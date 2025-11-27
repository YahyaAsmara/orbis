import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { authAPI, profileAPI } from '../services/api'
import type { Location, TravelRoute, User } from '../types/models'

interface ProfilePayload {
  user: User
  locations: Location[]
  savedRoutes: TravelRoute[]
}

export default function Profile() {
  const navigate = useNavigate()
  const userId = authAPI.getCurrentUserId()
  const [data, setData] = useState<ProfilePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!userId) {
      navigate('/login')
      return
    }
    loadProfile()
  }, [userId])

  const loadProfile = async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const payload = await profileAPI.getProfileData(userId)
      setData(payload)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load profile'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!userId || !data) return
    const confirmed = window.confirm('Delete your account and all related map data? This cannot be undone.')
    if (!confirmed) return

    setIsDeleting(true)
    setError(null)
    try {
      await profileAPI.deleteAccount(userId)
      authAPI.signOut()
      navigate('/login', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete account'
      setError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const locationStats = useMemo(() => {
    if (!data) return { public: 0, private: 0 }
    return data.locations.reduce(
      (acc, loc) => {
        if (loc.isPublic) acc.public += 1
        else acc.private += 1
        return acc
      },
      { public: 0, private: 0 }
    )
  }, [data])

  if (!userId) {
    return null
  }

  return (
    <div className="animate-fade-in space-y-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-mono text-xs uppercase tracking-widest text-contour">Navigator Profile</p>
          <h1 className="text-display text-5xl font-black text-topo-brown">
            {data?.user.username ?? 'Account'}
          </h1>
          <p className="text-mono text-sm text-contour">Manage your atlas presence, saved routes, and account preferences.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/map" className="btn btn-primary text-xs">Go to Map</Link>
          <Link to="/places" className="btn btn-secondary text-xs">Manage Locations</Link>
          <button className="btn text-xs" onClick={loadProfile} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="card border-2 border-warn bg-warn/10 p-4 text-warn text-mono text-sm">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 border-2 border-topo-brown bg-topo-cream space-y-2">
          <p className="text-mono text-2xs uppercase tracking-widest text-contour">Account</p>
          {loading ? (
            <p className="text-mono text-sm text-contour">Loading…</p>
          ) : (
            <ul className="text-mono text-sm space-y-1">
              <li><span className="text-contour">Email:</span> {data?.user.email}</li>
              <li><span className="text-contour">Role:</span> {data?.user.role}</li>
              <li><span className="text-contour">Joined:</span> {data ? new Date(data.user.registrationDate).toLocaleDateString() : '—'}</li>
            </ul>
          )}
        </div>

        <div className="card p-6 border-2 border-topo-brown bg-topo-cream space-y-3">
          <p className="text-mono text-2xs uppercase tracking-widest text-contour">Map Assets</p>
          {loading ? (
            <p className="text-mono text-sm text-contour">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Locations" value={data?.locations.length ?? 0} />
              <StatBlock label="Saved routes" value={data?.savedRoutes.length ?? 0} />
              <StatBlock label="Public" value={locationStats.public} />
              <StatBlock label="Private" value={locationStats.private} />
            </div>
          )}
        </div>

        <div className="card p-6 border-2 border-topo-brown bg-topo-cream space-y-3">
          <p className="text-mono text-2xs uppercase tracking-widest text-contour">Danger zone</p>
          <p className="text-mono text-xs text-contour">Deleting your account removes all locations, routes, and history.</p>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="btn btn-accent text-xs"
          >
            {isDeleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-mono text-2xs uppercase tracking-widest text-contour">Locations</p>
            <h2 className="text-display text-3xl font-black text-topo-brown">{data?.locations.length ?? 0}</h2>
          </div>
        </div>
        {loading ? (
          <p className="text-mono text-sm text-contour">Loading locations…</p>
        ) : data && data.locations.length === 0 ? (
          <p className="text-mono text-sm text-contour">No locations yet. Head to the map to add your first one.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data?.locations.map((loc) => (
              <div key={loc.locationID} className="border-2 border-topo-brown p-4">
                <p className="text-mono text-sm font-bold">{loc.locationName}</p>
                <p className="text-mono text-xs text-contour">{loc.locationType} · [{loc.coordinate[0]}, {loc.coordinate[1]}]</p>
                <p className="text-mono text-xs mt-1">Capacity {loc.maxCapacity} · Parking {loc.parkingSpaces}</p>
                <p className="text-mono text-xs text-contour">{loc.isPublic ? 'Public' : 'Private'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-mono text-2xs uppercase tracking-widest text-contour">Saved routes</p>
            <h2 className="text-display text-3xl font-black text-topo-brown">{data?.savedRoutes.length ?? 0}</h2>
          </div>
        </div>
        {loading ? (
          <p className="text-mono text-sm text-contour">Loading routes…</p>
        ) : data && data.savedRoutes.length === 0 ? (
          <p className="text-mono text-sm text-contour">No saved routes yet. Plan a path and tap save in the Map view.</p>
        ) : (
          <div className="space-y-3">
            {data?.savedRoutes.map((route) => (
              <div key={route.routeID} className="border-2 border-topo-brown p-4 flex flex-col gap-1">
                <p className="text-mono text-sm font-bold">Route #{route.routeID}</p>
                <p className="text-mono text-xs text-contour">
                  Start [{route.startCellCoord[0]}, {route.startCellCoord[1]}] → End [{route.endCellCoord[0]}, {route.endCellCoord[1]}]
                </p>
                <p className="text-mono text-xs">Distance {route.totalDistance} · Time {route.travelTime} · Cost {route.totalCost}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-topo-brown p-3 text-center">
      <p className="text-mono text-2xs uppercase text-contour">{label}</p>
      <p className="text-display text-2xl font-black text-topo-brown">{value}</p>
    </div>
  )
}
