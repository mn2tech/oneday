import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

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
  const { id } = router.query;
  const [changeRequest, setChangeRequest] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0); // increment to reload iframe

  const previewUrl = id ? `/preview/${id}.html` : null;

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
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9b7eff', fontSize: '0.875rem' }}>
              View live page →
            </a>
          )}
        </header>

        <div style={styles.card}>
          <h1 style={styles.title}>Edit your event</h1>
          <p style={styles.subtitle}>
            Describe what you'd like to change — AI will update your page instantly.
          </p>

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
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.viewLink, display: 'block' }}>
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
                <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#9b7eff' }}>Open full page ↗</a>
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
