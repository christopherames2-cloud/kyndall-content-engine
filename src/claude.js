// kyndall-content-engine/src/claude.js
// Claude AI Content Analysis Service
// Extracts products from YouTube descriptions and generates blog content
// NOW WITH GEO CONTENT GENERATION (quickAnswer, keyTakeaways, expertTips, faqSection, kyndallsTake)

import Anthropic from '@anthropic-ai/sdk'

let client = null
let amazonAssociateTag = 'kyndallames09-20' // Default tag

export function initClaude(apiKey, associateTag) {
  client = new Anthropic({ apiKey })
  if (associateTag) {
    amazonAssociateTag = associateTag
  }
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
    'Maybelline', 'L\'Oreal', 'Revlon', 'CoverGirl', 'Neutrogena',
    'CeraVe', 'La Roche-Posay', 'The Ordinary', 'Paula\'s Choice', 'Drunk Elephant',
    'Tatcha', 'SK-II', 'Glow Recipe', 'Youth To The People', 'Supergoop',
    'Olaplex', 'Dyson', 'Ouai', 'Briogeo', 'Moroccanoil', 'Living Proof',
    'Peach & Lily', 'Laneige', 'Innisfree', 'COSRX', 'Some By Mi',
    'Pixi', 'First Aid Beauty', 'Origins', 'Fresh', 'Kiehl\'s',
    'Sol de Janeiro', 'Brazilian Bum Bum', 'Kopari', 'Nécessaire',
    'Augustinus Bader', 'La Mer', 'Sunday Riley', 'Dr. Dennis Gross'
  ]

  // ShopMy link patterns
  const shopmyPatterns = [
    /(?:https?:\/\/)?(?:www\.)?shopmy\.us\/[^\s]+/gi,
    /(?:https?:\/\/)?(?:www\.)?shop-links\.co\/[^\s]+/gi,
    /(?:https?:\/\/)?(?:www\.)?shopstyle\.it\/[^\s]+/gi,
  ]

  // Amazon link patterns
  const amazonPatterns = [
    /(?:https?:\/\/)?(?:www\.)?(?:amazon\.com|amzn\.to|amzn\.com)\/[^\s]+/gi,
    /(?:https?:\/\/)?(?:www\.)?a\.co\/[^\s]+/gi,
  ]

  // Split into lines
  const lines = description.split('\n')
  
  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine) continue
    
    // Check for ShopMy links
    let shopmyUrl = null
    for (const pattern of shopmyPatterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        shopmyUrl = match[0]
        break
      }
    }
    
    // Check for Amazon links
    let amazonUrl = null
    for (const pattern of amazonPatterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        amazonUrl = match[0]
        break
      }
    }
    
    // If we found a link, try to extract product info
    if (shopmyUrl || amazonUrl) {
      // Try to find brand and product name
      let brand = null
      let productName = null
      
      // Check for brand in line
      for (const b of beautyBrands) {
        if (trimmedLine.toLowerCase().includes(b.toLowerCase())) {
          brand = b
          break
        }
      }
      
      // Extract product name (text before the link, or after brand)
      const textBeforeLink = trimmedLine.split(/https?:\/\//)[0].trim()
      if (textBeforeLink) {
        // Remove common prefixes
        productName = textBeforeLink
          .replace(/^[-•*]\s*/, '')
          .replace(/^(?:Use code|Code|Discount).*$/i, '')
          .trim()
        
        // If we found a brand, remove it from product name
        if (brand && productName.toLowerCase().startsWith(brand.toLowerCase())) {
          productName = productName.substring(brand.length).trim()
        }
      }
      
      if (productName || brand) {
        products.push({
          brand: brand || 'Unknown',
          name: productName || 'Product',
          shopmyUrl: shopmyUrl || null,
          amazonUrl: amazonUrl || null,
          originalUrl: shopmyUrl || amazonUrl
        })
      }
    }
  }
  
  return products
}

// Guess category from text
function guessCategory(text) {
  const lower = text.toLowerCase()
  
  if (lower.includes('makeup') || lower.includes('lipstick') || lower.includes('foundation') || lower.includes('mascara') || lower.includes('eyeshadow')) {
    return 'makeup'
  }
  if (lower.includes('skincare') || lower.includes('serum') || lower.includes('moisturizer') || lower.includes('sunscreen') || lower.includes('spf')) {
    return 'skincare'
  }
  if (lower.includes('fashion') || lower.includes('outfit') || lower.includes('style') || lower.includes('clothing')) {
    return 'fashion'
  }
  if (lower.includes('travel') || lower.includes('vacation') || lower.includes('trip') || lower.includes('hotel')) {
    return 'travel'
  }
  
  return 'lifestyle'
}

export default {
  initClaude,
  analyzeVideoContent,
  reviewQuickAnswer
}
