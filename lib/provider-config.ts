// Provider configuration utility
const AI_PROVIDER = process.env.AI_PROVIDER || "openai"

// Azure configuration
const AZURE_ENDPOINT = "https://stefa-m74csuwx-eastus2.openai.azure.com/openai/v1"
const AZURE_API_VERSION = "preview"

// Provider configuration interface
export interface ProviderConfig {
  generateUrl: string
  statusUrl: (jobId: string) => string
  contentUrl: (jobId: string) => string
  headers: Record<string, string>
}

// Get provider-specific configuration
export const getProviderConfig = (): ProviderConfig => {
  if (AI_PROVIDER === "azure") {
    return {
      generateUrl: `${AZURE_ENDPOINT}/video/generations/jobs?api-version=${AZURE_API_VERSION}`,
      statusUrl: (jobId: string) => `${AZURE_ENDPOINT}/video/generations/jobs/${jobId}?api-version=${AZURE_API_VERSION}`,
      contentUrl: (jobId: string) => `${AZURE_ENDPOINT}/video/generations/${jobId}/content/video?api-version=${AZURE_API_VERSION}`,
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.AZURE_API_KEY || "",
      } as Record<string, string>
    }
  } else {
    // Default OpenAI configuration
    return {
      generateUrl: "https://api.openai.com/v1/videos",
      statusUrl: (jobId: string) => `https://api.openai.com/v1/videos/${jobId}`,
      contentUrl: (jobId: string) => `https://api.openai.com/v1/videos/${jobId}/content`,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      } as Record<string, string>
    }
  }
}

// Format request body for different providers
export const formatRequestForProvider = (prompt: string, model: string, seconds: string, size: string, inputReference: File | null) => {
  const [width, height] = size.split("x").map(Number)
  
  if (AI_PROVIDER === "azure") {
    // Azure format
    return {
      prompt,
      n_variants: 1,
      n_seconds: parseInt(seconds),
      height,
      width,
      model
    }
  } else {
    // OpenAI format
    if (inputReference) {
      const formData = new FormData()
      formData.append("model", model)
      formData.append("prompt", prompt)
      formData.append("seconds", seconds)
      formData.append("size", size)
      formData.append("input_reference", inputReference)
      return formData
    } else {
      return {
        model,
        prompt,
        seconds,
        size
      }
    }
  }
}

// Get the current provider name
export const getCurrentProvider = () => AI_PROVIDER

// Check if Azure provider is being used
export const isAzureProvider = () => AI_PROVIDER === "azure"
