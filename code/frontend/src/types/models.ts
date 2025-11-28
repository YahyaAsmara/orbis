// Database models matching PostgreSQL schema

export type UserRole = 'admin' | 'mapper' | 'viewer'

export interface User {
  userID: number
  email: string
  registrationDate: string
  username: string
  role: UserRole
}

export type LocationType =
  | 'Hotel'
  | 'Park'
  | 'Cafe'
  | 'Restaurant'
  | 'Gas_Station'
  | 'Electric_Charging_Station'

export const LOCATION_TYPE_ACCESS: Record<LocationType, boolean> = {
  Hotel: false,
  Park: true,
  Cafe: false,
  Restaurant: false,
  Gas_Station: false,
  Electric_Charging_Station: false,
}

export type TransportType = 'Car' | 'Bicycle' | 'Bus' | 'Walking'

export interface LocationCurrency {
  currencyName: string
  currencySymbol: string
}

export interface Location {
  locationID: number
  coordinate: [number, number] // [x, y] point
  locationName: string
  locationType: LocationType
  isPublic: boolean
  maxCapacity: number
  parkingSpaces: number
  createdBy: number
  acceptedCurrencies?: LocationCurrency[]
  landmarks?: Landmark[]
}

export interface Landmark {
  landmarkName: string
  locationID: number
  landmarkDescription: string
  category: 'Mountain' | 'River' | 'Lake' | 'In_City' | 'Other'
}

export interface CurrencyReference {
  currencyName: string
  currencySymbol: string
}

export interface ExchangeRate {
  currencyFrom: string
  currencyTo: string
  exchangeRate: string
}

export interface CurrencyExchangeInput {
  currencyTo: string
  rate: number
}

export interface CreateCurrencyRequest {
  currencyName: string
  currencySymbol: string
  exchangeRates: CurrencyExchangeInput[]
}

export interface Road {
  roadID: number
  roadSegment: [[number, number], [number, number]] // Line segment [(x1,y1),(x2,y2)]
  roadName: string
  distance: number
  roadType: 'blocked' | 'unblocked'
  connectedLocations?: RoadConnection[]
}

export interface RoadConnection {
  locationID: number | null
  locationName: string | null
  coordinate?: [number, number] | null
  owner?: string | null
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
  transportType: TransportType
  energyEfficiency?: number
}

export interface Vehicle {
  vehicleID: number
  transportID: number
  vehicleName: string
  transportType: TransportType
  passengerCapacity: number
}

export interface VehicleReference {
  vehicleName: string
  passengerCapacity: number
  transportType: TransportType
}

export interface CreateVehicleRequest {
  vehicleName: string
  transportType?: TransportType
}

export interface TravelRoute {
  routeID: number
  storedBy: number
  modeOfTransportID: number
  vehicleID?: number
  vehicleName?: string | null
  transportType?: TransportType | null
  startCellCoord: [number, number]
  endCellCoord: [number, number]
  travelTime: string
  totalDistance: string
  totalCost: string
  directions: string[]
}

export interface SaveRouteRequest {
  modeOfTransportID?: number
  transportType?: TransportType
  vehicleID: number
  startCellCoord: [number, number]
  endCellCoord: [number, number]
  travelTime: string
  totalDistance: string
  totalCost: string
  directions: string[]
}

export interface UpdateLocationCurrenciesRequest {
  currencyNames: string[]
}

export interface LandmarkPayload {
  landmarkName: string
  locationID: number
  landmarkDescription: string
  category: Landmark['category']
}

export interface DeleteLandmarkRequest {
  landmarkName: string
  locationID: number
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
  locationType: LocationType
  maxCapacity: number
  parkingSpaces: number
}

export interface ComputePathRequest {
  startCoord: [number, number]
  endCoord: [number, number]
  pitStops?: [number, number][]
  transportType: TransportType
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

export interface RouteSummary extends ComputePathResponse {
  mode: TransportType
  speed: number
  costPerLeague: number
  description: string
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

export interface AdminLocationRecord {
  locationID: number
  locationName: string
  locationType: LocationType
  coordinate: [number, number]
  owner: string
  isPublic: boolean
  maxCapacity: number
  parkingSpaces: number
}

export interface AdminRouteRecord {
  routeID: number
  owner: string
  transportType: TransportType | null
  startCellCoord: [number, number]
  endCellCoord: [number, number]
  totalDistance: string
  totalTime: string
  totalCost: string
}

export interface AdminRoadRecord extends Road {}
