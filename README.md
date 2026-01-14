🤖 Kyndall Content Engine
Automatically generates SEO-optimized blog posts from Kyndall's YouTube videos.

What It Does
Kyndall posts YouTube video
         ↓
   Engine detects it (hourly)
         ↓
   Claude analyzes content
   - Extracts products mentioned
   - Determines category
   - Writes SEO blog post
         ↓
   Finds affiliate links
   - Checks ShopMy first
   - Falls back to Amazon
         ↓
   Creates DRAFT in Sanity
         ↓
   Kyndall reviews & publishes
Kyndall's Workflow
Post video to YouTube (as normal)
Wait 1 hour (engine runs hourly)
Open Sanity Studio → See new draft posts marked with 🤖
Review the post:
Check category is correct
Verify product links
Add any missing ShopMy links (flagged with ⚠️)
Change status to Published
Done! Post is live on her website
Setup Instructions
1. Get Your API Keys
Service	How to Get
YouTube API	Google Cloud Console → Create project → Enable YouTube Data API v3 → Create credentials
YouTube Channel ID	Go to your YouTube channel → View page source → Search for "channelId"
Claude API	Anthropic Console → API Keys
ShopMy API	Email your account manager or support@shopmy.us
Sanity Write Token	sanity.io/manage → Your project → API → Tokens → Add token (with Write access)
Amazon Associate Tag	Your Amazon Associates tag (like kyndallames-20)
2. Update Sanity Schema
Replace your sanity/schemas/blogPost.ts with the contents of sanity-schema-blogPost.ts from this folder.

This adds:

SEO fields (title, description)
Product links tracking
Auto-generated flag
Better preview in Studio
3. Deploy to DigitalOcean
Option A: As a Worker (Recommended)

Create new App in DigitalOcean
Select your repo
Choose Worker (not Web Service)
Add environment variables (see below)
Deploy
Option B: Add to Existing App

Go to your existing kyndall-site app
Click Create → Create Resources
Add a Worker component
Point to this folder
Add environment variables
4. Set Environment Variables
In DigitalOcean App Settings → Environment Variables:

YOUTUBE_API_KEY=AIza...
YOUTUBE_CHANNEL_ID=UC...
ANTHROPIC_API_KEY=sk-ant-...
AMAZON_ASSOCIATE_TAG=kyndallames-20
SHOPMY_API_TOKEN=your-token (optional)
SANITY_PROJECT_ID=f9drkp1w
SANITY_DATASET=production
SANITY_API_TOKEN=sk...
CHECK_INTERVAL_MINUTES=60
Local Development
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env with your values

# Run once (for testing)
npm run run-once

# Run continuously
npm start
What Gets Created
Each draft blog post includes:

SEO Title - Optimized for search (60 chars)
SEO Description - Meta description (155 chars)
Blog Content - Full article with product mentions
Product Links:
✓ ShopMy link (if found)
✓ Amazon affiliate link
⚠️ Flag if needs ShopMy link
Source Info:
Platform (YouTube/TikTok/IG)
Original video link
View count
Category - Auto-suggested (Kyndall can change)
Troubleshooting
Engine not detecting new videos?

Check YouTube API key is valid
Verify Channel ID is correct
Look at logs in DigitalOcean
Products not found on ShopMy?

These are flagged with ⚠️ in Sanity
Kyndall can add to ShopMy, then update the post
Posts not showing on site?

Check status is "Published" (not Draft)
Wait 60 seconds for cache refresh
Future Enhancements
 TikTok integration (when API available)
 Instagram integration
 Auto-add products to ShopMy
 Thumbnail auto-upload to Sanity
 Slack notifications for new drafts
Built with 💕 for Kyndall Ames
