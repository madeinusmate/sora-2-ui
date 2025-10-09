import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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
    console.log("[STATUS-CHECK] 🔍 Checking OpenAI job status:", openaiJobId)

    // Check status with OpenAI API
    const statusResponse = await fetch(`https://api.openai.com/v1/videos/${openaiJobId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    })

    console.log("[STATUS-CHECK] 📊 OpenAI status response:", statusResponse.status)

    if (!statusResponse.ok) {
      console.error("[STATUS-CHECK] ❌ Failed to check status with OpenAI:", {
        status: statusResponse.status,
        statusText: statusResponse.statusText
      })
      return NextResponse.json({ 
        error: "Failed to check status with OpenAI" 
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
      
      // Download video content
      const contentResponse = await fetch(`https://api.openai.com/v1/videos/${openaiJobId}/content`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
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
      const arrayBuffer = await videoBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const base64Video = buffer.toString("base64")
      const videoDataUrl = `data:video/mp4;base64,${base64Video}`
      
      console.log("[STATUS-CHECK] ✅ Video processing completed")

      // Update database with completed video
      const { error: updateError } = await supabase
        .from("videos")
        .update({ 
          video_url: videoDataUrl, 
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
