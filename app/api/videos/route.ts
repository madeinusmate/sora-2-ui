import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: videos, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false })

    if (error) {
      console.error("[DEBUG] Database error:", error)
      return NextResponse.json({ error: "Failed to fetch videos" }, { status: 500 })
    }

    return NextResponse.json({ videos })
  } catch (error) {
    console.error("[DEBUG] Error fetching videos:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
