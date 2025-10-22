import { createClient } from "@/lib/supabase/server"
import { DATABASE_CONFIG, logDatabaseMetrics, shouldRetryError, calculateRetryDelay } from "@/lib/database-config"

interface DatabaseOperationOptions {
  retries?: number
  timeout?: number
  retryDelay?: number
}

const DEFAULT_OPTIONS: Required<DatabaseOperationOptions> = {
  retries: DATABASE_CONFIG.maxRetries,
  timeout: DATABASE_CONFIG.queryTimeout,
  retryDelay: DATABASE_CONFIG.retryDelay,
}

export class DatabaseTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseTimeoutError'
  }
}

export class DatabaseConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseConnectionError'
  }
}

/**
 * Executes a database operation with retry logic and timeout handling
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: DatabaseOperationOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null
  const startTime = Date.now()

  for (let attempt = 0; attempt <= config.retries; attempt++) {
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new DatabaseTimeoutError(`Operation timed out after ${config.timeout}ms`))
        }, config.timeout)
      })

      // Race between the operation and timeout
      const result = await Promise.race([operation(), timeoutPromise])
      
      // Log successful operation
      const duration = Date.now() - startTime
      logDatabaseMetrics('database_operation', duration, true)
      
      return result
    } catch (error) {
      lastError = error as Error
      
      // Check if it's a timeout or connection error that we should retry
      if (shouldRetryError(error) && attempt < config.retries) {
        const retryDelay = calculateRetryDelay(attempt + 1)
        console.warn(`[DB-UTILS] ⚠️ Database operation failed (attempt ${attempt + 1}/${config.retries + 1}):`, {
          error: error instanceof Error ? error.message : String(error),
          retryingIn: retryDelay
        })
        
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        continue
      }
      
      // Log failed operation
      const duration = Date.now() - startTime
      logDatabaseMetrics('database_operation', duration, false)
      
      // If it's not retryable or we've exhausted retries, throw the error
      throw error
    }
  }

  throw lastError || new Error('Database operation failed after all retries')
}


/**
 * Wrapper for Supabase operations with automatic retry and timeout handling
 */
export async function withDatabaseRetry<T>(
  operation: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<T>,
  options: DatabaseOperationOptions = {}
): Promise<T> {
  return executeWithRetry(async () => {
    const supabase = await createClient()
    return operation(supabase)
  }, options)
}

/**
 * Optimized query for fetching videos with proper indexing
 */
export async function fetchVideosOptimized(limit: number = 50, offset: number = 0) {
  return withDatabaseRetry(async (supabase) => {
    const { data, error } = await supabase
      .from("videos")
      .select("id, prompt, video_url, video_id, status, error_message, creation_type, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (error) throw error
    return data
  })
}

/**
 * Optimized query for fetching a single video by ID
 */
export async function fetchVideoById(videoId: string) {
  return withDatabaseRetry(async (supabase) => {
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .single()
    
    if (error) throw error
    return data
  })
}

/**
 * Optimized query for fetching a video by video_id (OpenAI job ID)
 */
export async function fetchVideoByVideoId(videoId: string) {
  return withDatabaseRetry(async (supabase) => {
    const { data, error } = await supabase
      .from("videos")
      .select("id, video_id, status, error_message, video_url, created_at")
      .eq("video_id", videoId)
      .single()
    
    if (error) throw error
    return data
  })
}

/**
 * Batch update operation for better performance
 */
export async function updateVideoStatus(
  recordId: string, 
  updates: { status?: string; error_message?: string; video_url?: string }
) {
  return withDatabaseRetry(async (supabase) => {
    const { data, error } = await supabase
      .from("videos")
      .update(updates)
      .eq("id", recordId)
      .select()
      .single()
    
    if (error) throw error
    return data
  })
}

/**
 * Insert video with optimized error handling
 */
export async function insertVideo(videoData: {
  prompt: string
  video_url: string
  video_id: string
  model: string
  status: string
  error_message?: string
  creation_type: string
}) {
  return withDatabaseRetry(async (supabase) => {
    const { data, error } = await supabase
      .from("videos")
      .insert(videoData)
      .select()
      .single()
    
    if (error) throw error
    return data
  })
}
