// Claude AI Analysis Service
// Extracts products and generates SEO blog content

import Anthropic from '@anthropic-ai/sdk'

let client = null

export function initClaude(apiKey) {
  client = new Anthropic({ apiKey })
}

export async function analyzeVideoContent(video) {
  if (!client) throw new Error('Claude client not initialized')
  
  const prompt = `You are analyzing a beauty/lifestyle video for Kyndall Ames, a beauty content creator.

VIDEO INFORMATION:
Title: ${video.title}
Description: ${video.description?.substring(0, 1500) || 'No description'}
Tags: ${video.tags?.slice(0, 20).join(', ') || 'None'}
Platform: ${video.platform}

TASKS:
1. Extract ALL beauty/skincare/fashion products mentioned or likely used (max 5 products)
2. Suggest a category for this content
3. Generate SEO-optimized blog content

IMPORTANT: Respond with ONLY valid JSON, no other text. No markdown code blocks.

{
  "products": [
    {
      "name": "Product Name",
      "brand": "Brand Name",
      "type": "makeup",
      "searchQuery": "brand product name"
    }
  ],
  "category": "Makeup",
  "seoTitle": "SEO title under 60 chars",
  "seoDescription": "Meta description under 155 chars",
  "blogTitle": "Engaging blog post title",
  "blogExcerpt": "2-3 sentence preview",
  "blogContent": "Full blog post in markdown, 200-400 words. Include [PRODUCT_LINK:Product Name] placeholders.",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
    
    let text = response.content[0].text
    
    // Clean up the response
    text = text.trim()
    
    // Remove markdown code blocks if present
    text = text.replace(/^```json\s*/i, '')
    text = text.replace(/^```\s*/i, '')
    text = text.replace(/\s*```$/i, '')
    
    // Find JSON object
    const startIndex = text.indexOf('{')
    const endIndex = text.lastIndexOf('}')
    
    if (startIndex === -1 || endIndex === -1) {
      console.error('   No JSON object found in response')
      return null
    }
    
    text = text.substring(startIndex, endIndex + 1)
    
    // Parse JSON
    const parsed = JSON.parse(text)
    
    // Validate required fields
    if (!parsed.products) parsed.products = []
    if (!parsed.category) parsed.category = 'Lifestyle'
    if (!parsed.seoTitle) parsed.seoTitle = video.title.substring(0, 60)
    if (!parsed.seoDescription) parsed.seoDescription = video.title
    if (!parsed.blogTitle) parsed.blogTitle = video.title
    if (!parsed.blogExcerpt) parsed.blogExcerpt = 'Check out this video!'
    if (!parsed.blogContent) parsed.blogContent = 'Watch the full video for more details.'
    if (!parsed.suggestedTags) parsed.suggestedTags = []
    
    return parsed
    
  } catch (error) {
    console.error('   Claude analysis error:', error.message)
    
    // Return a fallback response so we don't skip the video entirely
    return {
      products: [],
      category: 'Lifestyle',
      seoTitle: video.title.substring(0, 60),
      seoDescription: video.title.substring(0, 155),
      blogTitle: video.title,
      blogExcerpt: `Watch ${video.title} on YouTube.`,
      blogContent: `Check out this video: ${video.title}\n\nWatch the full video for all the details and product recommendations.`,
      suggestedTags: ['beauty', 'youtube']
    }
  }
}

export async function generateProductDescription(product, amazonData, shopmyData) {
  if (!client) throw new Error('Claude client not initialized')
  
  const prompt = `Write a brief, enthusiastic product callout for Kyndall Ames' blog.

Product: ${product.name} by ${product.brand}
Type: ${product.type}
${amazonData ? `Amazon Price: ${amazonData.price}` : ''}
${shopmyData ? `Already in ShopMy: Yes` : ''}

Write 1-2 sentences about why this product is great. Sound like a beauty influencer who genuinely loves this product. Don't be too salesy.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      { role: 'user', content: prompt }
    ]
  })
  
  return response.content[0].text.trim()
}
