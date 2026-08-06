import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

interface SendEmailRequest {
  type?: 'auth_otp' | 'site_provisioned' | 'invoice_paid' | 'support_reply' | 'generic'
  to: string
  subject?: string
  data?: {
    code?: string
    domain?: string
    invoiceId?: string
    amount?: string
    ticketSubject?: string
    message?: string
    htmlContent?: string
  }
}

function getAuthOtpTemplate(code: string): { subject: string; html: string } {
  return {
    subject: `${code} is your Maxmark Host verification code`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Maxmark Host Verification</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="500" border="0" cellspacing="0" cellpadding="0" style="max-width: 500px; background-color: #121214; border: 1px solid #232328; border-radius: 16px; padding: 32px;">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Maxmark Host</h2>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 16px;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff; text-align: center;">Verification Code</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 24px; color: #a1a1aa; font-size: 14px; line-height: 1.5; text-align: center;">
                    Enter the following 6-digit code to sign in to your Maxmark Host account.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="background-color: #1a1a1e; border: 1px solid #3f3f46; border-radius: 12px; padding: 16px 24px; font-family: monospace; font-size: 32px; font-weight: 700; color: #a89cf7; letter-spacing: 8px;">
                      ${code}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="color: #71717a; font-size: 12px; line-height: 1.5; text-align: center;">
                    If you didn't request this code, you can safely ignore this email.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  }
}

function getSiteProvisionedTemplate(domain: string): { subject: string; html: string } {
  return {
    subject: `Your WordPress site ${domain} is live!`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="background-color: #09090b; color: #ffffff; font-family: sans-serif; padding: 40px;">
        <div style="max-width: 500px; margin: 0 auto; background: #121214; border: 1px solid #232328; border-radius: 16px; padding: 32px;">
          <h2 style="color: #5c4df0;">Maxmark Host</h2>
          <h1>Your site is ready!</h1>
          <p style="color: #a1a1aa;">We've provisioned your new WordPress site on high-performance cPanel infrastructure.</p>
          <div style="background: #1a1a1e; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <strong>Domain:</strong> ${domain}<br>
            <strong>Status:</strong> Active & Encrypted (AutoSSL)
          </div>
          <a href="https://${domain}" style="display: inline-block; background: #5c4df0; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold;">Visit Site</a>
        </div>
      </body>
      </html>
    `,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'Maxmark Host <noreply@maxmark.com.ng>'

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment secret is not configured.')
    }

    const payload: SendEmailRequest = await req.json()
    const { to, type = 'generic', data, subject: customSubject } = payload

    if (!to) {
      return new Response(JSON.stringify({ error: 'Missing "to" email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let subject = customSubject || 'Notification from Maxmark Host'
    let html = data?.htmlContent || `<p>${data?.message || 'Hello from Maxmark Host'}</p>`

    if (type === 'auth_otp' && data?.code) {
      const templated = getAuthOtpTemplate(data.code)
      subject = templated.subject
      html = templated.html
    } else if (type === 'site_provisioned' && data?.domain) {
      const templated = getSiteProvisionedTemplate(data.domain)
      subject = templated.subject
      html = templated.html
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
      }),
    })

    const result = await resendResponse.json()

    if (!resendResponse.ok) {
      throw new Error(result.message || `Resend API failed with status ${resendResponse.status}`)
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Send email failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
