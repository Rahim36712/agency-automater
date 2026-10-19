# Agency Mail Tracker

Your privately installed Chrome extension, tracking server and optional agency integration. No subscription is built into the code. You send every email yourself. No notification emails are sent. Tracking records possible opening signals; it cannot prove that a person opened or read an email.

## Install the extension

The unpacked extension is built at `D:\AI STUFF\PROJECTS\automater\extension`.

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Click **Load unpacked**, choosing that `extension` folder, not the project root.
3. Pin **Agency Mail Tracker** and open its dashboard from the toolbar popup.
4. Connect your server below, then refresh Gmail. Disable the old tracker during testing to avoid two tracking images.

After extension edits, run `npm run tracking:build`, Reload its Chrome card, and refresh Gmail. The standalone extension does not require n8n, Gemini or Google OAuth.

## Deploy the public tracker

Recipients cannot reach localhost. Only the small image/API server is public; n8n stays on your laptop.

1. Create a [Cloudflare account](https://dash.cloudflare.com/), open **Workers & Pages**, and choose your `workers.dev` account subdomain. Use **Workers Free** and **D1 Free** with paid upgrades disabled. The script cannot inspect billing.
2. Find your account ID and create an account-scoped API token with **Workers Scripts: Edit** and **D1: Edit** for that account. API permission names are `Workers Scripts Write` and `D1 Write`; Workers Scripts access also permits the account subdomain lookup. Do not use a global API key.
3. Run `npm run tracking:setup` if needed. Open `.env` locally and enter `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_FREE_CONFIRMED=true` after checking your plan. `TRACKING_ADMIN_TOKEN` is a separate generated 64-character extension key. Keep keys local; don't paste them into chat.
4. Run:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
npm run tracking:deploy
```

This creates a D1 database, applies its schema, uploads the Worker, enables its URL, schedules daily deletion of records older than 90 days, and checks its private API before reporting success. Resource IDs are saved in ignored `.data/tracking-deployment.json` and the address as `TRACKING_URL` in `.env`. Keep that file for upgrades. Unrelated existing Workers/databases are not overwritten; no paid upgrade is attempted on failure.

5. Expand **Connection & notifications** in the extension dashboard. Enter `TRACKING_URL` and your local `TRACKING_ADMIN_TOKEN`. Chrome asks for access to that specific host. Click **Connect server**, then refresh Gmail. Desktop notifications are optional and off by default.

Cloud deployment is prepared but has not been executed against an actual account. If a scope or deployment parameter is rejected, the command stops and preserves saved resources for inspection/retry.

## Use it in Gmail

The first integration supports **desktop Gmail in English, a new-message compose window, one recipient, no Cc/Bcc**.

1. Add the recipient and subject; write your message normally.
2. Enable **Track this email** beside Send. Only recipient, subject and an ID are registered. Body text and attachments are not uploaded to the tracker.
3. Send using Gmail's button or Ctrl/Cmd+Enter. The extension watches for a new **Message sent** confirmation and closure of that compose window. It never clicks Send itself.
4. A 45-second buffer excludes activity during Gmail's maximum 30-second Undo Send period. Undo cancels tracking. Real early opens within the buffer are also missed.
5. Refresh the popup/dashboard. Optional Chrome notifications check the latest 100 messages about every five minutes while Chrome runs. Hosted event collection continues while your laptop is off.

Send one tracked message at a time. Changing recipient/subject after enabling tracking requires disabling and re-enabling it. Scheduled sends, inline replies, mobile Gmail and other clients are not supported by this compose integration. Gmail DOM or locale changes can require selector updates. If send confirmation is missed, the record remains **Awaiting send confirmation**. **Confirm already sent** is a manual fallback after checking that exact message in Sent Mail; it is labelled separately from verified Gmail API proof.

Saved drafts can restore tracking when the local registry survives and the record still awaits send confirmation. Closing an unsent compose window cancels its tracking record. When you reopen that draft, enable tracking again; a known cancelled/disabled image is replaced with a fresh registration. Agency-created drafts are already tracked; don't add a second image. A copied image without a known local mapping needs removal before registering a fresh email. Gmail/browser caches, your own Sent Mail views and automated fetching affect signals; perfect sender-open filtering is not promised.

**Disable** stops future recording. **Delete record** removes its hosted record. Disconnecting removes this browser's key/sync; hosted records remain. Hosted deletion does not erase a previously synchronized Sheets row—remove that row separately if required. Clearing extension storage loses restored-draft mappings and queued local confirmations.

Send confirmations/cancellations are stored locally and retried after connection returns. If the server is offline during Undo or cancellation, the image is removed locally but the hosted record may remain armed until the queued cancellation reaches it. The Gmail control/dashboard reports pending actions.

## Optional agency and Google Sheets connection

With your existing Google authorization configured:

```powershell
npm run tracking:crm
```

This adds **TRACKING** and exact headers, preserving the original five tabs. Conflicting existing TRACKING headers produce an error instead of overwriting data. See docs/crm-columns.md for mappings.

After the owned-account test, set `TRACKING_ENABLED=true`, retain your deployed address/key in `.env`, and restart `npm start`. New agency drafts get an HTML tracking image plus a plain-text alternative. Existing drafts are not retrofitted. Agency images arm only after actual Gmail Sent Mail reconciliation verifies your manual send.

```powershell
npm run run -- reconcile
npm run run -- tracking-sync
```

Standalone extension records link to a CRM lead only if there is one unambiguous recipient match. Opening signals never change scoring, suppression or follow-up rules. The additional inactive `workflows/agency_tracking-sync.json` can sync every 30 minutes. Stop n8n before `npm run workflows:import`: it now imports 11 workflows, connects the helper credential, and deactivates existing schedules for review.

## Safe test and local preview

Use two accounts you control first. Register a fresh email, verify it awaits send, send it manually, wait over 45 seconds, then open it in your second account. Check the possible opening signal. Also test blocked images, Undo Send, disabled/deleted records, saved-draft restore and Chrome restart. Inspect Chrome's extension Errors panel. No signal does not mean an unopened email.

For the local dashboard/API preview:

```powershell
npm run tracking:dev
```

Open `http://127.0.0.1:8788/preview`. This uses a loopback extension-API shim, not an installed extension or real Gmail session. Its key is in ignored `.data/tracker-dev/admin-key.txt`. Local data is isolated from hosted records, and localhost images cannot track external recipients. Ctrl+C stops it.

To populate this isolated preview with three clearly labelled synthetic records, run `node scripts/tracker-demo.mjs`. Remove those exact demo records with `node scripts/tracker-demo.mjs --clear`. No mail is sent by either command.

Offline checks: `npm test`, `npm run test:tracking`, `npm run check`. Worker logic uses actual SQLite through a D1-compatible local adapter; compose logic uses synthetic Gmail DOM fixtures. Actual Chrome/Gmail, Cloudflare deployment/D1, notifications and Sheets synchronization still require controlled account testing.

## Data and accuracy

Application records contain opaque IDs/tokens, one recipient, subject, optional company/agency IDs, send-confirmation type, state, timestamps and aggregate image-request count. No email bodies, attachments, IP addresses or user agents are stored. Obvious scanner/preview agents and HEAD requests are excluded, but automated fetching still cannot be reliably distinguished from human opening. Cloudflare may process its own infrastructure telemetry.

The admin key controls this single-user tracker. Its hash is uploaded as a Worker secret. The key stays in `.env` and trusted Chrome extension storage, inaccessible to content scripts. Image URLs use random tokens instead of email addresses. Use tracking where permitted and preserve opt-out handling.

Apple Mail can prefetch without human opening; blocked images hide opens; forwarding/caching affects counts and attribution. Wording therefore stays **Possible open detected**, **No opening signal detected**, and **image requests**.

Official sources checked 2026-10-11: [Chrome permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Gmail Undo Send](https://support.google.com/mail/answer/2819488), [Gmail images](https://support.google.com/mail/answer/145919), [Apple privacy](https://www.apple.com/in/legal/privacy/data/en/mail-privacy-protection/), [Worker upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/), [multipart bindings](https://developers.cloudflare.com/workers/configuration/multipart-upload-metadata/), [D1 queries](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).
