import { useEffect, useMemo, useState, Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI, authAPI } from '../services/api'
import type { AdminOverview, AdminUserRecord, AdminLocationRecord, AdminRouteRecord, AdminRoadRecord } from '../types/models'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [locations, setLocations] = useState<AdminLocationRecord[]>([])
  const [routes, setRoutes] = useState<AdminRouteRecord[]>([])
  const [roads, setRoads] = useState<AdminRoadRecord[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'mapper' | 'viewer'>('all')
  const [roleBusy, setRoleBusy] = useState<Record<number, boolean>>({})
  const [deleteBusy, setDeleteBusy] = useState<Record<number, boolean>>({})
  const [locationBusy, setLocationBusy] = useState<Record<number, boolean>>({})
  const [routeBusy, setRouteBusy] = useState<Record<number, boolean>>({})
  const [roadBusy, setRoadBusy] = useState<Record<number, boolean>>({})
  const currentUserId = authAPI.getCurrentUserId()

  useEffect(() => {
    if (!authAPI.isAuthenticated()) {
      navigate('/login')
      return
    }
    refreshAll()
  }, [])

  const refreshAll = async () => {
    setIsRefreshing(true)
    setError(null)
    try {
      const [overviewData, usersData, locationsData, routesData, roadsData] = await Promise.all([
        adminAPI.getOverview(),
        adminAPI.getUsers(),
        adminAPI.getLocations(),
        adminAPI.getRoutes(),
        adminAPI.getRoads(),
      ])
      setOverview(overviewData)
      setUsers(usersData)
      setLocations(locationsData)
      setRoutes(routesData)
      setRoads(roadsData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load admin data'
      setError(message)
    } finally {
      setIsRefreshing(false)
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const roleMatch = roleFilter === 'all' ? true : user.role === roleFilter
      const term = search.trim().toLowerCase()
      const searchMatch = term.length === 0
        ? true
        : user.username.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term)
      return roleMatch && searchMatch
    })
  }, [users, roleFilter, search])

  const roleStats = useMemo(() => {
    return users.reduce(
      (acc, user) => ({
        ...acc,
        [user.role]: (acc[user.role] ?? 0) + 1,
      }),
      { admin: 0, mapper: 0, viewer: 0 } as Record<'admin' | 'mapper' | 'viewer', number>
    )
  }, [users])

  const toggleBusy = (
    setter: Dispatch<SetStateAction<Record<number, boolean>>>,
    userId: number,
    value: boolean,
  ) => {
    setter((prev) => {
      const next = { ...prev }
      if (value) next[userId] = true
      else delete next[userId]
      return next
    })
  }

  const handleRoleChange = async (userId: number, role: AdminUserRecord['role']) => {
    toggleBusy(setRoleBusy, userId, true)
    try {
      await adminAPI.updateUserRole(userId, role)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update role'
      setError(message)
    } finally {
      toggleBusy(setRoleBusy, userId, false)
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (userId === currentUserId) {
      alert('You cannot delete the account currently in use.')
      return
    }
    const confirmed = window.confirm('Remove this user and all of their data?')
    if (!confirmed) return

    toggleBusy(setDeleteBusy, userId, true)
    try {
      await adminAPI.removeUser(userId)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete user'
      setError(message)
    } finally {
      toggleBusy(setDeleteBusy, userId, false)
    }
  }

  const handleDeleteLocationRecord = async (locationId: number) => {
    const confirmed = window.confirm('Remove this location from the Atlas?')
    if (!confirmed) return

    toggleBusy(setLocationBusy, locationId, true)
    try {
      await adminAPI.deleteLocation(locationId)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete location'
      setError(message)
    } finally {
      toggleBusy(setLocationBusy, locationId, false)
    }
  }

  const handleDeleteRouteRecord = async (routeId: number) => {
    const confirmed = window.confirm('Delete this saved route?')
    if (!confirmed) return

    toggleBusy(setRouteBusy, routeId, true)
    try {
      await adminAPI.deleteRoute(routeId)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete route'
      setError(message)
    } finally {
      toggleBusy(setRouteBusy, routeId, false)
    }
  }

  const handleDeleteRoadRecord = async (roadId: number) => {
    const confirmed = window.confirm('Remove this road segment? Connected locations will lose this edge.')
    if (!confirmed) return

    toggleBusy(setRoadBusy, roadId, true)
    try {
      await adminAPI.deleteRoad(roadId)
      await refreshAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete road'
      setError(message)
    } finally {
      toggleBusy(setRoadBusy, roadId, false)
    }
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-mono text-xs uppercase tracking-widest text-contour">
            Administrative Control Center
          </p>
          <h1 className="text-display text-5xl font-black text-topo-brown">
            Atlas Ops Console
          </h1>
          <p className="text-mono text-sm text-contour mt-2">
            Monitor user activity, infrastructure health, and network syncs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-mono text-2xs uppercase text-contour bg-topo-cream border border-topo-brown px-3 py-1">
            {overview ? `Last sync · ${new Date(overview.lastSync).toLocaleString()}` : 'Sync pending...'}
          </span>
          <button
            onClick={refreshAll}
            className="btn btn-primary text-xs"
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-2 border-warn bg-warn/10 p-4 text-warn text-mono text-sm">
          <div className="flex items-center justify-between">
            <span>⚠ {error}</span>
            <button className="underline" onClick={refreshAll}>
              Retry
            </button>
          </div>
        </div>
      )}

      <AdminBootstrapHint />

      <OverviewGrid overview={overview} roleStats={roleStats} loading={isRefreshing && !overview} />

      <UserRoster
        loading={isRefreshing && users.length === 0}
        users={filteredUsers}
        total={users.length}
        search={search}
        onSearch={setSearch}
        roleFilter={roleFilter}
        onRoleFilter={setRoleFilter}
        onChangeRole={handleRoleChange}
        onDeleteUser={handleDeleteUser}
        roleBusy={roleBusy}
        deleteBusy={deleteBusy}
        currentUserId={currentUserId}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <LocationsPanel
          loading={isRefreshing && locations.length === 0}
          locations={locations}
          onDelete={handleDeleteLocationRecord}
          busyMap={locationBusy}
        />
        <RoutesPanel
          loading={isRefreshing && routes.length === 0}
          routes={routes}
          onDelete={handleDeleteRouteRecord}
          busyMap={routeBusy}
        />
      </div>

      <RoadsPanel
        loading={isRefreshing && roads.length === 0}
        roads={roads}
        onDelete={handleDeleteRoadRecord}
        busyMap={roadBusy}
      />
    </div>
  )
}

function OverviewGrid({
  overview,
  roleStats,
  loading,
}: {
  overview: AdminOverview | null
  roleStats: Record<'admin' | 'mapper' | 'viewer', number>
  loading: boolean
}) {
  const averageLocations = overview && overview.totalUsers
    ? (overview.totalLocations / Math.max(overview.totalUsers, 1)).toFixed(1)
    : '—'

  const metrics = [
    { label: 'Total Users', value: overview?.totalUsers ?? '—' },
    { label: 'Total Locations', value: overview?.totalLocations ?? '—' },
    { label: 'Saved Routes', value: overview?.totalRoutes ?? '—' },
    { label: 'Blocked Roads', value: overview?.blockedRoads ?? '—' },
    { label: 'Pending Requests', value: overview?.pendingRequests ?? '—' },
    { label: 'Avg Loc/User', value: averageLocations },
    { label: 'Role Mix', value: `${roleStats.admin} / ${roleStats.mapper} / ${roleStats.viewer}` },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="card p-4 border-2 border-topo-brown bg-topo-cream">
          <p className="text-mono text-2xs uppercase tracking-widest text-contour">
            {metric.label}
          </p>
          <p className="text-display text-3xl font-black text-topo-brown mt-2">
            {loading ? '…' : metric.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function UserRoster({
  loading,
  users,
  total,
  search,
  onSearch,
  roleFilter,
  onRoleFilter,
  onChangeRole,
  onDeleteUser,
  roleBusy,
  deleteBusy,
  currentUserId,
}: {
  loading: boolean
  users: AdminUserRecord[]
  total: number
  search: string
  onSearch: (value: string) => void
  roleFilter: 'all' | 'admin' | 'mapper' | 'viewer'
  onRoleFilter: (value: 'all' | 'admin' | 'mapper' | 'viewer') => void
  onChangeRole: (userId: number, role: AdminUserRecord['role']) => void
  onDeleteUser: (userId: number) => void
  roleBusy: Record<number, boolean>
  deleteBusy: Record<number, boolean>
  currentUserId: number | null
}) {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-mono text-2xs uppercase tracking-widest text-contour">User Roster</p>
          <h2 className="text-display text-2xl font-black text-topo-brown">{total} accounts</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search username or email"
            className="input"
          />
          <select
            value={roleFilter}
            onChange={(e) => onRoleFilter(e.target.value as any)}
            className="input"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="mapper">Mapper</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      <div className="border border-topo-brown divide-y divide-topo-brown/30">
        <div className="grid grid-cols-6 text-mono text-2xs uppercase tracking-widest bg-topo-green text-topo-cream">
          <span className="px-3 py-2 col-span-2">User</span>
          <span className="px-3 py-2">Role</span>
          <span className="px-3 py-2">Locations</span>
          <span className="px-3 py-2">Last Active</span>
          <span className="px-3 py-2">Actions</span>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-mono text-sm text-contour">
            No users match the current filters.
          </div>
        ) : (
          users.map((user) => (
            <div key={user.userID} className="grid grid-cols-6 items-center">
              <div className="px-3 py-3 col-span-2">
                <p className="text-mono text-sm font-bold">{user.username}</p>
                <p className="text-mono text-xs text-contour">{user.email}</p>
              </div>
              <div className="px-3">
                <RolePill role={user.role} />
              </div>
              <div className="px-3 text-mono text-sm">
                {user.locations} locations · {user.savedRoutes} routes
              </div>
              <div className="px-3 text-mono text-xs text-contour">
                {new Date(user.lastActive).toLocaleString()}
              </div>
              <div className="px-3 py-2 flex flex-col gap-2">
                <select
                  value={user.role}
                  onChange={(e) => onChangeRole(user.userID, e.target.value as AdminUserRecord['role'])}
                  disabled={!!roleBusy[user.userID]}
                  className="input text-2xs"
                >
                  <option value="admin">Admin</option>
                  <option value="mapper">Mapper</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => onDeleteUser(user.userID)}
                  disabled={!!deleteBusy[user.userID] || user.userID === currentUserId}
                  className="btn btn-secondary text-2xs"
                >
                  {deleteBusy[user.userID] ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AdminBootstrapHint() {
  const snippet = "UPDATE USERS SET userRole = 'admin' WHERE username = 'your_username';"
  return (
    <div className="card border-2 border-topo-brown bg-topo-cream/70 p-4 text-mono text-xs text-topo-brown">
      <p className="uppercase tracking-widest text-2xs text-contour mb-2">Admin bootstrapping</p>
      <p>
        Need to create the first admin? Run the following SQL against your database, replacing the username with an existing account:
      </p>
      <pre className="mt-3 bg-topo-cream border border-topo-brown p-3 overflow-auto">{snippet}</pre>
      <p className="mt-2 text-contour">Once at least one admin exists you can promote or demote users directly from this dashboard.</p>
    </div>
  )
}

function LocationsPanel({
  loading,
  locations,
  onDelete,
  busyMap,
}: {
  loading: boolean
  locations: AdminLocationRecord[]
  onDelete: (locationId: number) => void | Promise<void>
  busyMap: Record<number, boolean>
}) {
  return (
    <div className="card p-6 space-y-4">
      <div>
        <p className="text-mono text-2xs uppercase tracking-widest text-contour">All Locations</p>
        <h2 className="text-display text-2xl font-black text-topo-brown">{locations.length} records</h2>
      </div>
      <div className="border border-topo-brown divide-y divide-topo-brown/30">
        <div className="grid grid-cols-5 text-mono text-2xs uppercase tracking-widest bg-topo-brown text-topo-cream">
          <span className="px-3 py-2 col-span-2">Name</span>
          <span className="px-3 py-2">Type</span>
          <span className="px-3 py-2">Owner</span>
          <span className="px-3 py-2">Access</span>
          <span className="px-3 py-2">Actions</span>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : locations.length === 0 ? (
          <div className="p-4 text-mono text-sm text-contour">No locations have been created yet.</div>
        ) : (
          locations.map((loc) => (
            <div key={loc.locationID} className="grid grid-cols-5 items-center text-mono text-sm">
              <span className="px-3 py-2 font-bold text-topo-brown col-span-2">{loc.locationName}</span>
              <span className="px-3 py-2 text-xs uppercase">{loc.locationType}</span>
              <span className="px-3 py-2 text-contour">{loc.owner}</span>
              <span className="px-3 py-2 text-xs">{loc.isPublic ? 'Public' : 'Private'}</span>
              <span className="px-3 py-2">
                <button
                  className="btn btn-secondary text-2xs"
                  onClick={() => onDelete(loc.locationID)}
                  disabled={!!busyMap[loc.locationID]}
                >
                  {busyMap[loc.locationID] ? 'Removing…' : 'Remove'}
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RoutesPanel({
  loading,
  routes,
  onDelete,
  busyMap,
}: {
  loading: boolean
  routes: AdminRouteRecord[]
  onDelete: (routeId: number) => void | Promise<void>
  busyMap: Record<number, boolean>
}) {
  return (
    <div className="card p-6 space-y-4">
      <div>
        <p className="text-mono text-2xs uppercase tracking-widest text-contour">Saved Routes</p>
        <h2 className="text-display text-2xl font-black text-topo-brown">{routes.length} entries</h2>
      </div>
      <div className="border border-topo-brown divide-y divide-topo-brown/30">
        <div className="grid grid-cols-5 text-mono text-2xs uppercase tracking-widest bg-topo-green text-topo-cream">
          <span className="px-3 py-2">Owner</span>
          <span className="px-3 py-2">Transport</span>
          <span className="px-3 py-2">Path</span>
          <span className="px-3 py-2">Metrics</span>
          <span className="px-3 py-2">Actions</span>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : routes.length === 0 ? (
          <div className="p-4 text-mono text-sm text-contour">No routes have been saved yet.</div>
        ) : (
          routes.map((route) => (
            <div key={route.routeID} className="grid grid-cols-5 text-mono text-sm items-center">
              <span className="px-3 py-2 font-bold text-topo-brown">{route.owner}</span>
              <span className="px-3 py-2 text-xs uppercase">{route.transportType ?? '—'}</span>
              <span className="px-3 py-2 text-xs">
                [{route.startCellCoord[0]}, {route.startCellCoord[1]}] → [{route.endCellCoord[0]}, {route.endCellCoord[1]}]
              </span>
              <span className="px-3 py-2 text-xs">
                {route.totalDistance} · {route.totalTime} · {route.totalCost}
              </span>
              <span className="px-3 py-2">
                <button
                  className="btn btn-secondary text-2xs"
                  onClick={() => onDelete(route.routeID)}
                  disabled={!!busyMap[route.routeID]}
                >
                  {busyMap[route.routeID] ? 'Removing…' : 'Remove'}
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RoadsPanel({
  loading,
  roads,
  onDelete,
  busyMap,
}: {
  loading: boolean
  roads: AdminRoadRecord[]
  onDelete: (roadId: number) => void | Promise<void>
  busyMap: Record<number, boolean>
}) {
  const describeConnection = (conn: { locationName?: string | null; coordinate?: [number, number] | null; locationID?: number | null }) => {
    if (conn.locationName) return conn.locationName
    if (conn.coordinate) {
      const [x, y] = conn.coordinate
      return `[${x}, ${y}]`
    }
    if (conn.locationID) return `Location #${conn.locationID}`
    return 'Unknown'
  }

  return (
    <div className="card p-6 space-y-4">
      <div>
        <p className="text-mono text-2xs uppercase tracking-widest text-contour">Road Network</p>
        <h2 className="text-display text-2xl font-black text-topo-brown">{roads.length} segments</h2>
      </div>
      <div className="border border-topo-brown divide-y divide-topo-brown/30">
        <div className="grid grid-cols-5 text-mono text-2xs uppercase tracking-widest bg-topo-brown text-topo-cream">
          <span className="px-3 py-2 col-span-2">Road</span>
          <span className="px-3 py-2">Distance</span>
          <span className="px-3 py-2">Status</span>
          <span className="px-3 py-2">Actions</span>
        </div>
        {loading ? (
          <SkeletonRow />
        ) : roads.length === 0 ? (
          <div className="p-4 text-mono text-sm text-contour">No road segments found.</div>
        ) : (
          roads.map((road) => {
            const linkedNames = road.connectedLocations && road.connectedLocations.length > 0
              ? road.connectedLocations.map((conn) => describeConnection(conn)).join(' ↔ ')
              : 'Unlinked'
            return (
              <div key={road.roadID} className="grid grid-cols-5 text-mono text-sm items-center">
                <span className="px-3 py-2 col-span-2">
                  <span className="font-bold text-topo-brown">{road.roadName || `Road #${road.roadID}`}</span>
                  <span className="block text-2xs text-contour">{linkedNames}</span>
                </span>
                <span className="px-3 py-2 text-xs">{road.distance} leagues</span>
                <span className="px-3 py-2 text-xs">{road.roadType}</span>
                <span className="px-3 py-2">
                  <button
                    className="btn btn-secondary text-2xs"
                    onClick={() => onDelete(road.roadID)}
                    disabled={!!busyMap[road.roadID]}
                  >
                    {busyMap[road.roadID] ? 'Removing…' : 'Remove'}
                  </button>
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function RolePill({ role }: { role: AdminUserRecord['role'] }) {
  const styles: Record<AdminUserRecord['role'], string> = {
    admin: 'bg-topo-brown text-topo-cream',
    mapper: 'bg-topo-green text-topo-cream',
    viewer: 'bg-topo-cream border border-topo-brown text-topo-brown',
  }

  return (
    <span className={`text-mono text-2xs uppercase tracking-widest px-3 py-1 inline-flex ${styles[role]}`}>
      {role}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div className="animate-pulse p-6 text-mono text-sm text-contour">
      Loading data…
    </div>
  )
}
