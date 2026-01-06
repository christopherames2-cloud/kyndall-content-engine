// Kyndall Content Engine
// Automatically generates SEO blog posts from social media content
// Posts are created as DRAFTS - must be manually reviewed and published

import cron from 'node-cron'
import http from 'http'
import { getLatestVideos } from './youtube.js'
import { initClaude, analyzeVideoContent } from './claude.js'
import { searchProducts } from './amazon.js'
import { findOrSuggestLink, fetchExistingLinks } from './shopmy.js'
import { 
  initSanity, 
  checkIfVideoProcessed, 
  createDraftBlogPost, 
  getExpiringCodes, 
  markReminderSent,
  getAdminSettings,
  updateAdminStats,
  runCleanup
} from './sanity.js'
import { sendExpirationEmail, sendNewPostEmail } from './email.js'

// Load environment variables
const config = {
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channelId: process.env.YOUTUBE_CHANNEL_ID
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  amazon: {
    associateTag: process.env.AMAZON_ASSOCIATE_TAG
  },
  shopmy: {
    apiToken: process.env.SHOPMY_API_TOKEN
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID || 'f9drkp1w',
    dataset: process.env.SANITY_DATASET || 'production',
    token: process.env.SANITY_API_TOKEN
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 60
}

// Health check server for DigitalOcean
const PORT = process.env.PORT || 8080
let lastRunTime = null

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'kyndall-content-engine',
      lastRun: lastRunTime
    }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(PORT, () => {
  console.log(`🏥 Health check server running on port ${PORT}`)
})

// Validate required config
function validateConfig() {
  const required = [
    ['YOUTUBE_API_KEY', config.youtube.apiKey],
    ['YOUTUBE_CHANNEL_ID', config.youtube.channelId],
    ['ANTHROPIC_API_KEY', config.anthropic.apiKey],
    ['AMAZON_ASSOCIATE_TAG', config.amazon.associateTag],
    ['SANITY_API_TOKEN', config.sanity.token]
  ]
  
  const missing = required.filter(([name, value]) => !value)
  if (missing.length > 0) {
    console.error('Missing required environment variables:')
    missing.forEach(([name]) => console.error(`  - ${name}`))
    process.exit(1)
  }
  
  if (!config.email.resendApiKey) {
    console.log('⚠️  RESEND_API_KEY not set - email notifications disabled')
  }
}

// Check for expiring discount codes
async function checkExpiringCodes(adminSettings) {
  console.log('\n🏷️  Checking for expiring discount codes...')
  
  try {
    const daysAhead = adminSettings?.discountExpirationDays || 14
    const notificationEmail = adminSettings?.notificationEmail || 'hello@kyndallames.com'
    
    const expiringCodes = await getExpiringCodes(daysAhead)
    
    if (expiringCodes.length === 0) {
      console.log('   No codes expiring soon')
      return
    }
    
    console.log(`   Found ${expiringCodes.length} codes expiring in next ${daysAhead} days:`)
    expiringCodes.forEach(code => {
      console.log(`   - ${code.brand}: ${code.code} (${code.daysUntilExpiration} days left)`)
    })
    
    if (config.email.resendApiKey) {
      const emailSent = await sendExpirationEmail(
        config.email.resendApiKey, 
        expiringCodes,
        notificationEmail
      )
      
      if (emailSent) {
        for (const code of expiringCodes) {
          await markReminderSent(code._id)
        }
      }
    }
    
  } catch (error) {
    console.error('   Error checking expiring codes:', error.message)
  }
}

// Main processing function
async function processNewContent() {
  lastRunTime = new Date().toISOString()
  
  console.log('\n========================================')
  console.log(`🔍 Checking for new content - ${lastRunTime}`)
  console.log('========================================\n')
  
  try {
    // Load admin settings
    console.log('📋 Loading admin settings...')
    let adminSettings = {}
    try {
      adminSettings = await getAdminSettings()
      console.log(`   ✓ Settings loaded`)
    } catch (e) {
      console.log('   Using default settings')
    }
    
    const notificationEmail = adminSettings?.notificationEmail || 'hello@kyndallames.com'
    
    // Skip if auto-create is disabled
    if (adminSettings?.autoCreatePosts === false) {
      console.log('   ⏸️  Auto-create posts is disabled in settings')
      return
    }
    
    // 1. Run cleanup tasks
    try {
      await runCleanup()
    } catch (e) {
      console.log('   Cleanup skipped')
    }
    
    // 2. Check expiring discount codes
    await checkExpiringCodes(adminSettings)
    
    // 3. Fetch latest YouTube videos
    console.log('\n📺 Fetching latest YouTube videos...')
    const maxVideos = adminSettings?.maxVideosPerCheck || 5
    const videos = await getLatestVideos(
      config.youtube.apiKey,
      config.youtube.channelId,
      maxVideos
    )
    console.log(`   Found ${videos.length} videos`)
    
    // 4. Pre-fetch ShopMy links
    console.log('🛍️  Fetching ShopMy links...')
    let shopmyLinks = []
    if (config.shopmy.apiToken) {
      shopmyLinks = await fetchExistingLinks(config.shopmy.apiToken)
      console.log(`   Found ${shopmyLinks.length} existing ShopMy links`)
    } else {
      console.log('   ⚠️  No ShopMy token - skipping')
    }
    
    // 5. Process each video
    let postsCreated = 0
    let productsFound = 0
    
    for (const video of videos) {
      console.log(`\n📹 Processing: "${video.title}"`)
      
      const alreadyProcessed = await checkIfVideoProcessed(video.id)
      if (alreadyProcessed) {
        console.log('   ⏭️  Already processed - skipping')
        continue
      }
      
      console.log('   🤖 Analyzing content with Claude...')
      const analysis = await analyzeVideoContent(video)
      if (!analysis) {
        console.log('   ❌ Analysis failed - skipping')
        continue
      }
      console.log(`   ✅ Found ${analysis.products.length} products, Category: ${analysis.category}`)
      
      console.log('   🔗 Finding product links...')
      const productLinks = []
      
      for (const product of analysis.products) {
        console.log(`      - ${product.brand} ${product.name}`)
        
        let shopmyUrl = null
        if (config.shopmy.apiToken) {
          const shopmyResult = await findOrSuggestLink(config.shopmy.apiToken, product)
          if (shopmyResult.found) {
            shopmyUrl = shopmyResult.url
            console.log(`        ✓ Found on ShopMy`)
          } else {
            console.log(`        → Not on ShopMy yet`)
          }
        }
        
        const amazonResult = await searchProducts(product.searchQuery, config.amazon.associateTag)
        
        productLinks.push({
          name: product.name,
          brand: product.brand,
          type: product.type,
          shopmyUrl,
          amazonUrl: amazonResult.searchLink,
          needsShopmy: !shopmyUrl
        })
        
        productsFound++
      }
      
      // CREATE AS DRAFT - NOT PUBLISHED
      console.log('   📝 Creating DRAFT blog post (requires review)...')
      const post = await createDraftBlogPost({
        video,
        analysis,
        productLinks
      })
      
      postsCreated++
      console.log(`   ✅ Created DRAFT: "${post.title}" (ID: ${post._id})`)
      console.log(`   ⚠️  Post is a DRAFT - must be reviewed and published manually!`)
      
      // Send email notification about new draft
      if (config.email.resendApiKey) {
        console.log('   📧 Sending new post notification...')
        await sendNewPostEmail(
          config.email.resendApiKey,
          {
            title: post.title,
            excerpt: analysis.blogExcerpt,
            category: analysis.category,
            platform: video.platform,
            productLinks: productLinks
          },
          notificationEmail
        )
      }
      
      const needsShopmy = productLinks.filter(p => p.needsShopmy)
      if (needsShopmy.length > 0) {
        console.log(`   📌 ${needsShopmy.length} products need ShopMy links`)
      }
    }
    
    // Update stats
    if (postsCreated > 0) {
      try {
        await updateAdminStats({
          lastVideoProcessed: videos[0]?.title,
        })
      } catch (e) {}
    }
    
    console.log('\n✨ Content check complete!')
    console.log(`   Drafts created: ${postsCreated}`)
    console.log(`   Products found: ${productsFound}`)
    if (postsCreated > 0) {
      console.log(`   📧 Review notifications sent to ${notificationEmail}`)
    }
    
  } catch (error) {
    console.error('❌ Error processing content:', error)
  }
}

// Initialize and start
async function main() {
  console.log('🚀 Kyndall Content Engine Starting...\n')
  console.log('📝 NOTE: All posts are created as DRAFTS')
  console.log('   They must be reviewed and published manually in Sanity Studio\n')
  
  validateConfig()
  
  initClaude(config.anthropic.apiKey)
  initSanity(config.sanity.projectId, config.sanity.dataset, config.sanity.token)
  
  console.log('✅ Services initialized')
  
  // Get check interval
  let checkInterval = config.checkInterval
  try {
    const adminSettings = await getAdminSettings()
    checkInterval = adminSettings?.checkIntervalMinutes || checkInterval
  } catch (e) {}
  
  console.log(`⏰ Will check for new content every ${checkInterval} minutes\n`)
  
  // Run immediately on start
  await processNewContent()
  
  // Schedule recurring checks
  const cronExpression = `0 */${checkInterval} * * * *`
  cron.schedule(cronExpression, processNewContent)
  
  console.log('\n🎯 Content engine running. Press Ctrl+C to stop.')
}

main().catch(console.error)
