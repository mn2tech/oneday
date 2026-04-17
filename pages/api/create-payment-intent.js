import Stripe from 'stripe';

const PRICES = {
  standard: 1400,  // $14.00 in cents
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[create-payment-intent] STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Payment service not configured. Please contact support.' });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2023-10-16',
  });

  const { plan, email } = req.body;

  // Accept 'standard' or legacy 'basic'/'premium' gracefully
  const resolvedPlan = (plan === 'basic' || plan === 'premium') ? 'standard' : plan;

  if (!resolvedPlan || !PRICES[resolvedPlan]) {
    return res.status(400).json({ error: 'Invalid plan.' });
  }

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICES[resolvedPlan],
      currency: 'usd',
      metadata: { plan: resolvedPlan, email },
      receipt_email: email,
      description: `OneDay — Event Microsite`,
    });

    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('[create-payment-intent]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create payment intent.' });
  }
}
