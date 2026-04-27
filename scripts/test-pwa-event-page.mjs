import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const eventPage = readFileSync(new URL('../pages/e/[id].js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const icon = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

assert.equal(manifest.display, 'standalone');
assert.equal(manifest.icons[0].src, '/icon.svg');
assert.match(icon, /<svg/);
assert.match(sw, /self\.addEventListener\('fetch'/);

assert.match(eventPage, /const INSTALL_EVENT_APP = `<script>/);
assert.match(eventPage, /beforeinstallprompt/);
assert.match(eventPage, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
assert.match(eventPage, /oneday-install-card/);
assert.match(eventPage, /\/api\/manifest\.webmanifest\?start=\/e\//);
assert.match(eventPage, /injectBeforeHeadClose\(html, manifestLinks\)/);

assert.match(eventPage, /__onedayPhotoNoticeState/);
assert.match(eventPage, /setInterval\(function\(\)\{/);
assert.match(eventPage, /new photo'\+\(count===1\?'':'s'\)\+' added to the photo wall/);
assert.match(eventPage, /trackPhotoCount\(si, photos\.length, grid\)/);

console.log('pwa event-page tests passed');
