// Run the content engine once (for testing)

import { getLatestVideos } from './youtube.js'
import { initClaude, analyzeVideoContent } from './claude.js'
import { searchProducts } from './amazon.js'
import { findOrSuggestLink, fetchExistingLinks } from './shopmy.js'
import { initSanity, checkIfVideoProcessed, createDraftBlogPost } from './sanity.js'

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
  }
}

async function runOnce() {
  console.log('🚀 Running content engine once...\n')
  
  // Initialize
  initClaude(config.anthropic.apiKey)
  initSanity(config.sanity.projectId, config.sanity.dataset, config.sanity.token)
  
  // Fetch videos
  console.log('📺 Fetching YouTube videos...')
  const videos = await getLatestVideos(config.youtube.apiKey, config.youtube.channelId, 3)
  console.log(`Found ${videos.length} videos\n`)
  
  for (const video of videos) {
    console.log(`\n========================================`)
    console.log(`📹 ${video.title}`)
    console.log(`========================================`)
    console.log(`URL: ${video.url}`)
    console.log(`Views: ${video.viewCount}`)
    console.log(`Published: ${video.publishedAt}`)
    
    // Check if processed
    const processed = await checkIfVideoProcessed(video.id)
    if (processed) {
      console.log('⏭️  Already processed')
      continue
    }
    
    // Analyze
    console.log('\n🤖 Analyzing with Claude...')
    const analysis = await analyzeVideoContent(video)
    
    if (analysis) {
      console.log(`Category: ${analysis.category}`)
      console.log(`Products found: ${analysis.products.length}`)
      analysis.products.forEach(p => console.log(`  - ${p.brand} ${p.name}`))
      console.log(`\nSEO Title: ${analysis.seoTitle}`)
      console.log(`Blog Title: ${analysis.blogTitle}`)
    }
    
    // For testing, don't actually create the post
    console.log('\n📝 Would create draft post (skipping in test mode)')
  }
  
  console.log('\n✅ Done!')
}

runOnce().catch(console.error)
