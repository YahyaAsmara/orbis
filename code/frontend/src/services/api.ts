const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

export async function health() {
  const res = await fetch(`${API_BASE.replace(/\/$/, '')}/health`)
  if (!res.ok) throw new Error('Network error')
  return res.json()
}

export default {
  health,
}
