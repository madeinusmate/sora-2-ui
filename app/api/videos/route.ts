import { NextResponse } from "next/server"
import { fetchVideosOptimized } from "@/lib/database-utils"

export async function GET() {
  try {
    console.log("[VIDEOS-API] 📋 Fetching videos with optimized query")
    
    const videos = await fetchVideosOptimized(50, 0)
    
    console.log(`[VIDEOS-API] ✅ Successfully fetched ${videos?.length || 0} videos`)
    return NextResponse.json({ videos })
  } catch (error) {
    console.error("[VIDEOS-API] ❌ Error fetching videos:", error)
    
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
