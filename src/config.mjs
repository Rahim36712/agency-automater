import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function loadEnv() { if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env')); }
export function config() {
  loadEnv();
  const num = (key, fallback, min, max) => { const n = Number(process.env[key] ?? fallback); if (!Number.isInteger(n) || n < min || n > max) throw Error(`Invalid ${key}`); return n; };
  const c = {
    root, dataDir:path.join(root,'.data'), model:process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    geminiKey:process.env.GEMINI_API_KEY, freeConfirmed:process.env.GEMINI_FREE_TIER_CONFIRMED === 'true',
    geminiInterval:num('GEMINI_MIN_INTERVAL_MS',15000,1000,300000), geminiDaily:num('GEMINI_DAILY_LIMIT',20,1,1000),
    clientId:process.env.GOOGLE_CLIENT_ID, clientSecret:process.env.GOOGLE_CLIENT_SECRET, sheetId:process.env.GOOGLE_SHEET_ID,
    senderName:process.env.SENDER_NAME, senderEmail:process.env.SENDER_EMAIL?.toLowerCase(), businessName:process.env.SENDER_BUSINESS_NAME,
    address:process.env.SENDER_POSTAL_ADDRESS, services:(process.env.DELIVERABLE_SERVICES || 'Python automation,Web applications,SQL reporting,Data engineering,Cloud and DevOps,AI business automation').split(',').map(s=>s.trim()).filter(Boolean),
    mode:process.env.OUTREACH_MODE || 'test', testRecipients:(process.env.TEST_RECIPIENTS || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),
    maxLeads:num('MAX_LEADS_PER_RUN',3,1,20), maxDrafts:num('MAX_DRAFTS_PER_RUN',3,1,10), timezone:process.env.TIMEZONE || 'Asia/Karachi',
    port:num('HELPER_PORT',8787,1024,65535), n8nPort:num('N8N_PORT',5678,1024,65535), token:process.env.HELPER_TOKEN,
    trackingEnabled:process.env.TRACKING_ENABLED==='true',trackingUrl:process.env.TRACKING_URL||'',trackingKey:process.env.TRACKING_ADMIN_TOKEN||''
  };
  if (!['test','production'].includes(c.mode)) throw Error('OUTREACH_MODE must be test or production');
  if (!/^[a-z0-9.-]+$/.test(c.model)) throw Error('Invalid model identifier');
  new Intl.DateTimeFormat('en', {timeZone:c.timezone});
  return c;
}
