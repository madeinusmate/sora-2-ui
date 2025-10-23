import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getProviderConfig, getCurrentProvider, formatRequestForProvider } from "@/lib/provider-config"
import { updateVideoStatus } from "@/lib/database-utils"
import { uploadVideoToStorage } from "@/lib/storage-utils"

// Azure endpoint constant
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"

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

    console.log(`[REMIX-VIDEO] 🌐 Sending remix request to ${getCurrentProvider().toUpperCase()} API...`)
    const providerConfig = getProviderConfig()
    
    // Note: Azure might not support remix functionality, so we'll need to handle this
    if (getCurrentProvider() === "azure") {
      console.log("[REMIX-VIDEO] ⚠️ Azure provider may not support remix functionality")
      return NextResponse.json({ 
        error: "Remix functionality is not supported with Azure provider" 
      }, { status: 400 })
    }
    
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

    console.log(`[REMIX-VIDEO] 📡 ${getCurrentProvider().toUpperCase()} API response status:`, response.status)

    if (!response.ok) {
      const error = await response.json()
      console.error(`[REMIX-VIDEO] ❌ ${getCurrentProvider().toUpperCase()} API error:`, {
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
    console.log("[REMIX-POLLING] 🔄 Starting polling for remix video job:", { jobId, recordId, model, provider: getCurrentProvider() })
    
    const providerConfig = getProviderConfig()
    let completed = false
    let attempts = 0
    const maxAttempts = 60

    while (!completed && attempts < maxAttempts) {
      console.log(`[REMIX-POLLING] ⏳ Attempt ${attempts + 1}/${maxAttempts} - Waiting 5 seconds before status check...`)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      console.log(`[REMIX-POLLING] 📡 Checking status for remix job: ${jobId}`)
      const statusResponse = await fetch(providerConfig.statusUrl(jobId), {
        method: "GET",
        headers: providerConfig.headers,
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
        try {
          await updateVideoStatus(recordId, { 
            status: "failed",
            error_message: errorMessage
          })
          console.log(`[REMIX-POLLING] ✅ Successfully updated database status to 'failed' with error: ${errorMessage}`)
        } catch (updateError) {
          console.error(`[REMIX-POLLING] ❌ Failed to update database status to 'failed':`, updateError)
        }
        return
      }

      attempts++
    }

    if (!completed) {
      console.error(`[REMIX-POLLING] ⏰ Timeout reached after ${maxAttempts} attempts for remix job: ${jobId}`)
      
      // Timeout - mark as failed
      console.log(`[REMIX-POLLING] 💾 Updating database status to 'failed' due to timeout for record: ${recordId}`)
      try {
        await updateVideoStatus(recordId, { status: "failed" })
        console.log(`[REMIX-POLLING] ✅ Successfully updated database status to 'failed' after timeout`)
      } catch (timeoutError) {
        console.error(`[REMIX-POLLING] ❌ Failed to update database status after timeout:`, timeoutError)
      }
      return
    }

    // Download video content
    console.log(`[REMIX-DOWNLOAD] 📥 Starting video download for remix job: ${jobId}`)
    
    // Get the latest status to access generations array
    const finalStatusResponse = await fetch(providerConfig.statusUrl(jobId), {
      method: "GET",
      headers: providerConfig.headers,
    })
    
    if (!finalStatusResponse.ok) {
      console.error(`[REMIX-DOWNLOAD] ❌ Failed to get final status for remix job: ${jobId}`)
      await updateVideoStatus(recordId, { status: "failed" })
      return
    }
    
    const finalStatusData = await finalStatusResponse.json()
    const generations = finalStatusData.generations ?? []
    
    if (generations.length === 0) {
      console.error(`[REMIX-DOWNLOAD] ❌ No generations found for remix job: ${jobId}`)
      await updateVideoStatus(recordId, { status: "failed" })
      return
    }
    
    const generationId = generations[0].id
    console.log(`[REMIX-DOWNLOAD] 📹 Found generation ID: ${generationId}`)
    
    // Construct the correct video content URL using generationId
    const videoContentUrl = `${AZURE_ENDPOINT}/video/generations/${generationId}/content/video?api-version=${process.env.AZURE_API_VERSION || 'preview'}`
    
    console.log(`[REMIX-DOWNLOAD] 🔗 Fetching video from: ${videoContentUrl}`)
    
    const contentResponse = await fetch(videoContentUrl, {
      method: "GET",
      headers: providerConfig.headers,
    })

    console.log(`[REMIX-DOWNLOAD] 📊 Video download response status: ${contentResponse.status}`)

    if (!contentResponse.ok) {
      console.error(`[REMIX-DOWNLOAD] ❌ Failed to download remix video content for job: ${jobId}`, {
        status: contentResponse.status,
        statusText: contentResponse.statusText
      })
      
      console.log(`[REMIX-DOWNLOAD] 💾 Updating database status to 'failed' due to download failure for record: ${recordId}`)
      try {
        await updateVideoStatus(recordId, { status: "failed" })
        console.log(`[REMIX-DOWNLOAD] ✅ Successfully updated database status to 'failed' after download failure`)
      } catch (downloadError) {
        console.error(`[REMIX-DOWNLOAD] ❌ Failed to update database status after download failure:`, downloadError)
      }
      return
    }

    console.log(`[REMIX-DOWNLOAD] 🔄 Converting remix video to blob and processing...`)
    const videoBlob = await contentResponse.blob()
    const blobSize = videoBlob.size
    console.log(`[REMIX-DOWNLOAD] 📊 Remix video blob size: ${(blobSize / 1024 / 1024).toFixed(2)} MB`)
    
    // Upload to Supabase Storage instead of converting to base64
    console.log(`[REMIX-DOWNLOAD] 📤 Uploading remix video to Supabase Storage...`)
    try {
      const videoUrl = await uploadVideoToStorage(videoBlob, jobId)
      console.log(`[REMIX-DOWNLOAD] ✅ Remix video uploaded successfully:`, videoUrl)

      // Update database with completed video URL
      console.log(`[REMIX-DOWNLOAD] 💾 Updating database with completed remix video for record: ${recordId}`)
      await updateVideoStatus(recordId, { 
        video_url: videoUrl, 
        status: "completed" 
      })
      console.log(`[REMIX-DOWNLOAD] 🎉 Successfully updated database - remix video is now ready! Record: ${recordId}, Job: ${jobId}`)
    } catch (uploadError) {
      console.error(`[REMIX-DOWNLOAD] ❌ Failed to upload remix video to storage:`, uploadError)
      // Update status to failed if upload fails
      await updateVideoStatus(recordId, { 
        status: "failed",
        error_message: `Failed to upload video: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
      })
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
      await updateVideoStatus(recordId, { status: "failed" })
      console.log(`[REMIX-POLLING] ✅ Successfully marked remix video as failed after error`)
    } catch (dbError) {
      console.error("[REMIX-POLLING] ❌ Critical error: Failed to update status to failed:", dbError)
    }
  }
}
