// Sanity CMS Service
// Creates draft blog posts from analyzed content

import { createClient } from '@sanity/client'

let client = null

export function initSanity(projectId, dataset, token) {
  client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-01-01',
    useCdn: false
  })
}

// Upload an image from URL to Sanity assets
async function uploadImageFromUrl(imageUrl, filename) {
  if (!client || !imageUrl) return null
  
  try {
    // Fetch the image
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.log('   Failed to fetch thumbnail:', response.status)
      return null
    }
    
    const buffer = await response.arrayBuffer()
    const blob = new Blob([buffer])
    
    // Upload to Sanity
    const asset = await client.assets.upload('image', blob, {
      filename: filename || 'thumbnail.jpg',
      contentType: response.headers.get('content-type') || 'image/jpeg'
    })
    
    console.log('   ✓ Thumbnail uploaded to Sanity')
    
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id
      }
    }
  } catch (error) {
    console.log('   Could not upload thumbnail:', error.message)
    return null
  }
}

export async function checkIfVideoProcessed(videoId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "blogPost" && videoId == $videoId][0]`
  const result = await client.fetch(query, { videoId })
  return !!result
}

export async function createDraftBlogPost({
  video,
  analysis,
  productLinks
}) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Upload thumbnail image to Sanity
  let thumbnailImage = null
  if (video.thumbnail) {
    console.log('   Uploading thumbnail...')
    thumbnailImage = await uploadImageFromUrl(
      video.thumbnail, 
      `${video.id}-thumbnail.jpg`
    )
  }
  
  // Build the HTML content with product links inserted
  let htmlContent = analysis.blogContent || ''
  
  // Replace product reference links with actual URLs
  // Format: <a href="#product-N" class="product-link">Product Name</a>
  for (let i = 0; i < productLinks.length; i++) {
    const product = productLinks[i]
    const productIndex = i + 1
    
    // Find all references to this product
    const pattern = new RegExp(`<a href="#product-${productIndex}"[^>]*class="product-link"[^>]*>([^<]+)</a>`, 'gi')
    
    let actualUrl = ''
    let linkTitle = ''
    
    if (product.shopmyUrl) {
      actualUrl = product.shopmyUrl
      linkTitle = 'Shop on ShopMy'
    } else if (product.amazonUrl) {
      actualUrl = product.amazonUrl
      linkTitle = 'Shop on Amazon'
    }
    
    if (actualUrl) {
      htmlContent = htmlContent.replace(pattern, `<a href="${actualUrl}" target="_blank" rel="noopener noreferrer" title="${linkTitle}" class="product-link">$1</a>`)
    } else {
      // No link available - just make it bold
      htmlContent = htmlContent.replace(pattern, '<strong class="product-name">$1</strong>')
    }
  }
  
  // Also handle any remaining product links that weren't matched (fallback)
  htmlContent = htmlContent.replace(/<a href="#product-\d+"[^>]*class="product-link"[^>]*>([^<]+)<\/a>/gi, '<strong class="product-name">$1</strong>')
  
  // Create the blog post document
  // Determine aspect ratio based on platform
  let aspectRatio = 'landscape' // default for YouTube
  const platformLower = (video.platform || 'youtube').toLowerCase()
  if (platformLower === 'tiktok' || platformLower === 'instagram') {
    aspectRatio = 'portrait'
  }
  
  // Map platform to proper casing for schema
  const platformMap: Record<string, string> = {
    'youtube': 'YouTube',
    'tiktok': 'TikTok',
    'instagram': 'Instagram',
    'blog': 'Blog'
  }
  const platform = platformMap[platformLower] || 'YouTube'
  
  const doc = {
    _type: 'blogPost',
    title: analysis.blogTitle,
    slug: {
      _type: 'slug',
      current: generateSlug(analysis.blogTitle)
    },
    seoTitle: analysis.seoTitle,
    seoDescription: analysis.seoDescription,
    excerpt: analysis.blogExcerpt,
    category: analysis.category?.toLowerCase() || 'lifestyle',
    platform: platform,
    aspectRatio: aspectRatio,
    videoUrl: video.url,
    videoId: video.id,
    // Also store YouTube thumbnail URL as backup
    thumbnailUrl: video.thumbnail || null,
    // Use HTML content format for auto-generated posts
    contentFormat: 'html',
    htmlContent: htmlContent,
    // Keep content array empty for now (could convert later if needed)
    content: [],
    // Store product info for reference
    productLinks: productLinks.map(p => ({
      _type: 'productItem',
      _key: generateKey(),
      name: p.name,
      brand: p.brand,
      productType: p.productType || null,
      originalUrl: p.originalUrl || null,
      amazonUrl: p.amazonUrl || null,
      shopmyUrl: p.shopmyUrl || null,
      hasShopmy: p.shopmyUrl ? 'yes' : 'pending',
      hasAmazon: p.amazonUrl ? 'yes' : 'pending',
      suggestedAmazonSearch: p.amazonUrl ? null : `https://www.amazon.com/s?k=${encodeURIComponent((p.brand || '') + ' ' + (p.name || ''))}`,
      reviewed: false,
    })),
    suggestedTags: analysis.suggestedTags || [],
    status: 'draft', // Always create as draft for Kyndall to review
    publishedAt: new Date().toISOString(),
    autoGenerated: true,
    sourceVideo: {
      id: video.id,
      title: video.title,
      platform: video.platform,
      publishedAt: video.publishedAt
    }
  }
  
  // Add thumbnail image if upload was successful
  if (thumbnailImage) {
    doc.thumbnail = thumbnailImage
  }
  
  const result = await client.create(doc)
  return result
}

export async function getRecentDrafts(limit = 10) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "blogPost" && status == "draft" && autoGenerated == true] | order(publishedAt desc)[0...$limit] {
    _id,
    title,
    category,
    platform,
    publishedAt,
    productLinks
  }`
  
  return client.fetch(query, { limit })
}

export async function getAdminSettings() {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "adminSettings"][0] {
    youtubeChannelId,
    youtubeApiKey,
    autoProcessVideos,
    maxVideosPerRun,
    processedVideoIds
  }`
  
  return client.fetch(query)
}

export async function updateAdminStats(stats) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Get or create admin settings document
  const existing = await client.fetch(`*[_type == "adminSettings"][0]._id`)
  
  if (existing) {
    await client.patch(existing)
      .set({
        lastRun: new Date().toISOString(),
        ...stats
      })
      .commit()
  }
}

export async function getExpiringCodes(daysAhead = 7) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + daysAhead)
  
  const query = `*[_type == "discountCode" && expiresAt <= $futureDate && expiresAt > now() && !reminderSent] {
    _id,
    brand,
    code,
    discount,
    expiresAt
  }`
  
  return client.fetch(query, { futureDate: futureDate.toISOString() })
}

export async function markReminderSent(codeId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  await client.patch(codeId)
    .set({ reminderSent: true })
    .commit()
}

export async function runCleanup() {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Clean up expired discount codes older than 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const expiredCodes = await client.fetch(
    `*[_type == "discountCode" && expiresAt < $date]._id`,
    { date: thirtyDaysAgo.toISOString() }
  )
  
  if (expiredCodes.length > 0) {
    console.log(`   Cleaning up ${expiredCodes.length} expired codes`)
    for (const id of expiredCodes) {
      await client.delete(id)
    }
  }
  
  return { deletedCodes: expiredCodes.length }
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 96)
}

function generateKey() {
  return Math.random().toString(36).substring(2, 10)
}
