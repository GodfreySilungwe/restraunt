// API utility functions for handling different environments
const API_BASE_URL = 'https://8nhfw2nleg.execute-api.us-east-1.amazonaws.com'
const IMAGES_BASE_URL = 'https://goshrestrauntfilebucket.s3.us-east-1.amazonaws.com/images'

export const getApiUrl = (path) => {
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${API_BASE_URL}/api/${cleanPath}`
}

export const getImageUrl = (filename) => {
  if (!filename) return null

  let cleanName = filename
  
  // If it's already a full URL (starts with http), return as-is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename
  }
  
  // If it contains amazonaws.com, it's a full S3 URL, return as-is
  if (filename.includes('amazonaws.com')) {
    return filename
  }

  // If it's just a filename or relative path, build the full URL
  if (filename.includes('amazonaws.com')) {
    const parts = filename.split('/')
    cleanName = parts[parts.length - 1]
    if (cleanName.includes('?')) {
      cleanName = cleanName.split('?')[0]
    }
  }

  if (cleanName.startsWith('/')) {
    cleanName = cleanName.slice(1)
  }

  if (cleanName.startsWith('images/')) {
    cleanName = cleanName.replace(/^images\//, '')
  }

  return `${IMAGES_BASE_URL}/${cleanName}`
}

// Keep for backward compatibility
export const getImageSources = (filename) => {
  const url = getImageUrl(filename)
  return { primary: url, fallback: url }
}

export const apiFetch = async (path, options = {}) => {
  const url = getApiUrl(path)
  return fetch(url, options)
}