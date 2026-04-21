import { createClient } from '@supabase/supabase-js';
import { normalizeThemePreset } from '../../lib/eventThemePresets';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default async function handler(req, res) {
  const supabase = getSupabase();

  if (req.method === 'GET') {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id.' });

    let result = await supabase
      .from('event_apps')
      .select('theme_preset')
      .eq('id', id)
      .single();

    if (result.error) {
      // Backward compatibility while DB migration is rolling out.
      if (String(result.error.message || '').toLowerCase().includes('theme_preset')) {
        return res.status(200).json({ themePreset: 'default', migrationRequired: true });
      }
      return res.status(500).json({ error: 'Failed to load theme.' });
    }

    return res.status(200).json({ themePreset: normalizeThemePreset(result.data?.theme_preset || 'default') });
  }

  if (req.method === 'POST') {
    const id = String(req.body?.id || '').trim();
    const themePreset = normalizeThemePreset(req.body?.themePreset || 'default');
    if (!id) return res.status(400).json({ error: 'Missing id.' });

    const { error } = await supabase
      .from('event_apps')
      .update({ theme_preset: themePreset, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      if (String(error.message || '').toLowerCase().includes('theme_preset')) {
        return res.status(400).json({
          error: 'Theme presets require DB migration. Add event_apps.theme_preset first.',
          migrationRequired: true,
        });
      }
      return res.status(500).json({ error: 'Failed to save theme.' });
    }

    return res.status(200).json({ success: true, themePreset });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
