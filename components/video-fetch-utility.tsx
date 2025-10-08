"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Download } from "lucide-react"
import type { Video } from "@/types/video"

interface VideoFetchUtilityProps {
  onVideoFetched: (video: Video) => void
}

export function VideoFetchUtility({ onVideoFetched }: VideoFetchUtilityProps) {
  const [videoId, setVideoId] = useState("")
  const [isFetching, setIsFetching] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleFetch = async () => {
    if (!videoId.trim()) return

    setIsFetching(true)
    setMessage(null)

    try {
      const response = await fetch("/api/fetch-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId: videoId.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch video")
      }

      setMessage({ type: "success", text: data.message || "Video fetched successfully" })
      onVideoFetched(data.video)
      setVideoId("")
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="video_abc123..."
          value={videoId}
          onChange={(e) => setVideoId(e.target.value)}
          disabled={isFetching}
          className="flex-1"
        />
        <Button onClick={handleFetch} disabled={isFetching || !videoId.trim()}>
          {isFetching ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Fetch
            </>
          )}
        </Button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-destructive" : "text-green-600"}`}>{message.text}</p>
      )}
    </div>
  )
}
