"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { SecurityGroup } from "@/lib/types"

type UserRole = "VIEWER" | "ANALYST" | "APPROVER" | "ADMIN"

interface User {
  id: string
  email: string
  name: string
  role: UserRole
  securityGroups: SecurityGroup[]
}

interface AuthContextType {
  user: User | null
  login: (email: string, role: UserRole, securityGroups: SecurityGroup[]) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for stored auth on mount
    const stored = localStorage.getItem("fmv-auth")
    if (stored) {
      setUser(JSON.parse(stored))
    }
    setIsLoading(false)
  }, [])

  const login = (email: string, role: UserRole, securityGroups: SecurityGroup[]) => {
    const newUser: User = {
      id: Math.random().toString(36).substring(7),
      email,
      name: email.split("@")[0],
      role,
      securityGroups,
    }
    setUser(newUser)
    localStorage.setItem("fmv-auth", JSON.stringify(newUser))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("fmv-auth")
  }

  return <AuthContext.Provider value={{ user, login, logout, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
