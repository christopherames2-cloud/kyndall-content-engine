// Sanity CMS Service
// Creates draft blog posts from analyzed content
// Also manages discount code expiration tracking and cleanup

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

// ============================================
// ADMIN SETTINGS
// ============================================

export async function getAdminSettings() {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "adminSettings"][0] {
    notificationEmail,
    discountExpirationDays,
    sendWeeklyDigest,
    digestDay,
    autoCreatePosts,
    checkIntervalMinutes,
    maxVideosPerCheck,
    defaultCategory,
    requireProductReview,
    deleteDraftsOlderThan,
    deleteExpiredCodes
  }`
  
  const settings = await client.fetch(query)
  
  // Return defaults if no settings exist
  return settings || {
    notificationEmail: 'hello@kyndallames.com',
    discountExpirationDays: 14,
    sendWeeklyDigest: false,
    digestDay: 'monday',
    autoCreatePosts: true,
    checkIntervalMinutes: 60,
    maxVideosPerCheck: 5,
    defaultCategory: 'auto',
    requireProductReview: true,
    deleteDraftsOlderThan: 0,
    deleteExpiredCodes: true,
  }
}

export async function updateAdminStats(stats) {
  if (!client) throw new Error('Sanity client not initialized')
  
  try {
    // Get or create admin settings document
    const existing = await client.fetch(`*[_type == "adminSettings"][0]._id`)
    
    if (existing) {
      await client.patch(existing).set({
        lastRunTime: new Date().toISOString(),
        ...stats
      }).commit()
    }
  } catch (error) {
    console.error('   Failed to update admin stats:', error.message)
  }
}

// ============================================
// VIDEO PROCESSING
// ============================================

export async function checkIfVideoProcessed(videoId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "blogPost" && videoId == $videoId][0]`
  const result = await client.fetch(query, { videoId })
  return !!result
}

// Download image and upload to Sanity
async function uploadImageFromUrl(imageUrl, filename) {
  if (!imageUrl || !client) return null
  
  try {
    console.log(`      Downloading thumbnail from YouTube...`)
    
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.log(`      Failed to fetch image: ${response.status}`)
      return null
    }
    
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log(`      Uploading thumbnail to Sanity...`)
    const asset = await client.assets.upload('image', buffer, {
      filename: filename || 'thumbnail.jpg',
      contentType: 'image/jpeg'
    })
    
    console.log(`      ✓ Thumbnail uploaded: ${asset._id}`)
    
    return {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id
      }
    }
  } catch (error) {
    console.error(`      Failed to upload thumbnail:`, error.message)
    return null
  }
}

export async function createDraftBlogPost({
  video,
  analysis,
  productLinks
}) {
  if (!client) throw new Error('Sanity client not initialized')
  
  // Build the content with product links inserted
  let content = analysis.blogContent || ''
  
  // Replace product placeholders with actual links
  for (const productLink of productLinks) {
    const placeholder = `[PRODUCT_LINK:${productLink.name}]`
    let linkHtml = ''
    
    if (productLink.shopmyUrl) {
      linkHtml = `**[${productLink.name}](${productLink.shopmyUrl})** (ShopMy)`
    } else if (productLink.amazonUrl) {
      linkHtml = `**[${productLink.name}](${productLink.amazonUrl})** (Amazon)`
    } else {
      linkHtml = `**${productLink.name}**`
    }
    
    content = content.replace(placeholder, linkHtml)
  }
  
  // Upload YouTube thumbnail to Sanity
  let thumbnailAsset = null
  if (video.thumbnail) {
    const filename = `${video.id}-thumbnail.jpg`
    thumbnailAsset = await uploadImageFromUrl(video.thumbnail, filename)
  }
  
  // Create the blog post document with product workflow
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
    platform: video.platform?.toLowerCase() || 'youtube',
    videoUrl: video.url,
    videoId: video.id,
    thumbnail: thumbnailAsset,
    thumbnailUrl: video.thumbnail || null,
    views: video.viewCount ? `${formatViews(video.viewCount)} views` : undefined,
    content: [
      {
        _type: 'block',
        _key: generateKey(),
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: generateKey(),
            text: content,
            marks: []
          }
        ]
      }
    ],
    
    // Product workflow
    productsReviewed: false,
    productLinks: productLinks.map(p => ({
      _type: 'productItem',
      _key: generateKey(),
      name: p.name,
      brand: p.brand,
      hasShopmy: p.shopmyUrl ? 'yes' : 'pending',
      shopmyUrl: p.shopmyUrl || null,
      hasAmazon: 'pending',
      suggestedAmazonSearch: p.amazonUrl,
      amazonUrl: null,
      reviewed: false,
      notes: null,
    })),
    
    suggestedTags: analysis.suggestedTags || [],
    status: 'draft',
    publishedAt: new Date().toISOString(),
    autoGenerated: true,
    sourceVideo: {
      id: video.id,
      title: video.title,
      platform: video.platform,
      publishedAt: video.publishedAt
    }
  }
  
  const result = await client.create(doc)
  return result
}

// ============================================
// DISCOUNT CODE EXPIRATION
// ============================================

export async function getExpiringCodes(daysAhead = 14) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const today = new Date()
  const futureDate = new Date()
  futureDate.setDate(today.getDate() + daysAhead)
  
  const todayStr = today.toISOString().split('T')[0]
  const futureDateStr = futureDate.toISOString().split('T')[0]
  
  const query = `*[_type == "discountCode" && active == true && expirationDate != null && expirationDate >= $today && expirationDate <= $futureDate && (reminderSent != true)] | order(expirationDate asc) {
    _id,
    brand,
    code,
    discount,
    expirationDate,
    brandContact,
    reminderSent
  }`
  
  const codes = await client.fetch(query, { today: todayStr, futureDate: futureDateStr })
  
  return codes.map(code => {
    const expDate = new Date(code.expirationDate)
    const daysUntil = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24))
    return {
      ...code,
      daysUntilExpiration: daysUntil
    }
  })
}

export async function markReminderSent(codeId) {
  if (!client) throw new Error('Sanity client not initialized')
  
  try {
    await client.patch(codeId).set({ reminderSent: true }).commit()
    console.log(`   Marked reminder sent for ${codeId}`)
    return true
  } catch (error) {
    console.error(`   Failed to mark reminder sent:`, error.message)
    return false
  }
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

export async function deactivateExpiredCodes() {
  if (!client) throw new Error('Sanity client not initialized')
  
  const today = new Date().toISOString().split('T')[0]
  
  const query = `*[_type == "discountCode" && active == true && expirationDate != null && expirationDate < $today]._id`
  const expiredIds = await client.fetch(query, { today })
  
  if (expiredIds.length === 0) return 0
  
  console.log(`   Deactivating ${expiredIds.length} expired codes...`)
  
  for (const id of expiredIds) {
    await client.patch(id).set({ active: false }).commit()
  }
  
  return expiredIds.length
}

export async function deleteOldDrafts(daysOld = 30) {
  if (!client || daysOld <= 0) return 0
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)
  const cutoffStr = cutoffDate.toISOString()
  
  const query = `*[_type == "blogPost" && status == "draft" && autoGenerated == true && productsReviewed != true && publishedAt < $cutoff]._id`
  const oldDraftIds = await client.fetch(query, { cutoff: cutoffStr })
  
  if (oldDraftIds.length === 0) return 0
  
  console.log(`   Deleting ${oldDraftIds.length} old unreviewed drafts...`)
  
  for (const id of oldDraftIds) {
    await client.delete(id)
  }
  
  return oldDraftIds.length
}

export async function runCleanup() {
  if (!client) throw new Error('Sanity client not initialized')
  
  console.log('\n🧹 Running cleanup...')
  
  const settings = await getAdminSettings()
  let deactivated = 0
  let deleted = 0
  
  // Deactivate expired codes
  if (settings.deleteExpiredCodes) {
    deactivated = await deactivateExpiredCodes()
    if (deactivated > 0) {
      console.log(`   ✓ Deactivated ${deactivated} expired codes`)
    }
  }
  
  // Delete old drafts
  if (settings.deleteDraftsOlderThan > 0) {
    deleted = await deleteOldDrafts(settings.deleteDraftsOlderThan)
    if (deleted > 0) {
      console.log(`   ✓ Deleted ${deleted} old drafts`)
    }
  }
  
  // Update last cleanup time
  try {
    const existing = await client.fetch(`*[_type == "adminSettings"][0]._id`)
    if (existing) {
      await client.patch(existing).set({
        lastCleanupRun: new Date().toISOString()
      }).commit()
    }
  } catch (e) {}
  
  return { deactivated, deleted }
}

// ============================================
// HELPERS
// ============================================

export async function getRecentDrafts(limit = 10) {
  if (!client) throw new Error('Sanity client not initialized')
  
  const query = `*[_type == "blogPost" && status == "draft" && autoGenerated == true] | order(publishedAt desc)[0...$limit] {
    _id,
    title,
    category,
    platform,
    publishedAt,
    productsReviewed,
    productLinks
  }`
  
  return client.fetch(query, { limit })
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

function formatViews(count) {
  const num = parseInt(count)
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
  return num.toString()
}
