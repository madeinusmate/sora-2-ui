"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Download, LogOut, Sparkles } from "lucide-react"
import { VideoFetchUtility } from "@/components/video-fetch-utility"
import { useAuth } from "@/lib/auth-context"
import type { Video } from "@/types/video"
import Image from "next/image"

interface AppHeaderProps {
  onVideoFetched: (video: Video) => void
}

export function AppHeader({ onVideoFetched }: AppHeaderProps) {
  const { user, signOut } = useAuth()
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.webp" alt="Sora 2 UI" width={32} height={32} />
            <h1 className="text-xl font-bold">Sora 2 UI</h1>
          </div>

          <div className="flex items-center gap-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manual Video Fetch</DialogTitle>
                  <DialogDescription>Fetch and store a video by providing its OpenAI video ID</DialogDescription>
                </DialogHeader>
                <VideoFetchUtility onVideoFetched={onVideoFetched} />
              </DialogContent>
            </Dialog>
            {authEnabled && user && (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
