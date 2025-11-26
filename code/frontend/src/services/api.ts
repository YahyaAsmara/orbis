import type {
  User,
  Location,
  TravelRoute,
  CreateAccountRequest,
  SignInRequest,
  AuthResponse,
  GraphResponse,
  AddLocationRequest,
  ComputePathRequest,
  ComputePathResponse,
  AdminOverview,
  AdminUserRecord,
  AdminActivity,
  UserRole,
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
}

// Route/Path API
export const routeAPI = {
  async computePath(userId: number, params: ComputePathRequest): Promise<ComputePathResponse> {
    return apiRequest(`/${userId}/computePath`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  },

  async saveRoute(userId: number, route: Omit<TravelRoute, 'routeID' | 'storedBy'>): Promise<{ success: boolean; routeID?: number }> {
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
  }> {
    return apiRequest(`/${userId}/`, { method: 'GET' })
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

  async getActivity(): Promise<AdminActivity[]> {
    return apiRequest('/admin/activity', { method: 'GET' })
  },
}

export default {
  auth: authAPI,
  location: locationAPI,
  route: routeAPI,
  profile: profileAPI,
  admin: adminAPI,
}
