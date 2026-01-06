// Email Notification Service
// Sends alerts for expiring discount codes

// Using Resend for email - free tier allows 100 emails/day
// Sign up at resend.com and get an API key

const RESEND_API_URL = 'https://api.resend.com/emails'

export async function sendExpirationEmail(apiKey, codes) {
  if (!apiKey || codes.length === 0) return false
  
  // Build the email content
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
    to: 'hello@kyndallames.com',
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

    console.log(`   ✅ Expiration reminder sent to hello@kyndallames.com`)
    return true
  } catch (error) {
    console.error('   Email error:', error.message)
    return false
  }
}

// Alternative: Use SMTP (Gmail, etc.) with nodemailer
// You would need to add nodemailer to package.json
export async function sendExpirationEmailSMTP(smtpConfig, codes) {
  // This is a placeholder - would need nodemailer installed
  // const nodemailer = require('nodemailer')
  // const transporter = nodemailer.createTransport(smtpConfig)
  // await transporter.sendMail({...})
  console.log('   SMTP email not configured')
  return false
}
