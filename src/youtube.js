// YouTube Data API Service
// Fetches latest videos from a YouTube channel

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export async function getLatestVideos(apiKey, channelId, maxResults = 50) {
  console.log(`   Fetching up to ${maxResults} videos from channel...`)
  
  try {
    // First, get the uploads playlist ID
    const channelResponse = await fetch(
      `${YOUTUBE_API_BASE}/channels?` + new URLSearchParams({
        part: 'contentDetails',
        id: channelId,
        key: apiKey
      })
    )
    
    if (!channelResponse.ok) {
      const error = await channelResponse.json()
      console.error('   Channel fetch error:', error.error?.message || 'Unknown error')
      
      // If channel ID doesn't work, try searching by handle
      return await searchChannelVideos(apiKey, channelId, maxResults)
    }
    
    const channelData = await channelResponse.json()
    
    if (!channelData.items || channelData.items.length === 0) {
      console.log('   Channel not found, trying search...')
      return await searchChannelVideos(apiKey, channelId, maxResults)
    }
    
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads
    console.log(`   Found uploads playlist: ${uploadsPlaylistId}`)
    
    // Fetch ALL videos from uploads playlist (with pagination)
    const allVideos = []
    let nextPageToken = null
    
    do {
      const params = {
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, maxResults - allVideos.length), // API max is 50 per request
        key: apiKey
      }
      
      if (nextPageToken) {
        params.pageToken = nextPageToken
      }
      
      const playlistResponse = await fetch(
        `${YOUTUBE_API_BASE}/playlistItems?` + new URLSearchParams(params)
      )
      
      if (!playlistResponse.ok) {
        const error = await playlistResponse.json()
        console.error('   Playlist fetch error:', error.error?.message)
        break
      }
      
      const playlistData = await playlistResponse.json()
      
      if (playlistData.items) {
        allVideos.push(...playlistData.items)
        console.log(`   Fetched ${allVideos.length} videos so far...`)
      }
      
      nextPageToken = playlistData.nextPageToken
      
    } while (nextPageToken && allVideos.length < maxResults)
    
    console.log(`   Total videos fetched: ${allVideos.length}`)
    
    // Get video IDs for detailed info
    const videoIds = allVideos.map(item => item.snippet.resourceId.videoId)
    
    // Fetch detailed video info (including full description and stats)
    const videos = await getVideoDetails(apiKey, videoIds)
    
    return videos
    
  } catch (error) {
    console.error('   YouTube API error:', error.message)
    return []
  }
}

// Fetch detailed info for multiple videos
async function getVideoDetails(apiKey, videoIds) {
  const videos = []
  
  // API allows max 50 IDs per request, so batch them
  const batches = []
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50))
  }
  
  for (const batch of batches) {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/videos?` + new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
        key: apiKey
      })
    )
    
    if (!response.ok) {
      console.error('   Video details fetch error')
      continue
    }
    
    const data = await response.json()
    
    if (data.items) {
      for (const item of data.items) {
        videos.push({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: getBestThumbnail(item.snippet.thumbnails),
          publishedAt: item.snippet.publishedAt,
          tags: item.snippet.tags || [],
          viewCount: item.statistics?.viewCount,
          likeCount: item.statistics?.likeCount,
          commentCount: item.statistics?.commentCount,
          duration: item.contentDetails?.duration,
          url: `https://www.youtube.com/watch?v=${item.id}`,
          platform: 'youtube'
        })
      }
    }
  }
  
  return videos
}

// Fallback: search for channel videos
async function searchChannelVideos(apiKey, channelIdentifier, maxResults) {
  console.log(`   Searching for videos by: ${channelIdentifier}`)
  
  const allVideos = []
  let nextPageToken = null
  
  do {
    const params = {
      part: 'snippet',
      q: channelIdentifier,
      type: 'video',
      maxResults: Math.min(50, maxResults - allVideos.length),
      order: 'date',
      key: apiKey
    }
    
    if (nextPageToken) {
      params.pageToken = nextPageToken
    }
    
    const response = await fetch(
      `${YOUTUBE_API_BASE}/search?` + new URLSearchParams(params)
    )
    
    if (!response.ok) {
      const error = await response.json()
      console.error('   Search error:', error.error?.message)
      break
    }
    
    const data = await response.json()
    
    if (data.items) {
      const videoIds = data.items.map(item => item.id.videoId).filter(Boolean)
      const detailedVideos = await getVideoDetails(apiKey, videoIds)
      allVideos.push(...detailedVideos)
    }
    
    nextPageToken = data.nextPageToken
    
  } while (nextPageToken && allVideos.length < maxResults)
  
  return allVideos
}

function getBestThumbnail(thumbnails) {
  // Prefer maxres > standard > high > medium > default
  return thumbnails?.maxres?.url ||
         thumbnails?.standard?.url ||
         thumbnails?.high?.url ||
         thumbnails?.medium?.url ||
         thumbnails?.default?.url ||
         null
}

// Utility to get channel ID from handle or custom URL
export async function getChannelIdFromHandle(apiKey, handle) {
  // Remove @ if present
  const cleanHandle = handle.replace('@', '')
  
  const response = await fetch(
    `${YOUTUBE_API_BASE}/search?` + new URLSearchParams({
      part: 'snippet',
      q: cleanHandle,
      type: 'channel',
      maxResults: 1,
      key: apiKey
    })
  )
  
  if (!response.ok) {
    return null
  }
  
  const data = await response.json()
  
  if (data.items && data.items.length > 0) {
    return data.items[0].snippet.channelId
  }
  
  return null
}
