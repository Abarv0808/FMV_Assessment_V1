"use client"

import type React from "react"

import { useAuth } from "@/lib/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LayoutDashboard, FileText, Settings, LogOut, Shield, Database, Archive } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Assessments", href: "/assessments", icon: FileText },
  { name: "Benchmarks", href: "/benchmarks", icon: Database },
  { name: "Archive", href: "/archive", icon: Archive },
]

const adminNavigation = [{ name: "Admin", href: "/admin", icon: Shield }]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [user, isLoading, router])

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) return null

  const allNavigation = user.role === "ADMIN" ? [...navigation, ...adminNavigation] : navigation

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/40 bg-card/50 flex flex-col">
        <div className="p-6 border-b border-border/40 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">FMV Platform</h1>
            <p className="text-xs text-muted-foreground mt-1">Assessment Management</p>
          </div>
          <ThemeToggle className="-mr-1 -mt-1" />
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {allNavigation.map((item) => {
            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-border/40">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-3 px-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {user.name.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.role}</p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm">{user.email}</span>
                  <span className="text-xs text-muted-foreground font-normal">{user.role}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
