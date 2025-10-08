export interface Video {
  id: string
  prompt: string
  video_url: string
  video_id?: string
  model?: string
  status?: "in_progress" | "completed" | "failed" 
  error_message?: string // Added error message field
  created_at: string
  creation_type?: string
}
