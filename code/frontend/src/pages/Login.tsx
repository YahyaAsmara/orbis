import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import type { SignInRequest, CreateAccountRequest } from '../types/models'

interface LoginProps {
  onLogin: () => void
}

export default function Login({ onLogin }: LoginProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const [signInData, setSignInData] = useState<SignInRequest>({
    username: '',
    password: '',
  })

  const [signUpData, setSignUpData] = useState<CreateAccountRequest>({
    email: '',
    username: '',
    password: '',
  })

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await authAPI.signIn(signInData)
      if (response.success) {
        onLogin()
        navigate('/map')
      } else {
        setError(response.message || 'Sign in failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await authAPI.createAccount(signUpData)
      if (response.success) {
        // After successful account creation, automatically sign in
        await authAPI.signIn({
          username: signUpData.username,
          password: signUpData.password,
        })
        onLogin()
        navigate('/map')
      } else {
        setError(response.message || 'Account creation failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-300px)] flex items-center justify-center">
      <div className="w-full max-w-2xl animate-slide-in">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-display text-6xl font-black text-topo-brown mb-4">
            {mode === 'signin' ? 'Welcome Back' : 'Join Orbis'}
          </h2>
          <p className="text-mono text-sm text-contour uppercase tracking-widest">
            {mode === 'signin' 
              ? 'Sign in to continue your journey' 
              : 'Create an account to start mapping'
            }
          </p>
        </div>

        {/* Form container */}
        <div className="card p-12">
          {/* Mode toggle */}
          <div className="flex border-4 border-topo-brown mb-8">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError(null)
              }}
              className={`
                flex-1 py-4 text-mono text-sm font-bold uppercase tracking-wider
                transition-colors duration-150
                ${mode === 'signin' 
                  ? 'bg-topo-green text-topo-cream' 
                  : 'bg-topo-cream text-topo-brown hover:bg-contour hover:bg-opacity-10'
                }
              `}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setError(null)
              }}
              className={`
                flex-1 py-4 text-mono text-sm font-bold uppercase tracking-wider
                border-l-4 border-topo-brown transition-colors duration-150
                ${mode === 'signup' 
                  ? 'bg-topo-green text-topo-cream' 
                  : 'bg-topo-cream text-topo-brown hover:bg-contour hover:bg-opacity-10'
                }
              `}
            >
              Sign Up
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 border-4 border-warn bg-warn bg-opacity-10">
              <p className="text-mono text-sm text-warn font-bold">
                ⚠ {error}
              </p>
            </div>
          )}

          {/* Sign In Form */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-6">
              <div>
                <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
                  Username
                </label>
                <input
                  type="text"
                  value={signInData.username}
                  onChange={(e) => setSignInData({ ...signInData, username: e.target.value })}
                  className="input"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
                  Password
                </label>
                <input
                  type="password"
                  value={signInData.password}
                  onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                  className="input"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? 'Signing In...' : 'Sign In →'}
              </button>
            </form>
          )}

          {/* Sign Up Form */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-6">
              <div>
                <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
                  Email Address
                </label>
                <input
                  type="email"
                  value={signUpData.email}
                  onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                  className="input"
                  placeholder="your.email@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
                  Username
                </label>
                <input
                  type="text"
                  value={signUpData.username}
                  onChange={(e) => setSignUpData({ ...signUpData, username: e.target.value })}
                  className="input"
                  placeholder="Choose a username"
                  required
                />
              </div>

              <div>
                <label className="block text-mono text-xs uppercase tracking-widest mb-2 font-bold">
                  Password
                </label>
                <input
                  type="password"
                  value={signUpData.password}
                  onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                  className="input"
                  placeholder="Create a strong password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full"
              >
                {loading ? 'Creating Account...' : 'Create Account →'}
              </button>
            </form>
          )}
        </div>

        {/* Decorative coordinates */}
        <div className="mt-6 flex justify-between text-mono text-xs text-contour opacity-50">
          <span>[AUTH.SYSTEM]</span>
          <span>[SECURE.GATEWAY]</span>
        </div>
      </div>
    </div>
  )
}
