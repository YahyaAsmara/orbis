import React from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import MapView from './pages/MapView'
import Places from './pages/Places'
import PlaceDetail from './pages/PlaceDetail'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="p-4 bg-white shadow-sm">
        <div className="container mx-auto flex items-center gap-4">
          <h1 className="text-lg font-semibold">CPSC 471 — Orbis</h1>
          <nav className="flex gap-2">
            <Link to="/" className="text-sm text-blue-600">Home</Link>
            <Link to="/places" className="text-sm text-blue-600">Places</Link>
            <Link to="/map" className="text-sm text-blue-600">Map</Link>
          </nav>
        </div>
      </header>
      <main className="container mx-auto p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/map" element={<MapView />} />
          <Route path="/places" element={<Places />} />
          <Route path="/places/:id" element={<PlaceDetail />} />
        </Routes>
      </main>
    </div>
  )
}
