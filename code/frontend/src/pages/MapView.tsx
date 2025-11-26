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
  ModeOfTransport,
} from '../types/models'

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
  const [loading, setLoading] = useState(false)
  const [graphSource, setGraphSource] = useState<'api' | 'fallback'>('api')
  const [graphError, setGraphError] = useState<string | null>(null)

  const userId = authAPI.getCurrentUserId()

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
    } catch (err) {
      alert('Failed to remove location: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setLoading(false)
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
            {showRoutePanel ? 'Hide' : 'Plan Route'}
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

              {/* Render computed path */}
              {computedPath && (
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
          ) : selectedLocation ? (
            <LocationDetail
              location={selectedLocation}
              onRemove={() => handleRemoveLocation(selectedLocation)}
              onClose={() => setSelectedLocation(null)}
            />
          ) : showRoutePanel ? (
            <RoutePlanningPanel
              locations={locations}
              userId={userId}
              onPathComputed={(path) => setComputedPath(path)}
              graphSource={graphSource}
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
}: {
  location: Location
  onRemove: () => void
  onClose: () => void
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

      <button onClick={onRemove} className="btn btn-accent text-xs w-full mt-6">
        Remove Location
      </button>
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
}: {
  locations: Location[]
  userId: number | null
  onPathComputed: (path: [number, number][]) => void
  graphSource: 'api' | 'fallback'
}) {
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [endCoord, setEndCoord] = useState<[number, number] | null>(null)
  const [transportType, setTransportType] = useState<ModeOfTransport['transportType']>('Car')
  const [loading, setLoading] = useState(false)

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
      onPathComputed(result.path)
    } catch (err) {
      if (graphSource === 'fallback' && startCoord && endCoord) {
        // simple straight-line fallback route on atlas grid
        onPathComputed([startCoord, endCoord])
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
    </div>
  )
}
