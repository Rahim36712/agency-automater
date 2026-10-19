# Exact Google Sheets CRM mapping

Row 1 must contain these exact case-sensitive headers in this order. The workbook and CSV templates match the `HEADERS` constant in src/crm.mjs. Data begins on row 2; there are no title rows above the headers. n8n calls `/jobs` with a task name and the local helper maps fields by header. RAW writes keep source text literal. Never rename tabs or headers, duplicate keys or manually edit identifier/send-proof fields.

Boolean controls use true/false (strings or native booleans); dates use ISO timestamps. JSON fields are plain cell text and must remain valid JSON. Empty source evidence stays blank rather than being fabricated. Google Sheets is the CRM; the local journal is recovery state.

The existing workbook/CSV templates contain the original five tabs. Optional TRACKING is added separately with `npm run tracking:crm`; templates are unchanged. In TRACKING, Sent Date can be UI-reported or manually confirmed. Only Send Confirmation `gmail_sent_verified` means actual Gmail SENT proof. Image Requests is not a human open count.

## LEADS

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Lead ID | Generated canonical-domain SHA-256 identifier. Do not edit. |
| B | Company | Publicly supported company name; manual seed is unverified until research. |
| C | Website | Editable public company website; normalized to HTTPS domain. |
| D | Country | Publicly verified literal location, otherwise blank. |
| E | Contact Name | Optional public contact name entered and verified by you. Not used in generated greeting. |
| F | Contact Role | Optional relevant public role entered and verified by you. |
| G | Email | Public contact email, or owned recipient in test mode. |
| H | Industry | Literal public source text, otherwise blank. |
| I | Business Description | Exact public observations joined together. |
| J | Verified Observations | JSON array of {quote,url}; exact quotes checked against local snapshots. |
| K | Source URLs | JSON array of collected public source URLs. |
| L | Possible IT Opportunity | AI hypothesis to discuss; never a verified problem. |
| M | Recommended Service | One allowed deliverable service, otherwise blank. |
| N | Confidence | low/medium/high evidence strength from AI; review required. |
| O | Score Inputs | JSON object keyed by relevance,need,decisionMaker,budget,timing; values points,reason,quote,url. |
| P | Score Reviewed | Editable true/false. You confirm scored source evidence. |
| Q | Delivery Confirmed | Editable true/false. You confirm ability to deliver that service. |
| R | Lead Score | Computed integer 0..12. |
| S | Category | Computed A/B/C. |
| T | Score Explanation | Deterministic explanation for all six score components. |
| U | Lead Status | new, researched, qualified, additional research, duplicate, suppressed, reply received, manual review. |
| V | Research Allowed | Editable true/false; review source access terms first. |
| W | Contact Verified | Editable true/false; verify recipient and public email. |
| X | Outreach Approved | Editable true/false; permit draft preparation only. |
| Y | Follow-up Allowed | Editable true/false; can be revoked, but cannot override replies/opt-outs. |
| Z | Researched Date | ISO 8601 timestamp of verified research. |
| AA | Created Date | ISO 8601 creation timestamp. |
| AB | Last Error | Last lead-level error, safe text without secrets. |

## OUTREACH

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Operation ID | Immutable Lead ID:Stage key; stage0 initial, stage1 first follow-up, stage2 final. |
| B | Lead ID | Generated canonical-domain SHA-256 identifier. Do not edit. |
| C | Email | Public contact email, or owned recipient in test mode. |
| D | Draft ID | Actual Gmail draft ID returned/recovered from API. |
| E | Gmail Thread ID | Actual Gmail thread ID. |
| F | Sent Message ID | Actual SENT message ID verified by reconciliation. |
| G | Sent Date | Actual Gmail internalDate converted to ISO; blank before real sending. |
| H | Stage | Integer 0/1/2 for this specific outreach operation. |
| I | Next Follow-up Date | 4 days after initial send or 7 days after first follow-up send; blank if blocked/final. |
| J | Reply Status | Interested, Meeting requested, Needs more information, Not interested, Opt-out, Uncertain / manual review. |
| K | Draft Status | draft or sent. Do not fake sent to advance sequence. |
| L | Follow-up Allowed | Editable true/false; can be revoked, but cannot override replies/opt-outs. |
| M | Reference | Unique visible Reference footer token for recovery. |
| N | Message-ID | Unique RFC Message-ID assigned before draft POST. |
| O | Created Date | ISO 8601 creation timestamp. |

## SUPPRESSION

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Email | Public contact email, or owned recipient in test mode. |
| B | Reason | Opt-out/manual suppression reason. |
| C | Suppression Date | ISO 8601 suppression timestamp. |

## ACTIVITY LOG

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Event ID | Unique event key; stable keys for send/draft/reply deduplication. |
| B | Timestamp | ISO 8601 event timestamp. |
| C | Workflow | Helper task or n8n error workflow name. |
| D | Lead ID | Generated canonical-domain SHA-256 identifier. Do not edit. |
| E | Action | Business event such as researched, qualified, draft created, sent or reply category. |
| F | Outcome | success or error. |
| G | Error | Safe diagnostic text; no tokens, raw API bodies or secrets. |

## REPORTS

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Date | Karachi calendar date YYYY-MM-DD. |
| B | New Leads Researched | Successful researched events today. |
| C | Qualified Leads | New A qualification events today. |
| D | Drafts Awaiting Review | Current CRM drafts (not a count of sends). |
| E | Emails Actually Sent | New verified SENT events today. |
| F | Interested Responses | New rule-confirmed interested replies today. |
| G | Follow-ups Due | Currently eligible/due operations. |
| H | Meetings Needing Attention | Current Meeting requested CRM records. |
| I | Workflow Errors | Error events today, including lead-level batch failures. |

## TRACKING

| Column | Exact header | Mapping / meaning |
|---|---|---|
| A | Tracking ID | Unique hosted record ID. |
| B | Operation ID | Agency Lead ID:Stage; blank for standalone extension messages. |
| C | Lead ID | Agency ID or unique recipient-email CRM match; blank if ambiguous. |
| D | Company | CRM company or optional user label. |
| E | Email | Original single recipient; does not identify the viewer. |
| F | Subject | Email subject; no body is stored. |
| G | Source | extension or agency. |
| H | Send Confirmation | gmail_ui, gmail_sent_verified or manual. |
| I | Sent Date | Reported timestamp; see Send Confirmation for verification type. |
| J | Tracking State | draft, confirmed, disabled or cancelled. |
| K | First Possible Open | First image request after confirmation and 45-second buffer. |
| L | Last Image Request | Latest eligible image-request timestamp. |
| M | Image Requests | Image fetch count; not proof of human opening. |
| N | Last Synced | CRM sync timestamp. |

Manual intake: Company, Website, Country and optional Email are sufficient. Import defaults approvals to false and assigns Lead ID. Research overwrites company/country with verified public values, saves exact observations, score suggestions and dates. Qualification writes score/category/explanation after your review. Draft/reconcile/reply/follow-up jobs upsert OUTREACH by Operation ID. Suppression is keyed by normalized email and mirrored to the local journal. ACTIVITY LOG is keyed by Event ID. REPORTS is upserted by local Date.
