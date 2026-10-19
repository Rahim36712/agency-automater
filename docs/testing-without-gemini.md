# Continue testing while Gemini is unavailable

13 October 2026. The user has paused live Gemini tests following overload failures. Tracking remains paused. No model keys, billing, cooldowns or budgets were changed for these checks.

## Live checks completed

| Component | Result and limit |
|---|---|
| Both running local services | Helper /health and n8n /healthz returned HTTP 200. |
| Google Sheets | All five original tabs and exact headers accessible; no lead/outreach rows yet. |
| Gmail profile | Accessible and authorized primary address matches SENDER_EMAIL. |
| Gmail reads | Sent Mail listing and draft listing both succeeded; no message contents displayed and no drafts changed. |
| Lead intake | Completed with added 0, duplicates 0 because LEADS is empty. A real seed row still needs testing. |
| Reconciliation | Completed with sent 0; no stored outreach exists to reconcile. This does not validate a sent-message round trip. |
| Reply task | Completed with scanned 0; no stored sent operations exist. Reply processing still needs an actual owned-inbox exchange. |
| Reporting | Today's report saved to reports/2026-10-13.json and successfully written to Google Sheets REPORTS. Seven recorded error events are in today's report: one earlier CRM check, three Gemini connection tests and three model fallback failures. The current CRM check and report job both passed. |
| Schedules | Database has 11 workflows, all active=0. |

The most recent offline suite passed 98 tests, including 68 core/runtime tests. It covers Gemini outages, scoring, suppression, duplicate prevention and draft/send/reply flows using controlled fixtures. This is separate from live account validation.

## What to do next

Keep the existing npm start window open. In the n8n browser tab at http://localhost:5678, open your personal workspace and **Agency - Local connection test**. Click **Execute workflow**. Inspect **Helper health**: expect a successful response with ok:true. Leave schedules unpublished.

Next open the CRM's LEADS tab. In the next empty row (usually row 2), enter Company in B, a real public website you control in C, and your owned test inbox in G. Set V (Research Allowed) FALSE for now and leave scoring/contact/outreach/follow-up approvals false. Keep row 1 unchanged.

In a second PowerShell window:

```powershell
cd "D:\AI STUFF\PROJECTS\automater"
npm run run -- intake
```

Expect added:1, a generated Lead ID in A, Lead Status new in U and Created Date in AA. Run intake again: expect added:0 and the same single row/identifier. A repeated run does not count the existing row as a duplicate; duplicates means extra rows with the same canonical website.

Open **Agency - F Daily business report** in n8n and click **Execute workflow**. This tests a real n8n queue/poll/report run against the real helper and Sheet without AI. Wait for the **Job complete** node to succeed. Open its output: status must be complete; a failed helper job should fail the workflow rather than appear successful. Confirm today's REPORTS row remains a single date row and reflects no drafts/sends. To repeat directly from PowerShell, use `npm run run -- report`.

Inspect ACTIVITY LOG for the lead-intake event and the report file locally. Historical Gemini failures remain visible for diagnosis and should not be deleted to make the report look clean.

## What remains blocked

Skipping gemini:test does not remove Gemini from research or email drafting. Do not bypass evidence checks with made-up observations or scores. Wait for a successful real Gemini response before the research → qualify → draft → personal send → reconcile → reply/opt-out test in docs/live-testing.md. Gmail compose/write access, actual send matching, live opt-out suppression and real follow-up timing have not been validated by the empty-queue checks above.

Keep OUTREACH_MODE=test and TRACKING_ENABLED=false. No email was sent or draft created during these checks.
