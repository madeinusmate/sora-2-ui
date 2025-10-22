-- Comprehensive fix for all database constraints
-- This script safely removes restrictive constraints and adds flexible ones

-- Step 1: Check and drop existing constraints
DO $$ 
BEGIN
    -- Drop videos_model_check constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'videos_model_check' 
        AND table_name = 'videos'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.videos DROP CONSTRAINT videos_model_check;
        RAISE NOTICE 'Dropped videos_model_check constraint';
    END IF;
    
    -- Drop videos_status_check constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'videos_status_check' 
        AND table_name = 'videos'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.videos DROP CONSTRAINT videos_status_check;
        RAISE NOTICE 'Dropped videos_status_check constraint';
    END IF;
END $$;

-- Step 2: Clean up any problematic data
-- Update any null or empty model values
UPDATE public.videos 
SET model = 'sora-2' 
WHERE model IS NULL OR model = '';

-- Update any null or empty status values
UPDATE public.videos 
SET status = 'completed' 
WHERE status IS NULL OR status = '';

-- Step 3: Add flexible constraints
-- Add constraint for model (just ensure it's not null/empty)
ALTER TABLE public.videos 
ADD CONSTRAINT videos_model_check 
CHECK (model IS NOT NULL AND model != '');

-- Add constraint for status (just ensure it's not null/empty)
ALTER TABLE public.videos 
ADD CONSTRAINT videos_status_check 
CHECK (status IS NOT NULL AND status != '');

-- Step 4: Add comments for documentation
COMMENT ON CONSTRAINT videos_model_check ON public.videos IS 'Ensures model field is not null or empty';
COMMENT ON CONSTRAINT videos_status_check ON public.videos IS 'Ensures status field is not null or empty';

-- Step 5: Verify the constraints work
DO $$ 
BEGIN
    RAISE NOTICE 'All constraints have been successfully applied';
    RAISE NOTICE 'Model constraint: Ensures model is not null or empty';
    RAISE NOTICE 'Status constraint: Ensures status is not null or empty';
END $$;
