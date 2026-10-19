# Agency automation

A local acquisition assistant for a solo IT founder in Pakistan. It researches manually chosen company websites, keeps a Google Sheets CRM, scores documented opportunities, creates Gmail drafts for your review, stops follow-ups on replies, and reports daily activity. **You review and send every email yourself in Gmail.** The program has no email-sending endpoint.

## Start here

**Optional Chrome email tracker:** [installation and server setup](docs/mail-tracker.md). The built `extension/` folder adds a per-message Gmail toggle, possible-opening dashboard, optional desktop notifications, and CRM synchronization. It requires your own free-tier public tracker deployment, independently of the core agency Google/Gemini setup.

Node.js **24 LTS** and npm are required. The project pins **n8n Community Edition 2.42.6**. No Docker, local AI models, paid hosting or mandatory paid API is used. The helper uses built-in Node APIs; n8n is the runtime npm dependency and jsdom is a development dependency for extension tests.

In PowerShell:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
npm install --no-fund
npm run setup
npm test
```

`setup` creates a private `.env` and helper token. It preserves existing settings. Open `.env` locally and complete your Google, Gemini and sender information. Never put keys in chat. `install.cmd` performs the install, setup and offline tests if you prefer a double-click.

1. Follow [Google setup](docs/google-setup.md) to enable Gmail and Sheets APIs, create a **Desktop app** OAuth client, and authorize your own Gmail account with `npm run auth`.
2. Upload `templates/crm-template.xlsx` to Google Drive. Open it with Google Sheets and choose **File > Save as Google Sheets** if it remains an Excel file. Keep all five tab names and row 1 headers. Copy the spreadsheet ID from its URL into `GOOGLE_SHEET_ID` in `.env`. No cloud sheet has been created for you.
3. Get a Gemini API key from [AI Studio](https://aistudio.google.com/). Confirm the project is on **Free tier with billing disabled**. Enter the key locally and set `GEMINI_FREE_TIER_CONFIRMED=true`. The default model is `gemini-3.5-flash-lite`; `gemini-3.1-flash-lite` and `gemini-3.8-flash` are allowed alternatives. Standard text generation free-tier pricing was checked on 2026-10-13; account availability and quotas vary.

Gemini availability fallback is automatic: `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`, starting at your configured model and only moving lower. Quota errors (429), overload/server errors, unavailable models (404), and network failures try the next model once. Failed models are skipped for five minutes (one hour for 404), with cooldowns preserved across restart. All attempts share the existing throttle and daily cap. The selected model and fallback events are recorded locally. Authentication, invalid input, blocked content and invalid output still require attention. If all models are unavailable, drafting stays blocked with a clear retry message; availability and unused quota cannot be guaranteed. No paid fallback is added.
4. Enter your real name, business name, email and valid postal address. Limit `DELIVERABLE_SERVICES` to work you can actually deliver. Put a second email address **you control** in `TEST_RECIPIENTS`. Leave `OUTREACH_MODE=test`.
5. Run these commands:

```powershell
npm run doctor
npm start
```

Open **http://localhost:5678** and create the local n8n owner account. Keep the terminal open. `start.cmd` also starts both processes. They bind only to your laptop. Ctrl+C stops them; restart with the same command after reboot.

## Import the workflows

After creating the n8n owner account, stop `npm start` with Ctrl+C. Import everything, then restart:

```powershell
npm run workflows:import
npm start
```

Alternatively, use n8n's **Import from file** menu for each JSON in `workflows/`. All **11 workflows start inactive**, including the optional tracking sync. Reimporting updates the same IDs and deactivates them, so import while stopped and review before activating again.

The CLI import command automatically creates the encrypted **Agency Helper** header credential and connects it to the imported workflows. The temporary private import file is deleted afterward. You do not need to wire each node yourself. Google/Gemini credentials still require the setup above.

If you import the JSON files manually through the UI instead, create one **HTTP Header Auth** credential named **Agency Helper**:

- Header name: `x-agency-token`
- Header value: your local `.env` `HELPER_TOKEN`

For manual UI imports, select it on both HTTP nodes in every task workflow and on the error workflow's HTTP node. The local connection test needs no credential. If you change `HELPER_PORT`, edit the workflow HTTP URLs as well. In each task workflow's settings, verify the error workflow is **Agency - G Error monitoring**. The checked-in JSON contains placeholders, never real credentials.

Run **Agency - Local connection test** manually first. Then follow [the owned-account test](docs/live-testing.md). Activate the Schedule workflows only after that succeeds. The error workflow is selected in settings; Error Trigger is invoked by failed scheduled executions and normally needs no independent schedule. Manual execution errors remain visible in n8n and the helper journal.

| Workflow | What it does | Suggested schedule (Karachi time) |
|---|---|---|
| 00 Lead intake | Assigns IDs, normalizes websites, marks duplicates | Every 30 minutes |
| A Lead research | Fetches permitted public pages and validates Gemini research | 09:00 daily, up to 3 leads |
| B Lead qualification | Applies reviewed evidence scoring | 10:15 daily |
| C Gmail drafts for review | Prepares approved A leads as drafts | 11:00 daily, up to 3 drafts |
| D Reply detection and suppression | Reads replies, stops follow-ups, keeps opt-outs | Every 30 minutes |
| Sent Mail reconciliation | Confirms your manual sends | Every 30 minutes |
| E Follow-up drafts | Drafts after 4 days, then 7 days from the first follow-up's actual send | 12:00 daily |
| F Daily business report | Writes counts to REPORTS and local `reports/` | 18:00 daily |
| G Error monitoring | Records n8n failures | Error Trigger |

## Add your first 10 clients

Choose **7 US software/development or digital marketing agencies**, **2 direct US businesses**, and **1 Pakistani business** as an initial mix. Look for documented services, current partner requests or technology initiatives. This is a starting allocation, not proof that any company needs help.

Enter one website per row in **LEADS**, or replace the `.example` placeholders in `sample-data/first-10-leads.csv` and import it from a second terminal while `npm start` is running:

```powershell
npm run leads:import -- sample-data/first-10-leads.csv
npm run run -- intake
```

Do not use the sample `.example` domains as real leads. Use original public company websites. Email is optional. **Never guess contact addresses.** Intake and CSV import leave all approvals false.

For each lead:

1. Check that automated access is permitted by the website's terms and your purpose. Set **Research Allowed** to `true`. The fetcher also obeys robots.txt, rejects private network addresses and login/social scraping, and visits at most the homepage, `/about` and `/contact`.
2. Run research manually or wait for its schedule. Read **Verified Observations**, **Source URLs**, the explicitly tentative **Possible IT Opportunity**, and **Score Inputs**. Unverified fields stay blank. You can correct the points and reasons in the Score Inputs JSON; every scored quote must be in the verified observations. Read [the scoring guide](docs/scoring.md).
3. Set **Score Reviewed** and **Delivery Confirmed** to `true` only after checking the evidence and your delivery capacity. Run qualification. Score 9–12 becomes A; 5–8 becomes B; 0–4 becomes C. Unknown budget and timing receive 0. B/C leads need additional research before drafting.
4. Check the public contact email and recipient role. Set **Contact Verified**, **Outreach Approved**, and optionally **Follow-up Allowed** to `true`. Production drafts require the email to appear on a collected public company page. Test mode permits only the configured owned recipients.
5. Run the draft workflow. Open **Gmail > Drafts**, review the exact observation, service offer, sender details and opt-out instructions, then send personally if appropriate. Creating a draft never advances a follow-up clock.

After the owned-account test, switch `OUTREACH_MODE=production` locally and restart when ready for reviewed real contacts. This only allows draft recipients outside the test list. Sending remains manual.

## Useful commands

Run task commands in a second terminal while the helper is running. They print a job ID, poll status, and display the outcome.

```powershell
npm run crm:check
npm run gemini:test
npm run run -- research
npm run run -- qualify
npm run run -- drafts
npm run run -- reconcile
npm run run -- replies
npm run run -- followups
npm run run -- report
npm run run -- recover
npm run check
```

`gemini:test` makes a real, capped Gemini API request after you configure it. `npm test` is entirely offline, uses mocks, and never contacts prospects. [Validation notes](docs/validation.md) distinguish what was actually tested from what still requires your credentials.

For a repeatable n8n polling check after workflow import, stop both services and run `npm run test:n8n`. It runs the actual report workflow against a mock local helper, checks the imported credential and poll loop, and makes no Google requests. Restart with `npm start` afterward. It requires the default workflow helper port 8787.

## Reliability and free-setup limits

Google Sheets holds the CRM. A local SQLite **recovery journal**, not an additional CRM, holds immutable outreach attempts, processed-message IDs, opt-outs, AI request counters and queued jobs. Keep `.data/` with this project. Removing it can lose suppression and draft deduplication history. Read [recovery and privacy](docs/operations.md) before moving or restoring the project.

Draft POSTs are never retried automatically. If a connection breaks after Gmail accepts a draft, its operation stays uncertain and blocks another attempt. `recover` scans Gmail drafts for the exact Message-ID; reconciliation scans Sent Mail for the exact Message-ID or unique visible reference plus matching sender/recipient and SENT label. If you delete the reference or Gmail changes the identity, sending may remain unconfirmed and follow-ups stay blocked. An uncertain operation with no identifiable draft requires manual investigation; it is deliberately not auto-reset.

The laptop must be awake, connected and running. Missed scheduled runs do not execute while powered off; queued work survives restarts and later reply scans cover messages since first send. Run reconciliation, replies and report after extended downtime. OAuth apps left in Google's Testing state can need reauthorization after seven days. Gemini quotas are project-specific, may be low, and are not guaranteed. Defaults are 15 seconds between API attempts and a rolling 20-attempt daily cap; lower these limits to your actual AI Studio quotas. No automatic paid-model or paid-search fallback exists. Public-only free-tier Gemini inputs may be used by Google to improve products, so replies sent for optional AI review are limited and you should review that policy.

The installed n8n dependency tree has unresolved npm audit findings, including critical findings; see docs/validation.md for the measured counts and scope. This is a local installation for your own trusted workflows and account. Community package installation is disabled. npm's proposed downgrade to n8n 1.17.0 is not an appropriate security fix for this project. n8n also warns that future releases will remove non-container/internal-runner operation, so remain on the verified 2.x pin until a compatible supported path is checked. Python-runner startup warnings do not prevent the JavaScript workflows from running; no Python workflow is required.

The initial website collector cannot render JavaScript-only sites and may miss contacts or agency signals on nonstandard paths. No automatic search/discovery service is enabled: manually selected URLs and CSV imports avoid assumed free search access. No optional report-to-self Gmail draft is enabled; local reports and the REPORTS tab are the default. Replies use conservative English rules; ambiguous messages stop follow-ups for manual review. An opt-out received after a draft was already created must also be removed from Gmail manually before you send it. The system cannot control your manual Gmail actions.

## Project files

`src/` contains the shared testable rules and Google/Gemini adapters. `workflows/` contains importable native n8n Manual/Schedule, HTTP Request, Wait, Code, If and Error Trigger nodes. HTTP nodes call a local helper instead of duplicating OAuth and retry logic inside eight workflows. This uses documented Google REST APIs and keeps the durable safety checks consistent. `prompts/` has seven reusable prompts; the main research prompt combines problem identification and service recommendation to save quota. Deterministic scoring and reporting do not spend Gemini quota. AI selects approved email phrases; code inserts the verified observation, exact service and compliance footer. `templates/` has the five-tab workbook, exact CSV headers and editable scoring rules. `docs/` has setup, column mappings, tests, recovery and implementation notes.

Use Git to track code and documentation. `.env`, `.data/`, report files, npm dependencies and credentials are ignored. Verify with `git status` before committing. No secrets are included in exported workflows.
