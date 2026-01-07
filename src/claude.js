// Claude AI Content Analysis Service
// Extracts products from YouTube descriptions and generates blog content

import Anthropic from '@anthropic-ai/sdk'

let client = null

export function initClaude(apiKey) {
  client = new Anthropic({ apiKey })
}

export async function analyzeVideoContent(video) {
  if (!client) throw new Error('Claude client not initialized')

  console.log(`   Analyzing: "${video.title}"`)
  console.log(`   Description length: ${video.description?.length || 0} chars`)

  // Look for product links in description (common patterns)
  const descriptionProducts = extractProductsFromDescription(video.description || '')
  console.log(`   Found ${descriptionProducts.length} products in description`)

  const prompt = `You are analyzing a YouTube video to create a blog post and extract ALL products mentioned.

VIDEO TITLE: ${video.title}

VIDEO DESCRIPTION:
${video.description || 'No description'}

VIDEO TAGS: ${video.tags?.join(', ') || 'No tags'}

PRODUCTS ALREADY FOUND IN DESCRIPTION (preserve these exactly):
${descriptionProducts.length > 0 ? JSON.stringify(descriptionProducts, null, 2) : 'None found automatically'}

YOUR TASK:
1. Extract ALL products mentioned - from the description links AND any mentioned in text
2. Generate a blog post about this video
3. Suggest SEO metadata

IMPORTANT FOR PRODUCTS:
- Include ALL products from the "PRODUCTS ALREADY FOUND" list above
- Add any additional products mentioned in the title, description text, or tags
- For each product include: brand, name, type (makeup/skincare/fashion/etc), and a search query for Amazon
- If there's a URL in the description for a product, include it as "originalUrl"

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "category": "makeup|skincare|fashion|lifestyle|travel",
  "products": [
    {
      "brand": "Brand Name",
      "name": "Product Name", 
      "type": "makeup|skincare|fashion|haircare|fragrance|tools|other",
      "searchQuery": "brand name product name for Amazon search",
      "originalUrl": "url from description if available, otherwise null"
    }
  ],
  "blogTitle": "Engaging blog title (50-60 chars)",
  "blogExcerpt": "Brief compelling summary (150-160 chars)",
  "blogContent": "Full blog post (200-400 words) with [PRODUCT_LINK:Product Name] placeholders where products should be linked",
  "seoTitle": "SEO optimized title (50-60 chars)",
  "seoDescription": "Meta description for search engines (150-160 chars)",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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
    
    // Merge any description products that might have been missed
    if (descriptionProducts.length > 0) {
      const existingNames = new Set(analysis.products.map(p => p.name.toLowerCase()))
      for (const dp of descriptionProducts) {
        if (!existingNames.has(dp.name.toLowerCase())) {
          analysis.products.push(dp)
        }
      }
    }

    console.log(`   ✓ Extracted ${analysis.products.length} total products`)
    
    return analysis

  } catch (error) {
    console.error('   Claude analysis error:', error.message)
    
    // Return basic analysis with description products if Claude fails
    if (descriptionProducts.length > 0) {
      return {
        category: 'lifestyle',
        products: descriptionProducts,
        blogTitle: video.title,
        blogExcerpt: video.title,
        blogContent: `Check out this video: ${video.title}`,
        seoTitle: video.title.substring(0, 60),
        seoDescription: video.title.substring(0, 160),
        suggestedTags: []
      }
    }
    
    return null
  }
}

// Extract products from YouTube description using common patterns
function extractProductsFromDescription(description) {
  const products = []
  const lines = description.split('\n')
  
  // Common product link patterns in YouTube descriptions
  const linkPatterns = [
    // ShopMy links
    /(?:shopmy\.us|shop-links\.co)\/[^\s]+/gi,
    // LTK/LIKEtoKNOW.it
    /(?:liketoknow\.it|ltk\.app|rstyle\.me)\/[^\s]+/gi,
    // Amazon links
    /(?:amazon\.com|amzn\.to|amzn\.com)\/[^\s]+/gi,
    // Sephora
    /sephora\.com\/[^\s]+/gi,
    // Ulta
    /ulta\.com\/[^\s]+/gi,
    // Generic affiliate links
    /(?:rstyle|shopstyle|prf\.hn|bit\.ly|tinyurl)\.[\w]+\/[^\s]+/gi,
  ]

  // Pattern: "Product Name - LINK" or "Product Name: LINK" or "• Product Name LINK"
  const productLinePatterns = [
    /^[•\-\*]\s*(.+?)\s*[-–:]\s*(https?:\/\/[^\s]+)/i,
    /^[•\-\*]\s*(.+?)\s+(https?:\/\/[^\s]+)/i,
    /^(.+?)\s*[-–:]\s*(https?:\/\/[^\s]+)/i,
  ]

  // Pattern: "BRAND Product Name" with common beauty brands
  const beautyBrands = [
    'Charlotte Tilbury', 'Rare Beauty', 'Fenty', 'MAC', 'NARS', 'Too Faced',
    'Urban Decay', 'Tarte', 'Benefit', 'Glossier', 'Milk Makeup', 'Ilia',
    'Tower 28', 'Kosas', 'Merit', 'Saie', 'Patrick Ta', 'Makeup By Mario',
    'Laura Mercier', 'Hourglass', 'Armani', 'YSL', 'Dior', 'Chanel',
    'Estée Lauder', 'Clinique', 'Lancôme', 'Bobbi Brown', 'Smashbox',
    'e.l.f.', 'NYX', 'Maybelline', 'L\'Oréal', 'Revlon', 'CoverGirl',
    'The Ordinary', 'Drunk Elephant', 'Tatcha', 'Sunday Riley', 'Supergoop',
    'La Mer', 'SK-II', 'Olaplex', 'Dyson', 'Moroccan Oil', 'Ouai',
    'Sol de Janeiro', 'Gisou', 'Summer Fridays', 'Rhode', 'Kiehl\'s',
    'CeraVe', 'La Roche-Posay', 'Paula\'s Choice', 'Good Molecules'
  ]

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue

    // Check for product lines with links
    for (const pattern of productLinePatterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        const productName = match[1].trim()
        const url = match[2]
        
        // Skip if it's just a generic link or too short
        if (productName.length < 3) continue
        if (productName.toLowerCase().includes('subscribe')) continue
        if (productName.toLowerCase().includes('follow me')) continue
        
        // Try to extract brand
        let brand = 'Unknown'
        let name = productName
        
        for (const b of beautyBrands) {
          if (productName.toLowerCase().includes(b.toLowerCase())) {
            brand = b
            name = productName.replace(new RegExp(b, 'i'), '').trim()
            break
          }
        }
        
        // Determine product type
        const type = guessProductType(productName)
        
        products.push({
          brand,
          name: name || productName,
          type,
          searchQuery: `${brand} ${name}`.trim(),
          originalUrl: url
        })
      }
    }
  }

  // Also look for standalone links with context
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Check if line has a link but wasn't caught above
    if (line.match(/https?:\/\/[^\s]+/) && !products.some(p => line.includes(p.originalUrl || ''))) {
      // Look at previous line for product name
      if (i > 0) {
        const prevLine = lines[i - 1].trim()
        if (prevLine && prevLine.length > 3 && prevLine.length < 100) {
          // Skip common non-product lines
          if (prevLine.toLowerCase().includes('follow') ||
              prevLine.toLowerCase().includes('subscribe') ||
              prevLine.toLowerCase().includes('instagram') ||
              prevLine.toLowerCase().includes('tiktok') ||
              prevLine.toLowerCase().includes('business')) {
            continue
          }

          const urlMatch = line.match(/(https?:\/\/[^\s]+)/)
          if (urlMatch) {
            let brand = 'Unknown'
            let name = prevLine.replace(/^[•\-\*\d.]\s*/, '').trim()
            
            for (const b of beautyBrands) {
              if (name.toLowerCase().includes(b.toLowerCase())) {
                brand = b
                name = name.replace(new RegExp(b, 'i'), '').trim()
                break
              }
            }
            
            products.push({
              brand,
              name: name || prevLine,
              type: guessProductType(prevLine),
              searchQuery: `${brand} ${name}`.trim(),
              originalUrl: urlMatch[1]
            })
          }
        }
      }
    }
  }

  // Remove duplicates
  const seen = new Set()
  return products.filter(p => {
    const key = `${p.brand}-${p.name}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function guessProductType(text) {
  const lower = text.toLowerCase()
  
  if (lower.includes('foundation') || lower.includes('concealer') || lower.includes('powder') ||
      lower.includes('blush') || lower.includes('bronzer') || lower.includes('highlighter') ||
      lower.includes('lipstick') || lower.includes('lip') || lower.includes('mascara') ||
      lower.includes('eyeliner') || lower.includes('eyeshadow') || lower.includes('brow') ||
      lower.includes('primer') || lower.includes('setting spray') || lower.includes('contour')) {
    return 'makeup'
  }
  
  if (lower.includes('serum') || lower.includes('moisturizer') || lower.includes('cleanser') ||
      lower.includes('toner') || lower.includes('sunscreen') || lower.includes('spf') ||
      lower.includes('retinol') || lower.includes('vitamin c') || lower.includes('mask') ||
      lower.includes('exfoliant') || lower.includes('cream') || lower.includes('lotion')) {
    return 'skincare'
  }
  
  if (lower.includes('shampoo') || lower.includes('conditioner') || lower.includes('hair') ||
      lower.includes('oil') || lower.includes('styling') || lower.includes('olaplex')) {
    return 'haircare'
  }
  
  if (lower.includes('perfume') || lower.includes('fragrance') || lower.includes('cologne') ||
      lower.includes('body mist') || lower.includes('eau de')) {
    return 'fragrance'
  }
  
  if (lower.includes('brush') || lower.includes('sponge') || lower.includes('curler') ||
      lower.includes('dryer') || lower.includes('straightener') || lower.includes('dyson') ||
      lower.includes('mirror') || lower.includes('bag') || lower.includes('organizer')) {
    return 'tools'
  }
  
  if (lower.includes('dress') || lower.includes('top') || lower.includes('jeans') ||
      lower.includes('shoes') || lower.includes('bag') || lower.includes('jewelry') ||
      lower.includes('earring') || lower.includes('necklace')) {
    return 'fashion'
  }
  
  return 'other'
}
