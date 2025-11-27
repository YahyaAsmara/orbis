import { useEffect, useMemo, useState, Dispatch, SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI, authAPI } from '../services/api'
import type { AdminActivity, AdminOverview, AdminUserRecord } from '../types/models'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [activity, setActivity] = useState<AdminActivity[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'mapper' | 'viewer'>('all')
  const [roleBusy, setRoleBusy] = useState<Record<number, boolean>>({})
  const [deleteBusy, setDeleteBusy] = useState<Record<number, boolean>>({})
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
      const [overviewData, usersData, activityData] = await Promise.all([
        adminAPI.getOverview(),
        adminAPI.getUsers(),
        adminAPI.getActivity(),
      ])
      setOverview(overviewData)
      setUsers(usersData)
      setActivity(activityData)
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
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
        </div>
        <div>
          <ActivityFeed
            loading={isRefreshing && activity.length === 0}
            entries={activity}
          />
        </div>
      </div>
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
  const metrics = [
    { label: 'Total Users', value: overview?.totalUsers ?? '—' },
    { label: 'Total Locations', value: overview?.totalLocations ?? '—' },
    { label: 'Saved Routes', value: overview?.totalRoutes ?? '—' },
    { label: 'Blocked Roads', value: overview?.blockedRoads ?? '—' },
    { label: 'Pending Requests', value: overview?.pendingRequests ?? '—' },
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

function ActivityFeed({
  loading,
  entries,
}: {
  loading: boolean
  entries: AdminActivity[]
}) {
  const severityClasses: Record<AdminActivity['severity'], string> = {
    info: 'border-topo-green text-topo-green',
    warn: 'border-warn text-warn',
    critical: 'border-accent text-accent',
  }

  return (
    <div className="card p-6 space-y-4">
      <div>
        <p className="text-mono text-2xs uppercase tracking-widest text-contour">Activity</p>
        <h2 className="text-display text-2xl font-black text-topo-brown">Live feed</h2>
      </div>
      <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
        {loading ? (
          <SkeletonRow />
        ) : entries.length === 0 ? (
          <p className="text-mono text-sm text-contour">
            No recent events logged.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`border-l-4 pl-4 py-3 ${severityClasses[entry.severity]}`}>
              <div className="flex justify-between text-mono text-2xs uppercase tracking-widest">
                <span>{entry.type}</span>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-mono text-sm mt-1">{entry.summary}</p>
            </div>
          ))
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
