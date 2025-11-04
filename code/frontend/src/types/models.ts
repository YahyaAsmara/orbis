export interface User {
  id: string
  name: string
  email: string
}

export interface Place {
  id: string
  title: string
  lat?: number
  lng?: number
  description?: string
}
