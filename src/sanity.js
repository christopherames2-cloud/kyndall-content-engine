// kyndall-content-engine/src/sanity.js
// Sanity client for creating blog posts
// NOW WITH GEO CONTENT FIELDS

import { createClient } from '@sanity/client'
import fetch from 'node-fetch'

let client = null

export function initSanity(projectId, dataset, token) {
  client = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-01-01',
    useCdn: false,
  })
}

// Generate a unique key for array items
function generateKey() {
  return Math.random().toString(36).substring(2, 10)
}

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .substring(0, 96)
}

// Upload image from URL to Sanity
async function uploadImageFromUrl(imageUrl, filename) {
  if (!imageUrl) return null
  
  try {
    console.log(`   Downloading image: ${imageUrl.substring(0, 50)}...`)
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.log(`   ✗ Image download failed: ${response.status}`)
      return null
    }
    
    const buffer = await response.buffer()
    
    console.log(`   Uploading to Sanity (${buffer.length} bytes)...`)
    const asset = await client.assets.upload('image', buffer, {
      filename: filename || 'thumbnail.jpg'
    })
    
    console.log(`   ✓ Image uploaded: ${asset._id}`)
    
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id
      }
    }
  } catch (error) {
    console.log(`   ✗ Image upload error: ${error.message}`)
    return null
  }
}

// Convert HTML to Portable Text (simplified)
function convertHtmlToPortableText(html) {
  if (!html) return []
  
  const blocks = []
  
  // Split by paragraphs and headers
  const parts = html.split(/<\/?(?:p|h[1-6]|div)>/gi).filter(p => p.trim())
  
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    
    // Check for header
    const headerMatch = html.match(new RegExp(`<(h[2-4])[^>]*>${escapeRegex(trimmed)}<\\/\\1>`, 'i'))
    
    let style = 'normal'
    if (headerMatch) {
      const tag = headerMatch[1].toLowerCase()
      if (tag === 'h2') style = 'h2'
      else if (tag === 'h3') style = 'h3'
      else if (tag === 'h4') style = 'h4'
    }
    
    // Convert inline formatting
    const children = parseInlineFormatting(trimmed)
    
    blocks.push({
      _type: 'block',
      _key: generateKey(),
      style,
      markDefs: children.markDefs || [],
      children: children.spans
    })
  }
  
  return blocks.length > 0 ? blocks : [{
    _type: 'block',
    _key: generateKey(),
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: generateKey(), text: html, marks: [] }]
  }]
}

// Parse inline formatting (bold, italic, links)
function parseInlineFormatting(text) {
  const spans = []
  const markDefs = []
  
  // Remove HTML tags but track formatting
  let current = text
  
  // Strip tags and get plain text
  const plainText = current
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
  
  spans.push({
    _type: 'span',
    _key: generateKey(),
    text: plainText,
    marks: []
  })
  
  return { spans, markDefs }
}

// Escape regex special characters
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Check if a video has already been processed
export async function checkIfVideoProcessed(videoId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Check both the videoId field and with tiktok_ prefix
  const query = `*[_type == "blogPost" && (videoId == $videoId || videoId == $prefixedId)][0]._id`
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
  
  // Build the document with GEO fields
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
    
    // ==================== GEO CONTENT (NEW) ====================
    quickAnswer: analysis.quickAnswer || null,
    quickAnswerScore: null, // Will be set by review if done
    quickAnswerSuggestion: null,
    
    // Key Takeaways
    keyTakeaways: (analysis.keyTakeaways || []).map(takeaway => ({
      _type: 'takeaway',
      _key: generateKey(),
      point: takeaway.point || takeaway,
      icon: takeaway.icon || '✨'
    })),
    
    // Expert Tips
    expertTips: (analysis.expertTips || []).map(tip => ({
      _type: 'tip',
      _key: generateKey(),
      title: tip.title,
      description: tip.description,
      proTip: tip.proTip || null
    })),
    
    // FAQ Section
    faqSection: (analysis.faqSection || []).map(faq => ({
      _type: 'faqItem',
      _key: generateKey(),
      question: faq.question,
      answer: faq.answer
    })),
    
    // Kyndall's Take
    kyndallsTake: analysis.kyndallsTake ? {
      showKyndallsTake: true,
      headline: analysis.kyndallsTake.headline || "Kyndall's Take",
      content: analysis.kyndallsTake.content,
      mood: analysis.kyndallsTake.mood || 'recommend'
    } : {
      showKyndallsTake: false,
      headline: "Kyndall's Take",
      content: null,
      mood: 'recommend'
    },
    
    // Author (use default)
    useDefaultAuthor: true,
    author: null,
    
    // Banner (use category default)
    useCustomBanner: false,
    customBannerImage: null,
    
    // Related posts (empty - will be auto-filled on frontend)
    relatedPosts: [],
    relatedArticles: [],
    
    // ==================== PRODUCTS ====================
    featuredProducts: productLinks.map(p => ({
      _type: 'product',
      _key: generateKey(),
      productName: p.name || 'Product',
      brand: p.brand || null,
      shopmyUrl: p.shopmyUrl || null,
      amazonUrl: p.amazonUrl || null,
      productNote: null,
      hasShopMyLink: p.shopmyUrl ? 'yes' : 'pending',
      hasAmazonLink: p.amazonUrl ? 'yes' : 'pending',
      reviewed: false
    })),
    
    // Legacy product links format (for backwards compatibility)
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
    
    // Visibility toggles - hidden until Kyndall reviews and enables
    showInBlog: false,
    showInVideos: false,
    
    // Timestamps
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    originalPublishedAt: video.publishedAt || null,
    
    // Source info
    autoGenerated: true,
    sourceVideoId: video.id,
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
    console.log('   ⚠ No thumbnail image, using thumbnailUrl only:', doc.thumbnailUrl ? 'set' : 'not set')
  }
  
  // Log product link summary
  if (productLinks.length > 0) {
    console.log('   📦 Product links:')
    productLinks.forEach(p => {
      const status = p.shopmyUrl ? '✓ ShopMy' : (p.amazonUrl ? '✓ Amazon' : '⚠ No link')
      console.log(`      - ${p.brand || 'Unknown'} ${p.name || 'Product'}: ${status}`)
    })
  }
  
  // Log GEO content summary
  console.log('   🎯 GEO Content:')
  console.log(`      - Quick Answer: ${doc.quickAnswer ? 'Yes' : 'No'}`)
  console.log(`      - Key Takeaways: ${doc.keyTakeaways.length}`)
  console.log(`      - Expert Tips: ${doc.expertTips.length}`)
  console.log(`      - FAQs: ${doc.faqSection.length}`)
  console.log(`      - Kyndall's Take: ${doc.kyndallsTake.showKyndallsTake ? 'Yes' : 'No'}`)
  
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
    productLinks,
    quickAnswer,
    keyTakeaways,
    faqSection
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

export async function getRecentArticles(limit = 20) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "article" && showOnSite == true] | order(publishedAt desc)[0...$limit] {
    _id,
    title,
    "slug": slug.current,
    category
  }`
  
  return client.fetch(query, { limit })
}

export default {
  initSanity,
  checkIfVideoProcessed,
  createDraftBlogPost,
  getRecentDrafts,
  getAdminSettings,
  updateAdminStats,
  getExpiringCodes,
  markReminderSent,
  runCleanup,
  getRecentArticles
}
