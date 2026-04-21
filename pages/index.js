import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import styles from '../styles/Home.module.css';
import PromptBuilder from '../components/PromptBuilder';

// Lazy-initialise Stripe — avoids crashing the module if the key is a placeholder
let stripePromise = null;
function getStripePromise() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.startsWith('pk_test_...') || key === 'undefined') return null;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

function hasConfiguredStripeKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return Boolean(key && !key.startsWith('pk_test_...') && key !== 'undefined');
}

const PLANS = [
  {
    id: 'free',
    name: 'Try OneDay',
    price: '$0',
    tier: 'free',
    features: [
      'AI-generated event page',
      'Hero, countdown, schedule',
      'Photo wall, RSVP, messages',
      '2 AI edits included',
    ],
    limitations: [
      'Page expires in 90 days',
      'OneDay watermark visible',
    ],
  },
  {
    id: 'standard',
    name: 'OneDay Pro',
    price: '$14',
    tier: 'pro',
    popular: true,
    features: [
      'AI-generated event page',
      'Hero, countdown, schedule',
      'Photo wall, RSVP, messages',
      'Unlimited AI edits',
      'Permanent — never expires',
      'No watermark',
    ],
  },
];

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#f0f0f5',
      fontFamily: 'Inter, sans-serif',
      fontSize: '16px',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#8888aa' },
    },
    invalid: {
      color: '#f43f5e',
      iconColor: '#f43f5e',
    },
  },
};

/** Same key as event pages — used as creator_device_id for host actions on this browser. */
function getOrCreateBrowserDeviceId() {
  if (typeof window === 'undefined') return '';
  const k = 'onet_device_global_v1';
  let v = localStorage.getItem(k);
  if (v && v.length >= 16) return v;
  v = '';
  if (window.crypto && window.crypto.getRandomValues) {
    const a = new Uint8Array(16);
    window.crypto.getRandomValues(a);
    for (let i = 0; i < 16; i++) v += ('0' + a[i].toString(16)).slice(-2);
  } else {
    v = ('00000000000000000000000000000000' + Math.random().toString(16).replace(/[^a-f0-9]/g, '')).slice(-32);
  }
  v = String(v).toLowerCase().replace(/[^a-f0-9]/g, '');
  if (v.length < 32) v = (v + '0'.repeat(32)).slice(0, 32);
  localStorage.setItem(k, v);
  return v;
}

// Inner form component (needs Stripe hooks)
function CheckoutForm({ plan, email, onSuccess, termsAccepted }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (termsAccepted) setErrorMsg('');
  }, [termsAccepted]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!termsAccepted) {
      setErrorMsg('Please agree to the Terms & Conditions to continue.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Create PaymentIntent
      const piRes = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, email }),
      });
      const piData = await piRes.json();

      if (!piRes.ok) {
        setErrorMsg(piData.error || 'Failed to initialise payment.');
        setLoading(false);
        return;
      }

      // 2. Confirm card payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        piData.clientSecret,
        { payment_method: { card: elements.getElement(CardElement) } }
      );

      if (stripeError) {
        setErrorMsg(stripeError.message || 'Payment failed.');
        setLoading(false);
        return;
      }

      if (paymentIntent.status !== 'succeeded') {
        setErrorMsg('Payment was not completed. Please try again.');
        setLoading(false);
        return;
      }

      // 3. Trigger generation
      onSuccess(paymentIntent.id);

    } catch {
      setErrorMsg('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.paymentForm}>
      <div className={styles.cardWrapper}>
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      {errorMsg && (
        <div className={styles.errorMsg} role="alert">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        className={styles.btnPrimary}
        disabled={!stripe || loading || !termsAccepted}
      >
        {loading ? (
          <span className={styles.spinner} aria-label="Processing payment" />
        ) : (
          `Pay $14 & Generate`
        )}
      </button>

      <p className={styles.secureNote}>
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
          <rect x="1" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        Payments secured by Stripe
      </p>
    </form>
  );
}

// Main page
export default function Home() {
  const [step, setStep] = useState(1); // 1=prompt, 2=plan, 3=payment, 4=loading
  const [prompt, setPrompt] = useState('');
  const [eventMeta, setEventMeta] = useState({}); // { names, eventType, hostedBy }
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('standard');
  const [selectedTier, setSelectedTier] = useState('pro');
  const [generationStatus, setGenerationStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [doneUrl, setDoneUrl] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const stripeConfigured = hasConfiguredStripeKey();

  useEffect(() => {
    if (step !== 3) setTermsAccepted(false);
  }, [step]);

  // Step 1 submit
  function handlePromptSubmit(e) {
    e.preventDefault();
    if (!prompt.trim() || prompt.trim().length < 10) return;
    if (!email.trim() || !email.includes('@')) return;
    setStep(2);
  }

  // Step 2 select plan
  function handlePlanSelect(planId) {
    const plan = PLANS.find(p => p.id === planId);
    setSelectedPlan(planId);
    setSelectedTier(plan?.tier || 'pro');

    // Free tier — skip payment entirely
    if (planId === 'free') {
      setErrorMsg('');
      handlePaymentSuccess(`free_${Date.now()}`);
      return;
    }

    // Paid tier
    if (!getStripePromise()) {
      if (process.env.NODE_ENV === 'production') {
        setErrorMsg('Live payments are not configured yet. Please contact support.');
        return;
      }
      // Local/dev mode fallback only
      handlePaymentSuccess(`dev_test_${Date.now()}`);
    } else {
      setErrorMsg('');
      setStep(3);
    }
  }

  // Step 3 payment success → start generation
  async function handlePaymentSuccess(paymentIntentId) {
    setStep(4);
    setGenerationStatus('Building your event app with AI…');
    setErrorMsg('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 270000); // 270s — matches Vercel Pro limit

      const res = await fetch('/api/generate-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          plan: selectedPlan,
          tier: selectedTier,
          email,
          paymentIntentId,
          eventMeta,
          deviceId: getOrCreateBrowserDeviceId(),
        }),
      });

      clearTimeout(timeoutId);

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {
          error: `Server returned an invalid response (${res.status}). Please try again.`,
        };
      }

      if (!res.ok) {
        setErrorMsg(data.error || `Generation failed (${res.status}). Please contact support.`);
        setGenerationStatus('');
        return;
      }

      setDoneUrl(data.manageUrl || data.url || `/e/${data.id}`);
      setGenerationStatus('done');

    } catch (err) {
      if (err?.name === 'AbortError') {
        setErrorMsg('Generation is taking too long. Please try again.');
      } else {
        setErrorMsg('Network error during generation. Please contact support.');
      }
      setGenerationStatus('');
    }
  }

  const progressPct = { 1: 25, 2: 50, 3: 75, 4: 100 }[step] || 0;

  return (
    <>
      <Head>
        <title>OneDay — AI-Powered Event Microsites</title>
        <meta name="description" content="Describe your event, pay once, get a beautiful permanent event microsite powered by AI." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◆</span> OneDay
          </div>
        </header>

        {/* Hero */}
        {step === 1 && (
          <section className={styles.heroSection}>
            <div className={styles.heroGlow} aria-hidden="true" />
            <div className={styles.heroContent}>
              <div className={styles.badge}>AI-Powered Event Pages</div>
              <h1 className={styles.heroTitle}>
                Your event deserves<br />
                <span className={styles.gradient}>a beautiful home.</span>
              </h1>
              <p className={styles.heroSubtitle}>
                Describe your event. Pay once. Get a permanent, shareable microsite — built in seconds by AI.
              </p>
            </div>
          </section>
        )}

        {/* Main card */}
        <main className={styles.main}>
          {/* Progress bar */}
          {step < 4 && (
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {/* Step labels */}
          {step < 4 && (
            <div className={styles.stepLabels}>
              {['Describe', 'Plan', 'Pay'].map((label, i) => (
                <span
                  key={label}
                  className={[
                    styles.stepLabel,
                    step === i + 1 ? styles.stepLabelActive : '',
                    step > i + 1 ? styles.stepLabelDone : '',
                  ].join(' ')}
                >
                  <span className={styles.stepNum}>{step > i + 1 ? '✓' : i + 1}</span>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* ── STEP 1: Prompt builder ── */}
          {step === 1 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Build your event</h2>
              <p className={styles.cardSubtitle}>
                Fill in the details below — we&apos;ll check for anything missing before you continue.
              </p>

              <input
                className={styles.input}
                type="email"
                placeholder="Your email (for receipt & access)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ marginBottom: 24 }}
              />

              <PromptBuilder
                onComplete={(assembledPrompt, meta) => {
                  if (!email.trim() || !email.includes('@')) return;
                  setPrompt(assembledPrompt);
                  setEventMeta(meta || {});
                  setStep(2);
                }}
              />

              {!email.includes('@') && (
                <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 8 }}>
                  ⚠ Enter your email above before continuing.
                </p>
              )}
            </div>
          )}

          {/* ── STEP 2: Plan selection ── */}
          {step === 2 && (
            <div className={styles.card}>
              <button className={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <h2 className={styles.cardTitle}>Choose your plan</h2>
              <p className={styles.cardSubtitle}>Start free, upgrade anytime — no subscription ever.</p>

              <div className={styles.plansGrid}>
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    className={[
                      styles.planCard,
                      selectedPlan === plan.id ? styles.planCardSelected : '',
                      plan.popular ? styles.planCardPopular : '',
                    ].join(' ')}
                    onClick={() => handlePlanSelect(plan.id)}
                    type="button"
                  >
                    {plan.popular && <span className={styles.popularBadge}>✦ Most Popular</span>}
                    <div className={styles.planTier}>{plan.tier === 'free' ? 'FREE' : 'PRO'}</div>
                    <div className={styles.planName}>{plan.name}</div>
                    <div className={styles.planPrice}>
                      {plan.price}
                      <span className={styles.planPriceSuffix}>
                        {plan.tier === 'free' ? ' forever' : ' one-time'}
                      </span>
                    </div>
                    <ul className={styles.planFeatures}>
                      {plan.features.map((f) => (
                        <li key={f}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M2 7l3.5 3.5L12 3" stroke={plan.tier === 'pro' ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          {f}
                        </li>
                      ))}
                      {(plan.limitations || []).map((f) => (
                        <li key={f} className={styles.planFeatureDim}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path d="M3 3l8 8M11 3l-8 8" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <span className={styles.planCta}>
                      {plan.tier === 'free' ? 'Start Free →' : `Pay ${plan.price} & Generate →`}
                    </span>
                  </button>
                ))}
              </div>
              <p className={styles.compareNote}>🔒 Payments secured by Stripe · No subscription, no recurring charges</p>
            </div>
          )}

          {/* ── STEP 3: Payment ── */}
          {step === 3 && (
            <div className={styles.card}>
              <button className={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <h2 className={styles.cardTitle}>Complete your order</h2>
              {!stripeConfigured && (
                <div style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.4)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#f5c842' }}>
                  <strong>Stripe not configured:</strong> set a real publishable key to enable checkout.
                </div>
              )}
              <p className={styles.cardSubtitle}>
                OneDay Plan — $14 · One-time payment
              </p>

              <div className={styles.orderSummary}>
                <div className={styles.orderRow}>
                  <span>Plan</span>
                  <span>OneDay</span>
                </div>
                <div className={styles.orderRow}>
                  <span>AI Event Microsite</span>
                  <span>✓ Included</span>
                </div>
                <div className={styles.orderRow}>
                  <span>Permanent memory page</span>
                  <span>✓ Included</span>
                </div>
                <div className={styles.orderDivider} />
                <div className={[styles.orderRow, styles.orderTotal].join(' ')}>
                  <span>Total</span>
                  <span>$14.00</span>
                </div>
              </div>

              <label className={styles.termsRow}>
                <input
                  type="checkbox"
                  className={styles.termsCheckbox}
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span className={styles.termsLabel}>
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.termsLink}>
                    Terms &amp; Conditions
                  </Link>
                  {' '}and confirm I am authorised to make this purchase.
                </span>
              </label>

              <Elements stripe={getStripePromise()}>
                <CheckoutForm
                  plan={selectedPlan}
                  email={email}
                  onSuccess={handlePaymentSuccess}
                  termsAccepted={termsAccepted}
                />
              </Elements>
            </div>
          )}

          {/* ── STEP 4: Loading / Done ── */}
          {step === 4 && (
            <div className={styles.card}>
              {generationStatus === 'done' ? (
                <div className={styles.doneScreen}>
                  <div className={styles.doneIcon}>{selectedTier === 'free' ? '✨' : '🎉'}</div>
                  <h2 className={styles.cardTitle}>Your event is live!</h2>
                  <p className={styles.cardSubtitle}>
                    {selectedTier === 'free'
                      ? 'Your free page is live! Share with guests — upgrade anytime to remove the watermark.'
                      : "Share this link with your guests. It's permanent."}
                  </p>
                  <a
                    href={doneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.doneLink}
                  >
                    {doneUrl.startsWith('http') ? doneUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${doneUrl.startsWith('/') ? doneUrl : `/${doneUrl}`}`}
                  </a>
                  <a
                    href={doneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnPrimary}
                  >
                    View Your Event →
                  </a>
                  <a
                    href={`/edit/${doneUrl.split('/').pop().replace('.html', '')}`}
                    className={styles.btnSecondary}
                  >
                    ✏ Edit Your Event
                  </a>
                  {selectedTier === 'free' && (
                    <div className={styles.upgradeNudge}>
                      <div className={styles.upgradeNudgeTitle}>✦ Want to remove the watermark?</div>
                      <p className={styles.upgradeNudgeText}>Upgrade to Pro for $14 — permanent page, no watermark, unlimited edits.</p>
                      <a
                        href={`${doneUrl}?upgrade=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.upgradeNudgeBtn}
                      >
                        Upgrade for $14 →
                      </a>
                    </div>
                  )}
                  {errorMsg && (
                    <p className={styles.errorMsg}>{errorMsg}</p>
                  )}
                </div>
              ) : errorMsg ? (
                <div className={styles.errorScreen}>
                  <div className={styles.errorIcon}>⚠️</div>
                  <h2 className={styles.cardTitle}>Something went wrong</h2>
                  <p className={styles.errorMsg}>{errorMsg}</p>
                  <p className={styles.cardSubtitle}>
                    Your payment was processed. Please contact us at{' '}
                    <a href="mailto:support@oneday.app">support@oneday.app</a>{' '}
                    with your email address and we&apos;ll fix it.
                  </p>
                </div>
              ) : (
                <div className={styles.loadingScreen}>
                  <div className={styles.loadingOrb} aria-hidden="true" />
                  <h2 className={styles.cardTitle}>Building your event app…</h2>
                  <p className={styles.cardSubtitle}>
                    Our AI is crafting a beautiful, personalised page for your event. This takes 20–40 seconds.
                  </p>
                  <div className={styles.loadingSteps}>
                    <LoadingStep label="Verifying payment" done />
                    <LoadingStep label="Generating design with AI" active />
                    <LoadingStep label="Publishing to your link" />
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className={styles.footer}>
          <p>© {new Date().getFullYear()} OneDay · AI-powered event microsites</p>
        </footer>
      </div>
    </>
  );
}

function LoadingStep({ label, done, active }) {
  return (
    <div className={[
      styles.loadingStep,
      done ? styles.loadingStepDone : '',
      active ? styles.loadingStepActive : '',
    ].join(' ')}>
      <span className={styles.loadingStepIcon}>
        {done ? '✓' : active ? <span className={styles.dotPulse} /> : '○'}
      </span>
      <span>{label}</span>
    </div>
  );
}
