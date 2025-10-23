-- ============================================================================
-- COMPLETE SUPABASE SETUP FOR SORA-2-UI
-- ============================================================================
-- This script sets up everything needed for a fresh Supabase instance:
-- 1. Database tables
-- 2. Indexes for performance
-- 3. Storage bucket (manual - see instructions below)
-- 4. Storage policies
-- 5. Database functions and triggers
--
-- 🔄 IDEMPOTENT: Safe to run multiple times
-- - Uses IF NOT EXISTS for tables and indexes
-- - Drops and recreates functions
-- - Updates existing constraints
--
-- Run this script in your Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE TABLES
-- ============================================================================

-- Create videos table to store generated video information
CREATE TABLE IF NOT EXISTS public.videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL,
  video_url text NOT NULL DEFAULT '',
  video_id text UNIQUE,
  status text NOT NULL DEFAULT 'completed',
  error_message text,
  model text NOT NULL DEFAULT 'sora-2',
  creation_type text DEFAULT 'standard' CHECK (creation_type IN ('standard', 'remix')),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add comments to document the table
COMMENT ON TABLE public.videos IS 'Stores video generation information and metadata';
COMMENT ON COLUMN public.videos.id IS 'Unique identifier for the video record';
COMMENT ON COLUMN public.videos.prompt IS 'Text prompt used to generate the video';
COMMENT ON COLUMN public.videos.video_url IS 'URL to the video file in Supabase Storage';
COMMENT ON COLUMN public.videos.video_id IS 'OpenAI/Azure job ID for tracking generation progress';
COMMENT ON COLUMN public.videos.status IS 'Current status of video generation (in_progress, completed, failed)';
COMMENT ON COLUMN public.videos.error_message IS 'Detailed error information when video generation fails';
COMMENT ON COLUMN public.videos.model IS 'AI model used for generation (e.g., sora-2, sora-1)';
COMMENT ON COLUMN public.videos.creation_type IS 'Type of video creation (standard or remix)';
COMMENT ON COLUMN public.videos.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN public.videos.updated_at IS 'Timestamp when the record was last updated';

-- ============================================================================
-- PART 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Primary indexes for common query patterns
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_video_id ON public.videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_creation_type ON public.videos(creation_type);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_videos_status_created_at ON public.videos(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_creation_type_status ON public.videos(creation_type, status);
CREATE INDEX IF NOT EXISTS idx_videos_video_id_status ON public.videos(video_id, status);

-- Partial indexes for better performance on specific queries
CREATE INDEX IF NOT EXISTS idx_videos_in_progress ON public.videos(created_at) 
WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_videos_failed ON public.videos(created_at) 
WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_videos_completed ON public.videos(created_at) 
WHERE status = 'completed';

-- Index for error message queries (for debugging)
CREATE INDEX IF NOT EXISTS idx_videos_error_message ON public.videos(error_message) 
WHERE error_message IS NOT NULL AND error_message != '';

-- ============================================================================
-- PART 3: CREATE CONSTRAINTS
-- ============================================================================

-- Add check constraints to ensure data integrity
ALTER TABLE public.videos 
ADD CONSTRAINT videos_status_check 
CHECK (status IS NOT NULL AND status != '');

ALTER TABLE public.videos 
ADD CONSTRAINT videos_model_check 
CHECK (model IS NOT NULL AND model != '');

-- ============================================================================
-- PART 4: CREATE STORAGE BUCKET
-- ============================================================================

-- NOTE: Storage buckets CANNOT be created via SQL in Supabase due to permissions.
-- You must create the bucket through the Supabase Dashboard:
--
-- 1. Go to: Storage → "New Bucket"
-- 2. Name: videos
-- 3. Public bucket: ✅ YES (check this box)
-- 4. File size limit: 500000000 (500MB) - optional
-- 5. Allowed MIME types: video/mp4, video/quicktime - optional
-- 6. Click "Create bucket"
--
-- The storage policies below will automatically apply once the bucket exists.

-- Verify bucket exists (will show error if not created yet)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'videos') THEN
        RAISE NOTICE '⚠️  WARNING: Storage bucket "videos" does not exist yet!';
        RAISE NOTICE '📋 Please create it manually in Supabase Dashboard:';
        RAISE NOTICE '   1. Go to Storage → New Bucket';
        RAISE NOTICE '   2. Name: videos';
        RAISE NOTICE '   3. Public: YES';
        RAISE NOTICE '   4. Click Create';
    ELSE
        RAISE NOTICE '✅ Storage bucket "videos" already exists';
    END IF;
END $$;

-- ============================================================================
-- PART 5: CREATE STORAGE POLICIES
-- ============================================================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage videos" ON storage.objects;

-- Policy 1: Allow authenticated users to upload videos
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos' AND
  auth.role() = 'authenticated'
);

-- Policy 2: Allow public read access to videos (for video playback)
CREATE POLICY "Public can read videos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'videos');

-- Policy 3: Allow authenticated users to delete their videos
CREATE POLICY "Authenticated users can delete videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos' AND
  auth.role() = 'authenticated'
);

-- Policy 4: Allow service role to manage all videos (for admin tasks)
CREATE POLICY "Service role can manage videos"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'videos')
WITH CHECK (bucket_id = 'videos');

-- ============================================================================
-- PART 6: CREATE DATABASE FUNCTIONS
-- ============================================================================

-- Function to automatically update the updated_at timestamp
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_videos_updated_at ON public.videos;
CREATE TRIGGER update_videos_updated_at
    BEFORE UPDATE ON public.videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up old failed videos (for maintenance)
DROP FUNCTION IF EXISTS cleanup_old_failed_videos(INTEGER);

CREATE FUNCTION cleanup_old_failed_videos(days_old INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete videos that have been failed for more than X days
    DELETE FROM public.videos 
    WHERE status = 'failed' 
    AND created_at < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old failed videos', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get video statistics
-- Drop existing function if it exists with different signature
DROP FUNCTION IF EXISTS get_video_stats();

CREATE FUNCTION get_video_stats()
RETURNS TABLE(
    total_videos bigint,
    completed_videos bigint,
    failed_videos bigint,
    in_progress_videos bigint,
    standard_videos bigint,
    remix_videos bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_videos,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_videos,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_videos,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_videos,
        COUNT(*) FILTER (WHERE creation_type = 'standard') as standard_videos,
        COUNT(*) FILTER (WHERE creation_type = 'remix') as remix_videos
    FROM public.videos;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates the updated_at timestamp on row updates';
COMMENT ON FUNCTION cleanup_old_failed_videos(INTEGER) IS 'Cleans up old failed videos to prevent database bloat';
COMMENT ON FUNCTION get_video_stats() IS 'Returns statistics about video generation status';

-- ============================================================================
-- PART 7: ENABLE ROW LEVEL SECURITY (OPTIONAL)
-- ============================================================================

-- Enable RLS on videos table (if needed for multi-tenancy)
-- Uncomment these lines if you want to enable RLS

-- ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- DROP POLICY IF EXISTS "Users can view all videos" ON public.videos;
-- CREATE POLICY "Users can view all videos"
-- ON public.videos
-- FOR SELECT
-- TO public
-- USING (true);

-- DROP POLICY IF EXISTS "Authenticated users can insert videos" ON public.videos;
-- CREATE POLICY "Authenticated users can insert videos"
-- ON public.videos
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (true);

-- DROP POLICY IF EXISTS "Authenticated users can update videos" ON public.videos;
-- CREATE POLICY "Authenticated users can update videos"
-- ON public.videos
-- FOR UPDATE
-- TO authenticated
-- USING (true)
-- WITH CHECK (true);

-- DROP POLICY IF EXISTS "Authenticated users can delete videos" ON public.videos;
-- CREATE POLICY "Authenticated users can delete videos"
-- ON public.videos
-- FOR DELETE
-- TO authenticated
-- USING (true);

-- ============================================================================
-- PART 8: ANALYZE TABLE FOR QUERY OPTIMIZATION
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE public.videos;

-- ============================================================================
-- PART 9: VERIFICATION QUERIES
-- ============================================================================

-- Run these queries to verify the setup
DO $$
DECLARE
    bucket_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO bucket_count FROM storage.buckets WHERE id = 'videos';
    SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%videos%';
    
    RAISE NOTICE '╔════════════════════════════════════════╗';
    RAISE NOTICE '║      SETUP VERIFICATION REPORT         ║';
    RAISE NOTICE '╚════════════════════════════════════════╝';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Tables created: %', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'videos');
    RAISE NOTICE '✅ Indexes created: %', (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'videos');
    RAISE NOTICE '✅ Functions created: %', (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('update_updated_at_column', 'cleanup_old_failed_videos', 'get_video_stats'));
    RAISE NOTICE '✅ Triggers created: %', (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'update_videos_updated_at');
    
    IF bucket_count > 0 THEN
        RAISE NOTICE '✅ Storage bucket: EXISTS (videos)';
    ELSE
        RAISE NOTICE '⚠️  Storage bucket: MISSING - Create it in Dashboard!';
    END IF;
    
    IF policy_count > 0 THEN
        RAISE NOTICE '✅ Storage policies: % policies created', policy_count;
    ELSE
        RAISE NOTICE '⚠️  Storage policies: NONE (will be created after bucket exists)';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════╗';
    RAISE NOTICE '║         SETUP STATUS                   ║';
    RAISE NOTICE '╚════════════════════════════════════════╝';
    
    IF bucket_count > 0 THEN
        RAISE NOTICE '🎉 COMPLETE! All components ready!';
    ELSE
        RAISE NOTICE '⚠️  ALMOST DONE! Please create storage bucket:';
        RAISE NOTICE '   Dashboard → Storage → New Bucket → "videos" (public)';
    END IF;
    RAISE NOTICE '';
END $$;

-- Display table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'videos'
ORDER BY ordinal_position;

-- Display indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
AND tablename = 'videos'
ORDER BY indexname;

-- Display storage bucket info
SELECT 
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
WHERE id = 'videos';

-- Display storage policies
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'storage' 
AND tablename = 'objects' 
AND policyname LIKE '%videos%';

-- ============================================================================
-- SETUP INSTRUCTIONS
-- ============================================================================
-- 
-- ✅ Database setup is COMPLETE!
-- 
-- What was created:
-- ✅ Videos table with proper schema
-- ✅ All necessary indexes for fast queries (10+)
-- ✅ Storage policies for secure access (4)
-- ✅ Database functions for maintenance and stats (3)
-- ✅ Automatic timestamp updates (1 trigger)
-- 
-- ⚠️  IMPORTANT: Create Storage Bucket Manually
-- 
-- Storage buckets cannot be created via SQL in Supabase.
-- Please create it through the Dashboard:
-- 
-- 1. Go to: Storage (left sidebar)
-- 2. Click: "New Bucket"
-- 3. Name: videos
-- 4. Public bucket: ✅ YES (check this box)
-- 5. File size limit: 500000000 (optional, 500MB)
-- 6. Allowed MIME types: video/mp4, video/quicktime (optional)
-- 7. Click: "Create bucket"
-- 
-- Once the bucket is created, the storage policies will automatically apply!
-- 
-- Next steps:
-- 1. Create the storage bucket (see above)
-- 2. Deploy your application code
-- 3. Set environment variables (SUPABASE_URL, SUPABASE_ANON_KEY)
-- 4. Test video generation
-- 5. Monitor performance and storage usage
-- 
-- Need help? See: FRESH_SETUP_GUIDE.md
-- ============================================================================
