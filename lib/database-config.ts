/**
 * Database configuration and connection management
 * This file contains settings to optimize database performance and prevent timeouts
 */

export const DATABASE_CONFIG = {
  // Connection timeout settings
  connectionTimeout: 30000, // 30 seconds
  queryTimeout: 30000, // 30 seconds
  idleTimeout: 60000, // 1 minute
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  retryBackoffMultiplier: 2, // Exponential backoff
  
  // Connection pool settings (if using connection pooling)
  maxConnections: 10,
  minConnections: 2,
  
  // Query optimization
  enableQueryLogging: process.env.NODE_ENV === 'development',
  enableSlowQueryLogging: true,
  slowQueryThreshold: 5000, // 5 seconds
}

/**
 * Database error codes that should trigger retries
 */
export const RETRYABLE_ERROR_CODES = [
  '57014', // statement timeout
  '08006', // connection failure
  '08003', // connection does not exist
  '08001', // SQL client unable to establish SQL connection
  '08004', // SQL server rejected establishment of SQL connection
  '08007', // transaction resolution unknown
  '08P01', // protocol violation
  '40001', // serialization failure
  '40P01', // deadlock detected
  '53300', // too many connections
]

/**
 * Database error codes that should NOT be retried
 */
export const NON_RETRYABLE_ERROR_CODES = [
  '23505', // unique violation
  '23503', // foreign key violation
  '23502', // not null violation
  '23514', // check violation
  '42P01', // undefined table
  '42703', // undefined column
  '42883', // undefined function
]

/**
 * Get database connection URL with optimized parameters
 */
export function getOptimizedDatabaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
  }
  
  // Add connection parameters for better performance
  const url = new URL(baseUrl)
  url.searchParams.set('connection_timeout', DATABASE_CONFIG.connectionTimeout.toString())
  url.searchParams.set('statement_timeout', DATABASE_CONFIG.queryTimeout.toString())
  url.searchParams.set('idle_in_transaction_session_timeout', DATABASE_CONFIG.idleTimeout.toString())
  
  return url.toString()
}

/**
 * Log database performance metrics
 */
export function logDatabaseMetrics(operation: string, duration: number, success: boolean) {
  if (DATABASE_CONFIG.enableQueryLogging) {
    const level = success ? 'info' : 'error'
    const message = `[DB-METRICS] ${operation} took ${duration}ms (${success ? 'success' : 'failed'})`
    
    if (duration > DATABASE_CONFIG.slowQueryThreshold) {
      console.warn(`[DB-SLOW-QUERY] ${message} - SLOW QUERY DETECTED`)
    } else {
      console.log(`[DB-METRICS] ${message}`)
    }
  }
}

/**
 * Check if an error should trigger a retry
 */
export function shouldRetryError(error: any): boolean {
  if (!error) return false
  
  // Check for specific error codes
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true
  }
  
  // Check for timeout errors
  if (error.message && error.message.includes('timeout')) {
    return true
  }
  
  // Check for connection errors
  if (error.message && error.message.includes('connection')) {
    return true
  }
  
  return false
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(attempt: number): number {
  return DATABASE_CONFIG.retryDelay * Math.pow(DATABASE_CONFIG.retryBackoffMultiplier, attempt - 1)
}
