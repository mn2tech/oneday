/**
 * Run once to add freemium columns to event_apps table.
 * Usage: node scripts/add-freemium-columns.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Adding freemium columns to event_apps...');

  // We use raw SQL via supabase.rpc if available, otherwise just test a read
  // The safest approach: try to update a fake row with the new columns.
  // If columns don't exist, Supabase will return an error we can diagnose.

  const { error } = await supabase
    .from('event_apps')
    .select('tier, edit_count')
    .limit(1);

  if (error && error.message.includes('column')) {
    console.log('Columns missing. Please run this SQL in your Supabase SQL editor:');
    console.log(`
ALTER TABLE event_apps
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;
    `);
  } else if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('✅ Columns already exist — nothing to do.');
  }
}

run().catch(console.error);
