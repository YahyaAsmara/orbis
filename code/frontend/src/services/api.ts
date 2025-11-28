import type {
  User,
  Location,
  LocationCurrency,
  Road,
  TravelRoute,
  SaveRouteRequest,
  CreateAccountRequest,
  SignInRequest,
  AuthResponse,
  GraphResponse,
  AddLocationRequest,
  ComputePathRequest,
  ComputePathResponse,
  AdminOverview,
  AdminUserRecord,
  UserRole,
  AdminLocationRecord,
  AdminRouteRecord,
  AdminRoadRecord,
  Vehicle,
  VehicleReference,
  CreateVehicleRequest,
  CurrencyReference,
  ExchangeRate,
  CreateCurrencyRequest,
  UpdateLocationCurrenciesRequest,
  Landmark,
  LandmarkPayload,
  DeleteLandmarkRequest,
} from '../types/models'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
const USER_ROLE_KEY = 'userRole'

// Helper function for API requests
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const token = localStorage.getItem('authToken')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options?.headers,
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}

// Authentication API
export const authAPI = {
  async createAccount(data: CreateAccountRequest): Promise<AuthResponse> {
    const form = new FormData()
    form.append('email', data.email)
    form.append('username', data.username)
    form.append('password', data.password)

    const response = await fetch(`${API_BASE}/create_account`, {
      method: 'POST',
      body: form,
    })

    const payload = (await response.json()) as {
      success: boolean
      message: string
      data?: { user_id: number; username: string; email: string; token: string; role?: UserRole }
    }

    if (!payload.success) {
      throw new Error(payload.message || 'Account creation failed')
    }

    if (payload.data?.token) {
      localStorage.setItem('authToken', payload.data.token)
      localStorage.setItem('userId', String(payload.data.user_id))
      if (payload.data.role) {
        localStorage.setItem(USER_ROLE_KEY, payload.data.role)
      }
    }

    return {
      success: payload.success,
      message: payload.message,
      userId: payload.data?.user_id,
      username: payload.data?.username,
      email: payload.data?.email,
      token: payload.data?.token,
    }
  },

  async signIn(data: SignInRequest): Promise<AuthResponse> {
    const form = new FormData()
    form.append('username', data.username)
    form.append('password', data.password)

    const response = await fetch(`${API_BASE}/sign_in`, {
      method: 'POST',
      body: form,
    })

    const payload = (await response.json()) as {
      success: boolean
      message: string
      data?: { user_id: number; username: string; email: string; token: string; role?: UserRole }
    }

    if (!payload.success) {
      throw new Error(payload.message || 'Sign in failed')
    }

    if (payload.data?.token) {
      localStorage.setItem('authToken', payload.data.token)
      localStorage.setItem('userId', String(payload.data.user_id))
      if (payload.data.role) {
        localStorage.setItem(USER_ROLE_KEY, payload.data.role)
      }
    }

    return {
      success: payload.success,
      message: payload.message,
      userId: payload.data?.user_id,
      username: payload.data?.username,
      email: payload.data?.email,
      token: payload.data?.token,
    }
  },

  signOut() {
    localStorage.removeItem('authToken')
    localStorage.removeItem('userId')
    localStorage.removeItem(USER_ROLE_KEY)
  },

  getCurrentUserId(): number | null {
    const id = localStorage.getItem('userId')
    return id ? parseInt(id, 10) : null
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('authToken')
  },

  getCurrentUserRole(): UserRole | null {
    const stored = localStorage.getItem(USER_ROLE_KEY)
    if (stored === 'admin' || stored === 'mapper' || stored === 'viewer') {
      return stored
    }
    return null
  },
}

// Reference data API
export const referenceAPI = {
  async getCurrencies(): Promise<{ currencies: CurrencyReference[]; exchangeRates: ExchangeRate[] }> {
    return apiRequest('/reference/currencies', { method: 'GET' })
  },

  async createCurrency(payload: CreateCurrencyRequest): Promise<{
    success: boolean
    currency: CurrencyReference
    exchangeRates: ExchangeRate[]
  }> {
    return apiRequest('/currencies', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getVehicleTemplates(): Promise<VehicleReference[]> {
    return apiRequest('/reference/vehicles', { method: 'GET' })
  },
}

// Location/Graph API
export const locationAPI = {
  async getGraph(userId: number): Promise<GraphResponse> {
    return apiRequest<GraphResponse>(`/${userId}/getGraph`, { method: 'GET' })
  },

  async addLocation(userId: number, data: AddLocationRequest): Promise<{ success: boolean; locationID?: number }> {
    return apiRequest(`/${userId}/addLocation`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateLocation(userId: number, locationID: number, data: Partial<AddLocationRequest>): Promise<{ success: boolean }> {
    return apiRequest(`/${userId}/updateLocation`, {
      method: 'PUT',
      body: JSON.stringify({ locationID, ...data }),
    })
  },

  async removeLocation(userId: number, locationID: number): Promise<{ success: boolean }> {
    return apiRequest(`/${userId}/removeLocation`, {
      method: 'DELETE',
      body: JSON.stringify({ locationID }),
    })
  },

  async updateLocationCurrencies(
    userId: number,
    locationID: number,
    payload: UpdateLocationCurrenciesRequest
  ): Promise<{ success: boolean; currencies: LocationCurrency[] }> {
    return apiRequest(`/${userId}/locations/${locationID}/currencies`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
}

// User vehicle API
export const vehicleAPI = {
  async list(userId: number): Promise<Vehicle[]> {
    return apiRequest(`/${userId}/vehicles`, { method: 'GET' })
  },

  async create(userId: number, payload: CreateVehicleRequest): Promise<{ success: boolean; vehicle: Vehicle }> {
    return apiRequest(`/${userId}/vehicles`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async remove(userId: number, vehicleId: number): Promise<{ success: boolean }> {
    return apiRequest(`/${userId}/vehicles/${vehicleId}`, { method: 'DELETE' })
  },
}

// Landmark API
export const landmarkAPI = {
  async list(userId: number): Promise<Landmark[]> {
    return apiRequest(`/${userId}/landmarks`, { method: 'GET' })
  },

  async create(userId: number, payload: LandmarkPayload): Promise<{ success: boolean; landmarks: Landmark[] }> {
    return apiRequest(`/${userId}/landmarks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async update(userId: number, payload: LandmarkPayload): Promise<{ success: boolean; landmarks: Landmark[] }> {
    return apiRequest(`/${userId}/landmarks`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async remove(userId: number, payload: DeleteLandmarkRequest): Promise<{ success: boolean; landmarks: Landmark[] }> {
    return apiRequest(`/${userId}/landmarks`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    })
  },
}

// Route/Path API
export const routeAPI = {
  async computePath(userId: number, params: ComputePathRequest): Promise<ComputePathResponse> {
    return apiRequest(`/${userId}/computePath`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async saveRoute(userId: number, route: SaveRouteRequest): Promise<{ success: boolean; routeID?: number }> {
    return apiRequest(`/${userId}/saveRoute`, {
      method: 'POST',
      body: JSON.stringify(route),
    })
  },

  async removeSavedPath(userId: number, routeID: number): Promise<{ success: boolean }> {
    return apiRequest(`/${userId}/removeSavedPath`, {
      method: 'POST',
      body: JSON.stringify({ routeID }),
    })
  },

  async getSavedRoutes(userId: number): Promise<TravelRoute[]> {
    return apiRequest(`/${userId}/savedRoutes`, { method: 'GET' })
  },
}

// Profile API
export const profileAPI = {
  async getProfileData(userId: number): Promise<{
    user: User
    locations: Location[]
    savedRoutes: TravelRoute[]
    roads: Road[]
  }> {
    return apiRequest(`/${userId}/`, { method: 'GET' })
  },

  async deleteAccount(userId: number): Promise<{ success: boolean }> {
    return apiRequest(`/${userId}/delete_account`, { method: 'DELETE' })
  },
}

// Admin-only endpoints
export const adminAPI = {
  async getOverview(): Promise<AdminOverview> {
    return apiRequest('/admin/overview', { method: 'GET' })
  },

  async getUsers(): Promise<AdminUserRecord[]> {
    return apiRequest('/admin/users', { method: 'GET' })
  },

  async getLocations(): Promise<AdminLocationRecord[]> {
    return apiRequest('/admin/locations', { method: 'GET' })
  },

  async getRoutes(): Promise<AdminRouteRecord[]> {
    return apiRequest('/admin/routes', { method: 'GET' })
  },

  async getRoads(): Promise<AdminRoadRecord[]> {
    return apiRequest('/admin/roads', { method: 'GET' })
  },

  async updateUserRole(userId: number, role: UserRole): Promise<{ success: boolean }> {
    return apiRequest(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  async removeUser(userId: number): Promise<{ success: boolean }> {
    return apiRequest(`/admin/users/${userId}`, { method: 'DELETE' })
  },

  async deleteLocation(locationId: number): Promise<{ success: boolean }> {
    return apiRequest(`/admin/locations/${locationId}`, { method: 'DELETE' })
  },

  async deleteRoute(routeId: number): Promise<{ success: boolean }> {
    return apiRequest(`/admin/routes/${routeId}`, { method: 'DELETE' })
  },

  async deleteRoad(roadId: number): Promise<{ success: boolean }> {
    return apiRequest(`/admin/roads/${roadId}`, { method: 'DELETE' })
  },
}

export const roadAPI = {
  async updateRoadStatus(roadId: number, roadType: Road['roadType']): Promise<{ success: boolean; roadType: Road['roadType'] }> {
    return apiRequest(`/roads/${roadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ roadType }),
    })
  },
}

export default {
  auth: authAPI,
  reference: referenceAPI,
  location: locationAPI,
  vehicle: vehicleAPI,
  landmark: landmarkAPI,
  route: routeAPI,
  profile: profileAPI,
  admin: adminAPI,
  road: roadAPI,
}
