import { useState, useEffect, useMemo, useCallback } from 'react'
import type { FormEvent } from 'react'
import { MapContainer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import { locationAPI, routeAPI, authAPI, referenceAPI, vehicleAPI, landmarkAPI } from '../services/api'
import type {
  Location,
  LocationType,
  Road,
  GraphResponse,
  AddLocationRequest,
  ComputePathRequest,
  ComputePathResponse,
  ModeOfTransport,
  RouteSummary,
  Vehicle,
  VehicleReference,
  CurrencyReference,
  Landmark,
  LandmarkPayload,
  DeleteLandmarkRequest,
  CreateVehicleRequest,
} from '../types/models'
import { LOCATION_TYPE_ACCESS } from '../types/models'
import {
  loadStoredRoutes,
  persistStoredRoutes,
  getPendingRouteSelection,
  clearPendingRouteSelection,
  type StoredRoute,
  type SelectedRoutePayload,
} from '../utils/routePersistence'

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

const LOCATION_ICON_META: Record<LocationType, { emoji: string; color: string }> = {
  Hotel: { emoji: '🏨', color: '#b67945' },
  Park: { emoji: '🌳', color: '#2f8f5b' },
  Cafe: { emoji: '☕', color: '#6b4c3b' },
  Restaurant: { emoji: '🍽️', color: '#b9413a' },
  Gas_Station: { emoji: '⛽', color: '#a0522d' },
  Electric_Charging_Station: { emoji: '⚡', color: '#e1ba25' },
}

const LOCATION_ICON_CACHE: Partial<Record<LocationType, L.DivIcon>> = {}

const getLocationIcon = (type: LocationType) => {
  if (!LOCATION_ICON_CACHE[type]) {
    const meta = LOCATION_ICON_META[type] ?? { emoji: '📍', color: '#d35400' }
    LOCATION_ICON_CACHE[type] = L.divIcon({
      className: '',
      html: `<div class="orbis-marker" style="--pin-color:${meta.color}"><span class="orbis-marker__emoji">${meta.emoji}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -28],
    })
  }
  return LOCATION_ICON_CACHE[type]!
}

const generateRouteId = () => {
  const cryptoObj = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { crypto?: Crypto }).crypto : undefined
  if (cryptoObj && 'randomUUID' in cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  return `route-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const LANDMARK_CATEGORIES: Landmark['category'][] = ['Mountain', 'River', 'Lake', 'In_City', 'Other']

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
  const [isSavingRoute, setIsSavingRoute] = useState(false)
  const [routeSaveFeedback, setRouteSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [pendingSelection, setPendingSelection] = useState<SelectedRoutePayload | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleTemplates, setVehicleTemplates] = useState<VehicleReference[]>([])
  const [garageLoading, setGarageLoading] = useState(false)
  const [garageError, setGarageError] = useState<string | null>(null)
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)
  const [currencyOptions, setCurrencyOptions] = useState<CurrencyReference[]>([])
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const userId = authAPI.getCurrentUserId()
  const activeVehicle = useMemo(() => vehicles.find((vehicle) => vehicle.vehicleID === selectedVehicleId) ?? null, [vehicles, selectedVehicleId])

  const updateRouteHistory = (updater: (prev: StoredRoute[]) => StoredRoute[]) => {
    setRouteHistory((prev) => {
      const next = updater(prev)
      if (userId) {
        persistStoredRoutes(userId, next)
      }
      return next
    })
  }

  const handleRouteHistoryToggle = (routeId: string) => {
    updateRouteHistory((prev) => prev.filter(route => route.id !== routeId))
  }

  const archiveRouteForOverlay = (route: RouteSummary | null, routeRecordId?: number) => {
    if (!route) return
    updateRouteHistory((prev) => [...prev, { ...route, id: generateRouteId(), routeRecordId }])
  }

  const FALLBACK_GRAPH: GraphResponse = {
    locations: [
      {
        locationID: 1,
        coordinate: [0, 0],
        locationName: 'Atlas Terminal',
        locationType: 'Hotel',
        isPublic: LOCATION_TYPE_ACCESS['Hotel'],
        maxCapacity: 5000,
        parkingSpaces: 1200,
        createdBy: 0,
      },
      {
        locationID: 2,
        coordinate: [8, 8],
        locationName: 'Meridian Gardens',
        locationType: 'Park',
        isPublic: LOCATION_TYPE_ACCESS['Park'],
        maxCapacity: 1200,
        parkingSpaces: 80,
        createdBy: 0,
      },
      {
        locationID: 3,
        coordinate: [-10, 14],
        locationName: 'Aurora Spire',
        locationType: 'Restaurant',
        isPublic: LOCATION_TYPE_ACCESS['Restaurant'],
        maxCapacity: 200,
        parkingSpaces: 15,
        createdBy: 0,
      },
      {
        locationID: 4,
        coordinate: [14, -6],
        locationName: 'Ion Station',
        locationType: 'Electric_Charging_Station',
        isPublic: LOCATION_TYPE_ACCESS['Electric_Charging_Station'],
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

  useEffect(() => {
    const loadCurrencyCatalog = async () => {
      try {
        const response = await referenceAPI.getCurrencies()
        setCurrencyOptions(response.currencies || [])
        setReferenceError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load currency catalog.'
        setReferenceError(message)
      }
    }

    const loadVehicleTemplates = async () => {
      try {
        const templates = await referenceAPI.getVehicleTemplates()
        setVehicleTemplates(templates)
      } catch (err) {
        console.warn('Unable to load vehicle templates', err)
      }
    }

    loadCurrencyCatalog()
    loadVehicleTemplates()
  }, [])

  // Load user's graph
  const loadUserVehicles = useCallback(async (uid: number) => {
    setGarageLoading(true)
    setGarageError(null)
    try {
      const result = await vehicleAPI.list(uid)
      setVehicles(result)
      setSelectedVehicleId((prev) => {
        if (prev && result.some((vehicle) => vehicle.vehicleID === prev)) {
          return prev
        }
        return result.length ? result[0].vehicleID : null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load vehicles.'
      setGarageError(message)
      setVehicles([])
      setSelectedVehicleId(null)
    } finally {
      setGarageLoading(false)
    }
  }, [])

  const handleCreateVehicle = useCallback(async (payload: CreateVehicleRequest) => {
    if (!userId) {
      throw new Error('Sign in required to manage vehicles.')
    }
    try {
      await vehicleAPI.create(userId, payload)
      await loadUserVehicles(userId)
      setGarageError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create vehicle.'
      setGarageError(message)
      throw new Error(message)
    }
  }, [loadUserVehicles, userId])

  const handleDeleteVehicle = useCallback(async (vehicleId: number) => {
    if (!userId) {
      throw new Error('Sign in required to manage vehicles.')
    }
    try {
      await vehicleAPI.remove(userId, vehicleId)
      await loadUserVehicles(userId)
      setGarageError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete vehicle.'
      setGarageError(message)
      throw new Error(message)
    }
  }, [loadUserVehicles, userId])

  useEffect(() => {
    if (userId) {
      loadGraph()
      void loadUserVehicles(userId)
    } else {
      setVehicles([])
      setSelectedVehicleId(null)
    }
  }, [userId, loadUserVehicles])

  useEffect(() => {
    if (!userId) {
      setRouteHistory([])
      return
    }
    const stored = loadStoredRoutes(userId)
    setRouteHistory(stored)
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setPendingSelection(null)
      return
    }
    const selection = getPendingRouteSelection()
    if (selection && selection.userId === userId) {
      setPendingSelection(selection)
    } else {
      setPendingSelection(null)
    }
  }, [userId])

  useEffect(() => {
    if (!userId || !pendingSelection) return
    if (pendingSelection.userId !== userId) return
    if (!routeHistory.length) return

    const match = routeHistory.find(route => route.id === pendingSelection.storedRouteId)
    if (match) {
      setRouteSummary(match)
      setComputedPath(match.path)
      setKeepRouteVisible(true)
    } else {
      alert('This route overlay has not been cached on this device yet. Generate it once from the Map to store it locally.')
    }

    clearPendingRouteSelection()
    setPendingSelection(null)
  }, [userId, pendingSelection, routeHistory])

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

  const applyLocationPatch = (locationId: number, patch: Partial<Location>) => {
    setLocations((prev) => prev.map((loc) => (loc.locationID === locationId ? { ...loc, ...patch } : loc)))
    setSelectedLocation((prev) => (prev && prev.locationID === locationId ? { ...prev, ...patch } : prev))
  }

  const handleUpdateLocationCurrencies = async (locationId: number, currencyNames: string[]) => {
    if (!userId) {
      throw new Error('Sign in required to manage currencies.')
    }
    try {
      const response = await locationAPI.updateLocationCurrencies(userId, locationId, { currencyNames })
      applyLocationPatch(locationId, { acceptedCurrencies: response.currencies })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update currencies.'
      throw new Error(message)
    }
  }

  const handleCreateLandmark = async (payload: LandmarkPayload) => {
    if (!userId) {
      throw new Error('Sign in required to manage landmarks.')
    }
    try {
      const response = await landmarkAPI.create(userId, payload)
      applyLocationPatch(payload.locationID, { landmarks: response.landmarks })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create landmark.'
      throw new Error(message)
    }
  }

  const handleDeleteLandmark = async (payload: DeleteLandmarkRequest) => {
    if (!userId) {
      throw new Error('Sign in required to manage landmarks.')
    }
    try {
      const response = await landmarkAPI.remove(userId, payload)
      applyLocationPatch(payload.locationID, { landmarks: response.landmarks })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete landmark.'
      throw new Error(message)
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
      updateRouteHistory((prev) => prev.filter(route => !route.path.some(([x, y]) =>
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

  const persistCurrentRoute = async () => {
    if (!userId || !routeSummary) {
      setRouteSaveFeedback({ type: 'error', message: 'Compute a route before saving it to your profile.' })
      return
    }

    const start = routeSummary.path[0]
    const end = routeSummary.path[routeSummary.path.length - 1]
    if (!start || !end) {
      setRouteSaveFeedback({ type: 'error', message: 'Route is missing start or end coordinates.' })
      return
    }

    if (!selectedVehicleId) {
      setRouteSaveFeedback({ type: 'error', message: 'Select a vehicle before saving routes.' })
      return
    }

    setIsSavingRoute(true)
    setRouteSaveFeedback(null)
    try {
      const response = await routeAPI.saveRoute(userId, {
        transportType: routeSummary.mode,
        vehicleID: selectedVehicleId,
        startCellCoord: start,
        endCellCoord: end,
        travelTime: routeSummary.totalTime.toFixed(2),
        totalDistance: routeSummary.totalDistance.toFixed(2),
        totalCost: routeSummary.totalCost.toFixed(2),
        directions: routeSummary.directions,
      })
      const routeRecordId = response.routeID
      archiveRouteForOverlay(routeSummary, routeRecordId)
      setRouteSaveFeedback({ type: 'success', message: 'Route saved to your profile. Check the Profile tab to review it.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setRouteSaveFeedback({ type: 'error', message: `Failed to save route: ${message}` })
    } finally {
      setIsSavingRoute(false)
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
              }}
            >
              
              <MapClickHandler
                isAddingLocation={isAddingLocation}
                onMapClick={(coord) => setNewLocationCoord(snapToGrid(coord))}
              />

              <GridOverlay />

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
                  icon={getLocationIcon(loc.locationType)}
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
                archiveRouteForOverlay(routeSummary)
                setComputedPath(null)
                setRouteSummary(null)
                setRouteSaveFeedback(null)
              }}
              onPathComputed={(result: ComputePathResponse, mode: ModeOfTransport['transportType']) => {
                const adjusted = adjustSummaryForTransport(result, mode)
                archiveRouteForOverlay(routeSummary)
                setComputedPath(adjusted.path)
                setRouteSummary(adjusted)
                setRouteSaveFeedback(null)
                if (!keepRouteVisible) {
                  setKeepRouteVisible(true)
                }
              }}
              graphSource={graphSource}
              routeHistory={routeHistory}
              onRouteHistoryToggle={handleRouteHistoryToggle}
              onPersistRoute={persistCurrentRoute}
              isSavingRoute={isSavingRoute}
              saveFeedback={routeSaveFeedback}
              vehicles={vehicles}
              vehicleTemplates={vehicleTemplates}
              selectedVehicleId={selectedVehicleId}
              onVehicleSelect={setSelectedVehicleId}
              onCreateVehicle={handleCreateVehicle}
              onDeleteVehicle={handleDeleteVehicle}
              garageLoading={garageLoading}
              garageError={garageError}
              activeVehicleTransport={activeVehicle?.transportType}
              activeVehicle={activeVehicle}
            />
          ) : selectedLocation ? (
            <LocationDetail
              location={selectedLocation}
              currentUserId={userId}
              onRemove={() => handleRemoveLocation(selectedLocation)}
              onClose={() => setSelectedLocation(null)}
              onPlanRoute={() => setShowRoutePanel(true)}
              currencyOptions={currencyOptions}
              referenceError={referenceError}
              onUpdateCurrencies={handleUpdateLocationCurrencies}
              onCreateLandmark={handleCreateLandmark}
              onDeleteLandmark={handleDeleteLandmark}
            />
          ) : (
            <LocationsList
              locations={locations}
              onSelect={setSelectedLocation}
            />
          )}
        </div>
      </div>

      <MapLegend />

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
    maxCapacity: 100,
    parkingSpaces: 0,
  })

  useEffect(() => {
    setFormData((prev) => ({ ...prev, coordinate }))
  }, [coordinate])

  const accessLabel = LOCATION_TYPE_ACCESS[formData.locationType] ? 'Public' : 'Private'

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
            onChange={(e) => setFormData({ ...formData, locationType: e.target.value as LocationType })}
            className="input"
          >
            <option>Hotel</option>
            <option>Park</option>
            <option>Cafe</option>
            <option>Restaurant</option>
            <option>Gas_Station</option>
            <option>Electric_Charging_Station</option>
          </select>
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Capacity</label>
          <input
            type="number"
            value={formData.maxCapacity}
            onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value, 10) || 0 })}
            onFocus={(e) => e.target.select()}
            className="input"
            min="0"
          />
        </div>

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Parking Spaces</label>
          <input
            type="number"
            value={formData.parkingSpaces}
            onChange={(e) => setFormData({ ...formData, parkingSpaces: parseInt(e.target.value, 10) || 0 })}
            onFocus={(e) => e.target.select()}
            className="input"
            min="0"
          />
        </div>

        <div>
          <p className="text-mono text-2xs uppercase text-contour mb-1">Access Level</p>
          <p className="text-mono text-sm font-bold text-topo-brown">
            {accessLabel} · determined by location type
          </p>
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
  currentUserId,
  onRemove,
  onClose,
  onPlanRoute,
  currencyOptions,
  referenceError,
  onUpdateCurrencies,
  onCreateLandmark,
  onDeleteLandmark,
}: {
  location: Location
  currentUserId: number | null
  onRemove: () => void
  onClose: () => void
  onPlanRoute: () => void
  currencyOptions: CurrencyReference[]
  referenceError: string | null
  onUpdateCurrencies: (locationId: number, currencyNames: string[]) => Promise<void>
  onCreateLandmark: (payload: LandmarkPayload) => Promise<void>
  onDeleteLandmark: (payload: DeleteLandmarkRequest) => Promise<void>
}) {
  const [currencySelection, setCurrencySelection] = useState<string[]>(() => (location.acceptedCurrencies || []).map((currency) => currency.currencyName))
  const [currencyBusy, setCurrencyBusy] = useState(false)
  const [currencyStatus, setCurrencyStatus] = useState<string | null>(null)
  const [landmarkStatus, setLandmarkStatus] = useState<string | null>(null)
  const [landmarkBusy, setLandmarkBusy] = useState(false)
  const [landmarkForm, setLandmarkForm] = useState<Omit<LandmarkPayload, 'locationID'>>({
    landmarkName: '',
    landmarkDescription: '',
    category: LANDMARK_CATEGORIES[0],
  })
  const isOwner = currentUserId !== null && currentUserId === location.createdBy
  const acceptedCurrencies = location.acceptedCurrencies || []
  const landmarks = location.landmarks || []

  useEffect(() => {
    setCurrencySelection(acceptedCurrencies.map((currency) => currency.currencyName))
    setLandmarkForm({ landmarkName: '', landmarkDescription: '', category: LANDMARK_CATEGORIES[0] })
    setCurrencyStatus(null)
    setLandmarkStatus(null)
  }, [location.locationID])

  const toggleCurrency = (name: string) => {
    setCurrencySelection((prev) => (prev.includes(name) ? prev.filter((entry) => entry !== name) : [...prev, name]))
  }

  const handleCurrenciesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isOwner) return
    setCurrencyBusy(true)
    setCurrencyStatus(null)
    try {
      await onUpdateCurrencies(location.locationID, currencySelection)
      setCurrencyStatus('Accepted currencies updated.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update currencies.'
      setCurrencyStatus(message)
    } finally {
      setCurrencyBusy(false)
    }
  }

  const handleLandmarkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isOwner) return
    if (!landmarkForm.landmarkName.trim()) {
      setLandmarkStatus('Landmark name is required.')
      return
    }
    setLandmarkBusy(true)
    setLandmarkStatus(null)
    try {
      await onCreateLandmark({ ...landmarkForm, locationID: location.locationID })
      setLandmarkStatus('Landmark saved.')
      setLandmarkForm({ landmarkName: '', landmarkDescription: '', category: LANDMARK_CATEGORIES[0] })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save landmark.'
      setLandmarkStatus(message)
    } finally {
      setLandmarkBusy(false)
    }
  }

  const handleLandmarkDelete = async (landmarkName: string) => {
    if (!isOwner) return
    if (!confirm(`Remove ${landmarkName}?`)) return
    setLandmarkBusy(true)
    setLandmarkStatus(null)
    try {
      await onDeleteLandmark({ locationID: location.locationID, landmarkName })
      setLandmarkStatus('Landmark removed.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove landmark.'
      setLandmarkStatus(message)
    } finally {
      setLandmarkBusy(false)
    }
  }

  return (
    <div className="card p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-mono text-sm uppercase tracking-wider font-bold">Location Details</h3>
          {!isOwner && (
            <p className="text-mono text-2xs text-contour mt-1">Read-only preview · created by another mapper.</p>
          )}
        </div>
        <button onClick={onClose} className="text-contour hover:text-topo-brown">
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 text-mono text-sm">
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
          [{location.coordinate[0].toFixed(2)}, {location.coordinate[1].toFixed(2)}]
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Access</span>
          {location.isPublic ? 'Public' : 'Private'}
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Capacity</span>
          {location.maxCapacity} persons
        </div>
        <div>
          <span className="text-contour text-xs uppercase block mb-1">Parking</span>
          {location.parkingSpaces} spaces
        </div>
      </div>

      <section className="border-2 border-topo-brown p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-mono text-2xs uppercase text-contour">Accepted currencies</p>
          {!isOwner && <span className="text-mono text-2xs text-contour">View only</span>}
        </div>
        {referenceError && (
          <p className="text-mono text-2xs text-warn">{referenceError}</p>
        )}
        {currencyOptions.length ? (
          <form onSubmit={handleCurrenciesSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-mono text-xs">
              {currencyOptions.map((currency) => (
                <label key={currency.currencyName} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={currencySelection.includes(currency.currencyName)}
                    onChange={() => toggleCurrency(currency.currencyName)}
                    disabled={!isOwner || currencyBusy}
                  />
                  {currency.currencyName} ({currency.currencySymbol})
                </label>
              ))}
            </div>
            {isOwner && (
              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary text-2xs" disabled={currencyBusy}>
                  {currencyBusy ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-2xs"
                  onClick={() => setCurrencySelection(acceptedCurrencies.map((currency) => currency.currencyName))}
                  disabled={currencyBusy}
                >
                  Reset
                </button>
              </div>
            )}
            {currencyStatus && <p className="text-mono text-2xs text-topo-brown">{currencyStatus}</p>}
          </form>
        ) : (
          <p className="text-mono text-xs text-contour">No currencies configured.</p>
        )}
        {acceptedCurrencies.length > 0 && (
          <div className="text-mono text-2xs text-contour">
            Active: {acceptedCurrencies.map((currency) => currency.currencyName).join(', ')}
          </div>
        )}
      </section>

      <section className="border-2 border-topo-brown p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-mono text-2xs uppercase text-contour">Landmarks</p>
          {!isOwner && <span className="text-mono text-2xs text-contour">View only</span>}
        </div>
        {landmarks.length ? (
          <ul className="space-y-2">
            {landmarks.map((landmark) => (
              <li key={landmark.landmarkName} className="border border-topo-brown p-3 text-mono text-xs flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{landmark.landmarkName}</p>
                  <p className="text-contour text-2xs mb-1">{landmark.category.replace(/_/g, ' ')}</p>
                  <p>{landmark.landmarkDescription || 'No description provided.'}</p>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    className="text-topo-brown underline"
                    onClick={() => void handleLandmarkDelete(landmark.landmarkName)}
                    disabled={landmarkBusy}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-mono text-xs text-contour">No landmarks recorded.</p>
        )}

        {isOwner && (
          <form onSubmit={handleLandmarkSubmit} className="space-y-3">
            <div>
              <label className="text-mono text-2xs uppercase text-contour block mb-1">Name</label>
              <input
                className="input"
                value={landmarkForm.landmarkName}
                onChange={(e) => setLandmarkForm((prev) => ({ ...prev, landmarkName: e.target.value }))}
                disabled={landmarkBusy}
              />
            </div>
            <div>
              <label className="text-mono text-2xs uppercase text-contour block mb-1">Category</label>
              <select
                className="input"
                value={landmarkForm.category}
                onChange={(e) => setLandmarkForm((prev) => ({ ...prev, category: e.target.value as Landmark['category'] }))}
                disabled={landmarkBusy}
              >
                {LANDMARK_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-mono text-2xs uppercase text-contour block mb-1">Description</label>
              <textarea
                className="input"
                rows={3}
                value={landmarkForm.landmarkDescription}
                onChange={(e) => setLandmarkForm((prev) => ({ ...prev, landmarkDescription: e.target.value }))}
                disabled={landmarkBusy}
              />
            </div>
            <button type="submit" className="btn btn-primary text-2xs" disabled={landmarkBusy}>
              {landmarkBusy ? 'Saving...' : 'Add landmark'}
            </button>
            {landmarkStatus && <p className="text-mono text-2xs text-topo-brown">{landmarkStatus}</p>}
          </form>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <button onClick={onPlanRoute} className="btn btn-primary text-xs w-full">
          Plan Route from Here
        </button>
        <button onClick={onRemove} className="btn btn-accent text-xs w-full" disabled={!isOwner}>
          Remove Location
        </button>
        {!isOwner && (
          <p className="text-mono text-2xs text-contour text-center">Only the creator can delete this location.</p>
        )}
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

function GridOverlay({ spacing = 1, extent = 64 }: { spacing?: number; extent?: number }) {
  const lines: Array<{ key: string; positions: [number, number][] }> = []
  for (let coord = -extent; coord <= extent; coord += spacing) {
    lines.push({ key: `v-${coord}`, positions: [[coord, -extent], [coord, extent]] })
    lines.push({ key: `h-${coord}`, positions: [[-extent, coord], [extent, coord]] })
  }

  return (
    <>
      {lines.map((line) => (
        <Polyline
          key={line.key}
          positions={line.positions}
          pathOptions={{ color: '#c7b79c', weight: 1, opacity: 0.65 }}
        />
      ))}
    </>
  )
}

function MapLegend() {
  const markerEntries = Object.entries(LOCATION_ICON_META)

  return (
    <div className="mt-6 card p-6 bg-topo-cream border-4 border-topo-brown">
      <p className="text-mono text-2xs uppercase tracking-widest text-contour">Map Legend</p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4 text-mono text-2xs">
        {markerEntries.map(([type, meta]) => (
          <div key={type} className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">{meta.emoji}</span>
            <span className="uppercase truncate">{type.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-mono text-xs">
        <LegendLine color="#0c7c59" label="Open road" />
        <LegendLine color="#b71540" label="Blocked road" dashed />
        <LegendLine color="#d35400" label="Saved route" />
        <p className="text-contour">Sand grid = snapped lattice (1 league)</p>
      </div>
    </div>
  )
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block"
        style={{
          width: '32px',
          height: '3px',
          backgroundColor: dashed ? 'transparent' : color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      <span>{label}</span>
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
  onPersistRoute,
  isSavingRoute,
  saveFeedback,
  vehicles,
  vehicleTemplates,
  selectedVehicleId,
  onVehicleSelect,
  onCreateVehicle,
  onDeleteVehicle,
  garageLoading,
  garageError,
  activeVehicleTransport,
  activeVehicle,
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
  onPersistRoute: () => void | Promise<void>
  isSavingRoute: boolean
  saveFeedback: { type: 'success' | 'error'; message: string } | null
  vehicles: Vehicle[]
  vehicleTemplates: VehicleReference[]
  selectedVehicleId: number | null
  onVehicleSelect: (vehicleId: number | null) => void
  onCreateVehicle: (payload: CreateVehicleRequest) => Promise<void> | void
  onDeleteVehicle: (vehicleId: number) => Promise<void> | void
  garageLoading: boolean
  garageError: string | null
  activeVehicleTransport?: ModeOfTransport['transportType']
  activeVehicle: Vehicle | null
}) {
  const [startCoord, setStartCoord] = useState<[number, number] | null>(null)
  const [endCoord, setEndCoord] = useState<[number, number] | null>(null)
  const [transportType, setTransportType] = useState<ModeOfTransport['transportType']>('Car')
  const [loading, setLoading] = useState(false)
  const [garageOpen, setGarageOpen] = useState(false)

  useEffect(() => {
    if (activeVehicleTransport && activeVehicleTransport !== transportType) {
      setTransportType(activeVehicleTransport)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we only need to react to vehicle changes
  }, [activeVehicleTransport])

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

        <div>
          <label className="block text-mono text-xs uppercase mb-2">Vehicle</label>
          {vehicles.length > 0 ? (
            <select
              value={selectedVehicleId ?? ''}
              onChange={(e) => onVehicleSelect(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="input"
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.vehicleID} value={vehicle.vehicleID}>
                  {vehicle.vehicleName} · {vehicle.transportType}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-mono text-xs text-contour">
              No vehicles yet. Add one below to unlock route saving.
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            {activeVehicle && (
              <span className="text-mono text-2xs text-contour">
                Seats {activeVehicle.passengerCapacity} · {activeVehicle.transportType}
              </span>
            )}
            <button
              type="button"
              className="text-mono text-2xs text-topo-brown underline"
              onClick={() => setGarageOpen((prev) => !prev)}
            >
              {garageOpen ? 'Hide garage' : 'Manage garage'}
            </button>
          </div>
        </div>

        {garageOpen && (
          <VehicleGarageManager
            templates={vehicleTemplates}
            vehicles={vehicles}
            onCreateVehicle={onCreateVehicle}
            onDeleteVehicle={onDeleteVehicle}
            loading={garageLoading}
            error={garageError}
          />
        )}

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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { void onPersistRoute() }}
                className="btn btn-primary text-xs"
                disabled={isSavingRoute || !selectedVehicleId}
              >
                {isSavingRoute ? 'Saving route...' : 'Save route to profile'}
              </button>
              <button
                type="button"
                onClick={onClearRoute}
                className="btn btn-secondary text-xs"
              >
                Save route to overlay
              </button>
            </div>
            {!selectedVehicleId && (
              <p className="text-mono text-2xs text-warn">
                Select or add a vehicle to store routes.
              </p>
            )}
            {saveFeedback && (
              <p className={`text-mono text-xs ${saveFeedback.type === 'success' ? 'text-topo-green' : 'text-warn'}`}>
                {saveFeedback.message}
              </p>
            )}
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

function VehicleGarageManager({
  templates,
  vehicles,
  onCreateVehicle,
  onDeleteVehicle,
  loading,
  error,
}: {
  templates: VehicleReference[]
  vehicles: Vehicle[]
  onCreateVehicle: (payload: CreateVehicleRequest) => Promise<void> | void
  onDeleteVehicle: (vehicleId: number) => Promise<void> | void
  loading: boolean
  error: string | null
}) {
  const [templateName, setTemplateName] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!templateName && templates.length) {
      setTemplateName(templates[0].vehicleName)
    }
  }, [templateName, templates])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!templateName) return
    const template = templates.find((tpl) => tpl.vehicleName === templateName)
    if (!template) return
    setPending(true)
    try {
      await onCreateVehicle({ vehicleName: template.vehicleName, transportType: template.transportType })
    } catch (err) {
      // parent displays error state
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async (vehicleId: number) => {
    if (!vehicles.find((vehicle) => vehicle.vehicleID === vehicleId)) {
      return
    }
    if (!confirm('Remove this vehicle from your garage?')) {
      return
    }
    setPending(true)
    try {
      await onDeleteVehicle(vehicleId)
    } catch (err) {
      // parent displays error state
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="border-2 border-topo-brown p-4 space-y-4 bg-topo-cream/50">
      <div>
        <p className="text-mono text-2xs uppercase text-contour mb-2">Add vehicle</p>
        {templates.length ? (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <select
              className="input flex-1"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              disabled={pending || loading}
            >
              {templates.map((template) => (
                <option key={template.vehicleName} value={template.vehicleName}>
                  {template.vehicleName} · {template.transportType}
                </option>
              ))}
            </select>
            <button className="btn btn-primary text-2xs" type="submit" disabled={pending || loading}>
              Add
            </button>
          </form>
        ) : (
          <p className="text-mono text-xs text-contour">No templates available.</p>
        )}
      </div>

      <div>
        <p className="text-mono text-2xs uppercase text-contour mb-2">Your garage ({vehicles.length})</p>
        {vehicles.length ? (
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {vehicles.map((vehicle) => (
              <li key={vehicle.vehicleID} className="flex items-center justify-between border border-topo-brown px-3 py-2 text-mono text-xs">
                <div>
                  <p className="font-bold">{vehicle.vehicleName}</p>
                  <p className="text-contour">{vehicle.transportType} · Seats {vehicle.passengerCapacity}</p>
                </div>
                <button
                  type="button"
                  className="text-topo-brown underline"
                  onClick={() => void handleDelete(vehicle.vehicleID)}
                  disabled={pending || loading}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-mono text-xs text-contour">No vehicles owned yet.</p>
        )}
      </div>

      {error && (
        <p className="text-mono text-2xs text-warn">{error}</p>
      )}
    </div>
  )
}
