import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { EVENT_THEME_PRESETS } from '../../lib/eventThemePresets';
import { createEmptyPhase1Content } from '../../lib/eventStructuredPhase1';

const THEME_PRESETS = EVENT_THEME_PRESETS;

const styles = {
  page: { minHeight: '100vh', background: '#0a0a0f', color: '#f0f0f5', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 16px 60px' },
  header: { width: '100%', maxWidth: 800, padding: '20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: '1.25rem', fontWeight: 800, color: '#f0f0f5', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 },
  logoMark: { color: '#7c5cfc' },
  card: { width: '100%', maxWidth: 800, background: '#13131a', border: '1px solid #2a2a3d', borderRadius: 24, padding: '36px 32px' },
  title: { fontSize: '1.5rem', fontWeight: 700, marginBottom: 8, letterSpacing: '-0.02em' },
  subtitle: { fontSize: '0.9rem', color: '#8888aa', marginBottom: 28, lineHeight: 1.6 },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#8888aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' },
  textarea: { width: '100%', background: '#1c1c28', border: '1px solid #2a2a3d', borderRadius: 12, color: '#f0f0f5', padding: '14px 16px', fontSize: '0.9375rem', lineHeight: 1.6, resize: 'vertical', minHeight: 120, fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', background: 'linear-gradient(135deg, #7c5cfc, #a855f7)', color: '#fff', fontSize: '1rem', fontWeight: 600, padding: '14px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', marginTop: 16, letterSpacing: '-0.01em' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  previewWrap: { marginTop: 32, borderRadius: 16, overflow: 'hidden', border: '1px solid #2a2a3d', background: '#1c1c28' },
  previewLabel: { padding: '10px 16px', fontSize: '0.8rem', color: '#8888aa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #2a2a3d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  iframe: { width: '100%', height: 480, border: 'none', display: 'block' },
  successBanner: { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', borderRadius: 10, padding: '12px 16px', fontSize: '0.875rem', marginTop: 16 },
  errorBanner: { background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e', borderRadius: 10, padding: '12px 16px', fontSize: '0.875rem', marginTop: 16 },
  viewLink: { display: 'inline-block', marginTop: 12, color: '#9b7eff', fontSize: '0.875rem', textDecoration: 'none' },
  spinner: { display: 'inline-block', width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 8 },
  exampleList: { listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: 8 },
  exampleChip: { background: '#1c1c28', border: '1px solid #2a2a3d', borderRadius: 999, padding: '5px 14px', fontSize: '0.8rem', color: '#8888aa', cursor: 'pointer' },
  row: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  select: { minWidth: 220, background: '#1c1c28', border: '1px solid #2a2a3d', borderRadius: 12, color: '#f0f0f5', padding: '10px 12px', fontSize: '0.95rem', outline: 'none' },
  btnSecondary: { background: 'transparent', color: '#c6b7ff', border: '1px solid #4b3f77', borderRadius: 12, padding: '10px 14px', fontWeight: 600, cursor: 'pointer' },
  mutedText: { fontSize: '0.85rem', color: '#8888aa', marginTop: 8 },
  sectionCard: { marginBottom: 24, border: '1px solid #2a2a3d', borderRadius: 14, padding: '16px 14px', background: '#171722' },
  sectionTitle: { margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f0f0f5' },
  sectionSub: { margin: '6px 0 14px', color: '#8888aa', fontSize: '0.84rem' },
  gridTwo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 },
  input: { width: '100%', background: '#1c1c28', border: '1px solid #2a2a3d', borderRadius: 10, color: '#f0f0f5', padding: '10px 12px', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' },
  scheduleCard: { border: '1px solid #2a2a3d', background: '#141420', borderRadius: 12, padding: 12, marginTop: 10 },
  readOnlyWrap: { border: '1px dashed #3a3a58', borderRadius: 12, padding: 10, background: '#12131d', marginBottom: 12 },
  readOnlyLabel: { display: 'block', fontSize: '0.72rem', color: '#9d9dc5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  readOnlyValue: { fontSize: '0.88rem', color: '#e7e7ff', minHeight: 18 },
};

const EXAMPLES = [
  'Change the date to May 10th, 2026',
  'Update the venue to The Grand Ballroom',
  'Add a dress code: Black tie only',
  'Change the color theme to gold and navy',
  'Add a new schedule item at 7pm: Cake cutting',
  'Add edit and delete buttons to guest messages',
  'Add photo upload to the photo wall with remove buttons',
];

export default function EditPage() {
  const router = useRouter();
  const { id, admin } = router.query;
  const [changeRequest, setChangeRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0); // increment to reload iframe
  const [themePreset, setThemePreset] = useState('default');
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeMessage, setThemeMessage] = useState('');
  const [themeError, setThemeError] = useState('');
  const [structuredContent, setStructuredContent] = useState(createEmptyPhase1Content(''));
  const [structuredLoading, setStructuredLoading] = useState(false);
  const [structuredSaving, setStructuredSaving] = useState(false);
  const [structuredError, setStructuredError] = useState('');
  const [structuredMessage, setStructuredMessage] = useState('');
  const [currentLive, setCurrentLive] = useState(createEmptyPhase1Content('').eventDetails);

  const liveUrl = id ? `/e/${id}` : null;
  const previewThemeQs = themePreset !== 'default' ? `?themePreview=${encodeURIComponent(themePreset)}` : '';
  const previewUrl = liveUrl ? `${liveUrl}${previewThemeQs}` : null;

  function makeScheduleId() {
    return `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getDeviceId() {
    if (typeof window === 'undefined') return '';
    const key = 'oneday_device_global_v1';
    let v = localStorage.getItem(key) || '';
    if (!v || v.length < 16) {
      v = '';
      if (window.crypto?.getRandomValues) {
        const a = new Uint8Array(16);
        window.crypto.getRandomValues(a);
        for (let i = 0; i < 16; i += 1) v += (`0${a[i].toString(16)}`).slice(-2);
      } else {
        v = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
      }
      v = String(v).toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 32);
      localStorage.setItem(key, v);
    }
    return v;
  }

  function getAdminToken() {
    if (typeof window === 'undefined' || !id) return '';
    const eventId = String(id).slice(0, 80);
    const storageKey = `oneday_host_${eventId}`;
    let token = sessionStorage.getItem(storageKey) || '';
    const queryToken = Array.isArray(admin) ? admin[0] : admin;
    if (!token && typeof queryToken === 'string' && queryToken.trim().length >= 32) {
      token = queryToken.trim();
      sessionStorage.setItem(storageKey, token);
    }
    return token;
  }

  function authHeaders() {
    const headers = {};
    const adminToken = getAdminToken();
    const deviceId = getDeviceId();
    if (adminToken) headers['x-admin-token'] = adminToken;
    if (deviceId) headers['x-device-id'] = deviceId;
    return headers;
  }

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/event-theme?id=${encodeURIComponent(id)}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive || !ok) return;
        if (j.themePreset) setThemePreset(j.themePreset);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setStructuredLoading(true);
    setStructuredError('');
    fetch(`/api/event-structured-phase1?eventId=${encodeURIComponent(id)}`, {
      headers: authHeaders(),
    })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) {
          setStructuredError(j.error || 'Could not load structured editor data.');
          setStructuredLoading(false);
          return;
        }
        setStructuredContent(j.content || createEmptyPhase1Content(''));
        setCurrentLive(j.currentLive || createEmptyPhase1Content('').eventDetails);
        setStructuredLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setStructuredError('Network error loading structured data.');
        setStructuredLoading(false);
      });
    return () => { alive = false; };
  }, [id, admin]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!changeRequest.trim() || loading) return;

    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      const res = await fetch('/api/edit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, changeRequest }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setChangeRequest('');
      setPreviewKey(k => k + 1); // reload the iframe to show updated page
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleThemeSave() {
    if (!id || themeSaving) return;
    setThemeSaving(true);
    setThemeMessage('');
    setThemeError('');
    try {
      const res = await fetch('/api/event-theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, themePreset }),
      });
      const data = await res.json();
      if (!res.ok) {
        setThemeError(data.error || 'Could not save theme.');
      } else {
        setThemeMessage('Theme saved. Guests will see this style on the shared page.');
        setPreviewKey(k => k + 1);
      }
    } catch {
      setThemeError('Network error while saving theme.');
    } finally {
      setThemeSaving(false);
    }
  }

  function setDetailField(key, value) {
    setStructuredContent(prev => ({
      ...prev,
      eventDetails: { ...(prev.eventDetails || {}), [key]: value },
    }));
    setStructuredMessage('');
    setStructuredError('');
  }

  function updateScheduleItem(idx, key, value) {
    setStructuredContent(prev => ({
      ...prev,
      schedule: (prev.schedule || []).map((item, i) => (i === idx ? { ...item, [key]: value } : item)),
    }));
    setStructuredMessage('');
    setStructuredError('');
  }

  function addScheduleItem() {
    setStructuredContent(prev => ({
      ...prev,
      schedule: [...(prev.schedule || []), { id: makeScheduleId(), time: '', title: '', description: '' }],
    }));
    setStructuredMessage('');
    setStructuredError('');
  }

  function removeScheduleItem(idx) {
    setStructuredContent(prev => ({
      ...prev,
      schedule: (prev.schedule || []).filter((_, i) => i !== idx),
    }));
    setStructuredMessage('');
    setStructuredError('');
  }

  function moveScheduleItem(idx, dir) {
    setStructuredContent(prev => {
      const arr = [...(prev.schedule || [])];
      const next = idx + dir;
      if (next < 0 || next >= arr.length) return prev;
      const tmp = arr[idx];
      arr[idx] = arr[next];
      arr[next] = tmp;
      return { ...prev, schedule: arr };
    });
    setStructuredMessage('');
    setStructuredError('');
  }

  async function saveStructuredPhase1() {
    if (!id || structuredSaving) return;
    setStructuredSaving(true);
    setStructuredMessage('');
    setStructuredError('');
    try {
      const res = await fetch('/api/event-structured-phase1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          eventId: id,
          adminToken: getAdminToken(),
          deviceId: getDeviceId(),
          content: structuredContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStructuredError(data.error || 'Could not save structured content.');
      } else {
        setStructuredMessage('Structured Phase 1 content saved.');
      }
    } catch {
      setStructuredError('Network error while saving structured content.');
    } finally {
      setStructuredSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Edit Your Event — OneDay</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Head>

      <div style={styles.page}>
        <header style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoMark}>◆</span> OneDay
          </div>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9b7eff', fontSize: '0.875rem' }}>
              View live page →
            </a>
          )}
        </header>

        <div style={styles.card}>
          <h1 style={styles.title}>Edit your event</h1>
          <p style={styles.subtitle}>
            Describe what you&apos;d like to change — AI will update your page instantly.
          </p>
          <div style={{ marginBottom: 22 }}>
            <label style={styles.label}>Theme preset</label>
            <div style={styles.row}>
              <select
                value={themePreset}
                onChange={e => {
                  setThemePreset(e.target.value);
                  setThemeMessage('');
                  setThemeError('');
                  setPreviewKey(k => k + 1);
                }}
                style={styles.select}
              >
                {THEME_PRESETS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleThemeSave}
                style={{ ...styles.btnSecondary, ...(themeSaving ? styles.btnDisabled : {}) }}
                disabled={themeSaving}
              >
                {themeSaving ? 'Saving…' : 'Save Theme'}
              </button>
            </div>
            <p style={styles.mutedText}>Pick a style, preview it below, then save before sharing.</p>
            {themeMessage && <div style={styles.successBanner}>{themeMessage}</div>}
            {themeError && <div style={styles.errorBanner}>⚠ {themeError}</div>}
          </div>

          <div style={styles.sectionCard}>
            <h2 style={styles.sectionTitle}>Structured Edit (Phase 1)</h2>
            <p style={styles.sectionSub}>
              Update event details and schedule in structured fields. This phase stores admin data safely before full renderer integration.
            </p>
            {structuredLoading ? (
              <p style={styles.mutedText}>Loading structured content…</p>
            ) : (
              <>
                <label style={styles.label}>Event details</label>
                <div style={styles.readOnlyWrap}>
                  <div style={{ ...styles.row, marginBottom: 8 }}>
                    <strong style={{ fontSize: '0.85rem', color: '#b7b8da' }}>Current live values</strong>
                  </div>
                  <div style={styles.gridTwo}>
                    <div>
                      <span style={styles.readOnlyLabel}>Title</span>
                      <div style={styles.readOnlyValue}>{currentLive?.title || '—'}</div>
                    </div>
                    <div>
                      <span style={styles.readOnlyLabel}>Date & time</span>
                      <div style={styles.readOnlyValue}>{currentLive?.dateTime || '—'}</div>
                    </div>
                    <div>
                      <span style={styles.readOnlyLabel}>Location</span>
                      <div style={styles.readOnlyValue}>{currentLive?.location || '—'}</div>
                    </div>
                    <div>
                      <span style={styles.readOnlyLabel}>Host</span>
                      <div style={styles.readOnlyValue}>{currentLive?.host || '—'}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={styles.readOnlyLabel}>Dress code</span>
                    <div style={styles.readOnlyValue}>{currentLive?.dressCode || '—'}</div>
                  </div>
                </div>
                <div style={styles.gridTwo}>
                  <input style={styles.input} value={structuredContent.eventDetails?.title || ''} onChange={e => setDetailField('title', e.target.value)} placeholder="Event title" />
                  <input style={styles.input} value={structuredContent.eventDetails?.dateTime || ''} onChange={e => setDetailField('dateTime', e.target.value)} placeholder="Date & time" />
                  <input style={styles.input} value={structuredContent.eventDetails?.location || ''} onChange={e => setDetailField('location', e.target.value)} placeholder="Location" />
                  <input style={styles.input} value={structuredContent.eventDetails?.host || ''} onChange={e => setDetailField('host', e.target.value)} placeholder="Host name" />
                </div>
                <div style={{ marginTop: 10 }}>
                  <input style={styles.input} value={structuredContent.eventDetails?.dressCode || ''} onChange={e => setDetailField('dressCode', e.target.value)} placeholder="Dress code" />
                </div>

                <div style={{ marginTop: 18 }}>
                  <label style={styles.label}>Schedule</label>
                  {(structuredContent.schedule || []).map((item, idx) => (
                    <div key={item.id || `row-${idx}`} style={styles.scheduleCard}>
                      <div style={styles.gridTwo}>
                        <input style={styles.input} value={item.time || ''} onChange={e => updateScheduleItem(idx, 'time', e.target.value)} placeholder="Time (e.g. 5:00 PM)" />
                        <input style={styles.input} value={item.title || ''} onChange={e => updateScheduleItem(idx, 'title', e.target.value)} placeholder="Schedule title" />
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <input style={styles.input} value={item.description || ''} onChange={e => updateScheduleItem(idx, 'description', e.target.value)} placeholder="Description (optional)" />
                      </div>
                      <div style={{ ...styles.row, marginTop: 8 }}>
                        <button type="button" style={styles.exampleChip} onClick={() => moveScheduleItem(idx, -1)} disabled={idx === 0}>↑ Move up</button>
                        <button type="button" style={styles.exampleChip} onClick={() => moveScheduleItem(idx, 1)} disabled={idx === (structuredContent.schedule || []).length - 1}>↓ Move down</button>
                        <button type="button" style={styles.exampleChip} onClick={() => removeScheduleItem(idx)}>Delete</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <button type="button" style={styles.btnSecondary} onClick={addScheduleItem}>+ Add schedule item</button>
                    <button
                      type="button"
                      style={{ ...styles.btnSecondary, ...(structuredSaving ? styles.btnDisabled : {}) }}
                      onClick={saveStructuredPhase1}
                      disabled={structuredSaving}
                    >
                      {structuredSaving ? 'Saving…' : 'Save Structured Data'}
                    </button>
                  </div>
                  {structuredMessage && <div style={styles.successBanner}>{structuredMessage}</div>}
                  {structuredError && <div style={styles.errorBanner}>⚠ {structuredError}</div>}
                </div>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <label style={styles.label}>What would you like to change?</label>
            <textarea
              style={styles.textarea}
              placeholder="e.g. Change the date to June 15th and update the venue to The Rooftop Garden"
              value={changeRequest}
              onChange={e => setChangeRequest(e.target.value)}
              rows={4}
              maxLength={600}
              required
            />

            <ul style={styles.exampleList}>
              {EXAMPLES.map(ex => (
                <li key={ex}>
                  <button
                    type="button"
                    style={styles.exampleChip}
                    onClick={() => setChangeRequest(ex)}
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="submit"
              style={{ ...styles.btn, ...(loading || changeRequest.trim().length < 5 ? styles.btnDisabled : {}) }}
              disabled={loading || changeRequest.trim().length < 5}
            >
              {loading && <span style={styles.spinner} />}
              {loading ? 'Applying changes…' : 'Apply Changes'}
            </button>
          </form>

          {success && (
            <div style={styles.successBanner}>
              ✓ Changes applied! Your event page has been updated.
              {liveUrl && (
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.viewLink, display: 'block' }}>
                  View updated page →
                </a>
              )}
            </div>
          )}

          {error && <div style={styles.errorBanner}>⚠ {error}</div>}

          {previewUrl && (
            <div style={styles.previewWrap}>
              <div style={styles.previewLabel}>
                <span>Preview</span>
                <a href={liveUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9b7eff' }}>Open full page ↗</a>
              </div>
              <iframe
                key={previewKey}
                src={previewUrl}
                style={styles.iframe}
                title="Event page preview"
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
