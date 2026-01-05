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
Description: ${video.description}
Tags: ${video.tags?.join(', ') || 'None'}
Platform: ${video.platform}

TASKS:
1. Extract ALL beauty/skincare/fashion products mentioned or likely used
2. Suggest a category for this content
3. Generate SEO-optimized blog content

Respond in this exact JSON format:
{
  "products": [
    {
      "name": "Product Name",
      "brand": "Brand Name",
      "type": "makeup/skincare/haircare/fashion/other",
      "searchQuery": "exact search query for Amazon"
    }
  ],
  "category": "Makeup|Skincare|Fashion|Lifestyle|Travel",
  "seoTitle": "SEO optimized title (60 chars max)",
  "seoDescription": "Meta description for search engines (155 chars max)",
  "blogTitle": "Engaging blog post title",
  "blogExcerpt": "2-3 sentence preview of the content",
  "blogContent": "Full blog post content in markdown format. Include sections for: Introduction (mention this is from her YouTube), Product Breakdown (list products with placeholders like [PRODUCT_LINK:Product Name] for where affiliate links will go), How To/Tips, and Final Thoughts. Make it sound like Kyndall writing. 300-500 words.",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      { role: 'user', content: prompt }
    ]
  })
  
  try {
    const text = response.content[0].text
    // Extract JSON from response (handle potential markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('No JSON found in response')
  } catch (error) {
    console.error('Error parsing Claude response:', error)
    return null
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
