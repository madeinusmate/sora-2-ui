-- Fix the model constraint that's causing errors
-- This script removes the restrictive constraint and adds a more flexible one

-- First, drop the existing constraint if it exists
DO $$ 
BEGIN
    -- Check if the constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'videos_model_check' 
        AND table_name = 'videos'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.videos DROP CONSTRAINT videos_model_check;
        RAISE NOTICE 'Dropped existing videos_model_check constraint';
    END IF;
END $$;

-- Add a more flexible constraint that just ensures model is not null and not empty
ALTER TABLE public.videos 
ADD CONSTRAINT videos_model_check 
CHECK (model IS NOT NULL AND model != '');

-- Update any existing rows that might have null or empty model values
UPDATE public.videos 
SET model = 'sora-2' 
WHERE model IS NULL OR model = '';

-- Add a comment to document the constraint
COMMENT ON CONSTRAINT videos_model_check ON public.videos IS 'Ensures model field is not null or empty';
