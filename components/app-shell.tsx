"use client"

import type React from "react"

import { useAuth } from "@/lib/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
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
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Shield,
  Database,
  Archive,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login")
    }
  }, [user, isLoading, router])

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored === "true") setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-collapsed", String(next))
      return next
    })
  }

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
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "border-r border-border/40 bg-card/50 flex flex-col transition-[width] duration-200 ease-in-out",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <div
            className={cn(
              "border-b border-border/40 flex items-center gap-2",
              collapsed ? "p-3 justify-center" : "p-6 justify-between",
            )}
          >
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight truncate">FMV Platform</h1>
                <p className="text-xs text-muted-foreground mt-1">Assessment Management</p>
              </div>
            )}
            <div className="flex items-center gap-1">
              {!collapsed && <ThemeToggle className="-mr-1 -mt-1" />}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                className="h-8 w-8 shrink-0"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-4")}>
            {allNavigation.map((item) => {
              const Icon = item.icon
              const isActive = pathname.startsWith(item.href)
              const link = (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
                    collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && item.name}
                </Link>
              )
              return collapsed ? (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )
            })}
          </nav>
          <div className={cn("border-t border-border/40", collapsed ? "p-2" : "p-4")}>
            {collapsed && (
              <div className="flex justify-center pb-2">
                <ThemeToggle />
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn("w-full gap-3", collapsed ? "justify-center px-0" : "justify-start px-3")}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {user.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!collapsed && (
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.role}</p>
                    </div>
                  )}
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
    </TooltipProvider>
  )
}
