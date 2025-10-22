-- Check what model values exist in the database
-- This will help identify what values are causing the constraint violation

SELECT 
    model,
    COUNT(*) as count,
    MIN(created_at) as earliest,
    MAX(created_at) as latest
FROM public.videos 
GROUP BY model 
ORDER BY count DESC;

-- Also check for any null or empty model values
SELECT 
    'NULL or empty models' as issue,
    COUNT(*) as count
FROM public.videos 
WHERE model IS NULL OR model = '';

-- Show a sample of problematic records
SELECT 
    id,
    model,
    status,
    created_at
FROM public.videos 
WHERE model IS NULL OR model = ''
LIMIT 10;
