import { NextResponse } from "next/server"
import { getProviderConfig, getCurrentProvider, formatRequestForProvider } from "@/lib/provider-config"
import { insertVideo, updateVideoStatus } from "@/lib/database-utils"
import { uploadVideoToStorage } from "@/lib/storage-utils"

// Azure endpoint constant
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"

export async function POST(request: Request) {
  try {
    console.log("[VIDEO-GEN] 🚀 Starting video generation request")
     
    const contentType = request.headers.get("content-type") || ""
    let prompt: string
    let model = "sora-2"
    let seconds = "4"
    let size = "1280x720"
    let inputReference: File | null = null

    if (contentType.includes("multipart/form-data")) {
      // Handle file upload
      console.log("[VIDEO-GEN] 📁 Processing multipart form data with file upload")
      const formData = await request.formData()
      
      prompt = formData.get("prompt") as string
      model = (formData.get("model") as string) || "sora-2"
      seconds = (formData.get("seconds") as string) || "4"
      size = (formData.get("size") as string) || "1280x720"
      inputReference = formData.get("input_reference") as File
      
      if (inputReference) {
        console.log("[VIDEO-GEN] 📎 Input reference file received:", {
          name: inputReference.name,
          type: inputReference.type,
          size: inputReference.size
        })
      }
    } else {
      // Handle JSON request
      console.log("[VIDEO-GEN] 📄 Processing JSON request")
      const body = await request.json()
      prompt = body.prompt
      model = body.model || "sora-2"
      seconds = body.seconds || "4"
      size = body.size || "1280x720"
    }

    console.log("[VIDEO-GEN] 📝 Request parameters:", {
      prompt: prompt?.substring(0, 100) + (prompt?.length > 100 ? "..." : ""),
      model,
      seconds,
      size
    })

    if (!prompt || typeof prompt !== "string") {
      console.log("[VIDEO-GEN] ❌ Invalid prompt provided")
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    console.log(`[VIDEO-GEN] 🌐 Sending request to ${getCurrentProvider().toUpperCase()} API...`)
    
    const providerConfig = getProviderConfig()
    const requestBody = formatRequestForProvider(prompt, model, seconds, size, inputReference)
    let headers = { ...providerConfig.headers }

    // Handle Content-Type for different providers and request types
    if (getCurrentProvider() === "azure") {
      // Azure always uses JSON
      headers["Content-Type"] = "application/json"
    } else {
      // OpenAI: FormData for file uploads, JSON otherwise
      if (inputReference) {
        // Don't set Content-Type for FormData - let fetch set it with boundary
        delete headers["Content-Type"]
      } else {
        headers["Content-Type"] = "application/json"
      }
    }

    const response = await fetch(providerConfig.generateUrl, {
      method: "POST",
      headers,
      body: getCurrentProvider() === "azure" ? JSON.stringify(requestBody) : (requestBody instanceof FormData ? requestBody : JSON.stringify(requestBody)),
    })

    console.log(`[VIDEO-GEN] 📡 ${getCurrentProvider().toUpperCase()} API response status:`, response.status)

    if (!response.ok) {
      const error = await response.json()
      console.error(`[VIDEO-GEN] ❌ ${getCurrentProvider().toUpperCase()} API error:`, {
        status: response.status,
        error: error.error?.message || error.message || "Unknown error"
      })
      return NextResponse.json(
        { error: `Failed to generate video: ${error.error?.message || error.message || "Unknown error"}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    const jobId = data.id

    console.log(`[VIDEO-GEN] ✅ Video generation job created:`, {
      jobId,
      status: data.status || "unknown"
    })

    if (!jobId) {
      console.error("[VIDEO-GEN] ❌ No job ID in OpenAI response")
      return NextResponse.json({ error: "No job ID in response" }, { status: 500 })
    }

    console.log("[VIDEO-GEN] 💾 Saving video record to database...")
    const videoRecord = await insertVideo({
      prompt,
      video_url: "", // Empty initially
      video_id: jobId,
      model: model,
      status: "in_progress",
      error_message: "", // Empty initially
      creation_type: "standard",
    })

    console.log("[VIDEO-GEN] ✅ Video record saved:", {
      recordId: videoRecord.id,
      jobId: videoRecord.video_id
    })

    // Start background polling (fire and forget)
    console.log("[VIDEO-GEN] 🔄 Starting background polling for job:", jobId)
    pollAndUpdateVideo(jobId, videoRecord.id, model)

    return NextResponse.json({ video: videoRecord })
  } catch (error) {
    console.error("[VIDEO-GEN] ❌ Unexpected error generating video:", error)
    
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

async function pollAndUpdateVideo(jobId: string, recordId: string, model: string) {
  try {
    console.log(`[POLLING] 🔄 Starting polling for video job:`, { jobId, recordId, model, provider: getCurrentProvider() })
    
    const providerConfig = getProviderConfig()
    let completed = false
    let attempts = 0
    const maxAttempts = 150

    while (!completed && attempts < maxAttempts) {
      console.log(`[POLLING] ⏳ Attempt ${attempts + 1}/${maxAttempts} - Waiting 5 seconds before status check...`)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      console.log(`[POLLING] 📡 Checking status for job: ${jobId}`)
      const statusResponse = await fetch(providerConfig.statusUrl(jobId), {
        method: "GET",
        headers: providerConfig.headers,
      })

      console.log(`[POLLING] 📊 Status check response: ${statusResponse.status}`)

      if (!statusResponse.ok) {
        console.warn(`[POLLING] ⚠️ Status check failed (attempt ${attempts + 1}):`, {
          status: statusResponse.status,
          statusText: statusResponse.statusText
        })
        attempts++
        continue
      }

      const statusData = await statusResponse.json()
      console.log(`[POLLING] 📋 Current job status:`, {
        jobId,
        status: statusData.status,
        attempt: attempts + 1,
        progress: statusData.progress || "unknown"
      })

      if (statusData.status === "succeeded" || statusData.status === "completed") {
        console.log(`[POLLING] ✅ Video generation completed for job: ${jobId}`)
        completed = true
        break
      } else if (statusData.status === "failed" || statusData.status === "error") {
        const errorDetails = statusData.error || statusData.failure_reason || "No error details provided"
        console.error(`[POLLING] ❌ Video generation failed for job: ${jobId}`, {
          status: statusData.status,
          error: errorDetails
        })
        
        // Format error message for storage
        const errorMessage = typeof errorDetails === 'object' 
          ? `${errorDetails.code || 'unknown_error'}: ${errorDetails.message || 'Unknown error occurred'}`
          : String(errorDetails)
        
        // Update status to failed with error message
        console.log(`[POLLING] 💾 Updating database status to 'failed' with error message for record: ${recordId}`)
        try {
          await updateVideoStatus(recordId, { 
            status: "failed",
            error_message: errorMessage
          })
          console.log(`[POLLING] ✅ Successfully updated database status to 'failed' with error: ${errorMessage}`)
        } catch (updateError) {
          console.error(`[POLLING] ❌ Failed to update database status to 'failed':`, updateError)
        }
        return
      }

      attempts++
    }

    if (!completed) {
      console.error(`[POLLING] ⏰ Timeout reached after ${maxAttempts} attempts for job: ${jobId}`)
      
      // Timeout - mark as failed
      console.log(`[POLLING] 💾 Updating database status to 'failed' due to timeout for record: ${recordId}`)
      try {
        await updateVideoStatus(recordId, { status: "failed" })
        console.log(`[POLLING] ✅ Successfully updated database status to 'failed' after timeout`)
      } catch (timeoutError) {
        console.error(`[POLLING] ❌ Failed to update database status after timeout:`, timeoutError)
      }
      return
    }

    // Download video content
    console.log(`[DOWNLOAD] 📥 Starting video download for job: ${jobId}`)
    
    // Get the latest status to access generations array
    const finalStatusResponse = await fetch(providerConfig.statusUrl(jobId), {
      method: "GET",
      headers: providerConfig.headers,
    })
    
    if (!finalStatusResponse.ok) {
      console.error(`[DOWNLOAD] ❌ Failed to get final status for job: ${jobId}`)
      await updateVideoStatus(recordId, { status: "failed" })
      return
    }
    
    const finalStatusData = await finalStatusResponse.json()
    const generations = finalStatusData.generations ?? []
    
    if (generations.length === 0) {
      console.error(`[DOWNLOAD] ❌ No generations found for job: ${jobId}`)
      await updateVideoStatus(recordId, { status: "failed" })
      return
    }
    
    const generationId = generations[0].id
    console.log(`[DOWNLOAD] 📹 Found generation ID: ${generationId}`)
    
    // Construct the correct video content URL using generationId
    const videoContentUrl = `${AZURE_ENDPOINT}/video/generations/${generationId}/content/video?api-version=${process.env.AZURE_API_VERSION || 'preview'}`
    
    console.log(`[DOWNLOAD] 🔗 Fetching video from: ${videoContentUrl}`)
    
    const contentResponse = await fetch(videoContentUrl, {
      method: "GET",
      headers: providerConfig.headers,
    })

    console.log(`[DOWNLOAD] 📊 Video download response status: ${contentResponse.status}`)

    if (!contentResponse.ok) {
      console.error(`[DOWNLOAD] ❌ Failed to download video content for job: ${jobId}`, {
        status: contentResponse.status,
        statusText: contentResponse.statusText
      })
      
      console.log(`[DOWNLOAD] 💾 Updating database status to 'failed' due to download failure for record: ${recordId}`)
      try {
        await updateVideoStatus(recordId, { status: "failed" })
        console.log(`[DOWNLOAD] ✅ Successfully updated database status to 'failed' after download failure`)
      } catch (downloadError) {
        console.error(`[DOWNLOAD] ❌ Failed to update database status after download failure:`, downloadError)
      }
      return
    }

    console.log(`[DOWNLOAD] 🔄 Converting video to blob and processing...`)
    const videoBlob = await contentResponse.blob()
    const blobSize = videoBlob.size
    console.log(`[DOWNLOAD] 📊 Video blob size: ${(blobSize / 1024 / 1024).toFixed(2)} MB`)
    
    // Upload to Supabase Storage instead of converting to base64
    console.log(`[DOWNLOAD] 📤 Uploading video to Supabase Storage...`)
    try {
      const videoUrl = await uploadVideoToStorage(videoBlob, jobId)
      console.log(`[DOWNLOAD] ✅ Video uploaded successfully:`, videoUrl)

      // Update database with completed video URL
      console.log(`[DOWNLOAD] 💾 Updating database with completed video for record: ${recordId}`)
      await updateVideoStatus(recordId, { 
        video_url: videoUrl, 
        status: "completed" 
      })
      console.log(`[DOWNLOAD] 🎉 Successfully updated database - video is now ready! Record: ${recordId}, Job: ${jobId}`)
    } catch (uploadError) {
      console.error(`[DOWNLOAD] ❌ Failed to upload video to storage:`, uploadError)
      // Update status to failed if upload fails
      await updateVideoStatus(recordId, { 
        status: "failed",
        error_message: `Failed to upload video: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`
      })
    }
  } catch (error) {
    console.error("[POLLING] ❌ Unexpected error in background polling:", {
      jobId,
      recordId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Mark as failed on error
    console.log(`[POLLING] 💾 Attempting to mark video as failed due to unexpected error...`)
    try {
      await updateVideoStatus(recordId, { status: "failed" })
      console.log(`[POLLING] ✅ Successfully marked video as failed after error`)
    } catch (dbError) {
      console.error("[POLLING] ❌ Critical error: Failed to update status to failed:", dbError)
    }
  }
}
