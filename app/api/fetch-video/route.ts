import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { videoId } = await request.json()

    if (!videoId || typeof videoId !== "string") {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: existingVideo } = await supabase.from("videos").select().eq("video_id", videoId).single()

    if (existingVideo) {
      return NextResponse.json({ video: existingVideo, message: "Video already exists in database" })
    }

    const metadataResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    })

    if (!metadataResponse.ok) {
      const error = await metadataResponse.json()
      return NextResponse.json(
        { error: `Failed to fetch video metadata: ${error.error?.message || "Unknown error"}` },
        { status: metadataResponse.status },
      )
    }

    const metadata = await metadataResponse.json()

    if (metadata.status !== "completed" && metadata.status !== "succeeded") {
      return NextResponse.json({ error: `Video is not ready yet. Current status: ${metadata.status}` }, { status: 400 })
    }

    const modelUsed = metadata.model || null

    const contentResponse = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    })

    if (!contentResponse.ok) {
      return NextResponse.json({ error: "Failed to download video content" }, { status: 500 })
    }

    const videoBlob = await contentResponse.blob()
    const arrayBuffer = await videoBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64Video = buffer.toString("base64")
    const videoDataUrl = `data:video/mp4;base64,${base64Video}`

    const { data: videoRecord, error: dbError } = await supabase
      .from("videos")
      .insert({
        prompt: `Manually fetched video (ID: ${videoId})`,
        video_url: videoDataUrl,
        video_id: videoId,
        model: modelUsed, // Store the model if available from metadata
      })
      .select()
      .single()

    if (dbError) {
      console.error("[DEBUG] Database error:", dbError)
      return NextResponse.json({ error: "Failed to save video" }, { status: 500 })
    }

    return NextResponse.json({ video: videoRecord, message: "Video fetched and stored successfully" })
  } catch (error) {
    console.error("[DEBUG] Error fetching video:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
