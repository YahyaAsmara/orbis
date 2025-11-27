import type { RouteSummary } from '../types/models'

const ROUTE_HISTORY_KEY = (userId: number) => `routeHistory:${userId}`
const SELECTED_ROUTE_KEY = 'mapView:selectedRoute'

export interface StoredRoute extends RouteSummary {
  id: string
  routeRecordId?: number
}

export interface SelectedRoutePayload {
  userId: number
  storedRouteId: string
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  return window.localStorage
}

export function loadStoredRoutes(userId: number): StoredRoute[] {
  const storage = getStorage()
  if (!storage || !userId) return []
  const raw = storage.getItem(ROUTE_HISTORY_KEY(userId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as StoredRoute[]
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch (err) {
    console.warn('Failed to parse stored routes', err)
  }
  return []
}

export function persistStoredRoutes(userId: number, routes: StoredRoute[]) {
  const storage = getStorage()
  if (!storage || !userId) return
  try {
    storage.setItem(ROUTE_HISTORY_KEY(userId), JSON.stringify(routes))
  } catch (err) {
    console.warn('Failed to persist stored routes', err)
  }
}

export function clearStoredRoutes(userId: number) {
  const storage = getStorage()
  if (!storage || !userId) return
  storage.removeItem(ROUTE_HISTORY_KEY(userId))
}

export function findStoredRouteByRecordId(userId: number, routeId: number): StoredRoute | null {
  const routes = loadStoredRoutes(userId)
  return routes.find((route) => route.routeRecordId === routeId) ?? null
}

export function setPendingRouteSelection(payload: SelectedRoutePayload) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(SELECTED_ROUTE_KEY, JSON.stringify(payload))
}

export function getPendingRouteSelection(): SelectedRoutePayload | null {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(SELECTED_ROUTE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SelectedRoutePayload
  } catch (err) {
    console.warn('Failed to parse pending route selection', err)
    return null
  }
}

export function clearPendingRouteSelection() {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(SELECTED_ROUTE_KEY)
}
*** End Patch