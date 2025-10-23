"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { VideoGenerator } from "@/components/video-generator"
import { VideoGrid } from "@/components/video-grid"
import { LoginForm } from "@/components/login-form"
import { useAuth } from "@/lib/auth-context"
import type { Video } from "@/types/video"

export default function Home() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [videos, setVideos] = useState<Video[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [externalPrompt, setExternalPrompt] = useState<string>("")
  const [remixMode, setRemixMode] = useState<{
    isActive: boolean
    video: Video | null
  }>({ isActive: false, video: null })
  const [authCheckTrigger, setAuthCheckTrigger] = useState(0)

  // Check if auth is enabled
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  // Force re-render when auth state changes
  useEffect(() => {
    if (user) {
      
      setAuthCheckTrigger(prev => prev + 1)
    }
  }, [user])

  useEffect(() => {
    

    // If auth is not enabled, fetch videos immediately
    if (!authEnabled) {
      
      fetchVideos()
      return
    }

    // If auth is enabled and user is not authenticated, redirect to login
    if (!loading && !user && authEnabled) {
      
      router.push('/login')
      return
    }

    // If auth is enabled and user is authenticated, fetch videos
    if (!loading && user && authEnabled) {
      
      fetchVideos()
    }
  }, [user, loading, authEnabled, router, authCheckTrigger])

  const fetchVideos = async () => {
    
    try {
      const response = await fetch("/api/videos")
      

      if (response.ok) {
        const data = await response.json()
        
        setVideos(data.videos)
      } else {
        console.error("Failed to fetch videos:", response.status, response.statusText)
      }
    } catch (error) {
      console.error("Error fetching videos:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVideoGenerated = (newVideo: Video) => {
    setVideos((prev) => [newVideo, ...prev])
  }

  const handleVideoFetched = (newVideo: Video) => {
    setVideos((prev) => [newVideo, ...prev])
  }

  const handleVideoUpdate = async (updatedVideo: Video) => {
    console.log("[VIDEO-UPDATE] 📥 Received update:", {
      id: updatedVideo.id,
      status: updatedVideo.status,
      hasVideoUrl: !!updatedVideo.video_url,
      hasError: !!updatedVideo.error_message,
      videoUrl: updatedVideo.video_url?.substring(0, 50) + "..."
    })

    // Update the video in state immediately with available data
    setVideos((prev) => {
      const updated = prev.map((video) =>
        video.id === updatedVideo.id
          ? { ...video, ...updatedVideo }
          : video
      )
      console.log("[VIDEO-UPDATE] 📊 Updated videos in state (immediate)")
      return updated
    })

    // Determine if we should refresh from database
    // Refresh when video completes successfully OR fails
    const isCompleted = updatedVideo.status === "completed" && updatedVideo.video_url
    const isFailed = updatedVideo.status === "failed"
    const shouldRefresh = isCompleted || isFailed
    
    console.log("[VIDEO-UPDATE] 🔍 Should refresh?", shouldRefresh, {
      status: updatedVideo.status,
      hasUrl: !!updatedVideo.video_url,
      isCompleted,
      isFailed
    })

    if (shouldRefresh) {
      const action = isCompleted ? "completed" : "failed"
      console.log(`[VIDEO-UPDATE] ${isCompleted ? '🎉' : '❌'} Video ${action}! Fetching full data from database...`)
      
      try {
        const response = await fetch("/api/videos")
        console.log("[VIDEO-UPDATE] 📡 Response status:", response.status)
        
        if (response.ok) {
          const data = await response.json()
          console.log("[VIDEO-UPDATE] 📦 Received data:", {
            videoCount: data.videos?.length,
            firstVideo: data.videos?.[0]?.id
          })
          console.log("[VIDEO-UPDATE] ✅ Refreshed videos from database")
          setVideos(data.videos)
        } else {
          console.error("[VIDEO-UPDATE] ❌ Response not OK:", response.status)
        }
      } catch (error) {
        console.error("[VIDEO-UPDATE] ❌ Failed to refresh videos:", error)
      }
    }
  }

  const handlePromptReuse = (prompt: string) => {
    setExternalPrompt(prompt)
    // Clear the external prompt after a short delay to allow the video generator to pick it up
    setTimeout(() => setExternalPrompt(""), 100)
  }

  const handleVideoDelete = (videoId: string) => {
    setVideos((prev) => prev.filter((video) => video.id !== videoId))
  }

  const handleVideoRemix = (video: Video) => {
    setRemixMode({ isActive: true, video })

    // Clear the external prompt after a short delay to allow the video generator to pick it up
    setTimeout(() => setExternalPrompt(""), 100)
  }

  const handleExitRemix = () => {
    setRemixMode({ isActive: false, video: null })
  }

  // Show loading state while checking auth
  if (loading) {
    
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If auth is enabled and user is not authenticated, show login form
  if (authEnabled && !user) {
    
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
    )
  }

  // If auth is disabled or user is authenticated, show the main app
  
   

  // Additional check: if we have a user but auth is enabled, ensure we're showing the main app
  if (authEnabled && user) {
    
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <AppHeader onVideoFetched={handleVideoFetched} />

      <main className="container mx-auto px-4 py-12 max-w-6xl">
        <div className="space-y-8">
          <VideoGenerator
            onVideoGenerated={handleVideoGenerated}
            externalPrompt={externalPrompt}
            remixMode={remixMode}
            onExitRemix={handleExitRemix}
          />

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Your Creations</h2>
            <VideoGrid
              videos={videos}
              isLoading={isLoading}
              onVideoUpdate={handleVideoUpdate}
              onPromptReuse={handlePromptReuse}
              onVideoDelete={handleVideoDelete}
              onVideoRemix={handleVideoRemix}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
