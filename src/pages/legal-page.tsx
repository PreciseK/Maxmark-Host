import { Link, useParams } from 'react-router-dom'
import { ErrorState } from '@/components/ui/ui-states'

const policies = {
  terms: {
    title: 'Terms of Service',
    sections: [
      ['Service', 'Maxmark Host provides managed hosting and related account services. Service availability, capacity, and included features are determined by the active order and plan shown in your account.'],
      ['Account security', 'You are responsible for maintaining access to your email account, protecting credentials, and promptly reporting suspected unauthorized use.'],
      ['Billing', 'Charges, renewal dates, and taxes are shown before purchase. Failed or overdue payments may result in suspension after applicable notice.'],
      ['Availability', 'Maintenance and events outside reasonable control may affect service. Backups and security controls reduce risk but do not replace your own business-continuity plan.'],
      ['Contact', 'Questions about these terms can be sent to support@maxmark.host.'],
    ],
  },
  'acceptable-use': {
    title: 'Acceptable Use Policy',
    sections: [
      ['Prohibited activity', 'Do not use the service for unlawful content, malware, credential theft, spam, abusive traffic, infringement, unauthorized scanning, or attempts to bypass security or resource controls.'],
      ['Enforcement', 'We may limit or suspend activity that threatens customers, infrastructure, or third parties, and will preserve or disclose records when legally required.'],
      ['Reporting', 'Report suspected abuse to support@maxmark.host with the affected domain and relevant evidence.'],
    ],
  },
  privacy: {
    title: 'Privacy Notice',
    sections: [
      ['Data we use', 'We process account identifiers, contact details, hosting inventory, support messages, security logs, and billing records needed to provide and protect the service. Payment card details are handled by the payment provider and are not stored by Maxmark Host.'],
      ['Purposes', 'Data is used to authenticate users, deliver hosting, process orders, provide support, prevent abuse, meet legal obligations, and improve reliability.'],
      ['Sharing and retention', 'Data is shared only with service providers and authorities as necessary for these purposes. Records are retained for the service relationship and applicable security, tax, dispute, and legal periods.'],
      ['Your choices', 'You may request access, correction, or deletion where applicable by contacting privacy@maxmark.host. Some records must be retained for legal or security reasons.'],
    ],
  },
  cookies: {
    title: 'Cookie Notice',
    sections: [
      ['Essential storage', 'The dashboard uses essential browser storage and authentication tokens to keep you signed in, protect sessions, and remember necessary interface state.'],
      ['Analytics', 'Non-essential analytics or advertising cookies are not enabled by this application. If that changes, this notice and the consent controls will be updated before use.'],
    ],
  },
} as const

export function LegalPage() {
  const { policy = 'terms' } = useParams()
  const content = policies[policy as keyof typeof policies]

  if (!content) {
    return (
      <main className="min-h-screen bg-[#121214] flex items-center justify-center p-6 text-white">
        <ErrorState
          title="Policy Document Not Found"
          message="The legal policy document you requested does not exist or has been moved."
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#121214] px-5 py-12 text-white">
      <article className="mx-auto max-w-3xl space-y-8">
        <Link className="text-sm text-violet-300 hover:text-violet-200" to="/login">← Back to sign in</Link>
        <header>
          <p className="text-sm text-white/50">Last updated July 31, 2026</p>
          <h1 className="mt-2 text-4xl font-semibold">{content.title}</h1>
        </header>
        {content.sections.map(([heading, body]) => (
          <section className="space-y-2" key={heading}>
            <h2 className="text-xl font-semibold">{heading}</h2>
            <p className="leading-7 text-white/70">{body}</p>
          </section>
        ))}
      </article>
    </main>
  )
}
