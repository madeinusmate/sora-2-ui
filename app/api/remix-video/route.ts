import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    console.log("[REMIX-VIDEO] 🎬 Starting video remix request")
    
    const body = await request.json()
    const { prompt, model = "sora-2", seconds = "4", size = "1280x720", input_video_id } = body

    console.log("[REMIX-VIDEO] 📝 Request parameters:", {
      prompt: prompt?.substring(0, 100) + (prompt?.length > 100 ? "..." : ""),
      model,
      seconds,
      size,
      input_video_id
    })

    if (!prompt || typeof prompt !== "string") {
      console.log("[REMIX-VIDEO] ❌ Invalid prompt provided")
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    if (!input_video_id) {
      console.log("[REMIX-VIDEO] ❌ No input video ID provided")
      return NextResponse.json({ error: "Input video ID is required for remix" }, { status: 400 })
    }

    console.log("[REMIX-VIDEO] 🌐 Sending remix request to OpenAI API...")
    const response = await fetch(`https://api.openai.com/v1/videos/${input_video_id}/remix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({       
        prompt: prompt,       
      }),
    })

    console.log("[REMIX-VIDEO] 📡 OpenAI API response status:", response.status)

    if (!response.ok) {
      const error = await response.json()
      console.error("[REMIX-VIDEO] ❌ OpenAI API error:", {
        status: response.status,
        error: error.error?.message || "Unknown error"
      })
      return NextResponse.json(
        { error: `Failed to remix video: ${error.error?.message || "Unknown error"}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    const jobId = data.id

    console.log("[REMIX-VIDEO] ✅ Video remix job created:", {
      jobId,
      status: data.status || "unknown",
      input_video_id
    })

    if (!jobId) {
      console.error("[REMIX-VIDEO] ❌ No job ID in OpenAI response")
      return NextResponse.json({ error: "No job ID in response" }, { status: 500 })
    }

    console.log("[REMIX-VIDEO] 💾 Saving remix video record to database...")
    const supabase = await createClient()
    const { data: videoRecord, error: dbError } = await supabase
      .from("videos")
      .insert({
        prompt,
        video_url: "", // Empty initially
        video_id: jobId,
        model: model,
        status: "in_progress",
        error_message: "", // Empty initially
        creation_type: "remix",
      })
      .select()
      .single()

    if (dbError) {
      console.error("[REMIX-VIDEO] ❌ Database error:", dbError)
      return NextResponse.json({ error: "Failed to save remix video" }, { status: 500 })
    }

    console.log("[REMIX-VIDEO] ✅ Remix video record saved:", {
      recordId: videoRecord.id,
      jobId: videoRecord.video_id,
      originalVideoId: input_video_id
    })

    // Start background polling (fire and forget) - reuse the existing polling function
    console.log("[REMIX-VIDEO] 🔄 Starting background polling for remix job:", jobId)
    pollAndUpdateVideo(jobId, videoRecord.id, model)

    return NextResponse.json({ video: videoRecord })
  } catch (error) {
    console.error("[REMIX-VIDEO] ❌ Unexpected error remixing video:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Reuse the polling function from generate-video
async function pollAndUpdateVideo(jobId: string, recordId: string, model: string) {
  try {
    console.log("[REMIX-POLLING] 🔄 Starting polling for remix video job:", { jobId, recordId, model })
    
    let completed = false
    let attempts = 0
    const maxAttempts = 60

    while (!completed && attempts < maxAttempts) {
      console.log(`[REMIX-POLLING] ⏳ Attempt ${attempts + 1}/${maxAttempts} - Waiting 5 seconds before status check...`)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      console.log(`[REMIX-POLLING] 📡 Checking status for remix job: ${jobId}`)
      const statusResponse = await fetch(`https://api.openai.com/v1/videos/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      })

      console.log(`[REMIX-POLLING] 📊 Status check response: ${statusResponse.status}`)

      if (!statusResponse.ok) {
        console.warn(`[REMIX-POLLING] ⚠️ Status check failed (attempt ${attempts + 1}):`, {
          status: statusResponse.status,
          statusText: statusResponse.statusText
        })
        attempts++
        continue
      }

      const statusData = await statusResponse.json()
      console.log(`[REMIX-POLLING] 📋 Current remix job status:`, {
        jobId,
        status: statusData.status,
        attempt: attempts + 1,
        progress: statusData.progress || "unknown"
      })

      if (statusData.status === "succeeded" || statusData.status === "completed") {
        console.log(`[REMIX-POLLING] ✅ Video remix completed for job: ${jobId}`)
        completed = true
        break
      } else if (statusData.status === "failed" || statusData.status === "error") {
        const errorDetails = statusData.error || statusData.failure_reason || "No error details provided"
        console.error(`[REMIX-POLLING] ❌ Video remix failed for job: ${jobId}`, {
          status: statusData.status,
          error: errorDetails
        })
        
        // Format error message for storage
        const errorMessage = typeof errorDetails === 'object' 
          ? `${errorDetails.code || 'unknown_error'}: ${errorDetails.message || 'Unknown error occurred'}`
          : String(errorDetails)
        
        // Update status to failed with error message
        console.log(`[REMIX-POLLING] 💾 Updating database status to 'failed' with error message for record: ${recordId}`)
        const supabase = await createClient()
        const { error: updateError } = await supabase
          .from("videos")
          .update({ 
            status: "failed",
            error_message: errorMessage
          })
          .eq("id", recordId)
        
        if (updateError) {
          console.error(`[REMIX-POLLING] ❌ Failed to update database status to 'failed':`, updateError)
        } else {
          console.log(`[REMIX-POLLING] ✅ Successfully updated database status to 'failed' with error: ${errorMessage}`)
        }
        return
      }

      attempts++
    }

    if (!completed) {
      console.error(`[REMIX-POLLING] ⏰ Timeout reached after ${maxAttempts} attempts for remix job: ${jobId}`)
      
      // Timeout - mark as failed
      console.log(`[REMIX-POLLING] 💾 Updating database status to 'failed' due to timeout for record: ${recordId}`)
      const supabase = await createClient()
      const { error: timeoutError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (timeoutError) {
        console.error(`[REMIX-POLLING] ❌ Failed to update database status after timeout:`, timeoutError)
      } else {
        console.log(`[REMIX-POLLING] ✅ Successfully updated database status to 'failed' after timeout`)
      }
      return
    }

    // Download video content
    console.log(`[REMIX-DOWNLOAD] 📥 Starting video download for remix job: ${jobId}`)
    const contentResponse = await fetch(`https://api.openai.com/v1/videos/${jobId}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    })

    console.log(`[REMIX-DOWNLOAD] 📊 Video download response status: ${contentResponse.status}`)

    if (!contentResponse.ok) {
      console.error(`[REMIX-DOWNLOAD] ❌ Failed to download remix video content for job: ${jobId}`, {
        status: contentResponse.status,
        statusText: contentResponse.statusText
      })
      
      console.log(`[REMIX-DOWNLOAD] 💾 Updating database status to 'failed' due to download failure for record: ${recordId}`)
      const supabase = await createClient()
      const { error: downloadError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (downloadError) {
        console.error(`[REMIX-DOWNLOAD] ❌ Failed to update database status after download failure:`, downloadError)
      } else {
        console.log(`[REMIX-DOWNLOAD] ✅ Successfully updated database status to 'failed' after download failure`)
      }
      return
    }

    console.log(`[REMIX-DOWNLOAD] 🔄 Converting remix video to blob and processing...`)
    const videoBlob = await contentResponse.blob()
    const blobSize = videoBlob.size
    console.log(`[REMIX-DOWNLOAD] 📊 Remix video blob size: ${(blobSize / 1024 / 1024).toFixed(2)} MB`)
    
    const arrayBuffer = await videoBlob.arrayBuffer()
    console.log(`[REMIX-DOWNLOAD] 🔄 Converting to base64...`)
    const buffer = Buffer.from(arrayBuffer)
    const base64Video = buffer.toString("base64")
    const videoDataUrl = `data:video/mp4;base64,${base64Video}`
    
    console.log(`[REMIX-DOWNLOAD] ✅ Remix video processing completed. Base64 length: ${base64Video.length} characters`)

    // Update database with completed video
    console.log(`[REMIX-DOWNLOAD] 💾 Updating database with completed remix video for record: ${recordId}`)
    const supabase = await createClient()
    const { error: finalUpdateError } = await supabase
      .from("videos")
      .update({ 
        video_url: videoDataUrl, 
        status: "completed" 
      })
      .eq("id", recordId)
    
    if (finalUpdateError) {
      console.error(`[REMIX-DOWNLOAD] ❌ Failed to update database with completed remix video:`, finalUpdateError)
    } else {
      console.log(`[REMIX-DOWNLOAD] 🎉 Successfully updated database - remix video is now ready! Record: ${recordId}, Job: ${jobId}`)
    }
  } catch (error) {
    console.error("[REMIX-POLLING] ❌ Unexpected error in remix background polling:", {
      jobId,
      recordId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Mark as failed on error
    console.log(`[REMIX-POLLING] 💾 Attempting to mark remix video as failed due to unexpected error...`)
    try {
      const supabase = await createClient()
      const { error: errorUpdateError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (errorUpdateError) {
        console.error(`[REMIX-POLLING] ❌ Failed to update status to failed after error:`, errorUpdateError)
      } else {
        console.log(`[REMIX-POLLING] ✅ Successfully marked remix video as failed after error`)
      }
    } catch (dbError) {
      console.error("[REMIX-POLLING] ❌ Critical error: Failed to update status to failed:", dbError)
    }
  }
}
