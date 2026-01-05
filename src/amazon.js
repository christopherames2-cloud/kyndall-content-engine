// Amazon Affiliate Service
// Searches for products and generates affiliate links

const AMAZON_SEARCH_URL = 'https://www.amazon.com/s'

export function generateAffiliateLink(asin, associateTag) {
  return `https://www.amazon.com/dp/${asin}?tag=${associateTag}`
}

export function generateSearchLink(query, associateTag) {
  const encodedQuery = encodeURIComponent(query)
  return `https://www.amazon.com/s?k=${encodedQuery}&tag=${associateTag}`
}

// Note: Amazon's Product Advertising API requires approval and has strict requirements
// For now, we'll generate search links that still include the affiliate tag
// When Kyndall reviews posts, she can update with specific product ASINs

export async function searchProducts(query, associateTag) {
  // The Product Advertising API requires:
  // 1. An approved Amazon Associates account with 3+ qualifying sales
  // 2. AWS credentials
  // 3. PA-API access approval
  
  // For MVP, we'll return a search link that Kyndall can use to find the exact product
  return {
    searchLink: generateSearchLink(query, associateTag),
    query: query,
    note: 'Click to find on Amazon - update with specific product link after review'
  }
}

// Helper to extract ASIN from Amazon URL (for when Kyndall adds specific products)
export function extractASIN(amazonUrl) {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/exec\/obidos\/asin\/([A-Z0-9]{10})/,
    /\/o\/ASIN\/([A-Z0-9]{10})/,
    /\/gp\/offer-listing\/([A-Z0-9]{10})/
  ]
  
  for (const pattern of patterns) {
    const match = amazonUrl.match(pattern)
    if (match) return match[1]
  }
  return null
}
