// Utility functions for the Orbis frontend

/**
 * Format coordinates for display
 */
export function formatCoordinates(coord: [number, number], decimals = 4): string {
  return `[${coord[0].toFixed(decimals)}, ${coord[1].toFixed(decimals)}]`
}

/**
 * Calculate distance between two coordinates (Euclidean distance)
 */
export function calculateDistance(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const dx = coord2[0] - coord1[0]
  const dy = coord2[1] - coord1[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Format a date string for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format time for display
 */
export function formatTime(timeString: string): string {
  return timeString
}

/**
 * Get icon for location type
 */
export function getLocationIcon(type: string): string {
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

/**
 * Get icon for transport type
 */
export function getTransportIcon(type: string): string {
  const icons: Record<string, string> = {
    Car: '🚗',
    Bicycle: '🚴',
    Bus: '🚌',
    Walking: '🚶',
  }
  return icons[type] || '🚗'
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate username (alphanumeric, 3-20 chars)
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  return usernameRegex.test(username)
}

/**
 * Generate a random coordinate within a bounding box
 */
export function randomCoordinate(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number
): [number, number] {
  const lat = minLat + Math.random() * (maxLat - minLat)
  const lng = minLng + Math.random() * (maxLng - minLng)
  return [lat, lng]
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
