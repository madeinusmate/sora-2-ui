"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Sparkles, X, Shuffle, Upload, FileImage, FileVideo } from "lucide-react"
import type { Video } from "@/types/video"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface VideoGeneratorProps {
  onVideoGenerated: (video: Video) => void
  externalPrompt?: string
  remixMode?: {
    isActive: boolean
    video: Video | null
  }
  onExitRemix?: () => void
}

export function VideoGenerator({ onVideoGenerated, externalPrompt, remixMode, onExitRemix }: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const [selectedModel, setSelectedModel] = useState("sora-2")
  const [duration, setDuration] = useState("12")
  const [size, setSize] = useState("720x1280")

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update prompt when external prompt is provided
  useEffect(() => {
    if (externalPrompt) {
      setPrompt(externalPrompt)
    }
  }, [externalPrompt])

  const availableSizes =
    selectedModel === "sora-2-pro" ? ["1280x720", "720x1280", "1024x1792", "1792x1024"] : ["1280x720", "720x1280"]

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    const validVideoTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm']

    if (!validImageTypes.includes(file.type) && !validVideoTypes.includes(file.type)) {
      setFileError("Please select a valid image or video file (JPEG, PNG, GIF, WebP, MP4, MOV, AVI, WebM)")
      setSelectedFile(null)
      return
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      setFileError("File size must be less than 100MB")
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    setFileError(null)
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setFileError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const apiEndpoint = remixMode?.isActive ? "/api/remix-video" : "/api/generate-video"

      let response: Response

      if (selectedFile && !remixMode?.isActive) {
        // Send as FormData when file is selected
        const formData = new FormData()
        formData.append("prompt", prompt)
        formData.append("model", selectedModel)
        formData.append("seconds", duration)
        formData.append("size", size)
        formData.append("input_reference", selectedFile)

        response = await fetch(apiEndpoint, {
          method: "POST",
          body: formData,
        })
      } else {
        // Send as JSON when no file or in remix mode
        const requestBody = {
          prompt,
          model: selectedModel,
          seconds: duration,
          size: size,
          // Add remix parameters if in remix mode
          ...(remixMode?.isActive && remixMode.video && {
            input_video_id: remixMode.video.video_id
          })
        }

        response = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        })
      }

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate video")
      }

      const data = await response.json()
      onVideoGenerated(data.video)
      setPrompt("")

      // Exit remix mode after successful generation
      if (remixMode?.isActive && onExitRemix) {
        onExitRemix()
      }
    } catch (err) {
      console.error("[DEBUG] Error generating video:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Remix Mode Banner */}


      <Card className="border-2">
        <CardContent >
          {remixMode?.isActive && remixMode.video && (
            <Card className="border-2 mb-4 p-0 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Shuffle className="h-5 w-5 text-amber-600" />
                      <span className="font-semibold text-amber-800">Remix Mode</span>
                    </div>
                    <div className="h-4 w-px bg-amber-300" />
                    <Tooltip>
                      <TooltipTrigger>
                        <div className="text-sm text-amber-700">
                          Remixing: <span className="font-medium">
                            {remixMode.video.prompt.length > 60
                              ? remixMode.video.prompt.substring(0, 60) + "..."
                              : remixMode.video.prompt
                            }
                          </span>
                        </div>
                      </TooltipTrigger>

                      <TooltipContent>
                        <video src={remixMode.video.video_url} className="w-72 h-auto" controls />

                      </TooltipContent>
                    </Tooltip>

                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onExitRemix}
                    className="h-8 w-8 p-0 hover:bg-amber-100"
                    title="Exit remix mode"
                  >
                    <X className="h-4 w-4 text-amber-600" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              
              <Textarea
                id="prompt"
                placeholder="A serene sunset over a calm ocean with gentle waves..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="resize-none"
                disabled={isGenerating}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {/* File Upload Section - Only show when not in remix mode */}


            {!remixMode?.isActive && (
              <div className="flex flex-row flex-wrap gap-3 ">

<div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleUploadClick}
                        disabled={isGenerating}
                        className="flex items-center gap-2"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {selectedFile ? "Change File" : "Add image or video reference that guides generation. The referece file must be of the same size as the video you are generating."}
                    </TooltipContent>
                  </Tooltip>


                  {selectedFile && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {selectedFile.type.startsWith('image/') ? (
                        <FileImage className="h-4 w-4" />
                      ) : (
                        <FileVideo className="h-4 w-4" />
                      )}
                      <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
                {fileError && <p className="text-sm text-destructive">{fileError}</p>}

                <div className="space-y-2">

                  <Select
                    value={selectedModel}
                    onValueChange={(value) => {
                      setSelectedModel(value)
                      if (value === "sora-2" && !["1280x720", "720x1280"].includes(size)) {
                        setSize("1280x720")
                      }
                    }}
                  >
                    <SelectTrigger id="model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sora-2">Sora 2</SelectItem>
                      <SelectItem value="sora-2-pro">Sora 2 Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">

                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger id="duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 seconds</SelectItem>
                      <SelectItem value="8">8 seconds</SelectItem>
                      <SelectItem value="12">12 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">

                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger id="size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSizes.map((sizeOption) => (
                        <SelectItem key={sizeOption} value={sizeOption}>
                          {sizeOption}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
               
              </div>
            )}
            <Button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className="w-full" size="lg">
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {remixMode?.isActive ? "Remixing video..." : "Generating video..."}
                </>
              ) : (
                <>

                  {remixMode?.isActive ? "Remix Video" : "Generate Video"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
