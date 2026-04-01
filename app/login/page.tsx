"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SECURITY_GROUPS, type SecurityGroup } from "@/lib/types"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"VIEWER" | "ANALYST" | "APPROVER" | "ADMIN">("ANALYST")
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>(["USBU"])
  const { login } = useAuth()
  const router = useRouter()

  const toggleGroup = (sg: SecurityGroup) => {
    setSecurityGroups((prev) =>
      prev.includes(sg) ? prev.filter((g) => g !== sg) : [...prev, sg]
    )
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (email && securityGroups.length > 0) {
      login(email, role, securityGroups)
      router.push("/dashboard")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/40 shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold tracking-tight">FMV Assessment Platform</CardTitle>
          <CardDescription className="text-muted-foreground">Sign in to access your assessments</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role (for testing)</Label>
              <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                <SelectTrigger id="role" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">Viewer (Read-only)</SelectItem>
                  <SelectItem value="ANALYST">Analyst (Create & Edit)</SelectItem>
                  <SelectItem value="APPROVER">Approver (Review & Approve)</SelectItem>
                  <SelectItem value="ADMIN">Admin (Full Access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Security Groups / Business Units (for testing)</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between bg-background font-normal">
                    {securityGroups.length > 0 ? securityGroups.join(", ") : "Select groups..."}
                    <span className="ml-2 text-xs text-muted-foreground">{securityGroups.length} selected</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]" align="start">
                  {SECURITY_GROUPS.map((sg) => (
                    <DropdownMenuCheckboxItem
                      key={sg}
                      checked={securityGroups.includes(sg)}
                      onCheckedChange={() => toggleGroup(sg)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {sg}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
