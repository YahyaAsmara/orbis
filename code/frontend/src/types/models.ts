// Database models matching PostgreSQL schema

export type UserRole = 'admin' | 'mapper' | 'viewer'

export interface User {
  userID: number
  email: string
  registrationDate: string
  username: string
  role: UserRole
}

export interface Location {
  locationID: number
  coordinate: [number, number] // [x, y] point
  locationName: string
  locationType: 'Hotel' | 'Park' | 'Cafe' | 'Restaurant' | 'Landmark' | 'Gas_Station' | 'Electric_Charging_Station'
  isPublic: boolean
  maxCapacity: number
  parkingSpaces: number
  createdBy: number
}

export interface Landmark {
  landmarkName: string
  locationID: number
  landmarkDescription: string
  category: 'Mountain' | 'River' | 'Lake' | 'In_City' | 'Other'
}

export interface Currency {
  currencyName: string
  exchangeRate: string
  currencySymbol: string
}

export interface Road {
  roadID: number
  roadSegment: [[number, number], [number, number]] // Line segment [(x1,y1),(x2,y2)]
  roadName: string
  distance: number
  roadType: 'blocked' | 'unblocked'
}

export interface TimeRestriction {
  restrictionName: string
  startTime: string
  endTime: string
  roadID: number
  restrictedTransport: ('Car' | 'Bicycle' | 'Bus' | 'Walking')[]
}

export interface ModeOfTransport {
  transportID: number
  speedMultiplier: number
  isEcoFriendly: boolean
  transportType: 'Car' | 'Bicycle' | 'Bus' | 'Walking'
  energyEfficiency?: number
}

export interface Vehicle {
  vehicleID: number
  transportID: number
  vehicleName: string
  vehicleType: 'Car' | 'Bus'
  passengerCapacity: number
}

export interface TravelRoute {
  routeID: number
  storedBy: number
  modeOfTransportID: number
  startCellCoord: [number, number]
  endCellCoord: [number, number]
  travelTime: string
  totalDistance: string
  totalCost: string
  directions: string[]
}

// API request/response types
export interface CreateAccountRequest {
  email: string
  username: string
  password: string
}

export interface SignInRequest {
  username: string
  password: string
}

export interface AuthResponse {
  success: boolean
  message: string
  userId?: number
  username?: string
  email?: string
  token?: string
  role?: UserRole
}

export interface GraphResponse {
  locations: Location[]
  roads: Road[]
}

export interface AddLocationRequest {
  coordinate: [number, number]
  locationName: string
  locationType: Location['locationType']
  isPublic: boolean
  maxCapacity: number
  parkingSpaces: number
}

export interface ComputePathRequest {
  startCoord: [number, number]
  endCoord: [number, number]
  pitStops?: [number, number][]
  transportType: ModeOfTransport['transportType']
  timeOfDay: string
}

export interface ComputePathResponse {
  path: [number, number][]
  totalDistance: number
  totalTime: number
  totalCost: number
  directions: string[]
  closedAreas?: string[]
}

// Admin / analytics models
export interface AdminOverview {
  totalUsers: number
  totalLocations: number
  totalRoutes: number
  blockedRoads: number
  pendingRequests: number
  lastSync: string
}

export interface AdminUserRecord {
  userID: number
  username: string
  email: string
  role: UserRole
  lastActive: string
  locations: number
  savedRoutes: number
}

export interface AdminActivity {
  id: string
  timestamp: string
  type: 'sync' | 'mutation' | 'alert'
  severity: 'info' | 'warn' | 'critical'
  summary: string
}
