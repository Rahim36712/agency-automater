# Core agency program review — 2026-10-13

The core program starts locally and its real Gemini connection succeeds. Google account setup is incomplete, so the full Gmail/Sheets workflow is not yet live-validated. Chrome extension development is paused at the user's request; tracking remains disabled in the agency configuration.

## Checks actually executed

| Check | Result |
|---|---|
| Core tests before fixes | 54 passed, 0 failed |
| New runtime regression tests | 3 passed: reused PID, second helper protection, launcher exit status |
| Full suite after fixes | 88 passed, 0 failed; 58 core/runtime tests and 30 previously existing tracker tests |
| Syntax/resources | 44 JavaScript files passed; workflows inactive |
| Imported workflow database | 11 workflows, all inactive; one is optional tracker sync |
| Real n8n CLI polling smoke | Passed against an authenticated mock local helper; no Google calls |
| Actual `npm start` | Helper started on loopback :8787; n8n 2.42.6 and JS runner started on :5678 |
| Live local health | Both endpoints HTTP 200; neither binds a public network interface |
| Import while services run | Correctly refused before credential/workflow writes |
| Actual `npm run gemini:test` | Succeeded with configured `gemini-3.8-flash`; returned structured approved subject/introduction/question |
| Actual `npm run crm:check` | Blocked: `Google is not authorized. Run npm run auth.` |
| Production dependency audit | 164 findings: 11 critical, 54 high, 96 moderate, 3 low |

The Gemini request used a synthetic Owned Test Account prompt. No prospects were contacted, no Gmail drafts were created, no emails were sent, and no schedules were enabled. Google access tokens are absent. A configured Sheets ID is not proof of spreadsheet access or correct live headers.

## Issues fixed

1. **Startup could be blocked by an unrelated Windows process.** The old helper lock contained PID 6040, now owned by `cmd.exe`. Checking only PID existence misidentified it as a running helper. The listening socket now establishes single-writer ownership before opening/recovering the journal. Successful bind replaces the stale lock; a second helper fails before touching live jobs. No unrelated process was stopped.
2. **The launcher could exit successfully after startup failed.** Its unreferenced shutdown timer allowed Node to exit before setting the requested failure code. `process.exitCode` is now set before child shutdown. A real subprocess regression verifies a failed bind produces exit code 1.
3. **Workflow import used the same unreliable PID check.** Import now checks both configured local service ports and refuses while either is listening. It does not infer ownership from a possibly reused PID.
4. **The configured model was rejected before any Gemini request.** `gemini-3.8-flash` was outside the original Flash-Lite-only allowlist. [Google's pricing page](https://ai.google.dev/gemini-api/docs/pricing) lists standard text input/output on its free tier, checked 2026-10-13. The model is now allowed with the existing free-plan confirmation, throttling, daily cap, structured schema and no grounding tools. The user's model/key were preserved. Doctor now checks the selected model, and a real API test succeeded.

## Original brief coverage

| Component | Implemented | Current verification boundary |
|---|---|---|
| URL/CSV intake and duplicate IDs | Yes | Offline tested; real Sheets pending |
| Public website research and Gemini analysis | Yes | Parser/robots/evidence mocked tests pass; AI connection succeeds; no owned-site-to-Sheets live run |
| 0–12 scoring, A/B/C and delivery review | Yes | Offline tested; scoring still needs human evidence review |
| Personalized Gmail drafts | Yes | MIME, approvals and duplicate guards pass; live Gmail draft creation pending |
| Replies and persistent opt-out suppression | Yes | Offline tested, including Sheets failure/reimport; actual mailbox pending |
| Verified sends and 4-day/7-day follow-up drafts | Yes | Offline full sequence tested; actual Gmail reconciliation and wall-clock sequence pending |
| Daily reporting and error/restart recovery | Yes | Offline report/recovery tests and n8n mock execution pass; live CRM/report sync pending |
| CRM template, prompts, workflow exports, launchers and guides | Present | Import/syntax verified; original workbook render evidence is from 2026-10-11 |

The program uses Google REST adapters behind a serialized local helper. n8n schedules/queues/polls that helper; the substantive logic is implemented in `src/`, not duplicated into provider nodes. Marketing sends remain manual.

## What still needs the user

Complete these fields locally in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SENDER_NAME`, `SENDER_EMAIL`, `SENDER_BUSINESS_NAME`, `SENDER_POSTAL_ADDRESS`, `TEST_RECIPIENTS`. Use a Desktop OAuth client, the primary Gmail address being authorized, a real postal address, and a second inbox you control. Never put keys into chat.

Google Sheets ID and Gemini key/free-plan confirmation are already entered. Do not reinstall dependencies or reimport workflows as a prerequisite for this existing workspace.

Follow [Google setup](google-setup.md), run `npm run auth`, restart `npm start` after changing settings, then run `npm run doctor` and `npm run crm:check`. Complete [the owned-account test](live-testing.md): research → review → draft → rerun to check deduplication → manual send → reconcile → opt-out reply → suppression/report. Only then activate the desired schedules.

## Remaining limits and risks

- Research visits only homepage, `/about`, `/contact`; it does not render JavaScript or discover leads automatically. Contact names/roles may require manual entry. Reports-to-self and paid discovery are not enabled optional features.
- The Gemini live test validates authentication, this model and this draft schema; it does not prove full company research or mailbox classification quality.
- The laptop must stay awake and the main services must run for schedules. Queued jobs persist; missed scheduled times are not backfilled automatically.
- The n8n dependency audit remains unresolved. Finding counts are transitive/meta-advisory entries, not demonstrated exploit paths. No forced downgrade, installation or incompatible override was applied. Keep the editor local and workflows trusted.
- n8n warns about its missing Python runtime and future container/internal-runner changes. These workflows use JavaScript, whose actual polling execution passed.
- Git is initialized, but project files remain untracked and no remote is configured. There is no committed baseline yet. Private `.env` and `.data/` must remain excluded; preserve `.data/` for suppression and draft recovery.

At the end of this review, the main services are running locally with all schedules inactive. No Cloudflare deployment or Chrome extension changes were made.
