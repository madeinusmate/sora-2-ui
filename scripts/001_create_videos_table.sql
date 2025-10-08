-- Create videos table to store generated video information
-- This consolidated script creates the complete table structure with all columns and indexes

CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  video_url text NOT NULL,
  video_id text UNIQUE,
  status text DEFAULT 'completed',
  error_message text,
  creation_type text DEFAULT 'standard' CHECK (creation_type IN ('standard', 'remix')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON public.videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_creation_type ON public.videos(creation_type);

-- Add comments to document column purposes
COMMENT ON COLUMN public.videos.video_id IS 'OpenAI video ID for tracking generation progress';
COMMENT ON COLUMN public.videos.status IS 'Current status of video generation (completed, processing, failed, etc.)';
COMMENT ON COLUMN public.videos.error_message IS 'Detailed error information when video generation fails';
COMMENT ON COLUMN public.videos.creation_type IS 'Tracks whether the video was created as a standard generation or a remix of an existing video';
