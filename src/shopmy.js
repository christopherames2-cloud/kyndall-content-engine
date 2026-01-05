// ShopMy API Service
// Fetches existing links and creates new product links

const SHOPMY_API_BASE = 'https://api.shopmy.us/v1'

export async function fetchExistingLinks(apiToken) {
  try {
    const response = await fetch(`${SHOPMY_API_BASE}/links`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.error('ShopMy API error:', response.status)
      return []
    }
    
    const data = await response.json()
    return data.links || data.data || []
  } catch (error) {
    console.error('Error fetching ShopMy links:', error)
    return []
  }
}

export async function fetchCollections(apiToken) {
  try {
    const response = await fetch(`${SHOPMY_API_BASE}/collections`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      console.error('ShopMy API error:', response.status)
      return []
    }
    
    const data = await response.json()
    return data.collections || data.data || []
  } catch (error) {
    console.error('Error fetching ShopMy collections:', error)
    return []
  }
}

export async function searchExistingLinks(apiToken, query) {
  // Fetch all links and search locally
  // (ShopMy may not have a search endpoint)
  const links = await fetchExistingLinks(apiToken)
  
  const queryLower = query.toLowerCase()
  return links.filter(link => {
    const titleMatch = link.title?.toLowerCase().includes(queryLower)
    const brandMatch = link.brand?.toLowerCase().includes(queryLower)
    const urlMatch = link.url?.toLowerCase().includes(queryLower)
    return titleMatch || brandMatch || urlMatch
  })
}

export async function createLink(apiToken, productUrl) {
  try {
    const response = await fetch(`${SHOPMY_API_BASE}/links`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: productUrl
      })
    })
    
    if (!response.ok) {
      console.error('ShopMy create link error:', response.status)
      return null
    }
    
    const data = await response.json()
    return data.link || data
  } catch (error) {
    console.error('Error creating ShopMy link:', error)
    return null
  }
}

export async function findOrSuggestLink(apiToken, product) {
  // Search for existing link
  const existingLinks = await searchExistingLinks(apiToken, product.name)
  
  if (existingLinks.length > 0) {
    // Found existing link
    return {
      found: true,
      link: existingLinks[0],
      url: existingLinks[0].shortUrl || existingLinks[0].url
    }
  }
  
  // Also try searching by brand
  const brandLinks = await searchExistingLinks(apiToken, product.brand)
  const brandMatch = brandLinks.find(link => 
    link.title?.toLowerCase().includes(product.name.toLowerCase())
  )
  
  if (brandMatch) {
    return {
      found: true,
      link: brandMatch,
      url: brandMatch.shortUrl || brandMatch.url
    }
  }
  
  // Not found - suggest adding
  return {
    found: false,
    suggestion: `Add "${product.name}" by ${product.brand} to ShopMy`,
    searchQuery: `${product.brand} ${product.name}`
  }
}
