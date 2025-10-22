"use client"

import { useState, useEffect, useCallback } from "react"
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

  useEffect(() => {
    const inProgressVideos = videos.filter(video => 
      video.status === "in_progress" && video.video_id
    )

    if (inProgressVideos.length === 0) {
      return
    }

    // Initial fetch for all in-progress videos
    inProgressVideos.forEach(video => {
      if (video.video_id) {
        fetchProgress(video.video_id, video.id)
      }
    })

    // Set up polling interval
    const interval = setInterval(() => {
      // Re-filter in-progress videos on each poll to handle status changes
      const currentInProgressVideos = videos.filter(video => 
        video.status === "in_progress" && video.video_id
      )
      
      currentInProgressVideos.forEach(video => {
        if (video.video_id) {
          fetchProgress(video.video_id, video.id)
        }
      })
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(interval)
  }, [videos, fetchProgress])

  const getVideoProgress = (videoId: string): ProgressData | null => {
    return progressData[videoId] || null
  }

  return { getVideoProgress }
}
