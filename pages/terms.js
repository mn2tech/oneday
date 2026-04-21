import Head from 'next/head';
import Link from 'next/link';

const page = {
  wrap: {
    minHeight: '100vh',
    background: '#0a0a0f',
    color: '#f0f0f5',
    fontFamily: 'Inter, system-ui, sans-serif',
    padding: '32px 20px 64px',
  },
  inner: { maxWidth: 720, margin: '0 auto' },
  back: { display: 'inline-block', marginBottom: 28, color: '#a78bfa', fontSize: '0.9rem', textDecoration: 'none' },
  h1: { fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 },
  updated: { color: '#8888aa', fontSize: '0.85rem', marginBottom: 32 },
  h2: { fontSize: '1.1rem', fontWeight: 700, marginTop: 28, marginBottom: 12, color: '#e4e4ef' },
  p: { color: '#b4b4c8', lineHeight: 1.7, fontSize: '0.9375rem', marginBottom: 14 },
};

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms &amp; Conditions — OneDay</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={page.wrap}>
        <div style={page.inner}>
          <Link href="/" style={page.back}>
            ← Back to OneDay
          </Link>
          <h1 style={page.h1}>Terms &amp; Conditions</h1>
          <p style={page.updated}>Last updated: April 20, 2026</p>

          <p style={page.p}>
            These Terms &amp; Conditions (&quot;Terms&quot;) govern your use of OneDay (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;)
            and the purchase of our event microsite generation service. By paying for or using OneDay, you agree to these Terms.
            If you do not agree, do not complete a purchase.
          </p>

          <h2 style={page.h2}>1. Service</h2>
          <p style={page.p}>
            OneDay provides a one-time, paid service to generate a hosted HTML event page based on the information you provide.
            Features may include RSVP, messaging, polls, and photo uploads as described at the time of purchase. We may update
            how the service is delivered (including infrastructure and third-party providers) without changing the core purpose
            of your purchase.
          </p>

          <h2 style={page.h2}>2. Eligibility &amp; account</h2>
          <p style={page.p}>
            You must provide a valid email address and accurate payment details. You represent that you are authorised to use
            the payment method and that you are at least the age of majority in your jurisdiction.
          </p>

          <h2 style={page.h2}>3. Payment</h2>
          <p style={page.p}>
            Fees are charged once at checkout in the currency shown. Payments are processed by Stripe. You authorise us and
            Stripe to charge your selected payment method for the total amount due. Prices and taxes (if applicable) are as
            displayed before you confirm payment.
          </p>

          <h2 style={page.h2}>4. Intellectual property &amp; content</h2>
          <p style={page.p}>
            You retain rights to content you supply (e.g. text, images you upload). You grant us a licence to use that content
            solely to provide the service. Output generated for your event is provided for your personal or event-related use
            as described on our site. Do not use OneDay to create unlawful, infringing, or harmful content.
          </p>

          <h2 style={page.h2}>5. Acceptable use</h2>
          <p style={page.p}>You agree not to misuse the service, including by attempting to disrupt, scrape, or reverse engineer
            our systems beyond normal use, or to harass others via generated pages or guest features.</p>

          <h2 style={page.h2}>6. Third parties</h2>
          <p style={page.p}>
            We rely on third parties (e.g. hosting, AI providers, email, payment processors). Their terms and availability may
            affect the service. We are not responsible for third-party failures beyond our reasonable control.
          </p>

          <h2 style={page.h2}>7. Disclaimers</h2>
          <p style={page.p}>
            The service is provided &quot;as is&quot; to the maximum extent permitted by law. We do not guarantee uninterrupted
            or error-free operation. AI-generated output may be imperfect; you are responsible for reviewing your event page
            before sharing it.
          </p>

          <h2 style={page.h2}>8. Limitation of liability</h2>
          <p style={page.p}>
            To the maximum extent permitted by law, our total liability arising out of or related to these Terms or the service
            is limited to the amount you paid us for the specific purchase giving rise to the claim. We are not liable for
            indirect, incidental, special, or consequential damages.
          </p>

          <h2 style={page.h2}>9. Refunds</h2>
          <p style={page.p}>
            Because generation begins after payment, all sales are generally final. If something goes wrong on our side after
            a successful charge, contact us and we will work with you in good faith.
          </p>

          <h2 style={page.h2}>10. Changes</h2>
          <p style={page.p}>
            We may update these Terms from time to time. The &quot;Last updated&quot; date will change. Continued use of the
            service after changes constitutes acceptance where permitted by law.
          </p>

          <h2 style={page.h2}>11. Contact</h2>
          <p style={page.p}>
            Questions about these Terms:{' '}
            <a href="mailto:support@oneday.app" style={{ color: '#a78bfa' }}>
              support@oneday.app
            </a>
            .
          </p>

          <p style={{ ...page.p, marginTop: 32, fontSize: '0.8rem', color: '#6b6b80' }}>
            This page is a general template and does not constitute legal advice. Have it reviewed by qualified counsel for your
            jurisdiction and business.
          </p>
        </div>
      </div>
    </>
  );
}
