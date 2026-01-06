// Email Notification Service
// Sends alerts for expiring discount codes and new blog posts

const RESEND_API_URL = 'https://api.resend.com/emails'

export async function sendExpirationEmail(apiKey, codes, toEmail = 'hello@kyndallames.com') {
  if (!apiKey || codes.length === 0) return false
  
  const codesList = codes.map(code => {
    const daysLeft = code.daysUntilExpiration
    const urgency = daysLeft <= 3 ? '🚨 URGENT' : daysLeft <= 7 ? '⚠️ Soon' : '📅 Upcoming'
    const contactInfo = code.brandContact ? `\n   Contact: ${code.brandContact}` : ''
    
    return `${urgency} - ${code.brand}
   Code: ${code.code}
   Expires: ${code.expirationDate} (${daysLeft} days)${contactInfo}`
  }).join('\n\n')

  const htmlList = codes.map(code => {
    const daysLeft = code.daysUntilExpiration
    const color = daysLeft <= 3 ? '#e74c3c' : daysLeft <= 7 ? '#f39c12' : '#3498db'
    const contactInfo = code.brandContact 
      ? `<br><span style="color: #666;">Contact: <a href="mailto:${code.brandContact}">${code.brandContact}</a></span>` 
      : ''
    
    return `
      <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid ${color}; background: #f9f9f9;">
        <strong style="font-size: 16px;">${code.brand}</strong>
        <br>Code: <code style="background: #eee; padding: 2px 6px; border-radius: 3px;">${code.code}</code>
        <br><span style="color: ${color}; font-weight: bold;">Expires: ${code.expirationDate} (${daysLeft} days left)</span>
        ${contactInfo}
      </div>
    `
  }).join('')

  const emailBody = {
    from: 'Kyndall Site <notifications@updates.kyndallames.com>',
    to: toEmail,
    subject: `🏷️ ${codes.length} Discount Code${codes.length > 1 ? 's' : ''} Expiring Soon!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Discount Codes Expiring Soon</h2>
        <p style="color: #666;">The following discount codes need attention:</p>
        ${htmlList}
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px;">
          Reach out to these brands to extend your codes!
          <br>
          <a href="https://kyndallames.com/studio" style="color: #c4a07a;">Manage codes in Sanity Studio →</a>
        </p>
      </div>
    `,
    text: `Discount Codes Expiring Soon\n\n${codesList}\n\nReach out to these brands to extend your codes!\nManage codes: https://kyndallames.com/studio`
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('   Email send failed:', error)
      return false
    }

    console.log(`   ✅ Expiration reminder sent to ${toEmail}`)
    return true
  } catch (error) {
    console.error('   Email error:', error.message)
    return false
  }
}

// Send notification when a new blog post draft is created
export async function sendNewPostEmail(apiKey, post, toEmail = 'hello@kyndallames.com') {
  if (!apiKey || !post) return false
  
  const productCount = post.productLinks?.length || 0
  const productList = post.productLinks?.map(p => `• ${p.brand} - ${p.name}`).join('\n') || 'No products detected'
  
  const htmlProducts = post.productLinks?.map(p => `
    <li style="margin-bottom: 8px;">
      <strong>${p.brand}</strong> - ${p.name}
      ${p.shopmyUrl ? ' ✅ ShopMy' : ' ❓ Needs ShopMy'}
    </li>
  `).join('') || '<li>No products detected</li>'

  const emailBody = {
    from: 'Kyndall Site <notifications@updates.kyndallames.com>',
    to: toEmail,
    subject: `🤖 New Blog Draft Ready for Review: ${post.title}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🤖 New Blog Post Draft</h2>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #333;">${post.title}</h3>
          <p style="color: #666; margin-bottom: 10px;">${post.excerpt || 'No excerpt'}</p>
          <p style="color: #999; font-size: 14px;">
            📁 Category: <strong>${post.category || 'Uncategorized'}</strong><br>
            📺 Source: <strong>${post.platform || 'Unknown'}</strong><br>
            🛍️ Products: <strong>${productCount} found</strong>
          </p>
        </div>
        
        <h4 style="color: #333;">Products to Review:</h4>
        <ul style="color: #666;">
          ${htmlProducts}
        </ul>
        
        <div style="margin-top: 30px;">
          <a href="https://kyndallames.com/studio" 
             style="display: inline-block; background: #c4a07a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Review in Sanity Studio →
          </a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px;">
          <strong>Before publishing:</strong><br>
          1. Review the blog content<br>
          2. Check each product link (ShopMy & Amazon)<br>
          3. Mark products as reviewed<br>
          4. Change status to Published
        </p>
      </div>
    `,
    text: `New Blog Post Draft Ready for Review

Title: ${post.title}
Category: ${post.category || 'Uncategorized'}
Source: ${post.platform || 'Unknown'}

Products Found (${productCount}):
${productList}

Review at: https://kyndallames.com/studio

Before publishing:
1. Review the blog content
2. Check each product link (ShopMy & Amazon)
3. Mark products as reviewed
4. Change status to Published`
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('   New post email failed:', error)
      return false
    }

    console.log(`   ✅ New post notification sent to ${toEmail}`)
    return true
  } catch (error) {
    console.error('   Email error:', error.message)
    return false
  }
}
