import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

const PRICES = {
  basic: 1900,    // $19.00 in cents
  premium: 3900,  // $39.00 in cents
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan, email } = req.body;

  if (!plan || !PRICES[plan]) {
    return res.status(400).json({ error: 'Invalid plan. Must be "basic" or "premium".' });
  }

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PRICES[plan],
      currency: 'usd',
      metadata: { plan, email },
      receipt_email: email,
      description: `OneDay — ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
    });

    return res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('[create-payment-intent]', err.message);
    return res.status(500).json({ error: err.message || 'Failed to create payment intent.' });
  }
}
