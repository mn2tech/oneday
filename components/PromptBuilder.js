import { useState } from 'react';
import styles from '../styles/PromptBuilder.module.css';

const EVENT_TYPES = ['Wedding', 'Birthday', 'Nalugu/Haldi', 'Anniversary', 'Baby Shower', 'Bridal Shower', 'Graduation', 'Corporate', 'Party', 'Other'];

const COLOR_THEMES = [
  { name: 'Gold & Purple', colors: ['#b8860b', '#6d28d9', '#f5e6a3'] },
  { name: 'Black & Gold', colors: ['#0b0b10', '#c9a227', '#2f2f38'] },
  { name: 'Blush & Ivory', colors: ['#f4c2c2', '#fff8e7', '#d88fa8'] },
  { name: 'Navy & Silver', colors: ['#102a43', '#cbd5e1', '#334e68'] },
  { name: 'Tropical Brights', colors: ['#06d6a0', '#ffd166', '#ef476f'] },
  { name: 'Sage & Terracotta', colors: ['#a3b18a', '#bc6c25', '#dde5d0'] },
  { name: 'Rose Gold & Cream', colors: ['#b76e79', '#fff4ea', '#d8a39d'] },
  { name: 'Emerald & Champagne', colors: ['#047857', '#f7e7ce', '#0f766e'] },
  { name: 'Lavender & Pearl', colors: ['#b8a1e3', '#f8f6ff', '#8570b8'] },
  { name: 'Royal Blue & White', colors: ['#1d4ed8', '#ffffff', '#93c5fd'] },
  { name: 'Sunset Coral', colors: ['#ff6b6b', '#f7b267', '#ffe66d'] },
  { name: 'Forest & Linen', colors: ['#386641', '#f2e8cf', '#6a994e'] },
  { name: 'Burgundy & Gold', colors: ['#7f1d1d', '#d4af37', '#fef3c7'] },
  { name: 'Teal & Peach', colors: ['#0f766e', '#ffb4a2', '#99f6e4'] },
];

let scheduleIdCounter = 0;
function nextScheduleId() {
  scheduleIdCounter += 1;
  return `sched_${Date.now()}_${scheduleIdCounter}`;
}
const EMPTY_SCHEDULE = () => ({ id: nextScheduleId(), time: '', description: '' });
const EMPTY_PHOTO_SUBSECTION = () => ({ id: nextScheduleId(), title: '' });

const DEFAULT_FORM = {
  eventType: '',
  customEventType: '',
  names: '',
  hostedBy: '',
  date: '',
  time: '',
  venue: '',
  scheduleItems: [EMPTY_SCHEDULE(), EMPTY_SCHEDULE()],
  photoSubsections: [EMPTY_PHOTO_SUBSECTION(), EMPTY_PHOTO_SUBSECTION()],
  dressCode: '',
  colorTheme: '',
  specialNotes: '',
};

// ── Assemble the final prompt from form fields ────────────────────────────────
function assemblePrompt(f) {
  const type = f.eventType === 'Other' ? f.customEventType : f.eventType;
  const parts = [];

  // Opening sentence
  let opening = '';
  if (type && f.names) opening = `A ${type} celebration for ${f.names}`;
  else if (type) opening = `A ${type} event`;
  else if (f.names) opening = `An event for ${f.names}`;
  else opening = 'An event';
  if (f.date && f.time) opening += ` on ${f.date} at ${f.time}`;
  else if (f.date) opening += ` on ${f.date}`;
  parts.push(opening + '.');

  if (f.hostedBy) parts.push(`Hosted by ${f.hostedBy}.`);
  if (f.venue) parts.push(`The event will be held at ${f.venue}.`);

  const schedule = f.scheduleItems.filter(s => s.description.trim());
  if (schedule.length > 0) {
    const schedStr = schedule.map(s => s.time ? `${s.time} – ${s.description}` : s.description).join(', ');
    parts.push(`Schedule: ${schedStr}.`);
  }

  const photoSubsections = f.photoSubsections
    .map(s => s.title.trim())
    .filter(Boolean);
  if (photoSubsections.length > 0) {
    parts.push(`Photo wall subsections should be: ${photoSubsections.join(', ')}.`);
  }

  if (f.dressCode) parts.push(`Dress code: ${f.dressCode}.`);
  if (f.colorTheme) parts.push(`Color theme: ${f.colorTheme}.`);
  if (f.specialNotes.trim()) parts.push(f.specialNotes.trim());

  return parts.join(' ');
}

// ── Date parsing helper ───────────────────────────────────────────────────────
function parseEventDate(dateStr) {
  if (!dateStr) return null;
  // Strip ordinal suffixes: 1st → 1, 2nd → 2, etc.
  const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// ── Completeness checks ───────────────────────────────────────────────────────
function getChecks(f) {
  const checks = [];
  const type = f.eventType === 'Other' ? f.customEventType : f.eventType;

  if (!type) checks.push({ level: 'error', field: 'eventType', message: 'Event type is required' });
  if (!f.names.trim()) checks.push({ level: 'error', field: 'names', message: 'Add the name(s) of the honoree(s)' });
  if (!f.date.trim()) {
    checks.push({ level: 'error', field: 'date', message: 'Event date is required' });
  } else {
    const parsed = parseEventDate(f.date);
    if (parsed) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (parsed < today) {
        checks.push({ level: 'error', field: 'date', message: '⚠️ This date is in the past — guests won\'t be able to RSVP or upload photos. Please enter a future date.' });
      }
    }
  }
  if (!f.venue.trim()) checks.push({ level: 'warning', field: 'venue', message: 'No venue — AI will invent one. Add a real venue for accuracy.' });
  if (!f.time.trim()) checks.push({ level: 'suggestion', field: 'time', message: 'Adding a start time makes the countdown more precise' });
  if (f.scheduleItems.filter(s => s.description.trim()).length === 0)
    checks.push({ level: 'warning', field: 'schedule', message: 'No schedule items — add a few for a richer timeline section' });
  if (f.photoSubsections.filter(s => s.title.trim()).length === 0)
    checks.push({ level: 'suggestion', field: 'photoSubsections', message: 'Add photo wall subsections so guests know where to upload memories' });
  if (!f.dressCode.trim()) checks.push({ level: 'suggestion', field: 'dressCode', message: 'A dress code adds a nice personal touch' });
  if (!f.colorTheme.trim()) checks.push({ level: 'suggestion', field: 'colorTheme', message: 'A color theme helps the AI match the design to your event' });

  return checks;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PromptBuilder({ onComplete }) {
  const [view, setView] = useState('form'); // 'form' | 'review'
  const [form, setForm] = useState(DEFAULT_FORM);
  const [assembledPrompt, setAssembledPrompt] = useState('');

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function setScheduleItem(id, field, value) {
    setForm(f => ({
      ...f,
      scheduleItems: f.scheduleItems.map(s => s.id === id ? { ...s, [field]: value } : s),
    }));
  }

  function addScheduleItem() {
    setForm(f => ({ ...f, scheduleItems: [...f.scheduleItems, EMPTY_SCHEDULE()] }));
  }

  function removeScheduleItem(id) {
    setForm(f => ({ ...f, scheduleItems: f.scheduleItems.filter(s => s.id !== id) }));
  }

  function setPhotoSubsection(id, value) {
    setForm(f => ({
      ...f,
      photoSubsections: f.photoSubsections.map(s => s.id === id ? { ...s, title: value } : s),
    }));
  }

  function addPhotoSubsection() {
    setForm(f => ({ ...f, photoSubsections: [...f.photoSubsections, EMPTY_PHOTO_SUBSECTION()] }));
  }

  function removePhotoSubsection(id) {
    setForm(f => ({ ...f, photoSubsections: f.photoSubsections.filter(s => s.id !== id) }));
  }

  function handleReview() {
    setAssembledPrompt(assemblePrompt(form));
    setView('review');
  }

  const checks = getChecks(form);
  const errors = checks.filter(c => c.level === 'error');
  const warnings = checks.filter(c => c.level === 'warning');
  const suggestions = checks.filter(c => c.level === 'suggestion');
  const canReview = errors.length === 0;

  // ── Form view ───────────────────────────────────────────────────────────────
  if (view === 'form') {
    return (
      <div className={styles.root}>
        {/* Event type */}
        <div className={styles.field}>
          <label className={styles.label}>Event type <span className={styles.required}>*</span></label>
          <div className={styles.chips}>
            {EVENT_TYPES.map(t => (
              <button
                key={t}
                type="button"
                className={`${styles.chip} ${form.eventType === t ? styles.chipActive : ''}`}
                onClick={() => set('eventType', t)}
              >
                {t}
              </button>
            ))}
          </div>
          {form.eventType === 'Other' && (
            <input
              className={styles.input}
              placeholder="Describe the event type"
              value={form.customEventType}
              onChange={e => set('customEventType', e.target.value)}
              style={{ marginTop: 10 }}
            />
          )}
        </div>

        {/* Names */}
        <div className={styles.field}>
          <label className={styles.label}>Name(s) / Honoree(s) <span className={styles.required}>*</span></label>
          <input
            className={styles.input}
            placeholder="e.g. Nadia, Sarah & James, The Johnson Family"
            value={form.names}
            onChange={e => set('names', e.target.value)}
          />
        </div>

        {/* Hosted by */}
        <div className={styles.field}>
          <label className={styles.label}>Hosted by <span className={styles.optional}>(optional)</span></label>
          <input
            className={styles.input}
            placeholder="e.g. The Ahmed Family, Uncle Robert, NM2TECH Events"
            value={form.hostedBy}
            onChange={e => set('hostedBy', e.target.value)}
          />
        </div>

        {/* Date & Time */}
        <div className={styles.row}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Date <span className={styles.required}>*</span></label>
            <input
              className={styles.input}
              placeholder="e.g. April 25th, 2026"
              value={form.date}
              onChange={e => set('date', e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Start time</label>
            <input
              className={styles.input}
              placeholder="e.g. 4:00 PM"
              value={form.time}
              onChange={e => set('time', e.target.value)}
            />
          </div>
        </div>

        {/* Venue */}
        <div className={styles.field}>
          <label className={styles.label}>Venue / Location</label>
          <input
            className={styles.input}
            placeholder="e.g. The Grand Bali Resort, Ballroom A, New York"
            value={form.venue}
            onChange={e => set('venue', e.target.value)}
          />
        </div>

        {/* Schedule */}
        <div className={styles.field}>
          <label className={styles.label}>Schedule items</label>
          <div className={styles.scheduleList}>
            {form.scheduleItems.map((item, i) => (
              <div key={item.id} className={styles.scheduleRow}>
                <input
                  className={styles.scheduleTime}
                  placeholder="Time"
                  value={item.time}
                  onChange={e => setScheduleItem(item.id, 'time', e.target.value)}
                />
                <input
                  className={styles.scheduleDesc}
                  placeholder={`e.g. ${['Welcome ceremony', 'Dinner & speeches', 'Dancing', 'Cake cutting'][i] || 'Activity'}`}
                  value={item.description}
                  onChange={e => setScheduleItem(item.id, 'description', e.target.value)}
                />
                {form.scheduleItems.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removeScheduleItem(item.id)}
                    aria-label="Remove"
                  >×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className={styles.addBtn} onClick={addScheduleItem}>
            + Add item
          </button>
        </div>

        {/* Photo Wall subsections */}
        <div className={styles.field}>
          <label className={styles.label}>Photo wall subsections</label>
          <div className={styles.scheduleList}>
            {form.photoSubsections.map((item, i) => (
              <div key={item.id} className={styles.scheduleRow}>
                <input
                  className={styles.scheduleDesc}
                  placeholder={`e.g. ${['Ceremony', 'Reception', 'Family moments', 'After party'][i] || 'Photo subsection'}`}
                  value={item.title}
                  onChange={e => setPhotoSubsection(item.id, e.target.value)}
                />
                {form.photoSubsections.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => removePhotoSubsection(item.id)}
                    aria-label="Remove"
                  >×</button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className={styles.addBtn} onClick={addPhotoSubsection}>
            + Add subsection
          </button>
        </div>

        {/* Dress code & Color theme */}
        <div className={styles.row}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Dress code</label>
            <input
              className={styles.input}
              placeholder="e.g. Black tie, Tropical formal"
              value={form.dressCode}
              onChange={e => set('dressCode', e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Color theme</label>
            <input
              className={styles.input}
              placeholder="e.g. Gold & purple"
              value={form.colorTheme}
              onChange={e => set('colorTheme', e.target.value)}
            />
            <div className={styles.colorChips}>
              {COLOR_THEMES.map(theme => (
                <button
                  key={theme.name}
                  type="button"
                  className={`${styles.colorChip} ${form.colorTheme === theme.name ? styles.colorChipActive : ''}`}
                  onClick={() => set('colorTheme', theme.name)}
                >
                  <span className={styles.colorSwatches}>
                    {theme.colors.map(color => (
                      <span key={color} className={styles.colorSwatch} style={{ background: color }} />
                    ))}
                  </span>
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Special notes */}
        <div className={styles.field}>
          <label className={styles.label}>Special notes <span className={styles.optional}>(optional)</span></label>
          <textarea
            className={styles.textarea}
            placeholder="e.g. Traditional turmeric ceremony, marigold decorations, vegetarian menu"
            value={form.specialNotes}
            onChange={e => set('specialNotes', e.target.value)}
            rows={3}
          />
        </div>

        {/* Error summary */}
        {errors.length > 0 && (
          <div className={styles.errorSummary}>
            {errors.map(c => <div key={c.field}>⚠ {c.message}</div>)}
          </div>
        )}

        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleReview}
          disabled={!canReview}
        >
          Review & Continue →
        </button>
      </div>
    );
  }

  // ── Review view ─────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      <button type="button" className={styles.backLink} onClick={() => setView('form')}>
        ← Back to form
      </button>

      <h3 className={styles.reviewTitle}>Final check</h3>

      {/* Checks */}
      {(warnings.length > 0 || suggestions.length > 0) && (
        <div className={styles.checkList}>
          {warnings.map(c => (
            <div key={c.field} className={`${styles.checkItem} ${styles.checkWarning}`}>
              <span>⚠</span> {c.message}
              <button type="button" className={styles.fixBtn} onClick={() => setView('form')}>Fix</button>
            </div>
          ))}
          {suggestions.map(c => (
            <div key={c.field} className={`${styles.checkItem} ${styles.checkSuggestion}`}>
              <span>💡</span> {c.message}
              <button type="button" className={styles.fixBtn} onClick={() => setView('form')}>Add</button>
            </div>
          ))}
          {warnings.length === 0 && suggestions.length > 0 && (
            <div className={`${styles.checkItem} ${styles.checkGood}`}>
              ✓ All required fields complete — looking great!
            </div>
          )}
        </div>
      )}

      {warnings.length === 0 && suggestions.length === 0 && (
        <div className={`${styles.checkItem} ${styles.checkGood}`}>
          ✓ Everything looks perfect — ready to generate!
        </div>
      )}

      {/* Assembled prompt */}
      <div className={styles.field} style={{ marginTop: 20 }}>
        <label className={styles.label}>
          Your event prompt <span className={styles.optional}>(you can edit this)</span>
        </label>
        <textarea
          className={styles.textarea}
          value={assembledPrompt}
          onChange={e => setAssembledPrompt(e.target.value)}
          rows={6}
        />
        <div className={styles.charCount}>{assembledPrompt.length} / 1000</div>
      </div>

      <button
        type="button"
        className={styles.primaryBtn}
        onClick={() => onComplete(assembledPrompt, {
          names: form.names,
          eventType: form.eventType === 'Other' ? form.customEventType : form.eventType,
          hostedBy: form.hostedBy,
        })}
        disabled={assembledPrompt.trim().length < 10}
      >
        Looks good — Choose Plan →
      </button>
    </div>
  );
}
