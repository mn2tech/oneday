export const EVENT_THEME_PRESETS = [
  { id: 'default', label: 'Default' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'rose', label: 'Rose' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
];

const PRESET_VARS = {
  midnight: {
    bg: '#090c16',
    bgSoft: '#12182b',
    text: '#ecf0ff',
    muted: '#a7b0cf',
    accent: '#8da2ff',
    accent2: '#5de0ff',
    border: 'rgba(140,162,255,0.28)',
    buttonText: '#0b1020',
  },
  rose: {
    bg: '#170d14',
    bgSoft: '#261522',
    text: '#ffeef7',
    muted: '#d8adc8',
    accent: '#ff6da5',
    accent2: '#ff9b7a',
    border: 'rgba(255,109,165,0.30)',
    buttonText: '#2c0f1e',
  },
  forest: {
    bg: '#0b1610',
    bgSoft: '#15251c',
    text: '#e7fff1',
    muted: '#a7cfb7',
    accent: '#59d68a',
    accent2: '#78e6d1',
    border: 'rgba(89,214,138,0.30)',
    buttonText: '#082014',
  },
  sunset: {
    bg: '#1b1010',
    bgSoft: '#2a1714',
    text: '#fff0e6',
    muted: '#dfb8a3',
    accent: '#ff8c5a',
    accent2: '#ffd166',
    border: 'rgba(255,140,90,0.30)',
    buttonText: '#2a1306',
  },
};

export function normalizeThemePreset(input) {
  if (!input || typeof input !== 'string') return 'default';
  const key = input.trim().toLowerCase();
  if (key === 'default') return 'default';
  return PRESET_VARS[key] ? key : 'default';
}

export function buildThemePresetStyleTag(themePreset) {
  const preset = normalizeThemePreset(themePreset);
  if (preset === 'default') return '';
  const t = PRESET_VARS[preset];
  return `<style id="oneday-theme-preset">
html,body{
  background:${t.bg} !important;
  color:${t.text} !important;
}
body{
  --oneday-theme-bg:${t.bg};
  --oneday-theme-bg-soft:${t.bgSoft};
  --oneday-theme-text:${t.text};
  --oneday-theme-muted:${t.muted};
  --oneday-theme-accent:${t.accent};
  --oneday-theme-accent-2:${t.accent2};
  --oneday-theme-border:${t.border};
}
section,article,main,header,footer,nav,
[class*="card"],[class*="panel"],[class*="container"]{
  border-color:var(--oneday-theme-border) !important;
}
p,small,span,label,[class*="subtitle"],[class*="muted"],[class*="meta"]{
  color:var(--oneday-theme-muted) !important;
}
h1,h2,h3,h4,h5,h6,strong,b{
  color:var(--oneday-theme-text) !important;
}
a{
  color:var(--oneday-theme-accent) !important;
}
button,[role="button"],input[type="button"],input[type="submit"],input[type="reset"]{
  background-image:linear-gradient(135deg,var(--oneday-theme-accent),var(--oneday-theme-accent-2)) !important;
  color:${t.buttonText} !important;
  border-color:transparent !important;
}
input,textarea,select{
  border-color:var(--oneday-theme-border) !important;
}
</style>`;
}
