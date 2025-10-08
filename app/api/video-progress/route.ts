import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get("video_id")
    
    if (!videoId) {
      return NextResponse.json({ error: "video_id parameter is required" }, { status: 400 })
    }

    console.log(`[PROGRESS] 📊 Checking progress for video: ${videoId}`)

    const supabase = await createClient()
    const { data: video, error } = await supabase
      .from("videos")
      .select("id, status, error_message, video_url, created_at")
      .eq("video_id", videoId)
      .single()

    if (error) {
      console.error(`[PROGRESS] ❌ Database error:`, error)
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    console.log(`[PROGRESS] 📋 Current status for ${videoId}:`, {
      status: video.status,
      hasError: !!video.error_message,
      hasVideo: !!video.video_url
    })

    // If video is still in progress, try to get real-time status from OpenAI
    if (video.status === "in_progress") {
      try {
        console.log(`[PROGRESS] 🔍 Fetching real-time status from OpenAI...`)
        const statusResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        })

        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          console.log(`[PROGRESS] 📡 Real-time status from OpenAI:`, {
            status: statusData.status,
            progress: statusData.progress || "unknown"
          })

          return NextResponse.json({
            status: video.status,
            progress: statusData.progress || null,
            error_message: video.error_message,
            video_url: video.video_url,
            openai_status: statusData.status,
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
