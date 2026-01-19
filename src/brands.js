// kyndall-content-engine/src/brands.js
// Centralized brand management - fetches from Sanity with hardcoded fallback
// 
// USAGE:
//   import { getBrands, refreshBrands } from './brands.js'
//   const brands = await getBrands()  // Returns array of brand names + aliases
//
// BENEFITS:
// - Kyndall can add/edit brands in Sanity Studio without code changes
// - Aliases handled automatically (e.g., "e.l.f." and "elf" both map to "e.l.f.")
// - Cached in memory - only refreshes every 30 minutes
// - Falls back to hardcoded list if Sanity is unavailable

import { createClient } from '@sanity/client'

let sanityClient = null
let cachedBrands = null
let lastFetchTime = null
const CACHE_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// Initialize with Sanity credentials
export function initBrands(projectId, dataset, token) {
  sanityClient = createClient({
    projectId,
    dataset,
    token,
    apiVersion: '2024-01-01',
    useCdn: true, // Use CDN for faster reads
  })
  console.log('   ✓ Brands module initialized')
}

// Force refresh brands from Sanity
export async function refreshBrands() {
  cachedBrands = null
  lastFetchTime = null
  return getBrands()
}

// Get all brand names (including aliases), sorted by length for matching
export async function getBrands() {
  // Check cache
  if (cachedBrands && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION_MS)) {
    return cachedBrands
  }
  
  // Try to fetch from Sanity
  if (sanityClient) {
    try {
      console.log('   📦 Fetching brands from Sanity...')
      const brands = await sanityClient.fetch(`
        *[_type == "beautyBrand" && isActive == true] {
          name,
          aliases
        }
      `)
      
      if (brands && brands.length > 0) {
        // Flatten to array of all brand names + aliases
        const allNames = []
        for (const brand of brands) {
          if (brand.name) allNames.push(brand.name)
          if (brand.aliases && Array.isArray(brand.aliases)) {
            allNames.push(...brand.aliases.filter(a => a))
          }
        }
        
        // Sort by length (longest first) for proper matching
        cachedBrands = [...new Set(allNames)].sort((a, b) => b.length - a.length)
        lastFetchTime = Date.now()
        
        console.log(`   ✓ Loaded ${brands.length} brands (${cachedBrands.length} names/aliases) from Sanity`)
        return cachedBrands
      }
    } catch (error) {
      console.log(`   ⚠️ Could not fetch brands from Sanity: ${error.message}`)
      console.log('   Using fallback brand list...')
    }
  }
  
  // Fallback to hardcoded list
  cachedBrands = FALLBACK_BRANDS
  lastFetchTime = Date.now()
  console.log(`   ℹ️ Using fallback brand list (${cachedBrands.length} brands)`)
  return cachedBrands
}

// Get brand info (for looking up the canonical name from an alias)
export async function getBrandInfo(brandName) {
  if (!sanityClient) return null
  
  try {
    const brand = await sanityClient.fetch(`
      *[_type == "beautyBrand" && isActive == true && (
        name == $name || 
        $name in aliases
      )][0] {
        name,
        category,
        aliases
      }
    `, { name: brandName })
    
    return brand
  } catch {
    return null
  }
}

// ============================================================
// FALLBACK BRAND LIST
// Used when Sanity is unavailable or brands haven't been migrated yet
// Sorted by length (longest first) for proper regex matching
// ============================================================
const FALLBACK_BRANDS = [
  // === MAKEUP (longest names first) ===
  'Anastasia Beverly Hills',
  'Makeup By Mario',
  'Pat McGrath Labs',
  'Benefit Cosmetics',
  'Giorgio Armani',
  'Yves Saint Laurent',
  'Charlotte Tilbury',
  'Kylie Cosmetics',
  'Estée Lauder',
  'Estee Lauder',
  'Laura Mercier',
  'Natasha Denona',
  'Lunar Beauty',
  'Urban Decay',
  'Fenty Beauty',
  'Huda Beauty',
  'Rare Beauty',
  'Pat McGrath',
  'Bobbi Brown',
  'Milk Makeup',
  'Too Faced',
  'ColourPop',
  'Colourpop',
  'BH Cosmetics',
  'NYX Professional',
  'Tower 28',
  'TOWER 28',
  'Hourglass',
  'Smashbox',
  'Maybelline',
  'Glossier',
  'Benefit',
  'CoverGirl',
  'Clinique',
  'Lancôme',
  'Lancome',
  'Revlon',
  'Morphe',
  'Chanel',
  'Armani',
  'Tarte',
  'Kylie',
  'Fenty',
  'Kosas',
  'Merit',
  'e.l.f.',
  'E.L.F.',
  'NARS',
  'Dior',
  'Saie',
  'Ilia',
  'ILIA',
  'MAC',
  'YSL',
  'elf',
  'ELF',
  'NYX',
  'ABH',
  'PMG',
  'CT',

  // === SKINCARE ===
  'Youth To The People',
  'Peter Thomas Roth',
  'Augustinus Bader',
  'Dr. Dennis Gross',
  'First Aid Beauty',
  "Paula's Choice",
  'Paula Choice',
  'La Roche-Posay',
  'Drunk Elephant',
  'Good Molecules',
  'IT Cosmetics',
  'Alpyn Beauty',
  'The Ordinary',
  'Sunday Riley',
  'Glow Recipe',
  'Dermalogica',
  'Skin Smart',
  'SkinSmart',
  'Neutrogena',
  'Touchland',
  'Supergoop',
  'Herbivore',
  'Timeless',
  "Kiehl's",
  'Kiehls',
  'Farmacy',
  'Origins',
  'Cetaphil',
  'Bioderma',
  'CeraVe',
  'Tatcha',
  'La Mer',
  'Yepoda',
  'Versed',
  'Avène',
  'Avene',
  'Fresh',
  'Bliss',
  'Vichy',
  'SK-II',
  'SKII',
  'Pixi',
  'YTTP',
  'FAB',

  // === K-BEAUTY ===
  'Beauty of Joseon',
  'Thank You Farmer',
  'Holika Holika',
  'Nature Republic',
  'Pyunkang Yul',
  'By Wishtrend',
  'Etude House',
  'Peach & Lily',
  'Tony Moly',
  'TONYMOLY',
  'Round Lab',
  'Some By Mi',
  "Dr. Jart+",
  'Dr. Jart',
  'Dr Jart',
  'Banila Co',
  'Innisfree',
  'Torriden',
  'SKIN1004',
  'Mediheal',
  'Peripera',
  'Heimish',
  'Isntree',
  'Dasique',
  'LANEIGE',
  'Laneige',
  "Rom&nd",
  'Romand',
  'TirTir',
  'TIRTIR',
  'Missha',
  'Klairs',
  'Goodal',
  'Purito',
  'COSRX',
  'Cosrx',
  'Etude',
  'Benton',
  'Clio',
  'CLIO',
  'Anua',

  // === HAIRCARE ===
  'Bumble and bumble',
  'Bumble & Bumble',
  'Pattern Beauty',
  'SheaMoisture',
  'Shea Moisture',
  'Living Proof',
  'Moroccanoil',
  'Moroccan Oil',
  'Kérastase',
  'Kerastase',
  'Pureology',
  'Color Wow',
  'DevaCurl',
  'Briogeo',
  'Olaplex',
  'Redken',
  'Got2b',
  'GOT2B',
  'got2b',
  'Pattern',
  'Gisou',
  'Amika',
  'Dyson',
  'Ouai',
  'OUAI',
  'Verb',
  'Dae',
  'IGK',
  'JVN',

  // === BODY CARE ===
  'Brazilian Bum Bum',
  'Being Frenshe',
  'Sol de Janeiro',
  'Summer Fridays',
  "Dr. Teal's",
  "Dr Teal's",
  'Dr Teals',
  'Nécessaire',
  'Necessaire',
  'Tree Hut',
  'Aquaphor',
  'Eucerin',
  'Kopari',
  'Nivea',
  'Dove',

  // === FRAGRANCE ===
  'Maison Margiela',
  'Jo Malone',
  'Diptyque',
  'Tom Ford',
  'Replica',
  'Le Labo',
  'Versace',
  'Byredo',
  'Gucci',
  'Prada',

  // === WELLNESS/OTHER ===
  "L'Oréal",
  "L'Oreal",
  'Loreal',
  'Neilmed',
  'NeilMed',
  "O'Sulloc",
  'Osulloc',
  'Patrick Ta',
  'Aveeno',
  'Lumify',
  'Sante',
  'Rhode',

  // Special handling for brands that commonly appear without proper casing
  "Juvia's Place",
  'Make Up For Ever',
  'MUFE',
].sort((a, b) => b.length - a.length)

export default {
  initBrands,
  getBrands,
  refreshBrands,
  getBrandInfo,
}
