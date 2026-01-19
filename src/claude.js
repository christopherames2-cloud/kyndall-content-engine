// kyndall-content-engine/src/claude.js
// Claude AI Content Analysis Service
// Extracts products from YouTube descriptions and generates blog content
// NOW WITH GEO CONTENT GENERATION + SANITY-MANAGED BRANDS
//
// UPDATED: January 2026
// - Fixed product extraction for space-separated products
// - Uses centralized brands module (fetches from Sanity)
// - Proper handling of trailing dashes in product names

import Anthropic from '@anthropic-ai/sdk'
import { getBrands, initBrands } from './brands.js'
import { enrichProductsWithAmazon, isAmazonConfigured } from './amazon.js'

let client = null
let amazonAssociateTag = 'kyndallames09-20' // Default tag

export function initClaude(apiKey, associateTag, sanityConfig = null) {
  client = new Anthropic({ apiKey })
  if (associateTag) {
    amazonAssociateTag = associateTag
  }
  
  // Initialize brands module with Sanity config if provided
  if (sanityConfig) {
    initBrands(sanityConfig.projectId, sanityConfig.dataset, sanityConfig.token)
  }
}

export async function analyzeVideoContent(video) {
  if (!client) throw new Error('Claude client not initialized')

  console.log(`   Analyzing: "${video.title}"`)
  console.log(`   Description length: ${video.description?.length || 0} chars`)

  // Extract products from description FIRST
  let descriptionProducts = await extractProductsFromDescription(video.description || '')
  console.log(`   Found ${descriptionProducts.length} products in description`)
  
  // Enrich products with Amazon links (for those without ShopMy links)
  if (isAmazonConfigured() && descriptionProducts.length > 0) {
    descriptionProducts = await enrichProductsWithAmazon(descriptionProducts)
  }
  
  if (descriptionProducts.length > 0) {
    descriptionProducts.forEach(p => {
      console.log(`      - ${p.brand} ${p.name}`)
      if (p.shopmyUrl) console.log(`        ShopMy: ${p.shopmyUrl}`)
      if (p.amazonUrl) console.log(`        Amazon: ${p.amazonUrl}`)
    })
  }

  const prompt = `You are analyzing a YouTube video to create a GEO-optimized blog post for Kyndall Ames, a beauty/lifestyle content creator.

VIDEO TITLE: ${video.title}

VIDEO DESCRIPTION:
${video.description || 'No description'}

VIDEO TAGS: ${video.tags?.join(', ') || 'No tags'}

PRODUCTS ALREADY EXTRACTED FROM DESCRIPTION (DO NOT MODIFY THESE):
${descriptionProducts.length > 0 ? JSON.stringify(descriptionProducts, null, 2) : 'None found'}

YOUR TASK:
1. Generate a blog post about this video
2. Suggest SEO metadata
3. Determine the category
4. Generate GEO (Generative Engine Optimization) content sections

NOTE: Products have already been extracted from the description. Do NOT add or modify products.

CRITICAL FORMATTING RULES:
- ALWAYS include a space BEFORE and AFTER any formatting change (bold, italic, links)
- Example WRONG: "I love<strong>this product</strong>so much"
- Example RIGHT: "I love <strong>this product</strong> so much"
- Example WRONG: "Check out[PRODUCT_LINK:Serum]for glowing skin"
- Example RIGHT: "Check out [PRODUCT_LINK:Serum] for glowing skin"
- This applies to ALL inline formatting - never let formatted text touch unformatted text

VOICE & TONE:
- Write like Kyndall - a beauty influencer talking to a friend
- Use "you" and "your" freely - make it personal
- Casual phrases are okay: "here's the deal", "spoiler alert", "game-changer", "not gonna lie"
- Short paragraphs (2-4 sentences max)
- Be specific and actionable but SOUND like a person, not a textbook

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "category": "makeup|skincare|fashion|lifestyle|travel",
  "blogTitle": "Engaging blog title (50-60 chars)",
  "blogExcerpt": "Brief compelling summary (150-160 chars)",
  "blogContent": "Full blog post (200-400 words) with [PRODUCT_LINK:Product Name] placeholders where products should be linked. REMEMBER: spaces around ALL formatting!",
  "seoTitle": "SEO optimized title (50-60 chars)",
  "seoDescription": "Meta description for search engines (150-160 chars)",
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  
  "quickAnswer": "2-3 sentence TL;DR that directly answers the main question. Be specific with product names and techniques. 150-300 characters ideal. This appears in a highlighted box at the top of the post for AI engines to extract.",
  
  "keyTakeaways": [
    { "icon": "✨", "point": "First key takeaway - be specific and actionable" },
    { "icon": "💧", "point": "Second key takeaway" },
    { "icon": "☀️", "point": "Third key takeaway" },
    { "icon": "⏰", "point": "Fourth key takeaway (optional)" }
  ],
  
  "expertTips": [
    {
      "title": "Tip Title (short, catchy)",
      "description": "2-3 sentences explaining the tip",
      "proTip": "Optional one-liner insider advice"
    },
    {
      "title": "Second Tip Title",
      "description": "Explanation of second tip",
      "proTip": null
    }
  ],
  
  "faqSection": [
    { "question": "Common question viewers might ask?", "answer": "Helpful, conversational answer in 2-3 sentences." },
    { "question": "Another relevant question?", "answer": "Another helpful answer." },
    { "question": "Third question?", "answer": "Third answer." },
    { "question": "Fourth question?", "answer": "Fourth answer." },
    { "question": "Fifth question?", "answer": "Fifth answer." }
  ],
  
  "kyndallsTake": {
    "headline": "Kyndall's Take",
    "content": "Personal, authentic 2-4 sentence perspective. Use first person. Be real about what you love or have mixed feelings about. This is where personality shines through.",
    "mood": "love|recommend|mixed|caution|skip"
  }
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].text
    
    // Clean up response - remove markdown code blocks if present
    let cleanText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()
    
    // Try to extract JSON object
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      cleanText = jsonMatch[0]
    }

    const analysis = JSON.parse(cleanText)
    
    // Fix any spacing issues around formatting (safety net)
    if (analysis.blogContent) {
      analysis.blogContent = fixFormattingSpaces(analysis.blogContent)
    }
    
    // Use the products we already extracted - don't trust Claude's extraction
    analysis.products = descriptionProducts

    console.log(`   ✓ Analysis complete, ${analysis.products.length} products`)
    console.log(`   ✓ GEO content: quickAnswer, ${analysis.keyTakeaways?.length || 0} takeaways, ${analysis.expertTips?.length || 0} tips, ${analysis.faqSection?.length || 0} FAQs`)
    
    return analysis

  } catch (error) {
    console.error('   Claude analysis error:', error.message)
    
    // Return basic analysis with description products if Claude fails
    return {
      category: guessCategory(video.title + ' ' + video.description),
      products: descriptionProducts,
      blogTitle: video.title.substring(0, 60),
      blogExcerpt: video.title.substring(0, 160),
      blogContent: `Check out this video: ${video.title}`,
      seoTitle: video.title.substring(0, 60),
      seoDescription: video.title.substring(0, 160),
      suggestedTags: [],
      // Default GEO content
      quickAnswer: null,
      keyTakeaways: [],
      expertTips: [],
      faqSection: [],
      kyndallsTake: null
    }
  }
}

/**
 * Review a quick answer for SEO/GEO effectiveness
 * Returns score, feedback, and suggestion
 */
export async function reviewQuickAnswer(quickAnswer, postTitle, category, excerpt) {
  if (!client) throw new Error('Claude client not initialized')

  const prompt = `You are an SEO and GEO (Generative Engine Optimization) expert reviewing a "Quick Answer" box for a beauty/lifestyle blog post.

The Quick Answer box appears at the top of blog posts and is critical for:
1. Featured snippets in Google
2. AI engine extraction (ChatGPT, Perplexity, Claude)
3. Giving readers immediate value

**POST DETAILS:**
- Title: "${postTitle}"
- Category: ${category}
- Excerpt: ${excerpt || 'Not provided'}

**QUICK ANSWER TO REVIEW:**
"${quickAnswer}"

**EVALUATION CRITERIA:**
1. **Directness (0-2 points)**: Does it answer the implied question immediately?
2. **Specificity (0-2 points)**: Does it include specific products, techniques, or timeframes?
3. **Length (0-2 points)**: Is it 150-300 characters? (ideal for snippets)
4. **Voice (0-2 points)**: Does it sound like a beauty influencer, not a textbook?
5. **Actionability (0-2 points)**: Can readers take immediate action from this?

**RESPOND IN THIS EXACT JSON FORMAT:**
{
  "score": <number 1-10>,
  "feedback": "<1-2 sentence overall assessment>",
  "suggestion": "<improved version of the quick answer, if score < 8>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"]
}

Be encouraging but honest. The goal is to help, not criticize.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    return JSON.parse(jsonMatch[0])
  } catch (error) {
    console.error('   Quick answer review error:', error.message)
    return {
      score: 5,
      feedback: 'Could not complete review',
      suggestion: null,
      strengths: [],
      improvements: []
    }
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Fix spacing issues around HTML formatting
function fixFormattingSpaces(html) {
  if (!html) return html
  
  // Add space before opening tags if preceded by a word character
  html = html.replace(/(\w)(<(?:strong|em|a|span)[^>]*>)/gi, '$1 $2')
  
  // Add space after closing tags if followed by a word character
  html = html.replace(/(<\/(?:strong|em|a|span)>)(\w)/gi, '$1 $2')
  
  // Fix product link placeholders
  html = html.replace(/(\w)\[PRODUCT_LINK:/gi, '$1 [PRODUCT_LINK:')
  html = html.replace(/\](\w)/gi, '] $1')
  
  return html
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract brand and product name from a full product string
 * e.g., "Farmacy Green Clean Cleansing Balm" → { brand: "Farmacy", name: "Green Clean Cleansing Balm" }
 */
function extractBrandAndName(fullProductName, beautyBrands) {
  let brand = 'Unknown'
  let name = fullProductName
  
  // FIRST: Clean the product name of trailing dashes/hyphens
  name = name
    .replace(/\s*[-–—]\s*$/, '')  // Remove trailing dash/en-dash/em-dash
    .replace(/\s+$/, '')           // Remove trailing whitespace
    .trim()
  
  // Brands are already sorted by length (longest first)
  for (const b of beautyBrands) {
    const regex = new RegExp(`^${escapeRegex(b)}\\s+`, 'i')
    if (regex.test(name)) {
      brand = b
      name = name.replace(regex, '').trim()
      break
    }
  }
  
  // Clean up name - remove quotes around shade names but keep the shade
  name = name.replace(/"/g, '')
  
  // Additional cleanup: remove any remaining trailing dashes
  name = name.replace(/\s*[-–—]\s*$/, '').trim()
  
  return { brand, name }
}

/**
 * Guess the product type based on keywords in the name
 */
function guessProductType(text) {
  const lower = text.toLowerCase()
  
  // Makeup
  if (lower.includes('foundation') || lower.includes('concealer') || lower.includes('powder') ||
      lower.includes('blush') || lower.includes('bronzer') || lower.includes('highlighter') ||
      lower.includes('lipstick') || lower.includes('lip ') || lower.includes('mascara') ||
      lower.includes('eyeliner') || lower.includes('eyeshadow') || lower.includes('brow') ||
      lower.includes('primer') || lower.includes('setting') || lower.includes('contour') ||
      lower.includes('tint') || lower.includes('pencil') || lower.includes('balm') ||
      lower.includes('gloss') || lower.includes('palette')) {
    return 'makeup'
  }
  
  // Skincare
  if (lower.includes('serum') || lower.includes('moisturizer') || lower.includes('cleanser') ||
      lower.includes('toner') || lower.includes('sunscreen') || lower.includes('spf') ||
      lower.includes('retinol') || lower.includes('vitamin c') || lower.includes('mask') ||
      lower.includes('exfoliant') || lower.includes('cream') || lower.includes('lotion') ||
      lower.includes('wash') || lower.includes('acid') || lower.includes('oil')) {
    return 'skincare'
  }
  
  // Haircare
  if (lower.includes('shampoo') || lower.includes('conditioner') || lower.includes('hair') ||
      lower.includes('styling') || lower.includes('olaplex') || lower.includes('dry shampoo')) {
    return 'haircare'
  }
  
  // Fragrance
  if (lower.includes('perfume') || lower.includes('fragrance') || lower.includes('cologne') ||
      lower.includes('body mist') || lower.includes('eau de')) {
    return 'fragrance'
  }
  
  // Body care
  if (lower.includes('body') || lower.includes('scrub') || lower.includes('bath') ||
      lower.includes('hand') || lower.includes('soak')) {
    return 'bodycare'
  }
  
  // Tools
  if (lower.includes('brush') || lower.includes('sponge') || lower.includes('curler') ||
      lower.includes('dryer') || lower.includes('straightener') || lower.includes('dyson') ||
      lower.includes('mirror') || lower.includes('organizer') || lower.includes('spoolie')) {
    return 'tools'
  }
  
  return 'other'
}

// Guess category from text
function guessCategory(text) {
  const lower = text.toLowerCase()
  
  if (lower.includes('makeup') || lower.includes('lipstick') || lower.includes('foundation') || 
      lower.includes('mascara') || lower.includes('eyeshadow') || lower.includes('grwm') ||
      lower.includes('get ready')) {
    return 'makeup'
  }
  if (lower.includes('skincare') || lower.includes('serum') || lower.includes('moisturizer') || 
      lower.includes('sunscreen') || lower.includes('spf') || lower.includes('routine')) {
    return 'skincare'
  }
  if (lower.includes('fashion') || lower.includes('outfit') || lower.includes('style') || 
      lower.includes('clothing') || lower.includes('haul')) {
    return 'fashion'
  }
  if (lower.includes('travel') || lower.includes('vacation') || lower.includes('trip') || 
      lower.includes('hotel')) {
    return 'travel'
  }
  
  return 'lifestyle'
}

// ============================================================
// MAIN EXTRACTION FUNCTION (ASYNC - fetches brands from Sanity)
// ============================================================

async function extractProductsFromDescription(description) {
  const products = []
  
  if (!description) return products

  // Get brands from Sanity (or fallback)
  const beautyBrands = await getBrands()

  // Helper to add Amazon associate tag
  function addAmazonAssociateTag(url) {
    try {
      if (url.includes('amzn.to')) return url
      const urlObj = new URL(url)
      if (!urlObj.searchParams.has('tag')) {
        urlObj.searchParams.set('tag', amazonAssociateTag)
      }
      return urlObj.toString()
    } catch {
      return url.includes('?') ? `${url}&tag=${amazonAssociateTag}` : `${url}?tag=${amazonAssociateTag}`
    }
  }

  // METHOD 1: Look for "PRODUCTS:" or "PRODUCTS MENTIONED:" section
  const productsMatch = description.match(/PRODUCTS?\s*(?:MENTIONED)?:?\s*([\s\S]*?)(?=\n\n|\nFOLLOW|\nSUBSCRIBE|\nBUSINESS|\nMUSIC|\n[A-Z]{2,}:|$)/i)
  
  if (productsMatch) {
    const productsSection = productsMatch[1]
    console.log(`      Found PRODUCTS section`)
    
    // Extract all URLs and split text by URLs
    // This handles both space-separated and newline-separated products
    const urlPattern = /https?:\/\/[^\s]+/g
    const urls = productsSection.match(urlPattern) || []
    const textParts = productsSection.split(urlPattern)
    
    console.log(`      Found ${urls.length} URLs`)
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim()
      let productText = textParts[i] || ''
      
      // Clean the product text:
      // - Remove leading/trailing whitespace
      // - Remove trailing dash/en-dash that separates name from URL
      // - Remove leading dash if this follows a previous URL
      productText = productText
        .trim()
        .replace(/\s*[-–—]+\s*$/, '')  // Remove trailing separator
        .replace(/^\s*[-–—]+\s*/, '')   // Remove leading separator
        .trim()
      
      // Skip empty or too-short product names
      if (!productText || productText.length < 2) continue
      
      // Skip generic items
      if (productText.toLowerCase() === 'shop my:') continue
      
      // Parse brand and product name
      const { brand, name } = extractBrandAndName(productText, beautyBrands)
      
      // Determine URL type
      let shopmyUrl = null
      let amazonUrl = null
      
      if (url.includes('shopmy.us') || url.includes('go.shopmy.us') || url.includes('shop-links.co')) {
        shopmyUrl = url  // Preserve full URL
      } else if (url.includes('amazon.com') || url.includes('amzn.to') || url.includes('amzn.com')) {
        amazonUrl = addAmazonAssociateTag(url)
      }
      
      products.push({
        brand,
        name,
        type: guessProductType(productText),
        searchQuery: `${brand} ${name}`.trim(),
        shopmyUrl,
        amazonUrl,
        originalUrl: url
      })
    }
  }

  // METHOD 2: Fallback - scan whole description line by line
  if (products.length === 0) {
    const lines = description.split('\n')
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      // Skip non-product lines
      const skipPatterns = [
        'follow me', 'subscribe', 'business', 'instagram:', 
        'tiktok:', 'twitter:', 'shop my:'
      ]
      if (skipPatterns.some(p => trimmedLine.toLowerCase().includes(p))) continue
      
      // Look for lines with URLs
      const urlMatch = trimmedLine.match(/(.+?)\s*[-–:]?\s*(https?:\/\/[^\s]+)/i)
      
      if (urlMatch) {
        const productName = urlMatch[1]
          .replace(/^[•\-\*\d.]\s*/, '')
          .replace(/\s*[-–]\s*$/, '')
          .trim()
        const url = urlMatch[2]
        
        if (productName.length < 3 || productName.toUpperCase() === productName) continue
        
        const { brand, name } = extractBrandAndName(productName, beautyBrands)
        
        let shopmyUrl = null
        let amazonUrl = null
        
        if (url.includes('shopmy.us') || url.includes('go.shopmy.us') || url.includes('shop-links.co')) {
          shopmyUrl = url
        } else if (url.includes('amazon.com') || url.includes('amzn.to') || url.includes('amzn.com')) {
          amazonUrl = addAmazonAssociateTag(url)
        }
        
        const affiliateTypes = ['shopmy', 'amazon', 'rstyle', 'liketoknow', 'ltk.app']
        if (affiliateTypes.some(t => url.includes(t))) {
          products.push({
            brand,
            name,
            type: guessProductType(productName),
            searchQuery: `${brand} ${name}`.trim(),
            shopmyUrl,
            amazonUrl,
            originalUrl: url
          })
        }
      }
    }
  }

  // Remove duplicates
  const seen = new Set()
  return products.filter(p => {
    const key = p.originalUrl || `${p.brand}-${p.name}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default {
  initClaude,
  analyzeVideoContent,
  reviewQuickAnswer
}
