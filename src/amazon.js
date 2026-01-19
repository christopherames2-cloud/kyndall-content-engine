// kyndall-content-engine/src/amazon.js
// Amazon Product Advertising API 5.0 Integration
// Auto-searches Amazon for products and generates affiliate links
//
// USAGE:
//   import { initAmazon, searchAmazonProduct, enrichProductsWithAmazon } from './amazon.js'
//   
//   initAmazon({
//     accessKey: process.env.AMAZON_ACCESS_KEY,
//     secretKey: process.env.AMAZON_SECRET_KEY,
//     partnerTag: process.env.AMAZON_ASSOCIATE_TAG
//   })
//   
//   const result = await searchAmazonProduct("Farmacy Green Clean Cleansing Balm")
//   // Returns: { asin, title, url, price, imageUrl, available }

import crypto from 'crypto'

// ============================================================
// CONFIGURATION
// ============================================================

let config = {
  accessKey: null,
  secretKey: null,
  partnerTag: 'kyndallames-20',
  marketplace: 'www.amazon.com',
  region: 'us-east-1',
  host: 'webservices.amazon.com',
}

// Simple in-memory cache to avoid repeated API calls
const cache = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Rate limiting: 1 request per second max
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL_MS = 1100 // Slightly over 1 second to be safe

// ============================================================
// INITIALIZATION
// ============================================================

export function initAmazon({ accessKey, secretKey, partnerTag, marketplace = 'www.amazon.com' }) {
  if (!accessKey || !secretKey) {
    console.log('   ⚠️  Amazon PA-API credentials not configured - auto-linking disabled')
    return false
  }
  
  config.accessKey = accessKey
  config.secretKey = secretKey
  config.partnerTag = partnerTag || config.partnerTag
  config.marketplace = marketplace
  
  console.log(`   ✓ Amazon PA-API initialized (Partner Tag: ${config.partnerTag})`)
  return true
}

export function isAmazonConfigured() {
  return !!(config.accessKey && config.secretKey)
}

// ============================================================
// AWS SIGNATURE V4 SIGNING (Required for PA-API)
// ============================================================

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmac('AWS4' + key, dateStamp)
  const kRegion = hmac(kDate, regionName)
  const kService = hmac(kRegion, serviceName)
  const kSigning = hmac(kService, 'aws4_request')
  return kSigning
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest()
}

function hash(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex')
}

function signRequest(payload) {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  
  const service = 'ProductAdvertisingAPI'
  const endpoint = `https://${config.host}/paapi5/searchitems`
  const method = 'POST'
  const contentType = 'application/json; charset=UTF-8'
  
  // Create canonical request
  const canonicalUri = '/paapi5/searchitems'
  const canonicalQuerystring = ''
  const canonicalHeaders = [
    `content-encoding:amz-1.0`,
    `content-type:${contentType}`,
    `host:${config.host}`,
    `x-amz-date:${amzDate}`,
    `x-amz-target:com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems`,
  ].join('\n') + '\n'
  
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target'
  const payloadHash = hash(JSON.stringify(payload))
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')
  
  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256'
  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n')
  
  // Calculate signature
  const signingKey = getSignatureKey(config.secretKey, dateStamp, config.region, service)
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
  
  // Create authorization header
  const authorizationHeader = `${algorithm} Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  
  return {
    endpoint,
    headers: {
      'Content-Type': contentType,
      'Content-Encoding': 'amz-1.0',
      'Host': config.host,
      'X-Amz-Date': amzDate,
      'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
      'Authorization': authorizationHeader,
    }
  }
}

// ============================================================
// RATE LIMITING
// ============================================================

async function waitForRateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }
  
  lastRequestTime = Date.now()
}

// ============================================================
// CACHE HELPERS
// ============================================================

function getCacheKey(searchTerm) {
  return searchTerm.toLowerCase().trim()
}

function getFromCache(searchTerm) {
  const key = getCacheKey(searchTerm)
  const cached = cache.get(key)
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data
  }
  
  return null
}

function saveToCache(searchTerm, data) {
  const key = getCacheKey(searchTerm)
  cache.set(key, {
    data,
    timestamp: Date.now()
  })
}

// ============================================================
// MAIN SEARCH FUNCTION
// ============================================================

/**
 * Search Amazon for a product and return affiliate link
 * @param {string} searchTerm - Product name to search (e.g., "Farmacy Green Clean")
 * @param {string} category - Optional category hint (e.g., "Beauty")
 * @returns {Object|null} - Product info with affiliate URL, or null if not found
 */
export async function searchAmazonProduct(searchTerm, category = 'Beauty') {
  if (!isAmazonConfigured()) {
    return null
  }
  
  // Check cache first
  const cached = getFromCache(searchTerm)
  if (cached !== null) {
    console.log(`      📦 Amazon (cached): ${cached ? cached.title?.substring(0, 40) + '...' : 'Not found'}`)
    return cached
  }
  
  // Rate limit
  await waitForRateLimit()
  
  const payload = {
    "Keywords": searchTerm,
    "Resources": [
      "Images.Primary.Large",
      "ItemInfo.Title",
      "ItemInfo.ByLineInfo",
      "Offers.Listings.Price",
      "Offers.Listings.Availability.Type"
    ],
    "SearchIndex": category,
    "ItemCount": 3,
    "PartnerTag": config.partnerTag,
    "PartnerType": "Associates",
    "Marketplace": config.marketplace
  }
  
  try {
    const { endpoint, headers } = signRequest(payload)
    
    console.log(`      🔍 Searching Amazon for: "${searchTerm}"`)
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`      ❌ Amazon API error: ${response.status}`)
      
      // Handle specific errors
      if (response.status === 429) {
        console.log('      ⚠️  Rate limited - will retry later')
      } else if (response.status === 401 || response.status === 403) {
        console.log('      ⚠️  Authentication failed - check API credentials')
      }
      
      saveToCache(searchTerm, null)
      return null
    }
    
    const data = await response.json()
    
    // Check if we got results
    if (!data.SearchResult?.Items?.length) {
      console.log(`      ℹ️  No Amazon results for: "${searchTerm}"`)
      saveToCache(searchTerm, null)
      return null
    }
    
    // Get the best match (first result)
    const item = data.SearchResult.Items[0]
    
    const result = {
      asin: item.ASIN,
      title: item.ItemInfo?.Title?.DisplayValue || searchTerm,
      url: `https://www.amazon.com/dp/${item.ASIN}?tag=${config.partnerTag}`,
      detailPageUrl: item.DetailPageURL,
      price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || null,
      imageUrl: item.Images?.Primary?.Large?.URL || null,
      brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || null,
      available: item.Offers?.Listings?.[0]?.Availability?.Type === 'Now',
    }
    
    console.log(`      ✓ Found: ${result.title.substring(0, 50)}... (${result.price || 'Price N/A'})`)
    
    saveToCache(searchTerm, result)
    return result
    
  } catch (error) {
    console.log(`      ❌ Amazon search error: ${error.message}`)
    saveToCache(searchTerm, null)
    return null
  }
}

// ============================================================
// BATCH ENRICHMENT FUNCTION
// ============================================================

/**
 * Enrich an array of products with Amazon links
 * Searches ALL products to provide both ShopMy AND Amazon options
 * @param {Array} products - Array of product objects from extraction
 * @param {Object} options - Options for enrichment
 * @returns {Array} - Products with amazonUrl added where found
 */
export async function enrichProductsWithAmazon(products, options = {}) {
  if (!isAmazonConfigured()) {
    console.log('   ⚠️  Amazon PA-API not configured - skipping enrichment')
    return products
  }
  
  const {
    maxProducts = 50,          // Limit to avoid rate limits (increased for full coverage)
    category = 'Beauty'
  } = options
  
  console.log(`   🛒 Searching Amazon for ALL ${products.length} products...`)
  
  let enriched = 0
  let alreadyHadAmazon = 0
  
  for (let i = 0; i < products.length && i < maxProducts; i++) {
    const product = products[i]
    
    // Skip if already has Amazon link from description
    if (product.amazonUrl) {
      alreadyHadAmazon++
      continue
    }
    
    // Build search query
    const searchQuery = product.searchQuery || 
      `${product.brand !== 'Unknown' ? product.brand + ' ' : ''}${product.name}`.trim()
    
    if (!searchQuery || searchQuery === 'Unknown' || searchQuery.length < 3) {
      continue
    }
    
    // Search Amazon (even if product has ShopMy - we want BOTH)
    const amazonResult = await searchAmazonProduct(searchQuery, category)
    
    if (amazonResult) {
      product.amazonUrl = amazonResult.url
      product.amazonAsin = amazonResult.asin
      product.amazonPrice = amazonResult.price
      product.amazonTitle = amazonResult.title
      product.amazonImageUrl = amazonResult.imageUrl
      enriched++
    }
  }
  
  console.log(`   ✓ Amazon enrichment complete:`)
  console.log(`      - ${enriched} new Amazon links found`)
  console.log(`      - ${alreadyHadAmazon} already had Amazon links`)
  console.log(`      - Products now have: ShopMy + Amazon where available`)
  
  return products
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Generate Amazon search URL (fallback when API unavailable)
 * @param {string} searchTerm - Product name
 * @returns {string} - Amazon search URL with affiliate tag
 */
export function getAmazonSearchUrl(searchTerm) {
  const encoded = encodeURIComponent(searchTerm)
  return `https://www.amazon.com/s?k=${encoded}&tag=${config.partnerTag}`
}

/**
 * Add affiliate tag to existing Amazon URL
 * @param {string} url - Amazon product URL
 * @returns {string} - URL with affiliate tag
 */
export function addAffiliateTag(url) {
  if (!url) return url
  
  try {
    // Handle amzn.to short links - can't modify
    if (url.includes('amzn.to')) {
      return url
    }
    
    const urlObj = new URL(url)
    
    // Check if tag already exists
    if (urlObj.searchParams.has('tag')) {
      return url
    }
    
    // Add the associate tag
    urlObj.searchParams.set('tag', config.partnerTag)
    return urlObj.toString()
    
  } catch {
    // Fallback: simple string append
    if (url.includes('?')) {
      return `${url}&tag=${config.partnerTag}`
    } else {
      return `${url}?tag=${config.partnerTag}`
    }
  }
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache() {
  cache.clear()
  console.log('   🧹 Amazon cache cleared')
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.keys())
  }
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  initAmazon,
  isAmazonConfigured,
  searchAmazonProduct,
  enrichProductsWithAmazon,
  getAmazonSearchUrl,
  addAffiliateTag,
  clearCache,
  getCacheStats
}
