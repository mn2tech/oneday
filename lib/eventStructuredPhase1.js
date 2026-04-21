const MAX_FIELD = {
  title: 120,
  dateTime: 120,
  location: 180,
  host: 120,
  dressCode: 120,
  scheduleTime: 80,
  scheduleTitle: 140,
  scheduleDescription: 500,
};

export function createEmptyPhase1Content(fallbackTitle = '') {
  return {
    eventDetails: {
      title: String(fallbackTitle || '').slice(0, MAX_FIELD.title),
      dateTime: '',
      location: '',
      host: '',
      dressCode: '',
    },
    schedule: [],
  };
}

function cleanText(value, maxLen) {
  return String(value == null ? '' : value).trim().slice(0, maxLen);
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToLines(html) {
  const noScript = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(noScript)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function pickFirst(lines, testers) {
  for (const line of lines) {
    for (const test of testers) {
      const value = test(line);
      if (value) return value;
    }
  }
  return '';
}

export function extractLiveEventDetailsFromHtml(html, fallback = {}) {
  const lines = htmlToLines(html);
  const titleFallback = cleanText(fallback.title || '', MAX_FIELD.title);
  const eventDateFallback = cleanText(fallback.eventDate || '', MAX_FIELD.dateTime);

  const dateTime = pickFirst(lines, [
    (line) => {
      const m = line.match(/(?:📅|calendar)\s*(.+)$/i);
      return m ? m[1].trim() : '';
    },
    (line) => {
      const m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b[\w,\s:-]*(\d{1,2}:\d{2}\s*(am|pm))/i);
      return m ? line : '';
    },
  ]) || eventDateFallback;

  const location = pickFirst(lines, [
    (line) => {
      const m = line.match(/(?:📍|location|venue)\s*[:\-]?\s*(.+)$/i);
      return m ? m[1].trim() : '';
    },
  ]);

  const host = pickFirst(lines, [
    (line) => {
      const m = line.match(/hosted\s+by\s+(.+)$/i);
      return m ? m[1].trim() : '';
    },
    (line) => {
      const m = line.match(/^host\s*[:\-]?\s*(.+)$/i);
      return m ? m[1].trim() : '';
    },
  ]);

  const dressCode = pickFirst(lines, [
    (line) => {
      const m = line.match(/dress\s*code\s*[:\-]?\s*(.+)$/i);
      return m ? m[1].trim() : '';
    },
  ]);

  const title = titleFallback || cleanText(lines[0] || '', MAX_FIELD.title);

  return {
    title: cleanText(title, MAX_FIELD.title),
    dateTime: cleanText(dateTime, MAX_FIELD.dateTime),
    location: cleanText(location, MAX_FIELD.location),
    host: cleanText(host, MAX_FIELD.host),
    dressCode: cleanText(dressCode, MAX_FIELD.dressCode),
  };
}

export function mergeDetailsWithFallback(primary, fallback) {
  const p = primary || {};
  const f = fallback || {};
  return {
    title: cleanText(p.title || f.title || '', MAX_FIELD.title),
    dateTime: cleanText(p.dateTime || f.dateTime || '', MAX_FIELD.dateTime),
    location: cleanText(p.location || f.location || '', MAX_FIELD.location),
    host: cleanText(p.host || f.host || '', MAX_FIELD.host),
    dressCode: cleanText(p.dressCode || f.dressCode || '', MAX_FIELD.dressCode),
  };
}

function normalizeScheduleItem(item, idx) {
  const idRaw = typeof item?.id === 'string' ? item.id.trim() : '';
  const id = (idRaw || `schedule_${idx + 1}`).slice(0, 64);
  return {
    id,
    time: cleanText(item?.time, MAX_FIELD.scheduleTime),
    title: cleanText(item?.title, MAX_FIELD.scheduleTitle),
    description: cleanText(item?.description, MAX_FIELD.scheduleDescription),
  };
}

export function normalizePhase1Content(input, fallbackTitle = '') {
  const base = createEmptyPhase1Content(fallbackTitle);
  const src = input && typeof input === 'object' ? input : {};
  const details = src.eventDetails && typeof src.eventDetails === 'object' ? src.eventDetails : {};
  const scheduleRaw = Array.isArray(src.schedule) ? src.schedule : [];

  return {
    eventDetails: {
      title: cleanText(details.title || base.eventDetails.title, MAX_FIELD.title),
      dateTime: cleanText(details.dateTime, MAX_FIELD.dateTime),
      location: cleanText(details.location, MAX_FIELD.location),
      host: cleanText(details.host, MAX_FIELD.host),
      dressCode: cleanText(details.dressCode, MAX_FIELD.dressCode),
    },
    schedule: scheduleRaw.slice(0, 30).map(normalizeScheduleItem),
  };
}

export function validatePhase1Content(content) {
  const errors = [];
  if (!content || typeof content !== 'object') {
    return ['Content must be an object.'];
  }
  if (!content.eventDetails || typeof content.eventDetails !== 'object') {
    errors.push('eventDetails is required.');
  }
  if (!Array.isArray(content.schedule)) {
    errors.push('schedule must be an array.');
  } else {
    content.schedule.forEach((row, idx) => {
      if (!row || typeof row !== 'object') {
        errors.push(`schedule[${idx}] is invalid.`);
        return;
      }
      if (!String(row.title || '').trim()) {
        errors.push(`schedule[${idx}] title is required.`);
      }
    });
  }
  return errors;
}
