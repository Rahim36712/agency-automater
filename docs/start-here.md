# Finish setup and test the agency program

Checked 13 October 2026. Chrome tracking is paused. Cloudflare is not needed for these steps.

If Gemini is temporarily unavailable, continue with [testing without Gemini](testing-without-gemini.md). That guide records the completed live account checks and the next intake/n8n reporting steps; research and draft writing still need AI.

The installation, workflow import and local tests have passed. Google authorization is now saved and the user's live CRM check passed for all five original tabs. Sender information and a syntactically valid second test inbox are now configured. An earlier live Gemini test passed; subsequent tests returned HTTP 503. Automatic fallback to lower approved free-tier models has now been added and tested offline. Restart the running program to load it. Gmail draft/send/reply validation remains pending. All schedules remain inactive.

## 1. Prepare two accounts

Use your primary Gmail as the sending account, and a second inbox you own as the test recipient. Know both login passwords. Only the sending account authorizes the program. Never use a prospect's address in TEST_RECIPIENTS.

You also need a publicly accessible website for the research test, ideally a site you own. localhost, private network addresses and invented .example websites are blocked. Research needs readable public page text; a site requiring login or JavaScript may not work. A full draft test needs source evidence supporting an A score (at least 9/12); use explicitly labelled test facts on your own site if necessary. Do not invent facts about a real business to force qualification.

## 2. Create the Google project and enable APIs

Open https://console.cloud.google.com/ and sign into the sending Google account.

1. Click the project dropdown at the top, then **New project**.
2. Name it **Agency Automation**, click **Create**, then select that project. If you already have a suitable project, you can use it instead.
3. Open the top-left menu → **APIs & Services → Library**.
4. Search **Gmail API**, open the result and click **Enable**.
5. Return to Library, search **Google Sheets API**, open it and click **Enable**.

Both APIs must be enabled in the project where you create the OAuth client. No Drive API or paid n8n account is required by this program.

## 3. Configure Google consent

Top-left menu → **Google Auth Platform → Branding**. An older **APIs & Services → OAuth consent screen** link may take you to the same place.

If it says the platform is not configured, click **Get Started**. Set App name to **Agency Automation**, choose your sending email as the support email, select **External** for a personal Gmail account, enter your own contact email, review the displayed policy, and complete **Continue → Create** if you agree.

Open **Audience**. Keep Publishing status **Testing**. Under **Test users**, choose **Add users**, enter your sending Gmail address, and **Save**. You do not need to publish this app to the public for this test.

Open **Data Access → Add or Remove Scopes**. Select these three scopes. If necessary use the manual scope entry field:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
```

Click **Update** if shown, then **Save**. Google labels compose as access that can manage drafts and send mail; that is a provider permission. This program's adapter only creates drafts and does not implement sending.

## 4. Create the Desktop OAuth client

Open **Google Auth Platform → Clients → Create client**.

- Application type: **Desktop app**.
- Name: **Agency Automation Desktop**.
- Click **Create**.

Copy the **Client ID** and **Client secret** into the local settings file in step 6. If the dialog offers a download, the downloaded JSON contains client_id and client_secret. You do not need to install Google's sample Python program or rename that JSON for this project. Do not create a Web application client or configure a fixed redirect URI; our authorization script uses a random localhost callback port.

## 5. Confirm or create the Google Sheets CRM

A Sheet ID is already entered locally, but its access and headers have not passed a live check yet. If that ID points to an existing native Google Sheet created from our template, keep it and check its tabs. Otherwise:

1. Open https://drive.google.com/ using the sending account.
2. **New → File upload**; select `D:\AI STUFF\PROJECTS\automater\templates\crm-template.xlsx`.
3. Right-click the uploaded workbook → **Open with → Google Sheets**.
4. If it is still an Excel workbook, choose **File → Save as Google Sheets**. Use the new converted spreadsheet.
5. Check the bottom tabs: **LEADS**, **OUTREACH**, **SUPPRESSION**, **ACTIVITY LOG**, **REPORTS**.
6. Leave row 1 headers in their original order, spelling and capitalization. Data starts on row 2.
7. Copy the spreadsheet ID from its address: in `https://docs.google.com/spreadsheets/d/ABC123/edit`, the ID is `ABC123`.

Put only that ID into GOOGLE_SHEET_ID, not the full URL. If the Sheet belongs to another account, **Share** it with the authorized sending account as **Editor**. Keep it private; public link sharing is unnecessary. Do not add the optional TRACKING tab for this setup.

## 6. Fill the local settings

Windows Start → type **PowerShell** → open it. Run:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
notepad .env
```

Edit the existing lines below. Replace the descriptions with your own values; do not leave them literally as shown.

```dotenv
GOOGLE_CLIENT_ID=YOUR_DESKTOP_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_DESKTOP_CLIENT_SECRET
GOOGLE_SHEET_ID=YOUR_NATIVE_GOOGLE_SHEET_ID
SENDER_NAME="Your real name"
SENDER_EMAIL=your_primary_sending_gmail_address
SENDER_BUSINESS_NAME="Your real business or trading name"
SENDER_POSTAL_ADDRESS="Your real physical postal address on one line"
TEST_RECIPIENTS=your_second_owned_email_address
OUTREACH_MODE=test
TRACKING_ENABLED=false
MAX_LEADS_PER_RUN=3
MAX_DRAFTS_PER_RUN=3
TIMEZONE=Asia/Karachi
```

SENDER_EMAIL must be the exact primary Gmail address you authorize, not an alias. TEST_RECIPIENTS is your second owned inbox. Keep the existing Gemini key, Gemini model, free-tier confirmation and HELPER_TOKEN. Gemini already passed a live test. Review DELIVERABLE_SERVICES and retain only services you can actually deliver. Press Ctrl+S and close Notepad. Edit `.env`, not `.env.example`; do not create `.env.txt`. Never paste credentials into chat.

## 7. Authorize Google

In PowerShell, in this project folder:

```powershell
npm run auth
```

The terminal prints a Google authorization URL. Copy the complete URL into Chrome. Keep PowerShell open; finish within five minutes.

Select the sending account and grant all requested permissions. If Google displays an unverified app warning, verify it is your own Agency Automation app and project. For your own testing app, the available **Advanced → Go to Agency Automation (unsafe)** option can lead to consent; if Google blocks access, check the Audience test user and organization policy rather than changing credentials blindly.

Success in the browser: **Google connected. Close this tab and return to the terminal.**

Success in PowerShell: **Authorization saved privately in .data. No emails sent.**

If you time out, run auth again and use the new URL. Authorization is saved privately in `.data/google-tokens.json`.

## 8. Start the program in your own window

In **PowerShell window 1**:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
npm start
```

Keep this window open. Open http://localhost:5678 in Chrome. Sign into your existing local n8n owner account. If this is genuinely the first visit and n8n shows account setup, create the local owner account. This is separate from Google's authorization.

Open your personal workspace/workflow list. Existing names begin with **Agency -**. Leave schedules unpublished during testing. Installation and workflow import are already done; do not run setup/import again as a normal start step.

In **PowerShell window 2**, run:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
npm run doctor
npm run crm:check
```

Doctor should report required local settings ready. CRM check should list the five original tabs and their row counts without an authorization/header error. This is the live Sheet access check. Optional: `npm run gemini:test` makes a capped AI connection test; a successful response includes subject, introduction, question and the actual selected model, so you can see whether fallback was used.

For the n8n connection check, open **Agency - Local connection test → Execute workflow**. Expect the Helper health node to succeed with `ok: true`. Do not publish that manual test workflow.

## 9. Research one owned test lead

In Google Sheets → **LEADS**, use the next empty row, normally row 2:

| Column | Header | What to enter |
|---|---|---|
| B | Company | Your test company/site name |
| C | Website | A real public HTTPS website suitable for this test |
| G | Email | The second owned inbox in TEST_RECIPIENTS |
| V | Research Allowed | TRUE, after checking source access terms |

Leave generated identifiers and other computed cells blank. Keep approval cells false until reviewed.

In PowerShell window 2:

```powershell
npm run run -- intake
npm run run -- research
```

Check LEADS: A gets a Lead ID; U becomes `researched`; J contains exact source observations; M contains a recommended service; O contains suggested evidence scores. If research fails, inspect AB (Last Error) and ACTIVITY LOG. A completed batch with zero researched leads is not a passing research test.

## 10. Review and qualify

Check the quoted facts against the actual source page. Review O (Score Inputs) and M (Recommended Service). Do not turn unknown budget, need or timing into positive scores. The JSON score evidence must match verified source quotes.

Set P (**Score Reviewed**) TRUE after review. Set Q (**Delivery Confirmed**) TRUE only if you can deliver the recommended service. Run:

```powershell
npm run run -- qualify
```

R shows the score, S the category, T the explanation. An A score is at least 9/12 and U becomes `qualified`. B/C becomes `additional research` and will not produce a draft. This is expected protection, not a malfunction. For a complete controlled test, use your owned public site with clearly labelled test partner request, decision-maker, budget and current timing evidence. Do not fabricate a real prospect's facts or manually overwrite the computed score.

Once qualified, verify G is still your second owned inbox. Set W (**Contact Verified**), X (**Outreach Approved**) and Y (**Follow-up Allowed**) TRUE. Research clears scoring/contact/outreach approvals, so make these approvals after research, not before it.

## 11. Create and inspect the Gmail draft

```powershell
npm run run -- drafts
```

Open https://mail.google.com/ in the sending account → left sidebar **Drafts** (expand **More** if necessary). Open the new draft. Check the owned recipient, sensible subject, supported source observation, deliverable service, sender identity, physical address and opt-out wording. Preserve its **Reference** line.

OUTREACH should contain a Draft ID and Draft Status `draft`, with Sent Date blank. If no draft appears, inspect LEADS Last Error and ACTIVITY LOG; check qualification, approvals and test recipient matching before rerunning.

Run drafts again. Expect the same single draft, not a second copy. Then:

```powershell
npm run run -- reconcile
```

Before manual sending, Sent Date must remain blank and there should be no follow-up clock.

## 12. Test send detection and opt-out

Personally click **Send** in Gmail for this owned-inbox test only. The program does not click Send. Run:

```powershell
npm run run -- reconcile
```

In OUTREACH, Draft Status should become `sent`, Sent Message ID and Sent Date should be populated, and Next Follow-up Date should be four days after that actual send when follow-ups are allowed. Repeating reconcile must not count another send.

In your second inbox, open the received email and **Reply** with `Please unsubscribe me`. Return to PowerShell:

```powershell
npm run run -- replies
npm run run -- followups
npm run run -- report
```

Expect the owned recipient in SUPPRESSION, Reply Status `Opt-out`, follow-ups disabled and no new follow-up draft. Inspect REPORTS and ACTIVITY LOG; local report files are saved in `reports/`. That test recipient is now intentionally suppressed, so use a different owned contact for later timing tests. Do not delete `.data` or suppression to reset it. Delete any still-unsent drafts to an opted-out contact manually in Gmail.

A real follow-up timing test needs an unsuppressed owned contact and the actual waiting periods: four days after initial send, then seven days after sending the first follow-up. Any reply stops follow-ups. Do not falsify Sent Date to hurry the test.

## 13. Enable schedules only after the live test passes

You can keep running commands manually. For schedules, open http://localhost:5678 → your workspace → choose an Agency workflow → inspect **Schedule** and workflow **Settings**. Confirm timezone **Asia/Karachi**. After the test passes, use **Publish** in the top-right for the schedule workflows you want. In n8n 2.x Publish enables automatic triggers. To stop a published workflow, use its top-right menu → **Unpublish**.

| Workflow | Existing schedule, Karachi time |
|---|---|
| Agency - 00 Lead intake | Every 30 minutes |
| Agency - A Lead research | 09:00 daily |
| Agency - B Lead qualification | 10:15 daily |
| Agency - C Gmail drafts for review | 11:00 daily |
| Agency - D Reply detection and suppression | Every 30 minutes |
| Agency - Sent Mail reconciliation | Every 30 minutes |
| Agency - E Follow-up drafts | 12:00 daily |
| Agency - F Daily business report | 18:00 daily |

Leave **Agency - Optional tracking CRM sync** unpublished. **Local connection test** is manual; **G Error monitoring** is an error handler referenced by the other workflows rather than a daily schedule.

You still review facts and approve each lead in Sheets, review every Gmail draft, send personally, handle conversations/meetings and confirm delivery commitments. Research starts from the websites you enter/import; it does not discover unlimited companies by itself.

For real prospect work only after testing and appropriate outreach review: stop window 1 with Ctrl+C, change OUTREACH_MODE to `production` in `.env`, save and run `npm start` again. Keep tracking false. Production requires a verified public email present on the collected company pages. Keep test rows separate from real prospect rows; do not repurpose the same lead identifier after outreach.

## Daily use, shutdown and recovery

Start `npm start` in window 1 and keep it open while you want schedules running. Review Sheet approvals before the draft schedule. Check SUPPRESSION and replies before sending manually. If the laptop sleeps, shuts down or loses internet, schedules cannot run; after restarting run reconcile, replies and report from window 2. Check Gmail manually for opt-outs during downtime.

Stop with Ctrl+C in window 1. Restart after every `.env` change. Back up the entire `.data` folder and `.env` privately after stopping both processes, along with source/workflows/package lock and a CRM export. Do not delete `.data`: it contains duplicate prevention, actual send records, suppression, authorization and n8n state. Never run two copies against the same Gmail account and CRM.

## Common problems

| What you see | What to do |
|---|---|
| Google is not authorized | Run `npm run auth`, use the sending account and grant every requested permission. |
| Access blocked / access_denied | In the same Cloud project, Audience → Test users → add the exact sending account; personal Gmail needs External. Workspace policy may require your admin. |
| API disabled / API has not been used | Enable Gmail API and Google Sheets API in the OAuth client's Cloud project. |
| invalid_client | Recheck ID and secret from the same Desktop client in `.env`. |
| redirect_uri_mismatch | Replace a mistakenly created Web client with a Desktop app client. Do not hard-code our random callback port. |
| Missing scopes | Reauthorize and grant Sheets, Gmail read and Gmail compose. |
| No refresh token | Remove access for your own Agency Automation app under Google Account → Security → connections to third-party apps, then run auth again. Keep `.data`. |
| Sheet not found / permission denied | Use the native converted Sheet ID; grant the authorized account Editor access through Share. |
| CRM headers differ | Restore the exact row 1 headers/tab names from the template; do not overwrite existing lead data. |
| Authorized Gmail differs from SENDER_EMAIL | Match SENDER_EMAIL to the authorized account's primary address, save, restart and reauthorize if needed. |
| Zero drafts | Check A qualification, P/Q/W/X approvals, owned recipient matching, suppression and LEADS AB. No evidence means no draft. |
| Research blocked or unreadable | Use a permitted readable public site. Do not bypass robots/login/private-network restrictions. |
| Gemini quota / 429 / daily cap | Wait for provider quota or the configured rolling daily limit to clear. No paid fallback is enabled. |
| Gemini overload or quota exhaustion | Automatic fallback moves from your configured model to lower approved free-tier models, once each, and temporarily skips failed models. Restart after the code update, then run `npm run gemini:test`. If all models fail, wait for the reported cooldown or quota recovery; the program cannot guarantee availability. Every attempt counts toward the same local daily cap. Do not redo Google OAuth or Sheet setup for this error. |
| Helper unavailable / localhost page does not open | Start `npm start` in window 1 and leave it open; inspect that window for a startup error. |
| Port already in use | Stop the previous project start window with Ctrl+C before starting another copy. Do not terminate unrelated programs. |
| Python runner warning | Current workflows use JavaScript. This warning alone did not prevent the verified local JavaScript workflows from running. |
| Uncertain draft after interruption | Restore internet, run `npm run run -- recover` then reconcile. Inspect Gmail; do not delete the journal or force another creation. |
| Google authorization expires about a week later | Testing-mode Google refresh tokens for these scopes expire after seven days. Run auth again; restart the running program afterwards. |

## References checked for this guide

- Google consent menus and test users: https://developers.google.com/workspace/guides/configure-oauth-consent
- Desktop client creation: https://developers.google.com/workspace/gmail/api/quickstart/python (only account setup applies; our program is Node, not this Python sample)
- Desktop callback: https://developers.google.com/identity/protocols/oauth2/native-app
- Gmail permission meanings: https://developers.google.com/workspace/gmail/api/auth/scopes
- Excel conversion: https://support.google.com/docs/answer/9331167?hl=en
- Google Testing token expiration: https://developers.google.com/identity/protocols/oauth2#expiration
- n8n publishing: https://docs.n8n.io/workflows/publish/
