'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useToast } from '@/hooks/use-toast'

interface UserContextType {
  userId: string | null
  username: string | null
  sessionId: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  createNewSession: () => Promise<string>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const { toast } = useToast()

  // Load user data from localStorage on mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    const storedUsername = localStorage.getItem('username')
    const storedSessionId = localStorage.getItem('sessionId')
    const authToken = localStorage.getItem('authToken')

    if (storedUserId && storedUsername && authToken) {
      // User is already authenticated in this app
      setUserId(storedUserId)
      setUsername(storedUsername)
      setIsAuthenticated(true)
      
      if (storedSessionId) {
        setSessionId(storedSessionId)
      } else {
        // Create a new session if none exists
        createNewSession().catch(error => {
          console.error('Failed to create new session:', error)
        })
      }
    } else if (authToken && storedUsername) {
      // User is authenticated from the main app but needs a local user ID
      // Get or create user in the local database
      const setupUser = async () => {
        try {
          const userResponse = await fetch('/api/conversation', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'getOrCreateUser',
              username: storedUsername,
            }),
          })
          
          if (!userResponse.ok) {
            throw new Error('Failed to get or create user')
          }
          
          const userData = await userResponse.json()
          const localUserId = userData.userId
          
          // Create a new session
          const newSessionId = await createNewSession()
          
          // Save to state
          setUserId(localUserId)
          setUsername(storedUsername)
          setSessionId(newSessionId)
          setIsAuthenticated(true)
          
          // Update localStorage with the new user ID and session ID
          localStorage.setItem('userId', localUserId)
          localStorage.setItem('sessionId', newSessionId)
          
          toast({
            title: 'Welcome Back',
            description: `Welcome, ${storedUsername}!`,
          })
        } catch (error) {
          console.error('Error setting up user:', error)
          // Clear any partial data if setup fails
          localStorage.removeItem('userId')
          localStorage.removeItem('username')
          localStorage.removeItem('sessionId')
          localStorage.removeItem('authToken')
          localStorage.removeItem('refreshToken')
        }
      }
      
      setupUser()
    } else {
      // Clear any partial data if not fully authenticated
      if (storedUserId || storedUsername || storedSessionId) {
        localStorage.removeItem('userId')
        localStorage.removeItem('username')
        localStorage.removeItem('sessionId')
        localStorage.removeItem('authToken')
        localStorage.removeItem('refreshToken')
      }
    }
  }, [])

  // Login function
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      if (!username.trim() || !password.trim()) {
        toast({
          title: 'Error',
          description: 'Username and password cannot be empty',
          variant: 'destructive',
        })
        return false
      }

      // Use the Django backend API for authentication via our proxy
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/proxy'
      const response = await fetch(`${apiUrl}/api/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      const data = await response.json()
      
      // Get or create user in the local database to get a proper UUID
      const userResponse = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'getOrCreateUser',
          username: username,
        }),
      })
      
      if (!userResponse.ok) {
        throw new Error('Failed to get or create user')
      }
      
      const userData = await userResponse.json()
      const localUserId = userData.userId
      
      // Create a new session
      const newSessionId = await createNewSession()

      // Save to state and localStorage
      setUserId(localUserId) // Use the UUID from the local database
      setUsername(username)
      setSessionId(newSessionId)
      setIsAuthenticated(true)

      // Store JWT tokens and user information
      localStorage.setItem('userId', localUserId)
      localStorage.setItem('username', username)
      localStorage.setItem('sessionId', newSessionId)
      localStorage.setItem('authToken', data.access)
      localStorage.setItem('refreshToken', data.refresh)

      toast({
        title: 'Success',
        description: `Welcome, ${username}!`,
      })

      return true
    } catch (error) {
      console.error('Login error:', error)
      toast({
        title: 'Login Failed',
        description: 'Invalid credentials. Please try again.',
        variant: 'destructive',
      })
      return false
    }
  }

  // Logout function
  const logout = async () => {
    try {
      // Call the backend logout API if a refresh token exists
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/proxy'
        await fetch(`${apiUrl}/api/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
          body: JSON.stringify({
            refresh: refreshToken,
          }),
        }).catch(error => {
          console.error('Logout API error:', error)
          // Continue with local logout even if API call fails
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear state
      setUserId(null)
      setUsername(null)
      setSessionId(null)
      setIsAuthenticated(false)

      // Clear all tokens and data from localStorage
      localStorage.removeItem('userId')
      localStorage.removeItem('username')
      localStorage.removeItem('sessionId')
      localStorage.removeItem('authToken')
      localStorage.removeItem('refreshToken')

      toast({
        title: 'Logged Out',
        description: 'You have been logged out successfully.',
      })
    }
  }

  // Create a new session
  const createNewSession = async (): Promise<string> => {
    try {
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'createSession',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create new session')
      }

      const data = await response.json()
      const newSessionId = data.sessionId

      setSessionId(newSessionId)
      localStorage.setItem('sessionId', newSessionId)

      return newSessionId
    } catch (error) {
      console.error('Create session error:', error)
      throw error
    }
  }

  return (
    <UserContext.Provider
      value={{
        userId,
        username,
        sessionId,
        isAuthenticated,
        login,
        logout,
        createNewSession,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}