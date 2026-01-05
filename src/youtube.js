// YouTube API Service
// Fetches latest videos from Kyndall's channel

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export async function getLatestVideos(apiKey, channelId, maxResults = 10) {
  try {
    // First get the uploads playlist ID
    const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
    const channelRes = await fetch(channelUrl)
    const channelData = await channelRes.json()
    
    if (!channelData.items?.[0]) {
      console.error('Channel not found')
      return []
    }
    
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads
    
    // Get latest videos from uploads playlist
    const videosUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
    const videosRes = await fetch(videosUrl)
    const videosData = await videosRes.json()
    
    if (!videosData.items) {
      console.error('No videos found')
      return []
    }
    
    // Get full video details (including description, tags, duration)
    const videoIds = videosData.items.map(item => item.contentDetails.videoId).join(',')
    const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${apiKey}`
    const detailsRes = await fetch(detailsUrl)
    const detailsData = await detailsRes.json()
    
    return detailsData.items.map(video => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.maxres?.url || video.snippet.thumbnails.high?.url,
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
  // Note: YouTube API doesn't provide transcripts directly
  // We'd need to use a third-party service or YouTube's auto-captions
  // For now, we'll rely on title + description + tags
  return null
}
