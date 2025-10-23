import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getProviderConfig, getCurrentProvider } from "@/lib/provider-config"
import { uploadVideoToStorage } from "@/lib/storage-utils"

// Azure endpoint constant
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"

export async function POST(request: Request) {
  try {
    console.log("[STATUS-CHECK] 🔍 Starting manual video status check")
    
    const { videoId } = await request.json()
    
    if (!videoId) {
      console.log("[STATUS-CHECK] ❌ No video ID provided")
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    console.log("[STATUS-CHECK] 📝 Checking status for video ID:", videoId)

    // Get the video record from database to get the OpenAI job ID
    const supabase = await createClient()
    const { data: videoRecord, error: fetchError } = await supabase
      .from("videos")
      .select("id, video_id, status, model")
      .eq("id", videoId)
      .single()

    if (fetchError || !videoRecord) {
      console.error("[STATUS-CHECK] ❌ Video not found:", fetchError)
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    if (videoRecord.status !== "in_progress") {
      console.log("[STATUS-CHECK] ⚠️ Video is not in progress status:", videoRecord.status)
      return NextResponse.json({ 
        error: "Video is not in progress", 
        currentStatus: videoRecord.status 
      }, { status: 400 })
    }

    const openaiJobId = videoRecord.video_id
    console.log(`[STATUS-CHECK] 🔍 Checking ${getCurrentProvider().toUpperCase()} job status:`, openaiJobId)

    // Check status with provider API
    const providerConfig = getProviderConfig()
    const statusResponse = await fetch(providerConfig.statusUrl(openaiJobId), {
      method: "GET",
      headers: providerConfig.headers,
    })

    console.log(`[STATUS-CHECK] 📊 ${getCurrentProvider().toUpperCase()} status response:`, statusResponse.status)

    if (!statusResponse.ok) {
      console.error(`[STATUS-CHECK] ❌ Failed to check status with ${getCurrentProvider().toUpperCase()}:`, {
        status: statusResponse.status,
        statusText: statusResponse.statusText
      })
      return NextResponse.json({ 
        error: `Failed to check status with ${getCurrentProvider().toUpperCase()}` 
      }, { status: statusResponse.status })
    }

    const statusData = await statusResponse.json()
    console.log("[STATUS-CHECK] 📋 Current job status:", {
      jobId: openaiJobId,
      status: statusData.status,
      progress: statusData.progress || "unknown"
    })

    // Handle different status outcomes
    if (statusData.status === "succeeded" || statusData.status === "completed") {
      console.log("[STATUS-CHECK] ✅ Video generation completed, downloading video...")
      
      // Check if we have generations array (Azure API pattern)
      const generations = statusData.generations ?? []
      if (generations.length === 0) {
        console.error("[STATUS-CHECK] ❌ No generations found in response")
        return NextResponse.json({ 
          error: "No generations found in video response" 
        }, { status: 400 })
      }
      
      const generationId = generations[0].id
      console.log(`[STATUS-CHECK] 📹 Found generation ID: ${generationId}`)
      
      // Construct the correct video content URL using generationId
      const videoContentUrl = `${AZURE_ENDPOINT}/video/generations/${generationId}/content/video?api-version=${process.env.AZURE_API_VERSION || 'preview'}`
      
      console.log(`[STATUS-CHECK] 🔗 Fetching video from: ${videoContentUrl}`)
      
      // Download video content
      const contentResponse = await fetch(videoContentUrl, {
        method: "GET",
        headers: providerConfig.headers,
      })

      if (!contentResponse.ok) {
        console.error("[STATUS-CHECK] ❌ Failed to download video content:", {
          status: contentResponse.status,
          statusText: contentResponse.statusText
        })
        return NextResponse.json({ 
          error: "Failed to download video content" 
        }, { status: contentResponse.status })
      }

      // Process video content
      console.log("[STATUS-CHECK] 🔄 Processing video content...")
      const videoBlob = await contentResponse.blob()
      console.log("[STATUS-CHECK] 📊 Video blob size:", `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`)
      
      // Upload to Supabase Storage
      console.log("[STATUS-CHECK] 📤 Uploading video to Supabase Storage...")
      const videoUrl = await uploadVideoToStorage(videoBlob, openaiJobId)
      console.log("[STATUS-CHECK] ✅ Video uploaded successfully:", videoUrl)

      // Update database with completed video
      const { error: updateError } = await supabase
        .from("videos")
        .update({ 
          video_url: videoUrl, 
          status: "completed" 
        })
        .eq("id", videoId)
      
      if (updateError) {
        console.error("[STATUS-CHECK] ❌ Failed to update database:", updateError)
        return NextResponse.json({ 
          error: "Failed to update video status" 
        }, { status: 500 })
      }

      console.log("[STATUS-CHECK] 🎉 Video status updated to completed")
      return NextResponse.json({ 
        success: true, 
        status: "completed",
        message: "Video generation completed successfully"
      })

    } else if (statusData.status === "failed" || statusData.status === "error") {
      console.log("[STATUS-CHECK] ❌ Video generation failed")
      
      const errorDetails = statusData.error || statusData.failure_reason || "No error details provided"
      const errorMessage = typeof errorDetails === 'object' 
        ? `${errorDetails.code || 'unknown_error'}: ${errorDetails.message || 'Unknown error occurred'}`
        : String(errorDetails)
      
      // Update status to failed with error message
      const { error: updateError } = await supabase
        .from("videos")
        .update({ 
          status: "failed",
          error_message: errorMessage
        })
        .eq("id", videoId)
      
      if (updateError) {
        console.error("[STATUS-CHECK] ❌ Failed to update database status to failed:", updateError)
        return NextResponse.json({ 
          error: "Failed to update video status" 
        }, { status: 500 })
      }

      console.log("[STATUS-CHECK] ✅ Video status updated to failed")
      return NextResponse.json({ 
        success: true, 
        status: "failed",
        message: "Video generation failed",
        error: errorMessage
      })

    } else {
      // Still in progress or other status
      console.log("[STATUS-CHECK] ⏳ Video is still in progress")
      return NextResponse.json({ 
        success: true, 
        status: statusData.status,
        progress: statusData.progress || null,
        message: "Video is still being generated"
      })
    }

  } catch (error) {
    console.error("[STATUS-CHECK] ❌ Unexpected error checking video status:", error)
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 })
  }
}
