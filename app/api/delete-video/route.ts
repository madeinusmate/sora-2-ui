import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get("id")
    
    if (!videoId) {
      console.log("[DELETE-VIDEO] ❌ No video ID provided")
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 })
    }

    console.log(`[DELETE-VIDEO] 🗑️ Deleting video: ${videoId}`)

    const supabase = await createClient()
    
    // First check if the video exists
    const { data: existingVideo, error: fetchError } = await supabase
      .from("videos")
      .select("id, prompt, status")
      .eq("id", videoId)
      .single()

    if (fetchError || !existingVideo) {
      console.error(`[DELETE-VIDEO] ❌ Video not found:`, fetchError)
      return NextResponse.json({ error: "Video not found" }, { status: 404 })
    }

    console.log(`[DELETE-VIDEO] 📋 Found video to delete:`, {
      id: existingVideo.id,
      prompt: existingVideo.prompt.substring(0, 50) + "...",
      status: existingVideo.status
    })

    // Delete the video
    const { error: deleteError } = await supabase
      .from("videos")
      .delete()
      .eq("id", videoId)

    if (deleteError) {
      console.error(`[DELETE-VIDEO] ❌ Failed to delete video:`, deleteError)
      return NextResponse.json({ error: "Failed to delete video" }, { status: 500 })
    }

    console.log(`[DELETE-VIDEO] ✅ Successfully deleted video: ${videoId}`)

    return NextResponse.json({ 
      success: true, 
      message: "Video deleted successfully",
      deletedVideoId: videoId
    })

  } catch (error) {
    console.error("[DELETE-VIDEO] ❌ Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
