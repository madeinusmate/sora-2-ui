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
          console.log(`[PROGRESS-HOOK] 🔔 Video ${recordId} status changed to ${data.status}`)
          const updatedVideo: Video = {
            id: recordId,
            prompt: "", // Will be filled by parent refresh
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

  // Polling function that can be called immediately or on interval
  const doPoll = useCallback(() => {
    console.log(`[POLLING-CLIENT] 🔔 Poll triggered!`)
    
    const currentInProgressVideos = videos.filter(video => 
      video.status === "in_progress" && video.video_id
    )
    
    console.log(`[POLLING-CLIENT] 📡 Found ${currentInProgressVideos.length} in-progress videos`)
    
    if (currentInProgressVideos.length === 0) {
      console.log(`[POLLING-CLIENT] ✅ No in-progress videos`)
      return
    }
    
    currentInProgressVideos.forEach(video => {
      if (video.video_id) {
        console.log(`[POLLING-CLIENT] 🔍 Checking video ${video.id.substring(0, 8)} (${video.video_id})`)
        fetchProgress(video.video_id, video.id)
        lastFetchTimeRef.current[video.id] = Date.now()
      }
    })
  }, [videos, fetchProgress])

  // Start polling for in-progress videos
  const startPolling = useCallback(() => {
    console.log(`[POLLING] 🚀 startPolling called`)
    
    setIsPolling(true)

    // Clear any existing interval
    if (intervalRef.current) {
      console.log(`[POLLING] 🧹 Clearing existing interval ${intervalRef.current}`)
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // Do an immediate poll
    console.log(`[POLLING] 🎬 Doing immediate poll...`)
    doPoll()

    // Set up polling interval - fixed at 3 seconds for consistent checking
    const pollInterval = 3000 // Poll every 3 seconds
    
    console.log(`[POLLING] ⏰ Setting up interval with ${pollInterval}ms`)
    
    const id = setInterval(() => {
      console.log(`[POLLING-CLIENT] ⏰ Interval callback fired! (ID: ${id})`)
      doPoll()
    }, pollInterval)
    
    intervalRef.current = id
    
    console.log(`[POLLING] ✅ Interval set up, ID:`, intervalRef.current)
    
    // Verify the interval is actually stored
    setTimeout(() => {
      console.log(`[POLLING] 🔍 Checking interval after 1s - still exists?`, intervalRef.current !== null)
    }, 1000)
  }, [doPoll])

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

    console.log(`[POLLING-EFFECT] 🔄 Videos changed:`, {
      total: videos.length,
      inProgress: inProgressVideos.length,
      isCurrentlyPolling: isPolling,
      videoStatuses: videos.map(v => ({ id: v.id.substring(0, 8), status: v.status }))
    })

    if (inProgressVideos.length > 0 && !isPolling) {
      console.log(`[POLLING-EFFECT] ▶️ Starting polling for ${inProgressVideos.length} videos`)
      startPolling()
    } else if (inProgressVideos.length === 0 && isPolling) {
      console.log(`[POLLING-EFFECT] ⏹️ Stopping polling - no in-progress videos`)
      stopPolling()
    } else {
      console.log(`[POLLING-EFFECT] ⏸️ No action needed`, { 
        hasInProgress: inProgressVideos.length > 0, 
        isPolling 
      })
    }

    // DON'T cleanup the interval here - let startPolling/stopPolling manage it
    // Cleanup only on unmount
    return () => {
      console.log(`[POLLING-EFFECT] 🧹 Effect cleanup - isPolling:`, isPolling)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos, isPolling]) // Don't include startPolling/stopPolling to avoid re-running

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
