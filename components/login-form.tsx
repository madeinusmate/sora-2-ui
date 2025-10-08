"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useState } from "react"
import Image from "next/image"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { signIn } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[LOGIN] Attempting login for email:", email)

    // Basic validation
    if (!email.trim()) {
      setError("Email is required")
      return
    }

    if (!password.trim()) {
      setError("Password is required")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await signIn(email.trim(), password)

      if (error) {
        console.error("[LOGIN] Login failed:", error.message)

        // Provide more user-friendly error messages
        let errorMessage = error.message
        if (error.message.includes("Invalid login credentials")) {
          errorMessage = "Invalid email or password. Please check your credentials and try again."
        } else if (error.message.includes("Email not confirmed")) {
          errorMessage = "Please check your email and click the confirmation link before signing in."
        } else if (error.message.includes("Too many requests")) {
          errorMessage = "Too many login attempts. Please wait a few minutes before trying again."
        }

        setError(errorMessage)
        setIsLoading(false)
      } else {
        console.log("[LOGIN] Login successful for user:", email)
        setSuccess("Login successful! Redirecting...")

        // If successful, the auth state will be updated by the AuthProvider
        // The loading state will be managed by the auth context
        // We don't reset isLoading here because the page will redirect

        // Redirect to main app after successful login
        setTimeout(() => {
          window.location.href = '/'
        }, 1500)
      }
    } catch (error) {
      console.error("[LOGIN] Login exception:", error)
      setError("An unexpected error occurred. Please check your connection and try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <div className="flex justify-center items-center mb-4">
          <Image src="/logo.webp" alt="Sora 2 UI" width={72} height={72} />   
          </div>
          <CardTitle>Login to Sora 2 UI</CardTitle>
          <CardDescription>
            Enter your credentials to login to Sora 2 UI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}             
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
