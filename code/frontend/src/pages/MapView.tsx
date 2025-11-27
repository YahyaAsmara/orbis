import { useState, useEffect } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { locationAPI, routeAPI, authAPI } from '../services/api'
import type {
  Location,
  Road,
  GraphResponse,
  AddLocationRequest,
  ComputePathRequest,
  ComputePathResponse,
  ModeOfTransport,
} from '../types/models'

const TRANSPORT_PROFILES: Record<ModeOfTransport['transportType'], {
  speed: number
  costPerLeague: number
  description: string
}> = {
  Car: { speed: 60, costPerLeague: 4.2, description: 'Fuel + tolls impact travel time moderately' },
  Bicycle: { speed: 18, costPerLeague: 0.2, description: 'Muscle-powered, zero emissions but slower pace' },
  Bus: { speed: 40, costPerLeague: 1.6, description: 'Shared transit, steady pace with low personal cost' },
  Walking: { speed: 5, costPerLeague: 0.0, description: 'Slowest option yet no cost and full flexibility' },
}

type RouteSummary = ComputePathResponse & {
  mode: ModeOfTransport['transportType']
  speed: number
  costPerLeague: number
  description: string
}

interface StoredRoute extends RouteSummary {
  id: string
}

const generateRouteId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `route-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function MapView() {
  const [locations, setLocations] = useState<Location[]>([])
  const [roads, setRoads] = useState<Road[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [isAddingLocation, setIsAddingLocation] = useState(false)
  const [newLocationCoord, setNewLocationCoord] = useState<[number, number] | null>(null)
  const [showRoutePanel, setShowRoutePanel] = useState(false)
  const [computedPath, setComputedPath] = useState<[number, number][] | null>(null)
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeHistory, setRouteHistory] = useState<StoredRoute[]>([])
  const [keepRouteVisible, setKeepRouteVisible] = useState(true)
  const [loading, setLoading] = useState(false)
  const [graphSource, setGraphSource] = useState<'api' | 'fallback'>('api')
  const [graphError, setGraphError] = useState<string | null>(null)

  const userId = authAPI.getCurrentUserId()

  const handleRouteHistoryToggle = (routeId: string) => {
    setRouteHistory((prev) => prev.filter(route => route.id !== routeId))
  }

  const FALLBACK_GRAPH: GraphResponse = {
    locations: [
      {
        locationID: 1,
        coordinate: [0, 0],
        locationName: 'Atlas Terminal',
        locationType: 'Landmark',
        isPublic: true,
        maxCapacity: 5000,
        parkingSpaces: 1200,
        createdBy: 0,
      },
      {
        locationID: 2,
        coordinate: [8, 8],
        locationName: 'Meridian Gardens',
        locationType: 'Park',
        isPublic: true,
        maxCapacity: 1200,
        parkingSpaces: 80,
        createdBy: 0,
      },
      {
        locationID: 3,
        coordinate: [-10, 14],
        locationName: 'Aurora Spire',
        locationType: 'Landmark',
        isPublic: false,
        maxCapacity: 200,
        parkingSpaces: 15,
        createdBy: 0,
      },
      {
        locationID: 4,
        coordinate: [14, -6],
        locationName: 'Ion Station',
        locationType: 'Electric_Charging_Station',
        isPublic: true,
        maxCapacity: 50,
        parkingSpaces: 25,
        createdBy: 0,
      },
    ],
    roads: [
      {
        roadID: 1,
        roadSegment: [[0, 0], [8, 8]],
        roadName: 'Solaris Way',
        distance: 11.3,
        roadType: 'unblocked',
      },
      {
        roadID: 2,
        roadSegment: [[8, 8], [-10, 14]],
        roadName: 'Zephyr Span',
        distance: 19,
        roadType: 'unblocked',
      },
      {
        roadID: 3,
        roadSegment: [[0, 0], [14, -6]],
        roadName: 'Runic Causeway',
        distance: 15.2,
        roadType: 'blocked',
      },
    ],
  }

  const SNAP_SIZE = 1
  const snapToGrid = (coord: [number, number]): [number, number] => ([
    Math.round(coord[0] / SNAP_SIZE) * SNAP_SIZE,
    Math.round(coord[1] / SNAP_SIZE) * SNAP_SIZE,
  ])

  // Load user's graph
  useEffect(() => {
    if (userId) {
      loadGraph()
    }
  }, [userId])

  const loadGraph = async () => {
    if (!userId) return
    try {
      const data = await locationAPI.getGraph(userId)
      setLocations(data.locations || [])
      setRoads(data.roads || [])
      setGraphSource('api')
      setGraphError(null)
    } catch (err) {
      console.warn('Failed to load graph from API, using fallback grid.', err)
      setLocations(FALLBACK_GRAPH.locations)
      setRoads(FALLBACK_GRAPH.roads)
      setGraphSource('fallback')
      setGraphError('Displaying Atlas fallback grid while live data is unavailable.')
    }
  }

  const handleAddLocation = async (data: AddLocationRequest) => {
    if (!userId) return
    setLoading(true)
    try {
      const snappedPayload: AddLocationRequest = {
        ...data,
        coordinate: snapToGrid(data.coordinate),
      }
      await locationAPI.addLocation(userId, snappedPayload)
      await loadGraph()
      setIsAddingLocation(false)
      setNewLocationCoord(null)
    } catch (err) {
      alert('Failed to add location: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveLocation = async (target: Location) => {
    if (!userId || !confirm('Remove this location?')) return
    setLoading(true)
    try {
      await locationAPI.removeLocation(userId, target.locationID)
      await loadGraph()
      setSelectedLocation(null)
      setComputedPath(null)
      setRouteSummary(null)
      setRouteHistory((prev) => prev.filter(route => !route.path.some(([x, y]) =>
        x === target.coordinate[0] && y === target.coordinate[1]
      )))
      setKeepRouteVisible(false)
    } catch (err) {
      alert('Failed to remove location: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const adjustSummaryForTransport = (result: ComputePathResponse, mode: ModeOfTransport['transportType']): RouteSummary => {
    const profile = TRANSPORT_PROFILES[mode]
    const distance = result.totalDistance
    const hours = distance / profile.speed
    const cost = distance * profile.costPerLeague

    return {
      ...result,
      totalTime: Number(hours.toFixed(2)),
      totalCost: Number(cost.toFixed(2)),
      mode,
      speed: profile.speed,
      costPerLeague: profile.costPerLeague,
      description: profile.description,
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-display text-6xl font-black text-topo-brown mb-4">
            World Map
          </h1>
          <p className="text-mono text-sm text-contour uppercase tracking-widest">
            Interactive navigation & location management
          </p>
          <p className="text-mono text-xs text-contour mt-2">
            Grid source: {graphSource === 'api' ? 'Live user graph' : 'Atlas fallback dataset'}
          </p>
          {graphError && (
            <p className="text-mono text-xs text-warn mt-1">⚠ {graphError}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsAddingLocation(!isAddingLocation)}
            className={`btn text-xs ${isAddingLocation ? 'btn-accent' : 'btn-primary'}`}
          >
            {isAddingLocation ? 'Cancel' : '+ Add Location'}
          </button>
          <button
            onClick={() => setShowRoutePanel(!showRoutePanel)}
            className="btn btn-secondary text-xs"
          >
            {showRoutePanel ? 'Hide Route Planner' : 'Plan Route'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Map container */}
        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden">
            <MapContainer
              center={[0, 0]}
              zoom={4}
              crs={L.CRS.Simple}
              maxBounds={[[-64, -64], [64, 64]]}
              style={{
                height: '600px',
                width: '100%',
                backgroundColor: '#fdf6e3',
                backgroundImage: 'linear-gradient(#e0d7c5 1px, transparent 1px), linear-gradient(90deg, #e0d7c5 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            >
              
              <MapClickHandler
                isAddingLocation={isAddingLocation}
                onMapClick={(coord) => setNewLocationCoord(snapToGrid(coord))}
              />

              {/* Render stored roads */}
              {roads.map((road) => (
                <Polyline
                  key={road.roadID}
                  positions={road.roadSegment.map(([lat, lng]) => [lat, lng])}
                  pathOptions={{
                    color: road.roadType === 'blocked' ? '#b71540' : '#0c7c59',
                    weight: 2,
                    dashArray: road.roadType === 'blocked' ? '6 6' : undefined,
                  }}
                />
              ))}

              {/* Render location markers */}
              {locations.map((loc) => (
                <Marker
                  key={loc.locationID}
                  position={[loc.coordinate[0], loc.coordinate[1]]}
                  eventHandlers={{
                    click: () => setSelectedLocation(loc),
                  }}
                >
                  <Popup>
                    <div className="text-mono text-xs">
                      <strong>{loc.locationName}</strong>
                      <br />
                      {loc.locationType}
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Render prior routes */}
              {routeHistory.map((route) => (
                <Polyline
                  key={route.id}
                  positions={route.path}
                  pathOptions={{ color: '#d35400', weight: 3, opacity: 0.6 }}
                />
              ))}

              {/* Render active computed path */}
              {computedPath && keepRouteVisible && (
                <Polyline
                  positions={computedPath}
                  pathOptions={{ color: '#d35400', weight: 4 }}
                />
              )}
            </MapContainer>
          </div>

          {(isAddingLocation && newLocationCoord) && (
            <div className="mt-4 text-mono text-sm text-contour flex items-center gap-2">
              <span>📍 Grid coordinate:</span>
              <strong>[{newLocationCoord[0]}, {newLocationCoord[1]}]</strong>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-6">
          {/* Location detail or add form */}
          {isAddingLocation && newLocationCoord ? (
            <AddLocationForm
              coordinate={newLocationCoord}
              onSubmit={handleAddLocation}
              onCancel={() => {
                setIsAddingLocation(false)
                setNewLocationCoord(null)
              }}
              loading={loading}
            />
          ) : showRoutePanel ? (
            <RoutePlanningPanel
              locations={locations}
              userId={userId}
              summary={routeSummary}
              keepPathVisible={keepRouteVisible}
              onToggleKeepPath={() => setKeepRouteVisible((prev) => !prev)}
              onClearRoute={() => {
                if (routeSummary) {
                  setRouteHistory((prev) => [...prev, { ...routeSummary, id: generateRouteId() }])
                }
                setComputedPath(null)
                setRouteSummary(null)
              }}
              onPathComputed={(result: ComputePathResponse, mode: ModeOfTransport['transportType']) => {
                const adjusted = adjustSummaryForTransport(result, mode)
                setComputedPath(adjusted.path)
                setRouteSummary(adjusted)
                if (!keepRouteVisible) {
                  setKeepRouteVisible(true)
                }
              }}
              graphSource={graphSource}
              routeHistory={routeHistory}
              onRouteHistoryToggle={handleRouteHistoryToggle}
            />
          ) : selectedLocation ? (
            <LocationDetail
              location={selectedLocation}
              onRemove={() => handleRemoveLocation(selectedLocation)}
              onClose={() => setSelectedLocation(null)}
              onPlanRoute={() => setShowRoutePanel(true)}
            />
          ) : (
            <LocationsList
              locations={locations}
              onSelect={setSelectedLocation}
            />
          )}
        </div>
      </div>

      <div className="mt-8 card p-6 bg-topo-cream border-4 border-topo-brown">
        <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-4">
          Atlas Grid Reference
        </h3>
        <p className="text-mono text-sm text-topo-brown">
          The Orbis continent is plotted on a Chebyshev-friendly lattice where each cell equals one league in both the X and Y axis. Use snapped coordinates to keep routes compatible with the backend A* search and its diagonal-aware heuristic. Roads marked in ember indicate temporarily blocked paths the algorithm will avoid.
        </p>
      </div>
    </div>
  )
}

// Map click handler component
function MapClickHandler({
  isAddingLocation,
  onMapClick,
}: {
  isAddingLocation: boolean
  onMapClick: (coord: [number, number]) => void
}) {
  useMapEvents({
    click: (e) => {
      if (isAddingLocation) {
        onMapClick([e.latlng.lat, e.latlng.lng])
      }
    },
  })
  return null
}

// Add location form
function AddLocationForm({
  coordinate,
  onSubmit,
  onCancel,
  loading,
}: {
  coordinate: [number, number]
  onSubmit: (data: AddLocationRequest) => void
  onCancel: () => void
  loading: boolean
}) {
  const [formData, setFormData] = useState<AddLocationRequest>({
    coordinate,
    locationName: '',
    locationType: 'Park',
    isPublic: true,
    maxCapacity: 100,
    parkingSpaces: 0,
  })

  useEffect(() => {
    setFormData((prev) => ({ ...prev, coordinate }))
  }, [coordinate])

  const updateCoordinate = (index: 0 | 1, value: number) => {
    setFormData((prev) => {
      const nextCoord: [number, number] = [...prev.coordinate] as [number, number]
      nextCoord[index] = value
      return { ...prev, coordinate: nextCoord }
    })
  }

  return (
    <div className="card p-6">
      <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
        New Location
      </h3>

      <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="space-y-4">
        <div>
          <label className="block text-mono text-xs uppercase mb-2">Name</label>
          <input
            type="text"
            value={formData.locationName}
            onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
            className="input"
            required
          />
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Grid Coordinate</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-mono text-2xs uppercase text-contour">X</span>
              <input
                type="number"
                value={formData.coordinate[0]}
                onChange={(e) => updateCoordinate(0, parseInt(e.target.value, 10) || 0)}
                className="input"
              />
            </div>
            <div>
              <span className="text-mono text-2xs uppercase text-contour">Y</span>
              <input
                type="number"
                value={formData.coordinate[1]}
                onChange={(e) => updateCoordinate(1, parseInt(e.target.value, 10) || 0)}
                className="input"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Type</label>
          <select
            value={formData.locationType}
            onChange={(e) => setFormData({ ...formData, locationType: e.target.value as any })}
            className="input"
          >
            <option>Hotel</option>
            <option>Park</option>
            <option>Cafe</option>
            <option>Restaurant</option>
            <option>Landmark</option>
            <option>Gas_Station</option>
            <option>Electric_Charging_Station</option>
          </select>
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Capacity</label>
          <input
            type="number"
            value={formData.maxCapacity}
            onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) })}
            className="input"
            min="0"
          />
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Parking Spaces</label>
          <input
            type="number"
            value={formData.parkingSpaces}
            onChange={(e) => setFormData({ ...formData, parkingSpaces: parseInt(e.target.value) })}
            className="input"
            min="0"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={formData.isPublic}
            onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
            className="w-5 h-5"
          />
          <label className="text-mono text-xs uppercase">Public Location</label>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading} className="btn btn-primary text-xs flex-1">
            {loading ? 'Adding...' : 'Add Location'}
          </button>
          <button type="button" onClick={onCancel} className="btn btn-secondary text-xs">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// Location detail panel
function LocationDetail({
  location,
  onRemove,
  onClose,
  onPlanRoute,
}: {
  location: Location
  onRemove: () => void
  onClose: () => void
  onPlanRoute: () => void
}) {
  return (
    <div className="card p-6">
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-mono text-sm uppercase tracking-wider font-bold">
          Location Details
        </h3>
        <button onClick={onClose} className="text-contour hover:text-topo-brown">
          ✕
        </button>
      </div>

      <div className="space-y-4 text-mono text-sm">
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Name</span>
          <strong>{location.locationName}</strong>
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Type</span>
          {location.locationType}
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Coordinates</span>
          [{location.coordinate[0].toFixed(4)}, {location.coordinate[1].toFixed(4)}]
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Capacity</span>
          {location.maxCapacity} persons
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Parking</span>
          {location.parkingSpaces} spaces
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Access</span>
          {location.isPublic ? 'Public' : 'Private'}
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-6">
        <button onClick={onPlanRoute} className="btn btn-primary text-xs w-full">
          Plan Route from Here
        </button>
        <button onClick={onRemove} className="btn btn-accent text-xs w-full">
          Remove Location
        </button>
      </div>
    </div>
  )
}

// Locations list
function LocationsList({
  locations,
  onSelect,
}: {
  locations: Location[]
  onSelect: (loc: Location) => void
}) {
  return (
    <div className="card p-6">
      <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
        Locations ({locations.length})
      </h3>

      {locations.length === 0 ? (
        <p className="text-mono text-sm text-contour">
          No locations yet. Click "Add Location" to create one.
        </p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {locations.map((loc) => (
            <button
              key={loc.locationID}
              onClick={() => onSelect(loc)}
              className="w-full text-left p-4 border-2 border-topo-brown hover:bg-topo-green hover:text-topo-cream transition-colors duration-150"
            >
              <div className="text-mono text-sm font-bold">{loc.locationName}</div>
              <div className="text-mono text-xs text-contour">{loc.locationType}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Route planning panel
function RoutePlanningPanel({
  locations,
  userId,
  onPathComputed,
  graphSource,
  summary,
  keepPathVisible,
  onToggleKeepPath,
  onClearRoute,
  routeHistory,
  onRouteHistoryToggle,
}: {
  locations: Location[]
  userId: number | null
  onPathComputed: (result: ComputePathResponse, mode: ModeOfTransport['transportType']) => void
  graphSource: 'api' | 'fallback'
  summary: RouteSummary | null
  keepPathVisible: boolean
  onToggleKeepPath: () => void
  onClearRoute: () => void
  routeHistory: StoredRoute[]
  onRouteHistoryToggle: (routeId: string) => void
}) {
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [endCoord, setEndCoord] = useState<[number, number] | null>(null)
  const [transportType, setTransportType] = useState<ModeOfTransport['transportType']>('Car')
  const [loading, setLoading] = useState(false)

  const computeChebyshevDistance = (a: [number, number], b: [number, number]) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))

  const buildFallbackSummary = (start: [number, number], end: [number, number]): ComputePathResponse => {
    const distance = computeChebyshevDistance(start, end)
    return {
      path: [start, end],
      totalDistance: Number(distance.toFixed(2)),
      totalTime: Number(distance.toFixed(2)),
      totalCost: 0,
      directions: [`Travel from (${start[0]}, ${start[1]}) to (${end[0]}, ${end[1]})`],
      closedAreas: [],
    }
  }

  const handleComputePath = async () => {
    if (!userId || !startCoord || !endCoord) return
    
    setLoading(true)
    try {
      const request: ComputePathRequest = {
        startCoord,
        endCoord,
        transportType,
        timeOfDay: new Date().toISOString(),
      }
      const result = await routeAPI.computePath(userId, request)
      onPathComputed(result, transportType)
    } catch (err) {
      if (graphSource === 'fallback' && startCoord && endCoord) {
        onPathComputed(buildFallbackSummary(startCoord, endCoord), transportType)
      } else {
        alert('Failed to compute path: ' + (err instanceof Error ? err.message : 'Unknown error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6">
      <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
        Route Planning
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-mono text-xs uppercase mb-2">Start Location</label>
          <select
            onChange={(e) => {
              const loc = locations.find(l => l.locationID === parseInt(e.target.value))
              setStartCoord(loc ? loc.coordinate : null)
            }}
            className="input"
          >
            <option value="">Select start...</option>
            {locations.map(loc => (
              <option key={loc.locationID} value={loc.locationID}>
                {loc.locationName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">End Location</label>
          <select
            onChange={(e) => {
              const loc = locations.find(l => l.locationID === parseInt(e.target.value))
              setEndCoord(loc ? loc.coordinate : null)
            }}
            className="input"
          >
            <option value="">Select end...</option>
            {locations.map(loc => (
              <option key={loc.locationID} value={loc.locationID}>
                {loc.locationName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Transport</label>
          <select
            value={transportType}
            onChange={(e) => setTransportType(e.target.value as any)}
            className="input"
          >
            <option>Car</option>
            <option>Bicycle</option>
            <option>Bus</option>
            <option>Walking</option>
          </select>
        </div>

        <button
          onClick={handleComputePath}
          disabled={!startCoord || !endCoord || loading}
          className="btn btn-primary text-xs w-full"
        >
          {loading ? 'Computing...' : 'Compute Route →'}
        </button>
      </div>

      {summary && (
        <div className="mt-6 space-y-4">
          <div className="text-mono text-xs text-contour">
            Mode: <span className="font-bold text-topo-brown">{summary.mode}</span>
            {' '}• Cruise ~{summary.speed} leagues/hr • Cost {summary.costPerLeague.toFixed(2)} credits/league
            <p className="text-topo-brown mt-1">{summary.description}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="border-2 border-topo-brown p-3">
              <p className="text-mono text-2xs uppercase text-contour">Distance</p>
              <p className="text-mono text-base font-bold">{summary.totalDistance.toFixed(2)} leagues</p>
            </div>
            <div className="border-2 border-topo-brown p-3">
              <p className="text-mono text-2xs uppercase text-contour">Time</p>
              <p className="text-mono text-base font-bold">{summary.totalTime.toFixed(2)} hrs</p>
            </div>
            <div className="border-2 border-topo-brown p-3">
              <p className="text-mono text-2xs uppercase text-contour">Cost</p>
              <p className="text-mono text-base font-bold">{summary.totalCost.toFixed(2)} credits</p>
            </div>
          </div>

          <div>
            <p className="text-mono text-xs uppercase text-contour mb-2">Directions</p>
            <ul className="text-mono text-xs space-y-1 max-h-40 overflow-y-auto border-2 border-topo-brown p-3">
              {summary.directions.map((step, idx) => (
                <li key={idx}>{idx + 1}. {step}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3 text-mono text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={keepPathVisible} onChange={onToggleKeepPath} />
              Keep path visible on map
            </label>
            <button
              type="button"
              onClick={onClearRoute}
              className="btn btn-secondary text-xs"
            >
              Save route to overlay
            </button>
          </div>
        </div>
      )}

      {routeHistory.length > 0 && (
        <div className="mt-6 border-2 border-topo-brown p-3 space-y-2">
          <p className="text-mono text-xs uppercase text-contour">Overlayed Routes</p>
          {routeHistory.map((route) => (
            <div key={route.id} className="flex items-center justify-between text-mono text-xs">
              <span>{route.mode} • {route.totalDistance.toFixed(1)} leagues</span>
              <button
                className="text-topo-brown underline"
                onClick={() => onRouteHistoryToggle(route.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
