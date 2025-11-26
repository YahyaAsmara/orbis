import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapContainer, Marker, Popup } from 'react-leaflet'
import * as L from 'leaflet'
import { locationAPI, authAPI } from '../services/api'
import type { Location } from '../types/models'

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function PlaceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [location, setLocation] = useState<Location | null>(null)
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)

  const userId = authAPI.getCurrentUserId()

  useEffect(() => {
    loadLocationData()
  }, [id])

  const loadLocationData = async () => {
    if (!userId || !id) return
    
    setLoading(true)
    try {
      const data = await locationAPI.getGraph(userId)
      setAllLocations(data.locations || [])
      
      const found = data.locations?.find(
        (loc: Location) => loc.locationID === parseInt(id!)
      )
      setLocation(found || null)
    } catch (err) {
      console.error('Failed to load location:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!userId || !location || !confirm('Delete this location permanently?')) return
    
    try {
      await locationAPI.removeLocation(userId, location.locationID)
      navigate('/places')
    } catch (err) {
      alert('Failed to delete: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  if (loading) {
    return (
      <div className="text-center py-24">
        <div className="text-mono text-sm text-contour">Loading location...</div>
      </div>
    )
  }

  if (!location) {
    return (
      <div className="text-center py-24">
        <h2 className="text-display text-4xl font-black text-topo-brown mb-4">
          Location Not Found
        </h2>
        <Link to="/places" className="btn btn-primary text-xs">
          ← Back to All Locations
        </Link>
      </div>
    )
  }

  const icon = getLocationIcon(location.locationType)

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <div className="mb-8">
        <Link 
          to="/places" 
          className="text-mono text-xs uppercase text-contour hover:text-topo-brown"
        >
          ← Back to All Locations
        </Link>
      </div>

      {/* Header */}
      <div className="mb-12 flex items-start justify-between">
        <div className="flex items-center gap-6">
          <div className="text-7xl">{icon}</div>
          <div>
            <h1 className="text-display text-6xl font-black text-topo-brown mb-2">
              {location.locationName}
            </h1>
            <div className="flex items-center gap-4 text-mono text-sm">
              <span className="text-contour uppercase">{location.locationType}</span>
              {location.isPublic && (
                <span className="px-3 py-1 bg-topo-green text-topo-cream text-xs font-bold uppercase">
                  Public Access
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="btn btn-secondary text-xs"
          >
            {isEditing ? 'Cancel Edit' : 'Edit'}
          </button>
          <button
            onClick={handleDelete}
            className="btn btn-accent text-xs"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-8">
          {/* Details card */}
          <div className="card p-8">
            <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6 text-topo-green">
              Location Details
            </h3>

            <div className="grid grid-cols-2 gap-6 text-mono text-sm">
              <DetailItem label="Coordinates" value={
                `[${location.coordinate[0].toFixed(4)}, ${location.coordinate[1].toFixed(4)}]`
              } />
              <DetailItem label="Type" value={location.locationType} />
              <DetailItem label="Max Capacity" value={`${location.maxCapacity} persons`} />
              <DetailItem label="Parking Spaces" value={location.parkingSpaces.toString()} />
              <DetailItem 
                label="Access Level" 
                value={location.isPublic ? 'Public' : 'Private'} 
              />
              <DetailItem label="Location ID" value={`#${location.locationID}`} />
            </div>
          </div>

          {/* Map */}
          <div className="card p-0 overflow-hidden">
            <MapContainer
              center={[location.coordinate[0], location.coordinate[1]]}
              zoom={6}
              crs={L.CRS.Simple}
              maxBounds={[[-64, -64], [64, 64]]}
              style={{
                height: '400px',
                width: '100%',
                backgroundColor: '#fdf6e3',
                backgroundImage: 'linear-gradient(#e0d7c5 1px, transparent 1px), linear-gradient(90deg, #e0d7c5 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            >
              <Marker position={[location.coordinate[0], location.coordinate[1]]}>
                <Popup>
                  <div className="text-mono text-xs">
                    <strong>{location.locationName}</strong>
                  </div>
                </Popup>
              </Marker>
            </MapContainer>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick stats */}
          <div className="card p-6">
            <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
              Quick Stats
            </h3>

            <div className="space-y-4">
              <StatItem icon="📊" label="Capacity" value={location.maxCapacity} />
              <StatItem icon="🚗" label="Parking" value={location.parkingSpaces} />
              <StatItem 
                icon={location.isPublic ? "🔓" : "🔒"} 
                label="Access" 
                value={location.isPublic ? "Public" : "Private"} 
              />
            </div>
          </div>

          {/* Nearby locations */}
          <div className="card p-6">
            <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
              Nearby Locations
            </h3>

            {allLocations.length > 1 ? (
              <div className="space-y-2">
                {allLocations
                  .filter(loc => loc.locationID !== location.locationID)
                  .slice(0, 5)
                  .map(loc => (
                    <Link
                      key={loc.locationID}
                      to={`/places/${loc.locationID}`}
                      className="block p-3 border-2 border-topo-brown hover:bg-topo-green hover:text-topo-cream transition-colors"
                    >
                      <div className="text-mono text-xs font-bold">{loc.locationName}</div>
                      <div className="text-mono text-[10px] text-contour">{loc.locationType}</div>
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="text-mono text-xs text-contour">
                No other locations yet
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="card p-6">
            <h3 className="text-mono text-sm uppercase tracking-wider font-bold mb-6">
              Actions
            </h3>

            <div className="space-y-3">
              <Link
                to="/map"
                className="btn btn-primary text-xs w-full"
              >
                View on Map →
              </Link>
              <button
                onClick={() => alert('Route planning from this location coming soon!')}
                className="btn btn-secondary text-xs w-full"
              >
                Plan Route From Here
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper components
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-contour text-xs uppercase block mb-1">{label}</span>
      <strong className="text-topo-brown">{value}</strong>
    </div>
  )
}

function StatItem({ 
  icon, 
  label, 
  value 
}: { 
  icon: string
  label: string
  value: string | number 
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="text-mono text-xs text-contour uppercase">{label}</div>
        <div className="text-mono text-sm font-bold text-topo-brown">{value}</div>
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
