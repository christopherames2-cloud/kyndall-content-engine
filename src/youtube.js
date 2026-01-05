// YouTube API Service
// Fetches latest videos from Kyndall's channel

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export async function getLatestVideos(apiKey, channelId, maxResults = 10) {
  try {
    // Get uploads playlist ID - try by channel ID first
    let uploadsPlaylistId = null
    
    // Method 1: Direct channel ID lookup
    const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    console.log(`   Trying channel ID: ${channelId}`)
    const channelRes = await fetch(channelUrl)
    const channelData = await channelRes.json()
    
    if (channelData.error) {
      console.error('   YouTube API error:', channelData.error.message)
      return []
    }
    
    if (channelData.items?.[0]) {
      uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads
    } else {
      // Method 2: Try searching for channel
      console.log('   Channel not found by ID, trying search...')
      const searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=kyndallames&key=${apiKey}`
      const searchRes = await fetch(searchUrl)
      const searchData = await searchRes.json()
      
      if (searchData.items?.[0]) {
        const foundChannelId = searchData.items[0].snippet.channelId
        console.log(`   Found channel via search: ${foundChannelId}`)
        
        const retryUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${foundChannelId}&key=${apiKey}`
        const retryRes = await fetch(retryUrl)
        const retryData = await retryRes.json()
        
        if (retryData.items?.[0]) {
          uploadsPlaylistId = retryData.items[0].contentDetails.relatedPlaylists.uploads
        }
      }
    }
    
    if (!uploadsPlaylistId) {
      console.error('   Could not find uploads playlist')
      return []
    }
    
    console.log(`   Found uploads playlist: ${uploadsPlaylistId}`)
    
    // Get latest videos from uploads playlist
    const videosUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
    const videosRes = await fetch(videosUrl)
    const videosData = await videosRes.json()
    
    if (videosData.error) {
      console.error('   Error fetching videos:', videosData.error.message)
      return []
    }
    
    if (!videosData.items || videosData.items.length === 0) {
      console.log('   No videos found in playlist')
      return []
    }
    
    // Get full video details (including description, tags, duration)
    const videoIds = videosData.items.map(item => item.contentDetails.videoId).join(',')
    const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`
    const detailsRes = await fetch(detailsUrl)
    const detailsData = await detailsRes.json()
    
    if (detailsData.error) {
      console.error('   Error fetching video details:', detailsData.error.message)
      return []
    }
    
    return detailsData.items.map(video => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url || video.snippet.thumbnails.default?.url,
      publishedAt: video.snippet.publishedAt,
      tags: video.snippet.tags || [],
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      platform: 'YouTube'
    }))
  } catch (error) {
    console.error('Error fetching YouTube videos:', error)
    return []
  }
}

export async function getVideoTranscript(videoId, apiKey) {
  return null
}
