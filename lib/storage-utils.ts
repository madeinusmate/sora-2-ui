import { createClient } from "@/lib/supabase/server"
import { createClient as createBrowserClient } from "@/lib/supabase/client"

/**
 * Supabase Storage utility functions for managing video files
 * This replaces the base64 string storage approach with proper file storage
 */

const STORAGE_BUCKET = "videos"

/**
 * Upload a video blob to Supabase Storage
 * @param videoBlob - The video blob to upload
 * @param videoId - Unique identifier for the video (OpenAI job ID)
 * @returns The public URL of the uploaded video
 */
export const uploadVideoToStorage = async (
  videoBlob: Blob,
  videoId: string
): Promise<string> => {
  const supabase = await createClient()
  
  // Generate a unique filename
  const timestamp = Date.now()
  const filename = `${videoId}-${timestamp}.mp4`
  const filePath = `videos/${filename}`

  console.log(`[STORAGE] 📤 Uploading video to storage:`, {
    filename,
    size: `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`,
    path: filePath
  })

  // Upload the file to Supabase Storage
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, videoBlob, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error(`[STORAGE] ❌ Failed to upload video:`, error)
    throw new Error(`Failed to upload video: ${error.message}`)
  }

  console.log(`[STORAGE] ✅ Video uploaded successfully:`, data.path)

  // Get the public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path)

  console.log(`[STORAGE] 🔗 Public URL generated:`, urlData.publicUrl)

  return urlData.publicUrl
}

/**
 * Delete a video from Supabase Storage
 * @param videoUrl - The public URL of the video to delete
 */
export const deleteVideoFromStorage = async (videoUrl: string): Promise<void> => {
  const supabase = await createClient()
  
  // Extract the file path from the public URL
  const filePath = extractFilePathFromUrl(videoUrl)
  
  if (!filePath) {
    console.warn(`[STORAGE] ⚠️ Could not extract file path from URL:`, videoUrl)
    return
  }

  console.log(`[STORAGE] 🗑️ Deleting video from storage:`, filePath)

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([filePath])

  if (error) {
    console.error(`[STORAGE] ❌ Failed to delete video:`, error)
    throw new Error(`Failed to delete video: ${error.message}`)
  }

  console.log(`[STORAGE] ✅ Video deleted successfully`)
}

/**
 * Extract the file path from a Supabase Storage public URL
 */
const extractFilePathFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`)
    return pathParts[1] || null
  } catch (error) {
    console.error(`[STORAGE] ❌ Failed to parse URL:`, error)
    return null
  }
}

/**
 * Client-side version of upload (for browser contexts)
 */
export const uploadVideoToStorageClient = async (
  videoBlob: Blob,
  videoId: string
): Promise<string> => {
  const supabase = createBrowserClient()
  
  const timestamp = Date.now()
  const filename = `${videoId}-${timestamp}.mp4`
  const filePath = `videos/${filename}`

  console.log(`[STORAGE-CLIENT] 📤 Uploading video to storage:`, {
    filename,
    size: `${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`,
    path: filePath
  })

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, videoBlob, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    console.error(`[STORAGE-CLIENT] ❌ Failed to upload video:`, error)
    throw new Error(`Failed to upload video: ${error.message}`)
  }

  console.log(`[STORAGE-CLIENT] ✅ Video uploaded successfully:`, data.path)

  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path)

  console.log(`[STORAGE-CLIENT] 🔗 Public URL generated:`, urlData.publicUrl)

  return urlData.publicUrl
}

/**
 * Download a video from a URL and return as Blob
 */
export const downloadVideoAsBlob = async (url: string): Promise<Blob> => {
  console.log(`[STORAGE] 📥 Downloading video from URL:`, url)
  
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`)
  }
  
  const blob = await response.blob()
  console.log(`[STORAGE] ✅ Video downloaded successfully:`, {
    size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
    type: blob.type
  })
  
  return blob
}

/**
 * Check if a URL is a base64 data URL
 */
export const isBase64DataUrl = (url: string): boolean => {
  return url.startsWith('data:')
}

/**
 * Check if a URL is a Supabase Storage URL
 */
export const isStorageUrl = (url: string): boolean => {
  return url.includes('/storage/v1/object/public/')
}
