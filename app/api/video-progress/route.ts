import { NextResponse } from "next/server"
import { getProviderConfig, getCurrentProvider } from "@/lib/provider-config"
import { fetchVideoByVideoId, updateVideoStatus } from "@/lib/database-utils"
import { uploadVideoToStorage } from "@/lib/storage-utils"

// Azure endpoint constant
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get("video_id")
    
    if (!videoId) {
      return NextResponse.json({ error: "video_id parameter is required" }, { status: 400 })
    }

    console.log(`[PROGRESS] 📊 Checking progress for video: ${videoId}`)

    const video = await fetchVideoByVideoId(videoId)

    console.log(`[PROGRESS] 📋 Current status for ${videoId}:`, {
      status: video.status,
      hasError: !!video.error_message,
      hasVideo: !!video.video_url
    })

    // If video is still in progress, try to get real-time status from provider
    if (video.status === "in_progress") {
      try {
        const providerConfig = getProviderConfig()
        console.log(`[PROGRESS] 🔍 Fetching real-time status from ${getCurrentProvider().toUpperCase()}...`)
        const statusResponse = await fetch(providerConfig.statusUrl(videoId), {
          method: "GET",
          headers: providerConfig.headers,
        })

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          console.log(`[PROGRESS] 📡 Real-time status from ${getCurrentProvider().toUpperCase()}:`, {
            status: statusData.status,
            progress: statusData.progress || "unknown"
          })

          // If provider reports success but database is still in_progress, update the database
          if ((statusData.status === "succeeded" || statusData.status === "completed") && !video.video_url) {
            console.log(`[PROGRESS] 🎉 Video completed! Updating database status...`)
            
            try {
              // Check if we have generations array (Azure API pattern)
              const generations = statusData.generations ?? []
              if (generations.length > 0) {
                const generationId = generations[0].id
                console.log(`[PROGRESS] 📹 Found generation ID: ${generationId}`)
                
                // Construct the correct video content URL using generationId
                const videoContentUrl = `${AZURE_ENDPOINT}/video/generations/${generationId}/content/video?api-version=${process.env.AZURE_API_VERSION || 'preview'}`
                
                console.log(`[PROGRESS] 🔗 Fetching video from: ${videoContentUrl}`)
                
                const contentResponse = await fetch(videoContentUrl, {
                  method: "GET",
                  headers: providerConfig.headers,
                })

               if (contentResponse.ok) {
                 const videoBlob = await contentResponse.blob()
                 console.log(`[PROGRESS] 📊 Video blob size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`)
                 
                 // Upload to Supabase Storage
                 console.log(`[PROGRESS] 📤 Uploading video to Supabase Storage...`)
                 const videoUrl = await uploadVideoToStorage(videoBlob, videoId)
                 console.log(`[PROGRESS] ✅ Video uploaded successfully:`, videoUrl)

                 // Update the database with completed status and video URL
                 await updateVideoStatus(video.id, {
                   status: "completed",
                   video_url: videoUrl
                 })

                  console.log(`[PROGRESS] ✅ Database updated successfully for video ${videoId}`)

                  return NextResponse.json({
                    status: "completed",
                    progress: 100,
                    error_message: null,
                    video_url: videoUrl,
                    provider_status: statusData.status,
                    updated_at: new Date().toISOString()
                  })
                } else {
                  console.error(`[PROGRESS] ❌ Failed to fetch video content: ${contentResponse.status}`)
                  // Update status to completed but without video URL
                  await updateVideoStatus(video.id, {
                    status: "completed"
                  })
                }
              } else {
                console.warn(`[PROGRESS] ⚠️ No generations found in response for video ${videoId}`)
                // Update status to completed but without video URL
                await updateVideoStatus(video.id, {
                  status: "completed"
                })
              }
            } catch (fetchError) {
              console.error(`[PROGRESS] ❌ Error fetching video content:`, fetchError)
              // Update status to completed but without video URL
              await updateVideoStatus(video.id, {
                status: "completed"
              })
            }
          }

          return NextResponse.json({
            status: video.status,
            progress: statusData.progress || null,
            error_message: video.error_message,
            video_url: video.video_url,
            provider_status: statusData.status,
            updated_at: new Date().toISOString()
          })
        } else {
          console.warn(`[PROGRESS] ⚠️ Failed to fetch real-time status: ${statusResponse.status}`)
        }
      } catch (openaiError) {
        console.warn(`[PROGRESS] ⚠️ Error fetching real-time status:`, openaiError)
      }
    }

    return NextResponse.json({
      status: video.status,
      progress: null,
      error_message: video.error_message,
      video_url: video.video_url,
      updated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error("[PROGRESS] ❌ Unexpected error:", error)
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'DatabaseTimeoutError') {
        return NextResponse.json({ error: "Database timeout - please try again" }, { status: 504 })
      }
      if (error.name === 'DatabaseConnectionError') {
        return NextResponse.json({ error: "Database connection failed - please try again" }, { status: 503 })
      }
    }
    
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
