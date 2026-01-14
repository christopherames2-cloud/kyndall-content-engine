# Kyndall Site Updates - Phase 1 & 2

This package contains updates to the Sanity CMS schemas for:
1. **Blog Post enhancements** (Feature in Videos, Do Not Include status)
2. **New Article schema** (GEO-optimized SEO content)

---

## 📦 What's Included

### Files to Update/Add in `kyndall-site` repo:

| File | Action | Description |
|------|--------|-------------|
| `sanity/schemas/blogPost.ts` | **REPLACE** | Updated with new fields |
| `sanity/schemas/article.ts` | **NEW** | GEO-optimized article schema |
| `sanity/schemas/index.ts` | **REPLACE** | Includes article export |
| `sanity/structure.ts` | **REPLACE** | Adds "Tips & Trends" to studio |

---

## ✨ New Features

### 1. Blog Post: "Feature in Videos" Toggle

**Field:** `featureInVideos` (boolean)  
**Location:** Media group  
**Purpose:** When enabled, the blog post's thumbnail appears in the homepage Videos section.

```
In Sanity Studio:
📝 Blog Posts → [Your Post] → Media tab → 🎬 Feature in Videos Section ✅
```

**Frontend Query Update Needed:**
```groq
// In your videos section query, add:
*[_type == "blogPost" && status == "published" && featureInVideos == true] | order(publishedAt desc)[0...6] {
  title,
  slug,
  thumbnail,
  thumbnailUrl,
  platform,
  aspectRatio,
  videoUrl
}
```

### 2. Blog Post: "Do Not Include in Blog" Status

**Field:** `status` with new value `hidden`  
**Purpose:** Keep posts in Sanity for reference but hide from public blog listing.

**Status Options:**
- 📝 Draft (`draft`) - Work in progress
- ✅ Published (`published`) - Live on site
- 🚫 Do Not Include in Blog (`hidden`) - Hidden from listings

**Frontend Query Update Needed:**
```groq
// Update blog listing query to exclude hidden posts:
*[_type == "blogPost" && status == "published"] | order(publishedAt desc)
```

### 3. New Article Schema for GEO/SEO

The new `article` schema is specifically designed for AI engine optimization (GEO).

**Key Sections:**

| Section | Purpose | GEO Impact |
|---------|---------|------------|
| FAQ Section | Question/Answer pairs | 🔥 HIGH - AI engines extract these directly |
| Key Takeaways | Quick memorable points | 🔥 HIGH - Perfect for featured snippets |
| Expert Tips | Pro advice from Kyndall | ⭐ MEDIUM - Establishes authority |
| Kyndall's Take | Unique perspective | ⭐ MEDIUM - Differentiates from generic content |
| Related Content | Internal links | ⭐ MEDIUM - SEO juice flow |

**URL Structure:** `/articles/[slug]` (you'll need to create this page)

---

## 🚀 Installation Instructions

### Step 1: Backup Current Files
```bash
cd kyndall-site
cp sanity/schemas/blogPost.ts sanity/schemas/blogPost.ts.backup
cp sanity/schemas/index.ts sanity/schemas/index.ts.backup
cp sanity/structure.ts sanity/structure.ts.backup
```

### Step 2: Copy New Files
Replace/add these files from this package:
- `sanity/schemas/blogPost.ts` → Replace existing
- `sanity/schemas/article.ts` → New file
- `sanity/schemas/index.ts` → Replace existing
- `sanity/structure.ts` → Replace existing

### Step 3: Deploy
```bash
git add .
git commit -m "Add Feature in Videos, Do Not Include status, and Article schema"
git push
```

DigitalOcean will auto-deploy.

### Step 4: Verify in Sanity Studio
1. Go to `https://kyndallames.com/studio`
2. You should see:
   - 📝 Blog Posts (with new status option and video toggle)
   - 📰 Tips & Trends (SEO Articles) ← NEW

---

## 🎨 Frontend Changes Needed

### A. Update Blog Query (exclude hidden posts)

In your blog listing component, update the GROQ query:

```typescript
// Before:
*[_type == "blogPost"] | order(publishedAt desc)

// After:
*[_type == "blogPost" && status == "published"] | order(publishedAt desc)
```

### B. Update Videos Section (include featured blog posts)

```typescript
// Query for videos section that includes blog posts marked as "Feature in Videos"
const videosQuery = `
  *[_type == "blogPost" && status == "published" && featureInVideos == true] | order(publishedAt desc)[0...6] {
    _id,
    title,
    "slug": slug.current,
    thumbnail,
    thumbnailUrl,
    platform,
    aspectRatio,
    videoUrl
  }
`
```

### C. Create Article Page (NEW)

You'll need to create `app/articles/[slug]/page.tsx` with:
- Schema.org Article structured data
- FAQPage schema for the FAQ section
- Related content links
- Social sharing metadata

**Example structured data:**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "...",
  "author": {
    "@type": "Person",
    "name": "Kyndall Ames"
  },
  "mainEntity": {
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "...",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "..."
        }
      }
    ]
  }
}
```

### D. Add Navigation Link

In your nav component, add:
```typescript
<Link href="/articles">Tips & Trends</Link>
```

### E. Optional: Homepage "Trending Now" Section

Add a section showing latest 3 articles:
```typescript
const trendingQuery = `
  *[_type == "article" && status == "published"] | order(publishedAt desc)[0...3] {
    _id,
    title,
    "slug": slug.current,
    excerpt,
    featuredImage,
    category,
    faqSection[0..2]
  }
`
```

---

## 📊 Preview in Sanity Studio

After installation, you'll see these preview indicators:

**Blog Posts:**
- ✅ 🤖 🎬 Post Title - Published, auto-generated, featured in videos
- 📝 🤖 Post Title - Draft, auto-generated
- 🚫 Post Title - Hidden from blog

**Articles:**
- ✅ 🤖 🎵 Article Title - Published, auto-generated from TikTok trend
- 📝 Article Title | 5 FAQs - Draft with FAQ count

---

## 🔜 Phase 3: kyndall-blog-engine

The next phase will create a separate application that:
1. Fetches trending topics from TikTok & YouTube daily at 4am PST
2. Generates 5 draft articles using Claude AI
3. Auto-links to related blog posts
4. Creates drafts in Sanity for Kyndall's review

**Required credentials:**
- TikTok Client Key: `sbaww449c1h77jy01m` ✅
- TikTok Client Secret: `EsGuahUUjUy9pBHevZL9OfdzN5TDkB4m` ✅
- YouTube API: Already configured ✅
- Instagram: Placeholder (future) ⏳

---

## 📝 Notes

- The article schema is designed for GEO (Generative Engine Optimization)
- FAQ sections are critical for AI citation
- Key Takeaways work great for featured snippets
- "Kyndall's Take" adds authenticity and differentiates from AI-generated content

---

Made with 💕 for Kyndall Ames
