"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

interface ThemeToggleProps {
  className?: string
  variant?: "icon" | "full"
}

export function ThemeToggle({ className, variant = "icon" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch — next-themes resolves on the client.
  React.useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"
  const next = isDark ? "light" : "dark"
  const label = mounted ? `Switch to ${next} mode` : "Toggle theme"

  if (variant === "full") {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setTheme(next)}
        aria-label={label}
        title={label}
        className={className}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="ml-2">{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</span>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={className}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{label}</span>
    </Button>
  )
}
