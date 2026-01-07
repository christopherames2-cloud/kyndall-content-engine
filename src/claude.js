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

PRODUCTS ALREADY EXTRACTED FROM DESCRIPTION (with their index numbers):
${descriptionProducts.length > 0 ? descriptionProducts.map((p, i) => `[${i + 1}] ${p.brand} ${p.name}`).join('\n') : 'None found'}

YOUR TASK:
1. Generate a blog post about this video in HTML format
2. Suggest SEO metadata
3. Determine the category

IMPORTANT HTML FORMATTING RULES:
- Use <h2> for main section headers
- Use <h3> for sub-headers
- Use <p> for paragraphs
- Use <strong> for emphasis (product names, key points)
- Use <em> for subtle emphasis
- For product mentions, use: <a href="#product-N" class="product-link">Product Name</a> where N is the product index number from the list above
- Keep paragraphs concise and scannable
- Write 200-400 words

NOTE: Products have already been extracted from the description. Do NOT add or modify products.

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "category": "makeup|skincare|fashion|lifestyle|travel",
  "blogTitle": "Engaging blog title (50-60 chars)",
  "blogExcerpt": "Brief compelling summary (150-160 chars)",
  "blogContent": "<h2>Section</h2><p>HTML formatted blog post with <a href=\\"#product-1\\" class=\\"product-link\\">Product Name</a> links...</p>",
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

  // Comprehensive beauty brands list for identification
  const beautyBrands = [
    // Prestige Makeup
    'Benefit Cosmetics', 'Benefit', 'Kylie Cosmetics', 'Kylie', 'Summer Fridays',
    'Pat McGrath Labs', 'Pat McGrath', 'MAC Cosmetics', 'MAC', 'Patrick Ta', 
    'Fenty Beauty', 'Fenty', 'Kosas', 'Make Up For Ever', 'MUFE', 'Bobbi Brown', 
    'Rare Beauty', 'Charlotte Tilbury', 'NARS', 'Too Faced', 'Urban Decay', 'Tarte',
    'Glossier', 'Milk Makeup', 'Ilia', 'Tower 28', 'Merit', 'Saie',
    'Makeup By Mario', 'Laura Mercier', 'Hourglass', 'Armani Beauty', 'Giorgio Armani',
    'YSL Beauty', 'YSL', 'Dior Beauty', 'Dior', 'Chanel', 'Estée Lauder', 'Estee Lauder',
    'Clinique', 'Lancôme', 'Lancome', 'Smashbox', 'Natasha Denona', 'Tom Ford Beauty', 
    'Tom Ford', 'Gucci Beauty', 'Valentino Beauty', 'Givenchy', 'Westman Atelier',
    'Victoria Beckham Beauty', 'Rose Inc', 'Jones Road', 'About Face', 'One Size', 
    'One/Size', 'Danessa Myricks', 'Lisa Eldridge', 'KVD Beauty', 'KVD', 
    'Kvd Vegan Beauty', 'Anastasia Beverly Hills', 'ABH', 'Huda Beauty', 'CT', 'PMG',
    
    // Drugstore Makeup
    'e.l.f. Cosmetics', 'e.l.f.', 'elf Cosmetics', 'elf', 'ELF', 'NYX Professional', 
    'NYX Cosmetics', 'NYX', 'Maybelline New York', 'Maybelline', 'L\'Oréal Paris', 
    'L\'Oreal Paris', 'L\'Oréal', 'L\'Oreal', 'Loreal', 'Revlon', 'CoverGirl', 'Cover Girl',
    'Milani', 'ColourPop Cosmetics', 'ColourPop', 'Colour Pop', 'Wet n Wild', 'Wet \'n Wild',
    'Essence Cosmetics', 'Essence', 'Catrice', 'Physicians Formula', 'Flower Beauty',
    'Makeup Revolution', 'Revolution Beauty', 'Morphe', 'BH Cosmetics',
    
    // Skincare - Prestige
    'The Ordinary', 'Ordinary', 'Drunk Elephant', 'Tatcha', 'Sunday Riley', 'Supergoop!', 
    'Supergoop', 'La Mer', 'SK-II', 'SK-2', 'SKII', 'Augustinus Bader', 
    'Dr. Barbara Sturm', 'Barbara Sturm', 'SkinCeuticals', 'Skinceuticals', 'iS Clinical',
    'Biologique Recherche', 'Vintner\'s Daughter', 'Summer Fridays', 'Rhode Skin', 'Rhode',
    'Kiehl\'s', 'Kiehls', 'Fresh Beauty', 'Fresh', 'Origins', 'Shiseido', 'Clarins', 
    'Sisley Paris', 'Sisley', 'La Prairie', 'Caudalie', 'Herbivore Botanicals', 'Herbivore',
    'Youth to the People', 'YTTP', 'Glow Recipe', 'Farmacy Beauty', 'Farmacy', 
    'Versed Skincare', 'Versed', 'Kinship', 'Osea', 'Tula Skincare', 'Tula', 'Dermalogica',
    'Peter Thomas Roth', 'PTR', 'Ole Henriksen', 'Murad', 'Dr. Dennis Gross', 
    'Dr Dennis Gross', 'Kate Somerville', 'Elemis', 'Ren Clean Skincare', 'REN', 
    'First Aid Beauty', 'FAB', 'Josie Maran', 'Biossance', 'Caudalie',
    
    // Skincare - Drugstore & Affordable
    'CeraVe', 'La Roche-Posay', 'La Roche Posay', 'LRP', 'Paula\'s Choice', 'Paulas Choice',
    'Good Molecules', 'The Inkey List', 'Inkey List', 'INKEY', 'Naturium', 
    'Aveeno', 'Neutrogena', 'Olay', 'Eucerin', 'Cetaphil', 'Vanicream', 'Aquaphor',
    'Differin', 'Cerave', 'Garnier', 'Bioderma', 'Vichy', 'Avene', 'Avène',
    
    // Korean Beauty (K-Beauty)
    'Skin1004', 'SKIN1004', 'COSRX', 'Cosrx', 'Innisfree', 'Laneige', 'Sulwhasoo',
    'Beauty of Joseon', 'Anua', 'ANUA', 'Isntree', 'ISNTREE', 'Torriden', 'TORRIDEN',
    'Round Lab', 'Roundlab', 'ROUND LAB', 'Missha', 'MISSHA', 'Etude House', 'Etude', 'ETUDE',
    'Tony Moly', 'TonyMoly', 'TONYMOLY', 'Holika Holika', 'Banila Co', 'BANILA CO',
    'Neogen', 'NEOGEN', 'Dear Klairs', 'Klairs', 'KLAIRS', 'Purito', 'PURITO', 
    'Some By Mi', 'SOME BY MI', 'Benton', 'BENTON', 'Heimish', 'HEIMISH', 
    'Pyunkang Yul', 'I\'m From', 'Im From', 'I\'M FROM', 'Medicube', 'MEDICUBE',
    'Dr. Jart+', 'Dr. Jart', 'Dr Jart', 'DR. JART+', 'Amorepacific', 'AMOREPACIFIC',
    'Hera', 'HERA', 'Iope', 'IOPE', 'Primera', 'PRIMERA', 'Mamonde', 'MAMONDE',
    'Belif', 'BELIF', 'VDL', 'Peach & Lily', 'Peach and Lily', 'Then I Met You',
    'Soko Glam', 'Numbuzin', 'NUMBUZIN', 'Axis-Y', 'AXIS-Y', 'Haruharu Wonder', 
    'HARUHARU WONDER', 'By Wishtrend', 'BY WISHTREND', 'Wishtrend', 'TIRTIR', 'Tirtir',
    'Rom&nd', 'Romand', 'ROM&ND', 'ROMAND', 'Peripera', 'PERIPERA', 'Clio', 'CLIO',
    'Espoir', 'ESPOIR', 'Moonshot', 'MOONSHOT', 'Amuse', 'AMUSE', 'Dasique', 'DASIQUE',
    'Wakemake', 'WAKEMAKE', 'Apieu', 'A\'PIEU', 'Tocobo', 'TOCOBO', 'Mixsoon', 'MIXSOON',
    'Abib', 'ABIB', 'Goodal', 'GOODAL', 'One Thing', 'ONE THING', 'Rovectin', 'ROVECTIN',
    'Celimax', 'CELIMAX', 'Thank You Farmer', 'Mizon', 'MIZON', 'Skinfood', 'SKINFOOD',
    
    // Japanese Beauty (J-Beauty)
    'Shiseido', 'SHISEIDO', 'Tatcha', 'DHC', 'Hada Labo', 'HADA LABO', 'Rohto', 
    'Bioré', 'Biore', 'BIORE', 'Canmake', 'CANMAKE', 'Kose', 'KOSE', 'Kosé',
    'Sofina', 'SOFINA', 'Shu Uemura', 'SHU UEMURA', 'Three Cosmetics', 'THREE',
    'Suqqu', 'SUQQU', 'Decorte', 'DECORTE', 'Cosme Decorte', 'RMK', 'Lunasol', 'LUNASOL',
    'Addiction Beauty', 'ADDICTION', 'Kate Tokyo', 'KATE', 'Integrate', 'Majolica Majorca',
    'Anessa', 'ANESSA', 'Allie', 'ALLIE', 'Senka', 'SENKA', 'Curel', 'Curél',
    'Melano CC', 'Kikumasamune', 'Naturie', 'Lululun', 'Muji', 'MUJI',
    
    // Haircare
    'Olaplex', 'OLAPLEX', 'Dyson', 'Moroccan Oil', 'Moroccanoil', 'MOROCCANOIL',
    'Ouai', 'OUAI', 'Oribe', 'ORIBE', 'Kerastase', 'Kérastase', 'KERASTASE',
    'Sol de Janeiro', 'SOL DE JANEIRO', 'Gisou', 'GISOU', 'Amika', 'amika', 'AMIKA',
    'Briogeo', 'BRIOGEO', 'Verb', 'VERB', 'Living Proof', 'LIVING PROOF', 'Drybar', 'DRYBAR',
    'Christophe Robin', 'Bumble and Bumble', 'Bumble and bumble', 'Davines', 'DAVINES',
    'R+Co', 'R + Co', 'IGK', 'K18', 'Curlsmith', 'CURLSMITH', 'DevaCurl', 'DEVACURL',
    'SheaMoisture', 'Shea Moisture', 'Cantu', 'CANTU', 'Pattern Beauty', 'Pattern', 
    'Mielle', 'MIELLE', 'Carol\'s Daughter', 'Aussie', 'OGX', 'Garnier Fructis',
    'Herbal Essences', 'Pantene', 'TRESemmé', 'Tresemme', 'Head & Shoulders',
    'Color Wow', 'COLOR WOW', 'Redken', 'REDKEN', 'Matrix', 'Kenra', 'Joico',
    
    // Fragrance
    'Jo Malone', 'Jo Malone London', 'Diptyque', 'DIPTYQUE', 'Le Labo', 'LE LABO',
    'Byredo', 'BYREDO', 'Maison Margiela', 'Replica', 'REPLICA', 'Tom Ford', 
    'Chanel', 'CHANEL', 'Dior', 'DIOR', 'YSL', 'Gucci', 'GUCCI', 'Prada', 'PRADA',
    'Versace', 'VERSACE', 'Dolce & Gabbana', 'D&G', 'Valentino', 'VALENTINO',
    'Burberry', 'BURBERRY', 'Marc Jacobs', 'MARC JACOBS', 'Clean Reserve', 'CLEAN',
    'Juliette Has a Gun', 'Kayali', 'KAYALI', 'Ariana Grande', 'Billie Eilish',
    'Sol de Janeiro', 'Brazilian Bum Bum', 'Glossier You', 'Dedcool', 'DEDCOOL',
    'Maison Francis Kurkdjian', 'MFK', 'Creed', 'CREED', 'Parfums de Marly',
    
    // Tools & Devices
    'Dyson', 'DYSON', 'GHD', 'ghd', 'T3', 'T3 Micro', 'BaByliss', 'Babyliss', 
    'Hot Tools', 'HOT TOOLS', 'Bio Ionic', 'BIO IONIC', 'Drybar',
    'NuFace', 'NuFACE', 'NUFACE', 'Foreo', 'FOREO', 'PMD', 'Dermaflash', 'DERMAFLASH',
    'Ziip', 'ZIIP', 'Solawave', 'SOLAWAVE', 'CurrentBody', 'Current Body',
    'Beautyblender', 'Beauty Blender', 'BEAUTYBLENDER', 'Real Techniques', 
    'Sigma Beauty', 'Sigma', 'SIGMA', 'Artis', 'ARTIS', 'Sephora Collection',
    'IT Cosmetics', 'IT Brushes', 'EcoTools', 'Tweezerman', 'Revlon Tools'
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
  
  // Clean up the product name first
  name = name.replace(/^[•\-\*\d.]\s*/, '').trim()
  
  // Sort brands by length (longest first) to match "Benefit Cosmetics" before "Benefit"
  const sortedBrands = [...beautyBrands].sort((a, b) => b.length - a.length)
  
  // First, check if it starts with a known brand
  for (const b of sortedBrands) {
    const regex = new RegExp(`^${escapeRegex(b)}\\s+`, 'i')
    if (regex.test(name)) {
      brand = b
      name = name.replace(regex, '').trim()
      break
    }
  }
  
  // If no brand found, check if brand appears anywhere in the name
  if (brand === 'Unknown') {
    for (const b of sortedBrands) {
      if (name.toLowerCase().includes(b.toLowerCase())) {
        brand = b
        // Remove brand from name
        const brandRegex = new RegExp(escapeRegex(b), 'i')
        name = name.replace(brandRegex, '').trim()
        // Clean up any leftover separators
        name = name.replace(/^[\s\-–:]+/, '').trim()
        break
      }
    }
  }
  
  // If still unknown, try to intelligently parse the first word as a brand
  if (brand === 'Unknown') {
    const words = fullProductName.trim().split(/\s+/)
    if (words.length >= 2) {
      const firstWord = words[0]
      // Check if first word looks like a brand (capitalized, not common word)
      const commonWords = ['the', 'a', 'an', 'my', 'best', 'new', 'mini', 'full', 'travel', 'size', 'set', 'kit']
      if (!commonWords.includes(firstWord.toLowerCase()) && 
          firstWord[0] === firstWord[0].toUpperCase() &&
          firstWord.length > 2) {
        // Looks like it could be a brand
        brand = firstWord
        name = words.slice(1).join(' ')
      }
    }
  }
  
  // Clean up name - remove quotes around shade names but keep the shade
  name = name.replace(/"/g, '').trim()
  
  // If name is empty after extraction, use original
  if (!name) {
    name = fullProductName.replace(/"/g, '').trim()
  }
  
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
      lower.includes('tint') || lower.includes('pencil') || lower.includes('balm') ||
      lower.includes('gloss') || lower.includes('liner') || lower.includes('lash')) {
    return 'makeup'
  }
  
  if (lower.includes('serum') || lower.includes('moisturizer') || lower.includes('cleanser') ||
      lower.includes('toner') || lower.includes('sunscreen') || lower.includes('spf') ||
      lower.includes('retinol') || lower.includes('vitamin c') || lower.includes('mask') ||
      lower.includes('exfoliant') || lower.includes('cream') || lower.includes('lotion') ||
      lower.includes('essence') || lower.includes('ampoule') || lower.includes('oil') ||
      lower.includes('mist') || lower.includes('centella') || lower.includes('hyaluronic') ||
      lower.includes('niacinamide') || lower.includes('aha') || lower.includes('bha')) {
    return 'skincare'
  }
  
  if (lower.includes('shampoo') || lower.includes('conditioner') || lower.includes('hair') ||
      lower.includes('styling') || lower.includes('olaplex') || lower.includes('scalp') ||
      lower.includes('leave-in') || lower.includes('treatment')) {
    return 'haircare'
  }
  
  if (lower.includes('perfume') || lower.includes('fragrance') || lower.includes('cologne') ||
      lower.includes('body mist') || lower.includes('eau de') || lower.includes('parfum')) {
    return 'fragrance'
  }
  
  if (lower.includes('brush') || lower.includes('sponge') || lower.includes('curler') ||
      lower.includes('dryer') || lower.includes('straightener') || lower.includes('dyson') ||
      lower.includes('mirror') || lower.includes('organizer') || lower.includes('device') ||
      lower.includes('roller') || lower.includes('gua sha') || lower.includes('led')) {
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
