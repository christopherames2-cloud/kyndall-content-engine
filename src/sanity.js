// src/sanity.js
// Sanity CMS integration for Kyndall Content Engine

import { createClient } from '@sanity/client'

let client = null

export function initSanity(projectId, dataset, token) {
  client = createClient({
    projectId,
    dataset,
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  })
  console.log('✅ Sanity client initialized')
}

// Generate a random key for array items
function generateKey() {
  return Math.random().toString(36).substring(2, 10)
}

// Generate URL-friendly slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 96)
}

// Upload image from URL to Sanity
async function uploadImageFromUrl(imageUrl, filename) {
  if (!client || !imageUrl) return null
  
  try {
    console.log('   Downloading image from:', imageUrl.substring(0, 50) + '...')
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.log('   ✗ Failed to download image:', response.status)
      return null
    }
    
    const buffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)
    
    console.log('   Uploading to Sanity...', uint8Array.length, 'bytes')
    
    const asset = await client.assets.upload('image', uint8Array, {
      filename: filename || 'thumbnail.jpg',
      contentType: 'image/jpeg',
    })
    
    console.log('   ✓ Image uploaded:', asset._id)
    
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id,
      },
    }
  } catch (error) {
    console.log('   ✗ Image upload error:', error.message)
    return null
  }
}

// Convert HTML to Portable Text (Rich Text) for Sanity
function convertHtmlToPortableText(html) {
  if (!html) return []
  
  const blocks = []
  
  // Simple HTML to Portable Text conversion
  // Split by block-level elements
  const blockPattern = /<(h[1-6]|p|blockquote|ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi
  let match
  let lastIndex = 0
  
  while ((match = blockPattern.exec(html)) !== null) {
    const tag = match[1].toLowerCase()
    const content = match[3]
      .replace(/<[^>]+>/g, '') // Strip inner HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
    
    if (!content) continue
    
    let style = 'normal'
    if (tag === 'h1') style = 'h1'
    else if (tag === 'h2') style = 'h2'
    else if (tag === 'h3') style = 'h3'
    else if (tag === 'h4') style = 'h4'
    else if (tag === 'blockquote') style = 'blockquote'
    
    blocks.push({
      _type: 'block',
      _key: generateKey(),
      style,
      markDefs: [],
      children: [
        {
          _type: 'span',
          _key: generateKey(),
          text: content,
          marks: [],
        },
      ],
    })
  }
  
  // If no blocks found, create a simple paragraph
  if (blocks.length === 0 && html.trim()) {
    const plainText = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    if (plainText) {
      blocks.push({
        _type: 'block',
        _key: generateKey(),
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: generateKey(),
            text: plainText,
            marks: [],
          },
        ],
      })
    }
  }
  
  return blocks
}

export async function checkIfVideoProcessed(videoId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Check for both regular and prefixed IDs (for TikTok)
  const query = `count(*[_type == "blogPost" && (videoId == $videoId || videoId == $prefixedId)]) > 0`
  const result = await client.fetch(query, { 
    videoId,
    prefixedId: `tiktok_${videoId}`
  })
  return result
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
    console.log('   Video thumbnail URL:', video.thumbnail)
    thumbnailImage = await uploadImageFromUrl(
      video.thumbnail, 
      `${video.id}-thumbnail.jpg`
    )
    if (thumbnailImage) {
      console.log('   ✓ Thumbnail ready to save:', JSON.stringify(thumbnailImage))
    } else {
      console.log('   ✗ Thumbnail upload failed, will use thumbnailUrl fallback')
    }
  } else {
    console.log('   ⚠ No thumbnail URL provided by video')
  }
  
  // Build the HTML content with product links inserted
  let htmlContent = analysis.blogContent || ''
  
  // Replace product reference links with actual URLs
  for (let i = 0; i < productLinks.length; i++) {
    const product = productLinks[i]
    const productIndex = i + 1
    
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
      htmlContent = htmlContent.replace(pattern, '<strong class="product-name">$1</strong>')
    }
  }
  
  // Handle remaining unmatched product links
  htmlContent = htmlContent.replace(/<a href="#product-\d+"[^>]*class="product-link"[^>]*>([^<]+)<\/a>/gi, '<strong class="product-name">$1</strong>')
  
  // Convert HTML to Portable Text
  const portableTextContent = convertHtmlToPortableText(htmlContent)
  console.log('   ✓ Converted HTML to Rich Text:', portableTextContent.length, 'blocks')
  
  // Determine aspect ratio based on platform
  let aspectRatio = 'landscape' // default for YouTube
  const platformLower = (video.platform || 'youtube').toLowerCase()
  if (platformLower === 'tiktok' || platformLower === 'instagram') {
    aspectRatio = 'portrait'
  }
  
  // Map platform to proper casing for schema
  const platformMap = {
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
    thumbnailUrl: video.thumbnail || null,
    contentFormat: 'richtext',
    content: portableTextContent,
    htmlContent: htmlContent,
    originalHtmlContent: htmlContent,
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
    // Use visibility toggles instead of status field
    showInBlog: false,   // Hidden until Kyndall reviews and enables
    showInVideos: false, // Hidden until Kyndall reviews and enables
    publishedAt: new Date().toISOString(),
    originalPublishedAt: video.publishedAt || null,
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
    console.log('   ✓ Thumbnail added to document')
  } else {
    console.log('   ⚠ No thumbnail image, using thumbnailUrl only:', doc.thumbnailUrl ? 'available' : 'none')
  }
  
  // If we have a thumbnailUrl but no uploaded image, that's okay
  // The frontend can fall back to thumbnailUrl
  
  // Create product summary for logging
  const shopmyCount = productLinks.filter(p => p.shopmyUrl).length
  const amazonCount = productLinks.filter(p => p.amazonUrl).length
  if (productLinks.length > 0) {
    console.log(`   📦 Products: ${productLinks.length} total (${shopmyCount} ShopMy, ${amazonCount} Amazon)`)
    productLinks.forEach(p => {
      const status = p.shopmyUrl ? '✓ ShopMy' : (p.amazonUrl ? '✓ Amazon' : '⚠ No link')
      console.log(`      - ${p.brand || 'Unknown'} ${p.name || 'Product'}: ${status}`)
    })
  }
  
  console.log('   Creating blog post in Sanity...')
  const result = await client.create(doc)
  console.log('   ✓ Blog post created:', result._id)
  return result
}

export async function getRecentDrafts(limit = 10) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Query for auto-generated posts that are hidden (not yet reviewed)
  const query = `*[_type == "blogPost" && showInBlog == false && autoGenerated == true] | order(publishedAt desc)[0...$limit] {
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
    checkIntervalMinutes,
    notificationEmail,
    processedVideoIds
  }`
  
  return client.fetch(query)
}

export async function updateAdminStats(stats) {
  if (!client) throw new Error('Sanity client not initialized')
  
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
  
  try {
    const expiredCodes = await client.fetch(
      `*[_type == "discountCode" && expiresAt < $date]._id`,
      { date: thirtyDaysAgo.toISOString() }
    )
    
    if (expiredCodes.length > 0) {
      console.log(`   🧹 Cleaning up ${expiredCodes.length} expired discount codes...`)
      for (const id of expiredCodes) {
        await client.delete(id)
      }
    }
  } catch (error) {
    console.log('   Cleanup error:', error.message)
  }
}
