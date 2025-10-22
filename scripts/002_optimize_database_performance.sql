-- Optimize database performance to prevent timeout errors
-- This script adds additional indexes and optimizations

-- Add composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_videos_status_created_at ON public.videos(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_creation_type_status ON public.videos(creation_type, status);
CREATE INDEX IF NOT EXISTS idx_videos_video_id_status ON public.videos(video_id, status);

-- Add partial indexes for better performance on specific queries
CREATE INDEX IF NOT EXISTS idx_videos_in_progress ON public.videos(created_at) 
WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_videos_failed ON public.videos(created_at) 
WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_videos_completed ON public.videos(created_at) 
WHERE status = 'completed';

-- Add index for error message queries (for debugging)
CREATE INDEX IF NOT EXISTS idx_videos_error_message ON public.videos(error_message) 
WHERE error_message IS NOT NULL AND error_message != '';

-- Optimize the main videos table by adding constraints and improving data types
-- Add check constraint for status values (more flexible)
ALTER TABLE public.videos 
ADD CONSTRAINT videos_status_check 
CHECK (status IS NOT NULL AND status != '');

-- Add check constraint for model values (more flexible)
ALTER TABLE public.videos 
ADD CONSTRAINT videos_model_check 
CHECK (model IS NOT NULL AND model != '');

-- Add model column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'videos' AND column_name = 'model') THEN
        ALTER TABLE public.videos ADD COLUMN model text DEFAULT 'sora-2';
    END IF;
END $$;

-- Create a function to clean up old failed videos (optional maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_failed_videos()
RETURNS void AS $$
BEGIN
    -- Delete videos that have been failed for more than 7 days
    DELETE FROM public.videos 
    WHERE status = 'failed' 
    AND created_at < NOW() - INTERVAL '7 days';
    
    -- Log the cleanup
    RAISE NOTICE 'Cleaned up old failed videos';
END;
$$ LANGUAGE plpgsql;

-- Create a function to get video statistics
CREATE OR REPLACE FUNCTION get_video_stats()
RETURNS TABLE(
    total_videos bigint,
    completed_videos bigint,
    failed_videos bigint,
    in_progress_videos bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_videos,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_videos,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_videos,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_videos
    FROM public.videos;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION cleanup_old_failed_videos() IS 'Cleans up old failed videos to prevent database bloat';
COMMENT ON FUNCTION get_video_stats() IS 'Returns statistics about video generation status';

-- Update table statistics for better query planning
ANALYZE public.videos;
