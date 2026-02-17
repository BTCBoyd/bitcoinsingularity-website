exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Format email content
    const emailContent = `
🎉 NEW 20M BITCOIN PARTY SUBMISSION

City: ${data.city}
Country: ${data.country}
Venue: ${data.venue || 'Not specified'}
Date/Time: ${data.date}
Organizer: ${data.organizer}
Contact: ${data.contact}
Description: ${data.description || 'No description provided'}

Submitted: ${new Date().toISOString()}

---
Add to map at: https://bitcoinsingularity.ai/btc-20m-countdown.html
    `.trim();

    // Send email using Resend (requires API key in environment)
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (!resendApiKey) {
      // Fallback: Just log it and return success (Boyd can check Netlify logs)
      console.log('PARTY SUBMISSION:', emailContent);
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true,
          message: 'Submission logged (email not configured yet)'
        })
      };
    }

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Bitcoin Singularity <noreply@bitcoinsingularity.ai>',
        to: ['boyd@arcadiab.com'],
        subject: '🎉 New 20M Bitcoin Party Submission',
        text: emailContent
      })
    });

    if (!response.ok) {
      throw new Error('Email send failed');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Party submission error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Submission failed',
        details: error.message
      })
    };
  }
};
