import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { locationAPI, authAPI } from '../services/api'
import type { Location } from '../types/models'

type LocationEditForm = {
  locationName: string
  locationType: Location['locationType']
  coordinate: [number, number]
  maxCapacity: number
  parkingSpaces: number
  isPublic: boolean
}

export default function Places() {
  const [locations, setLocations] = useState<Location[]>([])
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('All')
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [editForm, setEditForm] = useState<LocationEditForm | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const userId = authAPI.getCurrentUserId()

  useEffect(() => {
    loadLocations()
  }, [])

  useEffect(() => {
    filterLocations()
  }, [searchQuery, typeFilter, locations])

  useEffect(() => {
    if (editingLocation) {
      setEditForm({
        locationName: editingLocation.locationName,
        locationType: editingLocation.locationType,
        coordinate: [...editingLocation.coordinate] as [number, number],
        maxCapacity: editingLocation.maxCapacity,
        parkingSpaces: editingLocation.parkingSpaces,
        isPublic: editingLocation.isPublic,
      })
      setEditError(null)
    } else {
      setEditForm(null)
    }
  }, [editingLocation])

  const loadLocations = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await locationAPI.getGraph(userId)
      setLocations(data.locations || [])
    } catch (err) {
      console.error('Failed to load locations:', err)
    } finally {
      setLoading(false)
    }
  }

  const filterLocations = () => {
    let filtered = locations

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(loc =>
        loc.locationName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Filter by type
    if (typeFilter !== 'All') {
      filtered = filtered.filter(loc => loc.locationType === typeFilter)
    }

    setFilteredLocations(filtered)
  }

  const locationTypes = ['All', 'Hotel', 'Park', 'Cafe', 'Restaurant', 'Landmark', 'Gas_Station', 'Electric_Charging_Station']

  const handleEditChange = (field: keyof Omit<LocationEditForm, 'coordinate'>, value: string | number | boolean) => {
    if (!editForm) return
    setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleCoordinateChange = (index: 0 | 1, value: number) => {
    setEditForm((prev) => {
      if (!prev) return prev
      const next = [...prev.coordinate] as [number, number]
      next[index] = value
      return { ...prev, coordinate: next }
    })
  }

  const handleSaveLocation = async () => {
    if (!userId || !editingLocation || !editForm) return
    setSavingEdit(true)
    setEditError(null)
    try {
      await locationAPI.updateLocation(userId, editingLocation.locationID, {
        locationName: editForm.locationName,
        locationType: editForm.locationType,
        coordinate: editForm.coordinate,
        maxCapacity: editForm.maxCapacity,
        parkingSpaces: editForm.parkingSpaces,
        isPublic: editForm.isPublic,
      })
      setLocations((prev) => prev.map((loc) => (
        loc.locationID === editingLocation.locationID
          ? { ...loc, ...editForm }
          : loc
      )))
      setEditingLocation(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update location'
      setEditError(message)
    } finally {
      setSavingEdit(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-24">
        <div className="text-mono text-sm text-contour">Loading locations...</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-display text-6xl font-black text-topo-brown mb-4">
          All Locations
        </h1>
        <p className="text-mono text-sm text-contour uppercase tracking-widest">
          Browse and manage your world's places
        </p>
      </div>

      {/* Filters & Search */}
      <div className="card p-8 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
              Search Locations
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              className="input"
            />
          </div>

          {/* Type filter */}
          <div>
            <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
              Filter by Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input"
            >
              {locationTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-6 pt-6 border-t-2 border-topo-brown">
          <p className="text-mono text-sm text-contour">
            Showing <strong className="text-topo-brown">{filteredLocations.length}</strong> of{' '}
            <strong className="text-topo-brown">{locations.length}</strong> locations
          </p>
        </div>
      </div>

      {/* Locations grid */}
      {filteredLocations.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-mono text-sm text-contour mb-6">
            {searchQuery || typeFilter !== 'All' 
              ? 'No locations match your filters.' 
              : 'No locations yet. Create some on the Map page.'
            }
          </p>
          <Link to="/map" className="btn btn-primary text-xs">
            Go to Map →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLocations.map((location) => (
            <LocationCard
              key={location.locationID}
              location={location}
              onEdit={() => setEditingLocation(location)}
            />
          ))}
        </div>
      )}

      {editingLocation && editForm && (
        <EditLocationModal
          location={editingLocation}
          form={editForm}
          onChange={handleEditChange}
          onCoordinateChange={handleCoordinateChange}
          onClose={() => setEditingLocation(null)}
          onSave={handleSaveLocation}
          saving={savingEdit}
          error={editError}
        />
      )}
    </div>
  )
}

// Location card component
function LocationCard({ location, onEdit }: { location: Location, onEdit: () => void }) {
  const icon = getLocationIcon(location.locationType)

  return (
    <div className="card p-6 group hover:translate-x-2 hover:translate-y-2 transition-all duration-150 h-full">
        <div className="flex items-start gap-4">
          <div className="text-4xl">{icon}</div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-mono text-base font-bold text-topo-brown mb-2 truncate">
              {location.locationName}
            </h3>
            
            <div className="space-y-1 text-mono text-xs text-contour">
              <div className="flex items-center gap-2">
                <span className="uppercase">{location.locationType}</span>
                {location.isPublic && (
                  <span className="px-2 py-0.5 bg-topo-green text-topo-cream text-[10px] font-bold uppercase">
                    Public
                  </span>
                )}
              </div>
              
              <div>
                📊 Capacity: {location.maxCapacity}
              </div>
              
              {location.parkingSpaces > 0 && (
                <div>
                  🚗 Parking: {location.parkingSpaces} spaces
                </div>
              )}
              
              <div className="pt-2 text-[10px] opacity-60">
                [{location.coordinate[0].toFixed(2)}, {location.coordinate[1].toFixed(2)}]
              </div>
            </div>
            <button
              className="btn btn-secondary text-2xs mt-4"
              onClick={onEdit}
            >
              Edit details
            </button>
          </div>
        </div>
      </div>
  )
}

function getLocationIcon(type: string) {
  const icons: Record<string, string> = {
    Hotel: '🏨',
    Park: '🌳',
    Cafe: '☕',
    Restaurant: '🍽️',
    Landmark: '🏛️',
    Gas_Station: '⛽',
    Electric_Charging_Station: '🔋',
  }
  return icons[type] || '📍'
}

function EditLocationModal({
  location,
  form,
  onChange,
  onCoordinateChange,
  onClose,
  onSave,
  saving,
  error,
}: {
  location: Location
  form: LocationEditForm
  onChange: (field: keyof Omit<LocationEditForm, 'coordinate'>, value: string | number | boolean) => void
  onCoordinateChange: (index: 0 | 1, value: number) => void
  onClose: () => void
  onSave: () => Promise<void> | void
  saving: boolean
  error: string | null
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-xl shadow-2xl border-4 border-topo-brown">
        <div className="flex items-start justify-between p-4 border-b border-topo-brown">
          <div>
            <p className="text-mono text-2xs uppercase text-contour">Editing Location</p>
            <h3 className="text-mono text-xl font-bold">{location.locationName}</h3>
          </div>
          <button onClick={onClose} className="text-contour hover:text-topo-brown">✕</button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-warn text-mono text-xs">{error}</div>
          )}

          <div>
            <label className="block text-mono text-xs uppercase mb-1">Name</label>
            <input
              type="text"
              className="input"
              value={form.locationName}
              onChange={(e) => onChange('locationName', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-mono text-xs uppercase mb-1">Type</label>
              <select
                className="input"
                value={form.locationType}
                onChange={(e) => onChange('locationType', e.target.value as Location['locationType'])}
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
              <label className="block text-mono text-xs uppercase mb-1">Access</label>
              <select
                className="input"
                value={form.isPublic ? 'public' : 'private'}
                onChange={(e) => onChange('isPublic', e.target.value === 'public')}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-mono text-xs uppercase mb-1">Capacity</label>
              <input
                type="number"
                className="input"
                value={form.maxCapacity}
                min={0}
                onChange={(e) => onChange('maxCapacity', parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <div>
              <label className="block text-mono text-xs uppercase mb-1">Parking</label>
              <input
                type="number"
                className="input"
                value={form.parkingSpaces}
                min={0}
                onChange={(e) => onChange('parkingSpaces', parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>

          <div>
            <label className="block text-mono text-xs uppercase mb-1">Coordinates</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                className="input"
                value={form.coordinate[0]}
                onChange={(e) => onCoordinateChange(0, parseFloat(e.target.value) || 0)}
              />
              <input
                type="number"
                className="input"
                value={form.coordinate[1]}
                onChange={(e) => onCoordinateChange(1, parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-topo-brown flex justify-end gap-3">
          <button className="btn btn-secondary text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary text-xs" onClick={() => { void onSave() }} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
