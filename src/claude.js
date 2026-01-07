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

  // Extract products from description FIRST
  const descriptionProducts = extractProductsFromDescription(video.description || '')
  console.log(`   Found ${descriptionProducts.length} products in description`)
  
  if (descriptionProducts.length > 0) {
    descriptionProducts.forEach(p => {
      console.log(`      - ${p.brand} ${p.name}`)
      if (p.shopmyUrl) console.log(`        ShopMy: ${p.shopmyUrl}`)
      if (p.amazonUrl) console.log(`        Amazon: ${p.amazonUrl}`)
    })
  }

  const prompt = `You are analyzing a YouTube video to create a blog post.

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

NOTE: Products have already been extracted from the description. Do NOT add or modify products.

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "category": "makeup|skincare|fashion|lifestyle|travel",
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
    
    // Use the products we already extracted - don't trust Claude's extraction
    analysis.products = descriptionProducts

    console.log(`   ✓ Analysis complete, ${analysis.products.length} products`)
    
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
      suggestedTags: []
    }
  }
}

// Extract products from YouTube description
function extractProductsFromDescription(description) {
  const products = []
  
  if (!description) return products

  // Common beauty brands for identification
  const beautyBrands = [
    'Benefit Cosmetics', 'Benefit', 'Kylie Cosmetics', 'Kylie', 'Summer Fridays',
    'Pat McGrath Labs', 'Pat McGrath', 'MAC', 'Patrick Ta', 'Fenty Beauty', 'Fenty',
    'Kosas', 'Make Up For Ever', 'MUFE', 'Bobbi Brown', 'Rare Beauty',
    'Charlotte Tilbury', 'NARS', 'Too Faced', 'Urban Decay', 'Tarte',
    'Glossier', 'Milk Makeup', 'Ilia', 'Tower 28', 'Merit', 'Saie',
    'Makeup By Mario', 'Laura Mercier', 'Hourglass', 'Armani', 'YSL', 'Dior', 'Chanel',
    'Estée Lauder', 'Clinique', 'Lancôme', 'Smashbox', 'e.l.f.', 'elf', 'NYX',
    'Maybelline', 'L\'Oréal', 'Revlon', 'CoverGirl', 'The Ordinary', 'Drunk Elephant',
    'Tatcha', 'Sunday Riley', 'Supergoop', 'La Mer', 'SK-II', 'Olaplex', 'Dyson',
    'Moroccan Oil', 'Ouai', 'Sol de Janeiro', 'Gisou', 'Rhode', 'Kiehl\'s',
    'CeraVe', 'La Roche-Posay', 'Paula\'s Choice', 'Good Molecules', 'Anastasia Beverly Hills',
    'ABH', 'Huda Beauty', 'Natasha Denona', 'CT', 'PMG'
  ]

  // METHOD 1: Look for "PRODUCTS:" section (most reliable for Kyndall's format)
  // Format: "Product Name - https://go.shopmy.us/..." separated by spaces or newlines
  const productsMatch = description.match(/PRODUCTS?:?\s*([\s\S]*?)(?=\n\n|\nFOLLOW|\nSUBSCRIBE|\nBUSINESS|\nMUSIC|\n[A-Z]{2,}:|$)/i)
  
  if (productsMatch) {
    const productsSection = productsMatch[1]
    console.log(`      Found PRODUCTS section`)
    
    // Split by URL pattern to get each product
    // Match: "Product Name - URL" or "Product Name URL"
    const productPattern = /([^-\n]+(?:\s+"[^"]+")?\s*)-?\s*(https?:\/\/[^\s]+)/g
    let match
    
    while ((match = productPattern.exec(productsSection)) !== null) {
      const fullProductName = match[1].trim()
      const url = match[2].trim()
      
      // Parse brand and product name
      const { brand, name } = extractBrandAndName(fullProductName, beautyBrands)
      
      // Determine URL type
      let shopmyUrl = null
      let amazonUrl = null
      
      if (url.includes('shopmy.us') || url.includes('go.shopmy.us') || url.includes('shop-links.co')) {
        shopmyUrl = url
      } else if (url.includes('amazon.com') || url.includes('amzn.to') || url.includes('amzn.com')) {
        amazonUrl = url
      }
      
      products.push({
        brand,
        name,
        type: guessProductType(fullProductName),
        searchQuery: `${brand} ${name}`.trim(),
        shopmyUrl,
        amazonUrl,
        originalUrl: url
      })
    }
  }

  // METHOD 2: If no PRODUCTS section, scan whole description for product links
  if (products.length === 0) {
    const lines = description.split('\n')
    
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue
      
      // Skip non-product lines
      if (trimmedLine.toLowerCase().includes('follow me') ||
          trimmedLine.toLowerCase().includes('subscribe') ||
          trimmedLine.toLowerCase().includes('business') ||
          trimmedLine.toLowerCase().includes('instagram:') ||
          trimmedLine.toLowerCase().includes('tiktok:') ||
          trimmedLine.toLowerCase().includes('twitter:')) {
        continue
      }
      
      // Look for lines with URLs
      const urlMatch = trimmedLine.match(/(.+?)\s*[-–:]?\s*(https?:\/\/[^\s]+)/i)
      
      if (urlMatch) {
        const productName = urlMatch[1].replace(/^[•\-\*\d.]\s*/, '').trim()
        const url = urlMatch[2]
        
        // Skip if product name is too short or looks like a section header
        if (productName.length < 3 || productName.toUpperCase() === productName) continue
        
        const { brand, name } = extractBrandAndName(productName, beautyBrands)
        
        let shopmyUrl = null
        let amazonUrl = null
        
        if (url.includes('shopmy.us') || url.includes('go.shopmy.us') || url.includes('shop-links.co')) {
          shopmyUrl = url
        } else if (url.includes('amazon.com') || url.includes('amzn.to') || url.includes('amzn.com')) {
          amazonUrl = url
        }
        
        // Only add if it's an affiliate link we recognize
        if (shopmyUrl || amazonUrl || url.includes('rstyle') || url.includes('liketoknow') || url.includes('ltk.app')) {
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

  // Remove duplicates based on URL
  const seen = new Set()
  return products.filter(p => {
    const key = p.originalUrl || `${p.brand}-${p.name}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractBrandAndName(fullProductName, beautyBrands) {
  let brand = 'Unknown'
  let name = fullProductName
  
  // Sort brands by length (longest first) to match "Benefit Cosmetics" before "Benefit"
  const sortedBrands = [...beautyBrands].sort((a, b) => b.length - a.length)
  
  for (const b of sortedBrands) {
    const regex = new RegExp(`^${escapeRegex(b)}\\s+`, 'i')
    if (regex.test(fullProductName)) {
      brand = b
      name = fullProductName.replace(regex, '').trim()
      break
    }
  }
  
  // Clean up name - remove quotes around shade names but keep the shade
  name = name.replace(/"/g, '')
  
  return { brand, name }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function guessProductType(text) {
  const lower = text.toLowerCase()
  
  if (lower.includes('foundation') || lower.includes('concealer') || lower.includes('powder') ||
      lower.includes('blush') || lower.includes('bronzer') || lower.includes('highlighter') ||
      lower.includes('lipstick') || lower.includes('lip ') || lower.includes('mascara') ||
      lower.includes('eyeliner') || lower.includes('eyeshadow') || lower.includes('brow') ||
      lower.includes('primer') || lower.includes('setting') || lower.includes('contour') ||
      lower.includes('tint') || lower.includes('pencil') || lower.includes('balm')) {
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
      lower.includes('mirror') || lower.includes('organizer')) {
    return 'tools'
  }
  
  return 'makeup' // Default to makeup for beauty content
}

function guessCategory(text) {
  const lower = text.toLowerCase()
  
  if (lower.includes('skincare') || lower.includes('skin care') || lower.includes('routine')) {
    return 'skincare'
  }
  if (lower.includes('makeup') || lower.includes('glam') || lower.includes('tutorial') || lower.includes('grwm') || lower.includes('get ready')) {
    return 'makeup'
  }
  if (lower.includes('fashion') || lower.includes('outfit') || lower.includes('haul') || lower.includes('style')) {
    return 'fashion'
  }
  if (lower.includes('travel') || lower.includes('vacation') || lower.includes('trip')) {
    return 'travel'
  }
  return 'lifestyle'
}
