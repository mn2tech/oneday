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
