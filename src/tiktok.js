// src/tiktok.js
// TikTok API Service for Content Engine
// Fetches Kyndall's TikTok videos for blog post generation
// Same workflow as YouTube - videos become draft blogPosts

import { createClient } from '@sanity/client'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

let sanityClient = null

/**
 * Initialize Sanity client for token storage
 */
export function initTikTokSanity(projectId, dataset, token) {
  sanityClient = createClient({
    projectId,
    dataset,
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  })
}

/**
 * Get stored TikTok credentials from Sanity
 */
async function getCredentials() {
  if (!sanityClient) {
    console.log('   ⚠️ TikTok: Sanity client not initialized')
    return null
  }

  try {
    const credentials = await sanityClient.fetch(
      `*[_id == "tiktok-credentials"][0]`
    )
    return credentials
  } catch (error) {
    console.log('   ⚠️ TikTok: No credentials found')
    return null
  }
}

/**
 * Refresh access token if expired
 */
async function refreshTokenIfNeeded(credentials) {
  const now = Date.now()
  const accessExpiry = new Date(credentials.accessTokenExpiry).getTime()
  
  // If token is still valid (with 5 min buffer), return it
  if (now < accessExpiry - 5 * 60 * 1000) {
    return credentials.accessToken
  }

  // Check if refresh token is still valid
  const refreshExpiry = new Date(credentials.refreshTokenExpiry).getTime()
  if (now >= refreshExpiry) {
    console.log('   ❌ TikTok: Refresh token expired - need to reconnect at /admin/tiktok')
    return null
  }

  console.log('   🔄 TikTok: Refreshing access token...')

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET

  if (!clientKey || !clientSecret) {
    console.log('   ❌ TikTok: Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET')
    return null
  }

  try {
    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
      }),
    })

    const data = await response.json()

    if (data.error) {
      console.log(`   ❌ TikTok: Token refresh failed - ${data.error_description}`)
      return null
    }

    // Update stored tokens
    const newAccessExpiry = Date.now() + (data.expires_in * 1000)
    const newRefreshExpiry = Date.now() + (data.refresh_expires_in * 1000)

    await sanityClient.patch('tiktok-credentials').set({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiry: new Date(newAccessExpiry).toISOString(),
      refreshTokenExpiry: new Date(newRefreshExpiry).toISOString(),
      lastRefreshed: new Date().toISOString(),
    }).commit()

    console.log('   ✅ TikTok: Token refreshed successfully')
    return data.access_token

  } catch (error) {
    console.log(`   ❌ TikTok: Token refresh error - ${error.message}`)
    return null
  }
}

/**
 * Fetch videos from TikTok API
 */
async function fetchTikTokVideos(accessToken, maxCount = 20) {
  const fields = [
    'id',
    'title',
    'video_description',
    'duration',
    'cover_image_url',
    'share_url',
    'embed_link',
    'create_time',
    'like_count',
    'comment_count',
    'share_count',
    'view_count',
  ].join(',')

  const response = await fetch(`${TIKTOK_API_BASE}/video/list/?fields=${fields}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      max_count: maxCount,
    }),
  })

  const data = await response.json()

  if (data.error?.code && data.error.code !== 'ok') {
    throw new Error(data.error.message || 'Failed to fetch TikTok videos')
  }

  return data.data?.videos || []
}

/**
 * Get latest TikTok videos - main export function
 * Matches the same interface as getLatestVideos from youtube.js
 * 
 * @param {number} maxResults - Maximum number of videos to fetch
 * @returns {Promise<Array>} Array of video objects
 */
export async function getLatestTikTokVideos(maxResults = 20) {
  console.log(`   Fetching up to ${maxResults} TikTok videos...`)

  try {
    // Get stored credentials
    const credentials = await getCredentials()

    if (!credentials) {
      console.log('   ⚠️ TikTok: Not connected - skipping')
      console.log('      Connect TikTok at: /admin/tiktok')
      return []
    }

    // Get valid access token
    const accessToken = await refreshTokenIfNeeded(credentials)

    if (!accessToken) {
      console.log('   ⚠️ TikTok: Unable to get valid token - skipping')
      return []
    }

    // Fetch videos
    const tiktokVideos = await fetchTikTokVideos(accessToken, maxResults)
    console.log(`   Found ${tiktokVideos.length} TikTok videos`)

    // Transform to match YouTube video format for consistent processing
    const videos = tiktokVideos.map(video => ({
      id: `tiktok_${video.id}`, // Prefix to avoid ID collisions with YouTube
      title: video.title || video.video_description || 'TikTok Video',
      description: video.video_description || video.title || '',
      thumbnail: video.cover_image_url,
      publishedAt: video.create_time 
        ? new Date(video.create_time * 1000).toISOString() 
        : new Date().toISOString(),
      tags: [], // TikTok doesn't provide tags via this API
      viewCount: video.view_count?.toString() || '0',
      likeCount: video.like_count?.toString() || '0',
      commentCount: video.comment_count?.toString() || '0',
      shareCount: video.share_count?.toString() || '0',
      duration: video.duration ? `PT${video.duration}S` : null, // ISO 8601 duration format
      url: video.share_url,
      embedUrl: video.embed_link,
      platform: 'tiktok', // Important: identifies this as a TikTok video
      aspectRatio: 'portrait', // TikTok videos are vertical
    }))

    return videos

  } catch (error) {
    console.log(`   ❌ TikTok: Error fetching videos - ${error.message}`)
    return []
  }
}

/**
 * Check if TikTok is connected
 */
export async function isTikTokConnected() {
  const credentials = await getCredentials()
  
  if (!credentials) return false
  
  // Check if refresh token is still valid
  const refreshExpiry = new Date(credentials.refreshTokenExpiry).getTime()
  return Date.now() < refreshExpiry
}

/**
 * Get TikTok connection status
 */
export async function getTikTokStatus() {
  const credentials = await getCredentials()
  
  if (!credentials) {
    return {
      connected: false,
      message: 'TikTok not connected',
    }
  }
  
  const now = Date.now()
  const refreshExpiry = new Date(credentials.refreshTokenExpiry).getTime()
  
  if (now >= refreshExpiry) {
    return {
      connected: false,
      expired: true,
      message: 'TikTok authorization expired - please reconnect',
    }
  }
  
  const daysUntilExpiry = Math.floor((refreshExpiry - now) / (1000 * 60 * 60 * 24))
  
  return {
    connected: true,
    connectedAt: credentials.connectedAt,
    daysUntilExpiry,
    message: `TikTok connected (expires in ${daysUntilExpiry} days)`,
  }
}
