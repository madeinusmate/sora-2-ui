"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { Video } from "@/types/video"

interface ProgressData {
  status: string
  progress?: number | null
  error_message?: string | null
  video_url?: string | null
  openai_status?: string
  updated_at: string
}

export const useVideoProgress = (videos: Video[], onVideoUpdate: (updatedVideo: Video) => void) => {
  const [progressData, setProgressData] = useState<Record<string, ProgressData>>({})
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastFetchTimeRef = useRef<Record<string, number>>({})

  const fetchProgress = useCallback(async (videoId: string, recordId: string) => {
    try {
      const response = await fetch(`/api/video-progress?video_id=${videoId}`)
      if (response.ok) {
        const data: ProgressData = await response.json()
        
        setProgressData(prev => ({
          ...prev,
          [recordId]: data
        }))

        // If status changed to completed or failed, update the parent
        if (data.status !== "in_progress") {
          const updatedVideo: Video = {
            id: recordId,
            prompt: "", // Will be filled by parent
            video_url: data.video_url || "",
            status: data.status as "in_progress" | "completed" | "failed",
            error_message: data.error_message || undefined,
            created_at: data.updated_at,
          }
          onVideoUpdate(updatedVideo)
        }
      }
    } catch (error) {
      console.error(`Failed to fetch progress for video ${videoId}:`, error)
    }
  }, [onVideoUpdate])

  // Start polling for in-progress videos
  const startPolling = useCallback(() => {
    const inProgressVideos = videos.filter(video => 
      video.status === "in_progress" && video.video_id
    )

    if (inProgressVideos.length === 0) {
      setIsPolling(false)
      return
    }

    setIsPolling(true)
    console.log(`[POLLING] 🔄 Starting polling for ${inProgressVideos.length} in-progress videos`)

    // Initial fetch for all in-progress videos
    inProgressVideos.forEach(video => {
      if (video.video_id) {
        fetchProgress(video.video_id, video.id)
        lastFetchTimeRef.current[video.id] = Date.now()
      }
    })

    // Set up polling interval with exponential backoff
    let pollInterval = 5000 // Start with 5 seconds
    const maxInterval = 30000 // Max 30 seconds
    const backoffMultiplier = 1.5

    const poll = () => {
      const currentInProgressVideos = videos.filter(video => 
        video.status === "in_progress" && video.video_id
      )
      
      if (currentInProgressVideos.length === 0) {
        console.log(`[POLLING] ✅ No more in-progress videos, stopping polling`)
        setIsPolling(false)
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return
      }

      console.log(`[POLLING] 📡 Polling ${currentInProgressVideos.length} videos (interval: ${pollInterval}ms)`)
      
      currentInProgressVideos.forEach(video => {
        if (video.video_id) {
          const lastFetch = lastFetchTimeRef.current[video.id] || 0
          const timeSinceLastFetch = Date.now() - lastFetch
          
          // Only fetch if it's been at least 3 seconds since last fetch for this video
          if (timeSinceLastFetch >= 3000) {
            fetchProgress(video.video_id, video.id)
            lastFetchTimeRef.current[video.id] = Date.now()
          }
        }
      })

      // Increase interval gradually (exponential backoff)
      pollInterval = Math.min(pollInterval * backoffMultiplier, maxInterval)
    }

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    intervalRef.current = setInterval(poll, pollInterval)
  }, [videos, fetchProgress])

  // Stop polling
  const stopPolling = useCallback(() => {
    console.log(`[POLLING] ⏹️ Stopping polling`)
    setIsPolling(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Effect to manage polling based on video status
  useEffect(() => {
    const inProgressVideos = videos.filter(video => 
      video.status === "in_progress" && video.video_id
    )

    if (inProgressVideos.length > 0 && !isPolling) {
      startPolling()
    } else if (inProgressVideos.length === 0 && isPolling) {
      stopPolling()
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [videos, isPolling, startPolling, stopPolling])

  const getVideoProgress = (videoId: string): ProgressData | null => {
    return progressData[videoId] || null
  }

  const manualRefresh = useCallback(() => {
    const inProgressVideos = videos.filter(video => 
      video.status === "in_progress" && video.video_id
    )
    
    console.log(`[POLLING] 🔄 Manual refresh for ${inProgressVideos.length} videos`)
    inProgressVideos.forEach(video => {
      if (video.video_id) {
        fetchProgress(video.video_id, video.id)
        lastFetchTimeRef.current[video.id] = Date.now()
      }
    })
  }, [videos, fetchProgress])

  return { 
    getVideoProgress, 
    isPolling, 
    startPolling, 
    stopPolling, 
    manualRefresh 
  }
}
