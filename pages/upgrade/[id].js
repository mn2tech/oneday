import { useState } from 'react';
import Head from 'next/head';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';

let stripePromise = null;
function getStripePromise() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.startsWith('pk_test_...') || key === 'undefined') return null;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

const CARD_OPTIONS = {
  style: {
    base: {
      color: '#f0f0f5',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      '::placeholder': { color: '#8888aa' },
    },
    invalid: { color: '#f43f5e' },
  },
};

function UpgradeForm({ eventId, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError('');

    try {
      // Create payment intent for $14 upgrade
      const piRes = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'standard', email: 'upgrade@oneday.app' }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) { setError(piData.error || 'Payment failed.'); setLoading(false); return; }

      const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(
        piData.clientSecret,
        { payment_method: { card: elements.getElement(CardElement) } }
      );
      if (stripeErr) { setError(stripeErr.message || 'Payment failed.'); setLoading(false); return; }
      if (paymentIntent.status !== 'succeeded') { setError('Payment not completed.'); setLoading(false); return; }

      // Upgrade the event
      const upRes = await fetch('/api/upgrade-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: eventId, paymentIntentId: paymentIntent.id }),
      });
      const upData = await upRes.json();
      if (!upRes.ok) { setError(upData.error || 'Upgrade failed.'); setLoading(false); return; }

      onSuccess();
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%' }}>
      <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '16px 14px', marginBottom: 16 }}>
        <CardElement options={CARD_OPTIONS} />
      </div>
      {error && <p style={{ color: '#f43f5e', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}
      <button
        type="submit"
        disabled={!stripe || loading}
        style={{ width: '100%', padding: '14px', borderRadius: 12, fontSize: '1rem', fontWeight: 700, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
      >
        {loading ? 'Processing…' : '✦ Pay $14 & Remove Watermark'}
      </button>
      <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#666', marginTop: 10 }}>
        🔒 Secured by Stripe · One-time payment · No subscription
      </p>
    </form>
  );
}

export default function UpgradePage({ eventId }) {
  const [done, setDone] = useState(false);
  const sp = getStripePromise();
  const eventUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/e/${eventId}`;

  return (
    <>
      <Head>
        <title>Upgrade to Pro — OneDay</title>
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ background: '#08080f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Inter,system-ui,sans-serif', color: '#f0f0f5' }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28, fontSize: '1.1rem', fontWeight: 800 }}>
            <span style={{ color: '#a855f7' }}>◆</span> OneDay
          </div>

          {done ? (
            <div style={{ background: '#111118', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '36px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🎉</div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 8 }}>You&apos;re on Pro!</h1>
              <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.6 }}>
                Your watermark has been removed. The page is now permanent — it will never expire.
              </p>
              <a
                href={`/e/${eventId}`}
                style={{ display: 'inline-block', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontWeight: 600, padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}
              >
                View Your Event →
              </a>
            </div>
          ) : (
            <div style={{ background: '#111118', border: '1px solid rgba(168,85,247,0.35)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 0 60px rgba(168,85,247,0.1)' }}>

              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.25),rgba(168,85,247,0.1))', padding: '24px 28px', borderBottom: '1px solid rgba(168,85,247,0.25)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#a855f7', marginBottom: 6 }}>✦ Upgrade to Pro</div>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 6 }}>Make it permanent &amp; watermark-free</h1>
                <p style={{ color: '#888', fontSize: '0.88rem' }}>One payment. Your page lives forever.</p>
              </div>

              {/* Perks */}
              <div style={{ padding: '20px 28px 0' }}>
                {[
                  ['🚫', 'Remove the OneDay watermark', 'Your guests see only your event'],
                  ['♾️', 'Permanent page — never expires', 'Lives forever as a memory page'],
                  ['✏️', 'Unlimited AI edits', 'Change anything, anytime with AI'],
                ].map(([icon, title, sub]) => (
                  <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: 32, height: 32, background: 'rgba(168,85,247,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</div>
                      <div style={{ color: '#888', fontSize: '0.78rem', marginTop: 2 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Price + form */}
              <div style={{ padding: '20px 28px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>$14</span>
                  <span style={{ fontSize: '0.85rem', color: '#888' }}>one-time · no subscription</span>
                </div>

                {sp ? (
                  <Elements stripe={sp}>
                    <UpgradeForm eventId={eventId} onSuccess={() => setDone(true)} />
                  </Elements>
                ) : (
                  <div style={{ background: 'rgba(245,200,66,0.08)', border: '1px solid rgba(245,200,66,0.3)', borderRadius: 8, padding: '12px 16px', fontSize: '0.85rem', color: '#f5c842' }}>
                    Payment not configured. Contact support.
                  </div>
                )}
              </div>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.78rem', color: '#555' }}>
            <a href={`/e/${eventId}`} style={{ color: '#666', textDecoration: 'none' }}>← Back to event</a>
          </p>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  return { props: { eventId: params.id } };
}
