import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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

    console.log("[VIDEO-GEN] 🌐 Sending request to OpenAI API...")
    
    let requestBody: any
    let headers: Record<string, string> = {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    }

    if (inputReference) {
      // Send as FormData when input reference is provided
      console.log("[VIDEO-GEN] 📎 Including input reference in OpenAI request")
      const formData = new FormData()
      formData.append("model", model)
      formData.append("prompt", prompt)
      formData.append("seconds", seconds)
      formData.append("size", size)
      formData.append("input_reference", inputReference)
      
      requestBody = formData
      // Don't set Content-Type header for FormData - let fetch set it with boundary
    } else {
      // Send as JSON when no input reference
      headers["Content-Type"] = "application/json"
      requestBody = JSON.stringify({
        model: model,
        prompt: prompt,
        seconds: seconds,
        size: size,
      })
    }

    const response = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers,
      body: requestBody,
    })

    console.log("[VIDEO-GEN] 📡 OpenAI API response status:", response.status)

    if (!response.ok) {
      const error = await response.json()
      console.error("[VIDEO-GEN] ❌ OpenAI API error:", {
        status: response.status,
        error: error.error?.message || "Unknown error"
      })
      return NextResponse.json(
        { error: `Failed to generate video: ${error.error?.message || "Unknown error"}` },
        { status: response.status },
      )
    }

    const data = await response.json()
    const jobId = data.id

    console.log("[VIDEO-GEN] ✅ Video generation job created:", {
      jobId,
      status: data.status || "unknown"
    })

    if (!jobId) {
      console.error("[VIDEO-GEN] ❌ No job ID in OpenAI response")
      return NextResponse.json({ error: "No job ID in response" }, { status: 500 })
    }

    console.log("[VIDEO-GEN] 💾 Saving video record to database...")
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
        creation_type: "standard",
      })
      .select()
      .single()

    if (dbError) {
      console.error("[VIDEO-GEN] ❌ Database error:", dbError)
      return NextResponse.json({ error: "Failed to save video" }, { status: 500 })
    }

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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function pollAndUpdateVideo(jobId: string, recordId: string, model: string) {
  try {
    console.log("[POLLING] 🔄 Starting polling for video job:", { jobId, recordId, model })
    
    let completed = false
    let attempts = 0
    const maxAttempts = 600

    while (!completed && attempts < maxAttempts) {
      console.log(`[POLLING] ⏳ Attempt ${attempts + 1}/${maxAttempts} - Waiting 5 seconds before status check...`)
      await new Promise((resolve) => setTimeout(resolve, 5000))

      console.log(`[POLLING] 📡 Checking status for job: ${jobId}`)
      const statusResponse = await fetch(`https://api.openai.com/v1/videos/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
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
        const supabase = await createClient()
        const { error: updateError } = await supabase
          .from("videos")
          .update({ 
            status: "failed",
            error_message: errorMessage
          })
          .eq("id", recordId)
        
        if (updateError) {
          console.error(`[POLLING] ❌ Failed to update database status to 'failed':`, updateError)
        } else {
          console.log(`[POLLING] ✅ Successfully updated database status to 'failed' with error: ${errorMessage}`)
        }
        return
      }

      attempts++
    }

    if (!completed) {
      console.error(`[POLLING] ⏰ Timeout reached after ${maxAttempts} attempts for job: ${jobId}`)
      
      // Timeout - mark as failed
      console.log(`[POLLING] 💾 Updating database status to 'failed' due to timeout for record: ${recordId}`)
      const supabase = await createClient()
      const { error: timeoutError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (timeoutError) {
        console.error(`[POLLING] ❌ Failed to update database status after timeout:`, timeoutError)
      } else {
        console.log(`[POLLING] ✅ Successfully updated database status to 'failed' after timeout`)
      }
      return
    }

    // Download video content
    console.log(`[DOWNLOAD] 📥 Starting video download for job: ${jobId}`)
    const contentResponse = await fetch(`https://api.openai.com/v1/videos/${jobId}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    })

    console.log(`[DOWNLOAD] 📊 Video download response status: ${contentResponse.status}`)

    if (!contentResponse.ok) {
      console.error(`[DOWNLOAD] ❌ Failed to download video content for job: ${jobId}`, {
        status: contentResponse.status,
        statusText: contentResponse.statusText
      })
      
      console.log(`[DOWNLOAD] 💾 Updating database status to 'failed' due to download failure for record: ${recordId}`)
      const supabase = await createClient()
      const { error: downloadError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (downloadError) {
        console.error(`[DOWNLOAD] ❌ Failed to update database status after download failure:`, downloadError)
      } else {
        console.log(`[DOWNLOAD] ✅ Successfully updated database status to 'failed' after download failure`)
      }
      return
    }

    console.log(`[DOWNLOAD] 🔄 Converting video to blob and processing...`)
    const videoBlob = await contentResponse.blob()
    const blobSize = videoBlob.size
    console.log(`[DOWNLOAD] 📊 Video blob size: ${(blobSize / 1024 / 1024).toFixed(2)} MB`)
    
    const arrayBuffer = await videoBlob.arrayBuffer()
    console.log(`[DOWNLOAD] 🔄 Converting to base64...`)
    const buffer = Buffer.from(arrayBuffer)
    const base64Video = buffer.toString("base64")
    const videoDataUrl = `data:video/mp4;base64,${base64Video}`
    
    console.log(`[DOWNLOAD] ✅ Video processing completed. Base64 length: ${base64Video.length} characters`)

    // Update database with completed video
    console.log(`[DOWNLOAD] 💾 Updating database with completed video for record: ${recordId}`)
    const supabase = await createClient()
    const { error: finalUpdateError } = await supabase
      .from("videos")
      .update({ 
        video_url: videoDataUrl, 
        status: "completed" 
      })
      .eq("id", recordId)
    
    if (finalUpdateError) {
      console.error(`[DOWNLOAD] ❌ Failed to update database with completed video:`, finalUpdateError)
    } else {
      console.log(`[DOWNLOAD] 🎉 Successfully updated database - video is now ready! Record: ${recordId}, Job: ${jobId}`)
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
      const supabase = await createClient()
      const { error: errorUpdateError } = await supabase
        .from("videos")
        .update({ status: "failed" })
        .eq("id", recordId)
      
      if (errorUpdateError) {
        console.error(`[POLLING] ❌ Failed to update status to failed after error:`, errorUpdateError)
      } else {
        console.log(`[POLLING] ✅ Successfully marked video as failed after error`)
      }
    } catch (dbError) {
      console.error("[POLLING] ❌ Critical error: Failed to update status to failed:", dbError)
    }
  }
}
