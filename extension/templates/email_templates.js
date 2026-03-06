// templates/email_templates.js
// HTML email templates for outreach, follow-up, and monthly report

/**
 * Initial outreach email template.
 * @param {string} authorName
 * @param {string} postUrl
 * @returns {string} HTML
 */
export function getOutreachTemplate(authorName, postUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oil & Gas Opportunities in UAE</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0077B5; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Kushi Consultancy</h1>
    <p style="color: #B0D4E8; margin: 5px 0 0;">Oil & Gas Recruitment Specialists</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear <strong>${escapeHtml(authorName)}</strong>,</p>

    <p>I came across your recent LinkedIn post regarding
    <strong>UAE job positions in Oil &amp; Gas (Onshore/Offshore)</strong>
    and felt compelled to reach out.</p>

    <p>We at <strong>Kushi Consultancy</strong> are a specialized recruitment firm with deep expertise
    in connecting qualified professionals with leading operators and EPC contractors across the UAE
    energy sector.</p>

    <p>Whether you are looking to hire top talent or seeking exciting new opportunities in:</p>
    <ul style="color: #555;">
      <li>Onshore / Offshore Operations</li>
      <li>Drilling & Completions</li>
      <li>Process & Instrumentation Engineering</li>
      <li>HSE & Maintenance</li>
    </ul>

    <p>…we would love to connect and explore how we can be of assistance.</p>

    <div style="background: #e8f4fb; padding: 15px; border-left: 4px solid #0077B5; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px;">
        📌 Reference Post:
        <a href="${escapeHtml(postUrl)}" style="color: #0077B5;">View on LinkedIn</a>
      </p>
    </div>

    <p>Please feel free to reply to this email or connect with us directly. We look forward to hearing from you.</p>

    <p>Best Regards,<br/>
    <strong>Kushi Consultancy Team</strong><br/>
    <a href="mailto:madhu@kushiconsultancy.com" style="color: #0077B5;">madhu@kushiconsultancy.com</a>
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #aaa; margin-top: 10px;">
    You are receiving this because your LinkedIn post matched our UAE Oil &amp; Gas search criteria.
    To unsubscribe, simply reply with "Unsubscribe".
  </p>
</body>
</html>`;
}

/**
 * Follow-up email template sent after no response.
 * @param {string} authorName
 * @param {string} originalSentDate - formatted date string
 * @param {number} followupCount - which follow-up number this is
 * @returns {string} HTML
 */
export function getFollowUpTemplate(authorName, originalSentDate, followupCount = 1) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Follow-Up: Oil & Gas Opportunities in UAE</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0077B5; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">Kushi Consultancy</h1>
    <p style="color: #B0D4E8; margin: 5px 0 0;">Follow-Up #${followupCount}</p>
  </div>
  <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p>Dear <strong>${escapeHtml(authorName)}</strong>,</p>

    <p>I hope this message finds you well. This is a gentle follow-up to our email sent on
    <strong>${escapeHtml(originalSentDate)}</strong> regarding UAE Oil &amp; Gas opportunities.</p>

    <p>We understand you may be busy, and we simply wanted to ensure our message reached you.
    Our team at <strong>Kushi Consultancy</strong> continues to actively work with top employers
    in the UAE energy sector.</p>

    <p>If you have any questions or would like to discuss further, please do not hesitate to reply
    to this email. We are happy to connect at a time convenient for you.</p>

    <p>Best Regards,<br/>
    <strong>Kushi Consultancy Team</strong><br/>
    <a href="mailto:madhu@kushiconsultancy.com" style="color: #0077B5;">madhu@kushiconsultancy.com</a>
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #aaa; margin-top: 10px;">
    To unsubscribe from future follow-ups, reply with "Unsubscribe".
  </p>
</body>
</html>`;
}

/**
 * Monthly report email template.
 * @param {object} reportData
 * @returns {string} HTML
 */
export function getMonthlyReportTemplate(reportData) {
  const {
    month, year, totalPosts, postsWithEmail, postsWithoutEmail,
    emailsSent, emailsFailed, repliesReceived, followupsSent
  } = reportData;

  const successRate = emailsSent > 0 ? Math.round((repliesReceived / emailsSent) * 100) : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Monthly LinkedIn Outreach Report – ${escapeHtml(month)} ${year}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <div style="background: #0077B5; padding: 25px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Monthly Outreach Report</h1>
    <p style="color: #B0D4E8; margin: 5px 0 0; font-size: 16px;">${escapeHtml(month)} ${year}</p>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">

    <h2 style="color: #0077B5; border-bottom: 2px solid #0077B5; padding-bottom: 8px;">Summary</h2>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
      <thead>
        <tr style="background: #0077B5; color: white;">
          <th style="padding: 12px; text-align: left; border-radius: 4px 0 0 0;">Metric</th>
          <th style="padding: 12px; text-align: center; border-radius: 0 4px 0 0;">Count</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background: #f9f9f9;">
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Total Posts Scraped</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; font-weight: bold;">${totalPosts}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Posts with Email</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; color: #27ae60; font-weight: bold;">${postsWithEmail}</td>
        </tr>
        <tr style="background: #f9f9f9;">
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Posts without Email</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; color: #e67e22; font-weight: bold;">${postsWithoutEmail}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Emails Sent Successfully</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; color: #27ae60; font-weight: bold;">${emailsSent}</td>
        </tr>
        <tr style="background: #f9f9f9;">
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Emails Failed</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; color: #e74c3c; font-weight: bold;">${emailsFailed}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">Replies Received (Acknowledged)</td>
          <td style="padding: 12px; text-align: center; border-bottom: 1px solid #e0e0e0; color: #2980b9; font-weight: bold;">${repliesReceived}</td>
        </tr>
        <tr style="background: #f9f9f9;">
          <td style="padding: 12px;">Follow-up Emails Sent</td>
          <td style="padding: 12px; text-align: center; font-weight: bold;">${followupsSent}</td>
        </tr>
      </tbody>
    </table>

    <div style="background: #e8f4fb; padding: 15px; border-radius: 8px; text-align: center;">
      <p style="margin: 0; font-size: 18px; color: #0077B5;">
        Response Rate: <strong>${successRate}%</strong>
      </p>
    </div>

    <p style="margin-top: 25px; color: #666; font-size: 13px;">
      This report was automatically generated by the LinkedIn Data Feed Generator Chrome Extension.
      Generated on: ${new Date().toLocaleString("en-GB")}
    </p>
  </div>
</body>
</html>`;
}

/**
 * Escapes HTML special characters to prevent XSS in templates.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
