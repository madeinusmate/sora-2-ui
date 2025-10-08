import { LoginForm } from "@/components/login-form"
import { redirect } from "next/navigation"

export default function Page() {
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  if (!authEnabled) {
    return (
    // Redirect to home page
    redirect('/')
    )
  }
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 ">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  )
}
