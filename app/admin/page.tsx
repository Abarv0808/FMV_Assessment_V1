"use client"

import { useAuth } from "@/lib/auth-context"
import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import { Shield, Database, Users, Settings, Plus } from "lucide-react"
import { mockManagedUsers } from "@/lib/mock-data"
import { SECURITY_GROUPS, USER_ROLES, type ManagedUser, type SecurityGroup, type UserRole } from "@/lib/types"

export default function AdminPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  // User management state
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>(mockManagedUsers)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newFullName, setNewFullName] = useState("")
  const [newSecurityGroups, setNewSecurityGroups] = useState<SecurityGroup[]>([])
  const [newRole, setNewRole] = useState<UserRole | "">("")
  const [formErrors, setFormErrors] = useState<{ email?: string; fullName?: string; securityGroup?: string; role?: string }>({})
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    if (!isLoading && user?.role !== "ADMIN") {
      router.push("/dashboard")
    }
  }, [user, isLoading, router])

  const resetForm = useCallback(() => {
    setNewEmail("")
    setNewFullName("")
    setNewSecurityGroups([])
    setNewRole("")
    setFormErrors({})
    setShowErrors(false)
  }, [])

  const validateForm = useCallback((): boolean => {
    const errors: { email?: string; fullName?: string; securityGroup?: string; role?: string } = {}
    if (!newFullName.trim()) {
      errors.fullName = "Full Name is required."
    }
    if (!newEmail.trim()) {
      errors.email = "Email Address is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      errors.email = "Please enter a valid email address."
    } else if (!newEmail.trim().toLowerCase().endsWith("@takeda.com")) {
      errors.email = "Email must be a @takeda.com address."
    } else if (managedUsers.some((u) => u.email.toLowerCase() === newEmail.trim().toLowerCase())) {
      errors.email = "A user with this email already exists."
    }
    if (newSecurityGroups.length === 0) {
      errors.securityGroup = "At least one Security Group is required."
    }
    if (!newRole) {
      errors.role = "Role is required."
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [newEmail, newFullName, newSecurityGroups, newRole, managedUsers])

  const handleCreateUser = useCallback(() => {
    setShowErrors(true)
    if (!validateForm()) return
    const newUser: ManagedUser = {
      id: `mu-${Date.now()}`,
      email: newEmail.trim().toLowerCase(),
      fullName: newFullName.trim(),
      securityGroups: newSecurityGroups,
      role: newRole as UserRole,
    }
    setManagedUsers((prev) => [...prev, newUser])
    setShowCreateDialog(false)
    resetForm()
  }, [validateForm, newEmail, newFullName, newSecurityGroups, newRole, resetForm])

  const handleToggleSecurityGroup = useCallback((userId: string, sg: SecurityGroup) => {
    setManagedUsers((prev) =>
      prev.map((u) => {
        if (u.id !== userId) return u
        const has = u.securityGroups.includes(sg)
        const updated = has
          ? u.securityGroups.filter((g) => g !== sg)
          : [...u.securityGroups, sg]
        // Don't allow removing all groups
        if (updated.length === 0) return u
        return { ...u, securityGroups: updated }
      })
    )
  }, [])

  const handleRoleChange = useCallback((userId: string, role: UserRole) => {
    setManagedUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role } : u))
    )
  }, [])

  if (isLoading || user?.role !== "ADMIN") {
    return null
  }

  return (
    <AppShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Admin Console</h1>
            <p className="text-muted-foreground mt-1">Manage system settings and configurations</p>
          </div>
        </div>

        {/* Admin Tabs */}
        <Tabs defaultValue="taxonomies" className="space-y-4">
          <TabsList>
            <TabsTrigger value="taxonomies">Taxonomies</TabsTrigger>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="connectors">Connectors</TabsTrigger>
          </TabsList>

          <TabsContent value="taxonomies">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Taxonomy Management
                </CardTitle>
                <CardDescription>Manage service codes, categories, and mapping dictionaries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-border/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Service Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        Manage the taxonomy of service codes and additional information
                      </p>
                      <Button variant="outline" size="sm">
                        Manage Codes
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-border/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Categories</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">Define and organize service categories</p>
                      <Button variant="outline" size="sm">
                        Manage Categories
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-border/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Mapping Dictionary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">Configure code mappings between systems</p>
                      <Button variant="outline" size="sm">
                        Manage Mappings
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="thresholds">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Threshold Profiles
                </CardTitle>
                <CardDescription>Configure variance thresholds for flagging proposal items</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <p>Threshold profile management coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="border-border/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      User Management
                    </CardTitle>
                    <CardDescription className="mt-1.5">Manage user accounts and security group assignments</CardDescription>
                  </div>
                  <Button onClick={() => { resetForm(); setShowCreateDialog(true) }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-border/40 rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/40">
                        <TableHead>Full Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="min-w-[160px]">Security Group</TableHead>
                        <TableHead className="min-w-[150px]">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {managedUsers.map((mu) => (
                        <TableRow key={mu.id} className="border-border/40">
                          <TableCell className="font-medium">{mu.fullName}</TableCell>
                          <TableCell className="text-muted-foreground">{mu.email}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-xs font-normal min-w-[140px] justify-between">
                                  <span className="truncate">{mu.securityGroups.join(", ")}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {SECURITY_GROUPS.map((sg) => (
                                  <DropdownMenuCheckboxItem
                                    key={sg}
                                    checked={mu.securityGroups.includes(sg)}
                                    onCheckedChange={() => handleToggleSecurityGroup(mu.id, sg)}
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    {sg}
                                  </DropdownMenuCheckboxItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mu.role}
                              onValueChange={(val) => handleRoleChange(mu.id, val as UserRole)}
                            >
                              <SelectTrigger className="h-8 text-xs w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {USER_ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                      {managedUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            No users yet. Click "Create User" to add one.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="connectors">
            <Card className="border-border/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Benchmark Connectors
                </CardTitle>
                <CardDescription>Configure connections to benchmark data sources</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <p>Connector configuration coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) resetForm(); setShowCreateDialog(open) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>Add a new user to the system. All fields are required.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-email">Email Address *</Label>
              <Input
                id="create-email"
                type="email"
                placeholder="user@takeda.com"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value)
                  if (showErrors) {
                    setFormErrors((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                className={showErrors && formErrors.email ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {showErrors && formErrors.email && (
                <p className="text-xs text-red-500">{formErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-fullname">Full Name *</Label>
              <Input
                id="create-fullname"
                placeholder="Enter full name"
                value={newFullName}
                onChange={(e) => {
                  setNewFullName(e.target.value)
                  if (showErrors) {
                    setFormErrors((prev) => ({ ...prev, fullName: undefined }))
                  }
                }}
                className={showErrors && formErrors.fullName ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {showErrors && formErrors.fullName && (
                <p className="text-xs text-red-500">{formErrors.fullName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Security Group(s) *</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full justify-between font-normal ${showErrors && formErrors.securityGroup ? "border-red-500" : ""}`}
                  >
                    {newSecurityGroups.length > 0 ? newSecurityGroups.join(", ") : "Select Security Groups"}
                    <span className="ml-2 text-xs text-muted-foreground">{newSecurityGroups.length} selected</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]" align="start">
                  {SECURITY_GROUPS.map((sg) => (
                    <DropdownMenuCheckboxItem
                      key={sg}
                      checked={newSecurityGroups.includes(sg)}
                      onCheckedChange={() => {
                        setNewSecurityGroups((prev) =>
                          prev.includes(sg) ? prev.filter((g) => g !== sg) : [...prev, sg]
                        )
                        if (showErrors) {
                          setFormErrors((prev) => ({ ...prev, securityGroup: undefined }))
                        }
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {sg}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {showErrors && formErrors.securityGroup && (
                <p className="text-xs text-red-500">{formErrors.securityGroup}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                value={newRole || undefined}
                onValueChange={(val) => {
                  setNewRole(val as UserRole)
                  if (showErrors) {
                    setFormErrors((prev) => ({ ...prev, role: undefined }))
                  }
                }}
              >
                <SelectTrigger className={showErrors && formErrors.role ? "border-red-500 focus:ring-red-500" : ""}>
                  <SelectValue placeholder="Select Role" />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors && formErrors.role && (
                <p className="text-xs text-red-500">{formErrors.role}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setShowCreateDialog(false) }}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
