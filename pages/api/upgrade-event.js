import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
}
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, paymentIntentId } = req.body || {};

  if (!id || !paymentIntentId) {
    return res.status(400).json({ error: 'Missing event ID or payment.' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured.' });
  }

  try {
    const stripe = getStripe();
    const supabase = getSupabase();

    // 1. Verify the event exists and is free tier
    const { data: event } = await supabase
      .from('event_apps')
      .select('id, tier')
      .eq('id', id)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    if (event.tier === 'pro') {
      return res.status(200).json({ success: true, alreadyPro: true });
    }

    // 2. Verify Stripe payment
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (err) {
      return res.status(502).json({ error: 'Could not verify payment. Please try again.' });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(402).json({ error: 'Payment has not been completed.' });
    }

    // 3. Upgrade to pro
    const { error: updateError } = await supabase
      .from('event_apps')
      .update({ tier: 'pro', payment_intent_id: paymentIntentId })
      .eq('id', id);

    if (updateError) {
      console.error('[upgrade-event] Supabase update error:', updateError.message);
      return res.status(500).json({ error: 'Failed to upgrade. Contact support.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[upgrade-event] Error:', err?.message || err);
    return res.status(500).json({ error: 'Upgrade failed. Please contact support.' });
  }
}
