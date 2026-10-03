// Test-only entrypoint. Real loopback OAuth and OS encryption; provider responses are fixtures.
const { dialog, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.DOPAMIGO_GOOGLE_FIXTURE_DIR;
if (!root) throw new Error('Fixture directory is required.');
const nativeFetch = globalThis.fetch;
globalThis.googleFixture = { phase: 1, oauthOpens: 0, refreshes: 0, apiCalls: 0 };
const scopes = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events.readonly', 'https://www.googleapis.com/auth/drive.metadata.readonly'];
const due = days => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0,10); };
const reply = value => new Response(JSON.stringify(value));
globalThis.fetch = async (raw, options) => {
  const url = new URL(String(raw));
  if (url.hostname === '127.0.0.1') return nativeFetch(raw, options);
  if (url.hostname === 'oauth2.googleapis.com') {
    if (url.pathname === '/revoke') return reply({});
    const body = new URLSearchParams(options.body); if (body.get('grant_type') === 'refresh_token') globalThis.googleFixture.refreshes++;
    return reply({ access_token: 'fixture-access-only', refresh_token: 'fixture-refresh-only', expires_in: 1, scope: scopes.join(' ') });
  }
  if (url.hostname === 'openidconnect.googleapis.com') return reply({ sub: 'fixture-student', email: 'student@example.org', email_verified: true });
  if (url.hostname === 'generativelanguage.googleapis.com') {
    const body = JSON.parse(options.body); const events = JSON.parse(body.contents[0].parts[0].text);
    return reply({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ events: events.map(item => ({ index: item.index, kind: item.title.includes('Dinner') ? 'other' : 'assignment', title: 'Urban green spaces literature review', subject: 'Research Methods', confidence: .98, reason: 'Explicit academic deadline.' })) }) }] } }] });
  }
  if (url.hostname !== 'www.googleapis.com') throw new Error('Unexpected test network destination.');
  globalThis.googleFixture.apiCalls++;
  if (url.pathname.endsWith('/calendarList')) return reply({ items: [{ id: 'course-calendar', summary: 'Research Methods', accessRole: 'owner' }] });
  if (url.pathname.endsWith('/events')) return reply({ items: [{ id: 'assignment-one', iCalUID: 'assignment-one@fixture', summary: 'Urban green spaces literature review due', description: 'Submit the review for Research Methods.', start: { date: due(globalThis.googleFixture.phase === 1 ? 7 : 10) } }, { id: 'dinner', summary: 'Dinner with friends', start: { date: due(3) } }] });
  if (url.pathname === '/drive/v3/files/assignments-folder') return reply({ id: 'assignments-folder', name: 'Assignments', mimeType: 'application/vnd.google-apps.folder' });
  if (url.pathname === '/drive/v3/files') {
    if (url.searchParams.get('q').includes('in parents')) return reply({ files: [{ id: 'student-draft', name: 'Urban green spaces literature review', mimeType: 'application/vnd.google-apps.document', modifiedTime: new Date().toISOString() }] });
    return reply({ files: [{ id: 'assignments-folder', name: 'Assignments', mimeType: 'application/vnd.google-apps.folder' }] });
  }
  throw new Error('Unexpected fixture request.');
};
dialog.showOpenDialog = async options => ({ canceled: false, filePaths: [path.join(root, options.title.includes('OAuth') ? 'oauth.json' : 'brief.pdf')] });
shell.openExternal = async raw => {
  const url = new URL(raw);
  if (url.hostname !== 'accounts.google.com') return;
  globalThis.googleFixture.oauthOpens++;
  const callback = new URL(url.searchParams.get('redirect_uri')); callback.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'fixture-code' }).toString();
  const response = await nativeFetch(callback); if (!response.ok) throw new Error('Fixture callback failed.');
};
require(path.resolve('dist/main.cjs'));
