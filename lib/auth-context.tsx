"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { User, Session, AuthError } from "@supabase/supabase-js"
import { createClient } from "./supabase/client"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    

    // Get initial session
    const getSession = async () => {
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error("[AUTH] Error getting initial session:", error)
        } else {
          
        }
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      } catch (error) {
        console.error("[AUTH] Exception getting initial session:", error)
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth changes
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => {
      
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  const signIn = async (email: string, password: string) => {
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        console.error("[AUTH] Sign in error:", error.message)
      } else {
        
      }

      return { error, data }
    } catch (error) {
      console.error("[AUTH] Sign in exception:", error)
      return { error: error as AuthError }
    }
  }

  const signOut = async () => {
    
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error("[AUTH] Sign out error:", error.message)
      } else {
        
      }

      return { error }
    } catch (error) {
      console.error("[AUTH] Sign out exception:", error)
      return { error: error as AuthError }
    }
  }

  const value = {
    user,
    session,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}