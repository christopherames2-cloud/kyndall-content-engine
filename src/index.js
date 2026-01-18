// src/index.js
// Kyndall Content Engine
// Automatically generates SEO blog posts from social media content
// Supports: YouTube + TikTok
// Posts are created as DRAFTS - must be manually reviewed and published
// NOW INCLUDES: Automatic GEO content migration for existing posts

import cron from 'node-cron'
import http from 'http'
import { getLatestVideos } from './youtube.js'
import { getLatestTikTokVideos, initTikTokSanity, getTikTokStatus } from './tiktok.js'
import { initClaude, analyzeVideoContent } from './claude.js'
import { 
  initSanity, 
  checkIfVideoProcessed, 
  createDraftBlogPost, 
  getExpiringCodes, 
  markReminderSent,
  getAdminSettings,
  runCleanup,
  getSanityClient
} from './sanity.js'
import { sendExpirationEmail, sendNewPostEmail } from './email.js'
import { initGeoMigration, runGeoMigration } from './geo-migrate.js'

// Load environment variables
const config = {
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channelId: process.env.YOUTUBE_CHANNEL_ID
  },
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  amazon: {
    associateTag: process.env.AMAZON_ASSOCIATE_TAG || 'kyndallames09-20'
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID || 'f9drkp1w',
    dataset: process.env.SANITY_DATASET || 'production',
    token: process.env.SANITY_API_TOKEN
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 60,
  // On first run, fetch ALL videos. After that, just check for new ones.
  maxVideosFirstRun: parseInt(process.env.MAX_VIDEOS_FIRST_RUN) || 50,
  maxVideosRegular: parseInt(process.env.MAX_VIDEOS_REGULAR) || 10,
  // GEO migration settings
  geoMigrationEnabled: process.env.GEO_MIGRATION_ENABLED !== 'false', // enabled by default
  geoMigrationBatchSize: parseInt(process.env.GEO_MIGRATION_BATCH_SIZE) || 5
}

// Track first run
let isFirstRun = true

// Stats
const stats = {
  startTime: new Date(),
  totalProcessed: 0,
  totalSkipped: 0,
  youtubeProcessed: 0,
  tiktokProcessed: 0,
  geoMigrated: 0,
  geoErrors: 0
}

// Basic validation
function validateConfig() {
  const required = [
    ['YOUTUBE_API_KEY', config.youtube.apiKey],
    ['YOUTUBE_CHANNEL_ID', config.youtube.channelId],
    ['ANTHROPIC_API_KEY', config.anthropic.apiKey],
    ['SANITY_API_TOKEN', config.sanity.token]
  ]
  
  const missing = required.filter(([name, value]) => !value)
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach(([name]) => console.error(`   - ${name}`))
    process.exit(1)
  }
  
  // TikTok is optional - just log status
  if (!config.tiktok.clientKey || !config.tiktok.clientSecret) {
    console.log('⚠️  TikTok credentials not configured - TikTok import disabled')
    console.log('   Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to enable')
  }
}

// Health check server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      stats
    }))
  } else if (req.url === '/geo-migrate' && req.method === 'POST') {
    // Manual trigger for GEO migration
    console.log('🎯 Manual GEO migration triggered via HTTP')
    runGeoMigration(config.geoMigrationBatchSize).then(result => {
      stats.geoMigrated += result.updated
      stats.geoErrors += result.errors
    })
    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'GEO migration started' }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(process.env.PORT || 8080, () => {
  console.log(`🏥 Health check server on port ${process.env.PORT || 8080}`)
})

// Check expiring discount codes
async function checkExpiringCodes(adminSettings) {
  try {
    const expiringCodes = await getExpiringCodes(7)
    
    if (expiringCodes.length > 0 && config.email.resendApiKey) {
      console.log(`\n⚠️  Found ${expiringCodes.length} discount codes expiring soon`)
      
      for (const code of expiringCodes) {
        if (!code.reminderSent) {
          const notificationEmail = adminSettings?.notificationEmail || 'hello@kyndallames.com'
          await sendExpirationEmail(config.email.resendApiKey, code, notificationEmail)
          await markReminderSent(code._id)
          console.log(`   📧 Sent reminder for ${code.brand} (expires ${code.expiresAt})`)
        }
      }
    }
  } catch (error) {
    console.log('   Could not check expiring codes:', error.message)
  }
}

// Main processing function
async function processNewContent() {
  console.log('\n========================================')
  console.log(`🔍 ${isFirstRun ? 'FIRST RUN (fetching all videos)' : 'Regular check'}`)
  console.log('========================================\n')
  
  try {
    // Load admin settings
    let adminSettings = {}
    try {
      adminSettings = await getAdminSettings()
    } catch (e) {}
    
    const notificationEmail = adminSettings?.notificationEmail || 'hello@kyndallames.com'
    
    // 1. Check expiring discount codes
    await checkExpiringCodes(adminSettings)
    
    // 2. Run cleanup of old data
    await runCleanup()
    
    // 3. Fetch videos from all sources
    const maxVideos = isFirstRun ? config.maxVideosFirstRun : config.maxVideosRegular
    const allVideos = []
    
    // --- YouTube ---
    console.log(`\n📺 Fetching up to ${maxVideos} YouTube videos...`)
    try {
      const youtubeVideos = await getLatestVideos(
        config.youtube.apiKey,
        config.youtube.channelId,
        maxVideos
      )
      console.log(`   Found ${youtubeVideos.length} YouTube videos`)
      allVideos.push(...youtubeVideos)
    } catch (error) {
      console.log(`   ❌ YouTube error: ${error.message}`)
    }
    
    // --- TikTok ---
    let tiktokVideos = []
    if (config.tiktok.clientKey && config.tiktok.clientSecret) {
      console.log(`\n🎵 Fetching up to ${maxVideos} TikTok videos...`)
      
      // Check TikTok connection status first
      const tiktokStatus = await getTikTokStatus()
      
      if (tiktokStatus.connected) {
        try {
          const tiktokVideos = await getLatestTikTokVideos(maxVideos)
          console.log(`   Found ${tiktokVideos.length} TikTok videos`)
          allVideos.push(...tiktokVideos)
        } catch (error) {
          console.log(`   ❌ TikTok error: ${error.message}`)
        }
      } else {
        console.log(`   ⚠️ ${tiktokStatus.message}`)
        if (tiktokStatus.expired) {
          console.log('      Reconnect at: https://kyndallames.com/admin/tiktok')
        }
      }
    }
    
    console.log(`\n📊 Total videos to process: ${allVideos.length}`)
    
    // Sort by publish date (newest first)
    allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    
    if (allVideos.length === 0) {
      console.log('\n📭 No videos found to process')
      isFirstRun = false
      
      // Still run GEO migration even if no new videos
      if (config.geoMigrationEnabled) {
        const geoResult = await runGeoMigration(config.geoMigrationBatchSize)
        stats.geoMigrated += geoResult.updated
        stats.geoErrors += geoResult.errors
      }
      return
    }
    
    // 4. Process each video
    let postsCreated = 0
    let postsSkipped = 0
    let totalProducts = 0
    let shopmyLinks = 0
    let amazonLinks = 0
    let youtubeCount = 0
    let tiktokCount = 0
    
    for (const video of allVideos) {
      const platformIcon = video.platform === 'tiktok' ? '🎵' : '📺'
      console.log(`\n${platformIcon} Processing: "${video.title}"`)
      console.log(`   Platform: ${video.platform}`)
      
      const alreadyProcessed = await checkIfVideoProcessed(video.id)
      if (alreadyProcessed) {
        console.log('   ⏭️  Already processed - skipping')
        postsSkipped++
        continue
      }
      
      // Analyze video with Claude
      console.log('   🤖 Analyzing content with Claude...')
      const analysis = await analyzeVideoContent(video)
      if (!analysis) {
        console.log('   ❌ Analysis failed - skipping')
        continue
      }
      
      const productLinks = analysis.products || []
      console.log(`   ✅ Category: ${analysis.category}, Products: ${productLinks.length}`)
      
      // Count link types
      const withShopmy = productLinks.filter(p => p.shopmyUrl).length
      const withAmazon = productLinks.filter(p => p.amazonUrl).length
      if (productLinks.length > 0) {
        console.log(`      🛍️  ${withShopmy} ShopMy, 📦 ${withAmazon} Amazon`)
      }
      
      // Create draft blog post
      console.log('   📝 Creating DRAFT blog post...')
      const post = await createDraftBlogPost({
        video,
        analysis,
        productLinks
      })
      
      postsCreated++
      totalProducts += productLinks.length
      shopmyLinks += withShopmy
      amazonLinks += withAmazon
      
      // Track by platform
      if (video.platform === 'tiktok') {
        tiktokCount++
      } else {
        youtubeCount++
      }
      
      console.log(`   ✅ Created DRAFT: "${post.title}"`)
      
      // Send email notification about new draft (not on first run)
      if (config.email.resendApiKey && !isFirstRun) {
        console.log('   📧 Sending notification...')
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
      
      // Small delay between processing to avoid rate limits
      if (allVideos.length > 5) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    // Update stats
    stats.totalProcessed += postsCreated
    stats.totalSkipped += postsSkipped
    stats.youtubeProcessed += youtubeCount
    stats.tiktokProcessed += tiktokCount
    
    console.log('\n✨ Content check complete!')
    console.log(`   Videos found: ${allVideos.length} (📺 YouTube: ${allVideos.filter(v => v.platform !== 'tiktok').length}, 🎵 TikTok: ${allVideos.filter(v => v.platform === 'tiktok').length})`)
    console.log(`   Already processed: ${postsSkipped}`)
    console.log(`   New drafts created: ${postsCreated} (📺 ${youtubeCount}, 🎵 ${tiktokCount})`)
    console.log(`   Products found: ${totalProducts}`)
    console.log(`   🛍️  ShopMy links: ${shopmyLinks}`)
    console.log(`   📦 Amazon links: ${amazonLinks}`)
    
    if (isFirstRun && postsCreated > 0) {
      console.log(`\n📧 First run complete - ${postsCreated} new drafts ready for review`)
    }
    
    // 5. Run GEO migration for existing posts (after processing new content)
    if (config.geoMigrationEnabled) {
      const geoResult = await runGeoMigration(config.geoMigrationBatchSize)
      stats.geoMigrated += geoResult.updated
      stats.geoErrors += geoResult.errors
    }
    
    // Mark first run as complete
    isFirstRun = false
    
  } catch (error) {
    console.error('❌ Error processing content:', error)
  }
}

// Initialize and start
async function main() {
  console.log('🚀 Kyndall Content Engine Starting...\n')
  console.log('📝 All posts are created as DRAFTS')
  console.log('🛍️  Products extracted from video descriptions')
  console.log('💰 Amazon links get affiliate tag automatically')
  console.log(`📺 YouTube: Enabled`)
  console.log(`🎵 TikTok: ${config.tiktok.clientKey ? 'Enabled (if connected)' : 'Disabled (no credentials)'}`)
  console.log(`🎯 GEO Migration: ${config.geoMigrationEnabled ? 'Enabled' : 'Disabled'}`)
  console.log(`📺 First run will fetch up to ${config.maxVideosFirstRun} videos per platform\n`)
  
  validateConfig()
  
  // Initialize services
  initClaude(config.anthropic.apiKey, config.amazon.associateTag)
  initSanity(config.sanity.projectId, config.sanity.dataset, config.sanity.token)
  
  // Initialize TikTok with Sanity client (for token storage)
  initTikTokSanity(config.sanity.projectId, config.sanity.dataset, config.sanity.token)
  
  // Initialize GEO migration with the Sanity client
  if (config.geoMigrationEnabled) {
    const sanityClientInstance = getSanityClient()
    initGeoMigration(config.anthropic.apiKey, sanityClientInstance)
  }
  
  console.log('✅ Services initialized')
  
  // Get check interval from admin settings
  let checkInterval = config.checkInterval
  try {
    const adminSettings = await getAdminSettings()
    checkInterval = adminSettings?.checkIntervalMinutes || checkInterval
  } catch (e) {}
  
  console.log(`⏰ After first run, checking every ${checkInterval} minutes\n`)
  
  // Run immediately on start (first run)
  await processNewContent()
  
  // Schedule recurring checks
  const cronExpression = `0 */${checkInterval} * * * *`
  cron.schedule(cronExpression, processNewContent)
  
  console.log('\n🎯 Content engine running.')
  console.log('   New YouTube videos → Draft blog posts')
  console.log('   New TikTok videos → Draft blog posts')
  console.log('   Existing posts → GEO content migration')
  console.log('   Kyndall reviews and publishes in Sanity Studio')
}

main().catch(console.error)
