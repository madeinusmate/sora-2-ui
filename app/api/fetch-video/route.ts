import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getProviderConfig, getCurrentProvider } from "@/lib/provider-config"
import { uploadVideoToStorage } from "@/lib/storage-utils"

// Azure endpoint constant
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"

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

    const providerConfig = getProviderConfig()
    const metadataResponse = await fetch(providerConfig.statusUrl(videoId), {
      method: "GET",
      headers: providerConfig.headers,
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

    // Check if we have generations array (Azure API pattern)
    const generations = metadata.generations ?? []
    if (generations.length === 0) {
      return NextResponse.json({ error: "No generations found in video metadata" }, { status: 400 })
    }

    const generationId = generations[0].id
    console.log(`[FETCH-VIDEO] 📹 Found generation ID: ${generationId}`)
    
    // Construct the correct video content URL using generationId
    const videoContentUrl = `${AZURE_ENDPOINT}/video/generations/${generationId}/content/video?api-version=${process.env.AZURE_API_VERSION || 'preview'}`
    
    console.log(`[FETCH-VIDEO] 🔗 Fetching video from: ${videoContentUrl}`)

    const contentResponse = await fetch(videoContentUrl, {
      method: "GET",
      headers: providerConfig.headers,
    })

    if (!contentResponse.ok) {
      return NextResponse.json({ error: "Failed to download video content" }, { status: 500 })
    }

    const videoBlob = await contentResponse.blob()
    console.log(`[FETCH-VIDEO] 📊 Video blob size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`)
    
    // Upload to Supabase Storage
    console.log(`[FETCH-VIDEO] 📤 Uploading video to Supabase Storage...`)
    const videoUrl = await uploadVideoToStorage(videoBlob, videoId)
    console.log(`[FETCH-VIDEO] ✅ Video uploaded successfully:`, videoUrl)

    const { data: videoRecord, error: dbError } = await supabase
      .from("videos")
      .insert({
        prompt: `Manually fetched video (ID: ${videoId})`,
        video_url: videoUrl,
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
