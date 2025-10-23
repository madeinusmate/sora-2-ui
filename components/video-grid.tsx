"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Video } from "@/types/video"
import { formatDistanceToNow } from "date-fns"
import { Loader2, AlertCircle, CheckCircle2, Clock, Copy, Trash2, Shuffle, Sparkles, Search, Filter, X, RefreshCw } from "lucide-react"
import { useVideoProgress } from "@/hooks/use-video-progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useState, useMemo, useEffect } from "react"
interface VideoGridProps {
  videos: Video[]
  isLoading: boolean
  onVideoUpdate: (updatedVideo: Video) => void
  onPromptReuse: (prompt: string) => void
  onVideoDelete: (videoId: string) => void
  onVideoRemix: (video: Video) => void
}

export function VideoGrid({ videos, isLoading, onVideoUpdate, onPromptReuse, onVideoDelete, onVideoRemix }: VideoGridProps) {
  const { getVideoProgress, isPolling, startPolling, stopPolling, manualRefresh } = useVideoProgress(videos, onVideoUpdate)
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [checkingStatusVideoId, setCheckingStatusVideoId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [creationTypeFilter, setCreationTypeFilter] = useState<string>("all")
  const [modelFilter, setModelFilter] = useState<string>("all")

  // Debug: Log when videos prop changes
  useEffect(() => {
    console.log("[VIDEO-GRID] 🔄 Videos prop changed:", {
      count: videos.length,
      statuses: videos.map(v => ({ id: v.id.substring(0, 8), status: v.status }))
    })
  }, [videos])

  // Get unique values for filter options
  const uniqueCreationTypes = useMemo(() => {
    const types = videos.map(v => v.creation_type).filter((type): type is string => Boolean(type))
    return Array.from(new Set(types))
  }, [videos])

  const uniqueModels = useMemo(() => {
    const models = videos.map(v => v.model).filter((model): model is string => Boolean(model))
    return Array.from(new Set(models))
  }, [videos])

  // Filter videos based on search query, creation type, and model
  const filteredVideos = useMemo(() => {
    return videos.filter(video => {
      // Search filter
      const matchesSearch = !searchQuery.trim() ||
        video.prompt.toLowerCase().includes(searchQuery.toLowerCase())

      // Creation type filter
      const matchesCreationType = creationTypeFilter === "all" ||
        video.creation_type === creationTypeFilter

      // Model filter
      const matchesModel = modelFilter === "all" ||
        video.model === modelFilter

      return matchesSearch && matchesCreationType && matchesModel
    })
  }, [videos, searchQuery, creationTypeFilter, modelFilter])

  const clearAllFilters = () => {
    setSearchQuery("")
    setCreationTypeFilter("all")
    setModelFilter("all")
  }

  const hasActiveFilters = searchQuery.trim() || creationTypeFilter !== "all" || modelFilter !== "all"

  const handleDeleteVideo = async (videoId: string) => {
    setDeletingVideoId(videoId)

    try {
      console.log(`[UI] Deleting video: ${videoId}`)
      const response = await fetch(`/api/delete-video?id=${videoId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete video")
      }

      const data = await response.json()
      console.log(`[UI] Successfully deleted video:`, data)

      // Call the parent callback to remove from state
      onVideoDelete(videoId)

    } catch (error) {
      console.error("[UI] Error deleting video:", error)
      // You could add a toast notification here for better UX
    } finally {
      setDeletingVideoId(null)
    }
  }

  const handleCheckVideoStatus = async (videoId: string) => {
    setCheckingStatusVideoId(videoId)

    try {
      console.log(`[UI] Checking status for video: ${videoId}`)
      const response = await fetch(`/api/check-video-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to check video status")
      }

      const data = await response.json()
      console.log(`[UI] Status check result:`, data)

      if (data.success) {
        // If the video was completed or failed, we need to refresh the video data
        // The onVideoUpdate callback should handle this
        const updatedVideo = videos.find(v => v.id === videoId)
        if (updatedVideo) {
          // Trigger a refresh by calling onVideoUpdate with the current video
          // This will cause the parent to refetch the video data
          onVideoUpdate(updatedVideo)
        }
      }

    } catch (error) {
      console.error("[UI] Error checking video status:", error)
      // You could add a toast notification here for better UX
    } finally {
      setCheckingStatusVideoId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="w-full aspect-video rounded-lg mb-3" />
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-center">No videos yet. Generate your first video above!</p>
        </CardContent>
      </Card>
    )
  }

  if (filteredVideos.length === 0 && hasActiveFilters) {
    return (
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search videos by prompt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filters:</span>
            </div>

            <Select value={creationTypeFilter} onValueChange={setCreationTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Creation Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueCreationTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === "standard" ? "Standard" : type === "remix" ? "Remix" : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {uniqueModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model?.replace("-", " ") || model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllFilters}
                className="h-8"
              >
                <X className="h-3 w-3 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground text-center">
              No videos found matching your filters
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getCreationTypeInfo = (creation_type: string) => {
    switch (creation_type) {
      case "standard":
        return {
          badge: { text: "Standard", variant: "default" as const },
          icon: <Sparkles className="h-4 w-4" />,
        }
      case "remix":
        return {
          badge: { text: "Remix", variant: "amber" as const },
          icon: <Shuffle className="h-4 w-4" />,
        }

    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search videos by prompt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />

        </div>
        <div className="flex flex-row gap-4 items-center justify-start w-full">
          

          <Select value={creationTypeFilter} onValueChange={setCreationTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Creation Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueCreationTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  <p className="capitalize">{type}</p>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {uniqueModels.map((model) => (
                <SelectItem key={model} value={model}>
                  <p className="capitalize">{model?.replace("-", " ") || model}</p>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Polling Controls */}
          <div className="flex items-center gap-2">
            {/* {isPolling ? (
              <Button
                variant="outline"
                size="sm"
                onClick={stopPolling}
                className="flex items-center gap-2"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Stop Polling
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={startPolling}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Start Polling
              </Button>
            )} */}
            
            <Button
              variant="outline"
              size="sm"
              onClick={manualRefresh}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Now
            </Button>
          </div>
          
        </div>


      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVideos.map((video) => {
          const progressData = getVideoProgress(video.id)

          // Use real-time progress data if available
          const currentStatus = progressData?.status || video.status
          const progressPercentage = progressData?.progress || null
          const errorMessage = progressData?.error_message || video.error_message

          return (
            <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-4">
                {currentStatus === "in_progress" ? (
                  <div className="relative w-full aspect-video rounded-lg mb-3 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        <div className="text-sm font-medium text-blue-700">Generating Video</div>
                        {isPolling && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-600">Live</span>
                          </div>
                        )}
                      </div>

                      {progressPercentage !== null && (
                        <div className="text-xs text-blue-600 font-medium">
                          {Math.round(progressPercentage)}% complete
                        </div>
                      )}

                      <div className="text-xs text-blue-600 text-center px-4">
                        {progressPercentage !== null
                          ? "Progress updating in real-time"
                          : "This may take a few minutes."
                        }
                      </div>

                      {/* Dynamic progress indicator */}
                      <div className="w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: progressPercentage !== null ? `${progressPercentage}%` : '60%',
                            animation: progressPercentage === null ? 'pulse 2s infinite' : 'none'
                          }}
                        />
                      </div>

                      {progressData?.openai_status && progressData.openai_status !== currentStatus && (
                        <div className="text-xs text-blue-500 font-mono bg-blue-100 px-2 py-1 rounded">
                          OpenAI: {progressData.openai_status}
                        </div>
                      )}
                    </div>
                  </div>
                ) : currentStatus === "failed" ? (
                  <div className="relative w-full aspect-video rounded-lg mb-3 bg-gradient-to-br from-red-50 to-rose-50 border-2 border-dashed border-red-200 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-8 w-8 text-red-500" />
                      <div className="text-sm font-medium text-red-700">Generation Failed</div>
                      {errorMessage && (
                        <div className="text-xs text-red-600 text-center px-4 max-w-full">
                          <div className="font-semibold mb-1">Error Details:</div>
                          <div className="bg-red-100 p-2 rounded text-left font-mono text-xs break-words">
                            {errorMessage}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                ) : currentStatus === "completed" && (progressData?.video_url || video.video_url) ? (
                  <div className="relative">
                    <video
                      src={progressData?.video_url || video.video_url}
                      controls
                      className="w-full aspect-video rounded-lg mb-3 bg-muted shadow-sm"

                    />

                  </div>
                ) : (
                  <div className="relative w-full aspect-video rounded-lg mb-3 bg-gradient-to-br from-gray-50 to-slate-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <Clock className="h-8 w-8 text-gray-400" />
                      <div className="text-sm font-medium text-gray-600">Processing</div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2 text-pretty flex-1">{video.prompt}</p>

                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}</span>
                    {video.model && (
                      <>
                        <span>•</span>
                        <span className="capitalize">{video.model.replace("-", " ")}</span>
                      </>
                    )}
                    {video.creation_type && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span>•</span>
                        <Badge variant={getCreationTypeInfo(video.creation_type)?.badge.variant} className="flex items-center gap-1">
                          {getCreationTypeInfo(video.creation_type)?.icon}
                          {getCreationTypeInfo(video.creation_type)?.badge.text}
                        </Badge>
                      </div>
                      // <>
                      //   <span>•</span>
                      //   <span className="capitalize">{video.creation_type.replace("-", " ")}</span>
                      // </>
                    )}


                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {currentStatus === "in_progress" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCheckVideoStatus(video.id)}
                        className="h-8 w-8 p-0 hover:bg-green-100"
                        title="Check video status"
                        disabled={checkingStatusVideoId === video.id}
                      >
                        <Tooltip>
                          <TooltipTrigger>
                            {checkingStatusVideoId === video.id ? (
                              <Loader2 className="h-3 w-3 text-green-600 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 text-green-600" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {checkingStatusVideoId === video.id ? "Checking status..." : "Check video status"}
                          </TooltipContent>
                        </Tooltip>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPromptReuse(video.prompt)}
                      className="h-8 w-8 p-0 hover:bg-blue-100"
                      title="Reuse this prompt"
                    >
                      <Tooltip>
                        <TooltipTrigger>
                          <Copy className="h-3 w-3 text-blue-600" />
                        </TooltipTrigger>
                        <TooltipContent>Reuse this prompt</TooltipContent>
                      </Tooltip>

                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onVideoRemix(video)}
                      className="h-8 w-8 p-0 hover:bg-amber-100"
                      title="Remix this Video"
                    >
                      <Tooltip>
                        <TooltipTrigger>
                          <Shuffle className="h-3 w-3 text-amber-600" />
                        </TooltipTrigger>
                        <TooltipContent>Remix this Video</TooltipContent>
                      </Tooltip>

                    </Button>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-100"
                          title="Delete this video"
                          disabled={deletingVideoId === video.id}
                        >
                          <Tooltip>
                            <TooltipTrigger>
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </TooltipTrigger>
                            <TooltipContent>Delete this video</TooltipContent>
                          </Tooltip>
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Video</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to delete this video? This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="text-sm text-muted-foreground">
                            <strong>Prompt:</strong> {video.prompt.length > 100 ? video.prompt.substring(0, 100) + "..." : video.prompt}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { }}>
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteVideo(video.id)}
                            disabled={deletingVideoId === video.id}
                          >
                            {deletingVideoId === video.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              "Delete Video"
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
