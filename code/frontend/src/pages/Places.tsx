import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { locationAPI, authAPI } from '../services/api'
import type { Location } from '../types/models'

export default function Places() {
  const [locations, setLocations] = useState<Location[]>([])
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('All')

  const userId = authAPI.getCurrentUserId()

  useEffect(() => {
    loadLocations()
  }, [])

  useEffect(() => {
    filterLocations()
  }, [searchQuery, typeFilter, locations])

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
            <LocationCard key={location.locationID} location={location} />
          ))}
        </div>
      )}
    </div>
  )
}

// Location card component
function LocationCard({ location }: { location: Location }) {
  const icon = getLocationIcon(location.locationType)

  return (
    <Link to={`/places/${location.locationID}`}>
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
          </div>
        </div>
      </div>
    </Link>
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
