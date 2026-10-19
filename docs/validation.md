# Actual validation results

## Latest fallback verification: 2026-10-13

**98 tests passed**, including **68 core/runtime** and the existing 30 tracker checks. Syntax checks passed for 45 JavaScript files. Ten new fallback tests verify a 503 → 429 → successful lower-model sequence with identical structured requests, persistent cooldown and primary recovery, bounded all-model outage, global budget enforcement, no switching on authentication/input errors, no switching around blocked/invalid output, network/404 fallback, no upward or unknown-model escalation, no Gmail draft intent on total failure, and the actual selected model in the connection-test result. These failures are simulated offline. New code requires restarting the currently running main process before live testing; no fresh live fallback success is claimed.

Doctor now reports all required local settings ready, including the saved second test recipient. The user's live Google Sheets check passed for all five original tabs. Gmail draft/send/reply validation remains pending. Earlier provider success and later 503 failures below describe their respective times.

## Latest core review: 2026-10-13

The complete suite now has **88 passing tests**, including **58 core/runtime tests**. Syntax checks cover 44 JavaScript files. Real n8n mocked polling passed, the actual main services started and returned HTTP 200, and a real configured `gemini-3.8-flash` structured generation succeeded. Google Sheets checking is blocked by missing Google authorization. Startup lock/exit-status issues were found and fixed; the dependency audit still has 164 findings. See [the dated core audit](program-audit-2026-10-13.md) for evidence, fixes and exact remaining setup. Chrome extension development is paused.

## Earlier build validation: 2026-10-11

Executed locally on **2026-10-11**, Windows, Node **24.15.0**, npm **11.12.1**, n8n **2.42.6**. No Google credentials or Gemini key were supplied, no prospects were contacted, and no marketing messages were sent.

| Check | Actual outcome |
|---|---|
| `npm install --no-fund --no-audit` | Succeeded; 2,328 packages installed. n8n has a large dependency tree and upstream peer/deprecation warnings. Exact lockfile saved. |
| `npm test` | **84 passed, 0 failed** in the latest run. Offline API fixtures, actual local SQLite, and synthetic Gmail compose DOM. |
| `npm run check` | Syntax for 43 JavaScript files, JSON parsing, inactive workflow checks, extension manifest/resources and copied shared rules passed. |
| n8n version command | Actual installed version is 2.42.6. |
| CLI workflow import | All **11 JSON workflows imported successfully** into the project's isolated n8n database, including optional tracking sync. |
| Automatic helper credential import | One HTTP Header Auth credential imported and connected to all relevant nodes; temporary plaintext import file removed. |
| Database inspection | All 11 stored workflows had `active=0`. |
| `npm start` | n8n ready on loopback port 5678 and helper on 8787. n8n JavaScript task runner registered. |
| Local health checks | n8n `/healthz` and helper `/health` both HTTP 200. Unauthorized helper mutation returned HTTP 401. |
| Real n8n local-connection execution | `agency_smoke` completed successfully against the actual helper and returned `{ok:true, working:false, mode:"test"}`. |
| `npm run test:n8n` | Real `agency_report` workflow completed against an authenticated **mock local helper**. Queue, HTTP Header Auth, Wait, Code, If and repeat polling all worked. This is not a Google API integration test. |
| CRM workbook | Created, rendered and visually inspected; exported XLSX reopened and all five saved tab header mappings matched src/crm.mjs exactly. |
| Git | Local repository initialized; private settings, journal, n8n state and credentials excluded. No remote/push created. |

The tests cover all requested areas: 0–12 scoring and category boundaries; canonical-domain duplicate detection; missing/changed source evidence; invalid/empty/truncated Gemini responses; approved email text/MIME/header injection; rule-based reply classification; opt-out handling including quoted text; case-insensitive persistent suppression after Sheets failure and reimport; 4-day and 7-day follow-up eligibility plus final stop; actual-send verification; deterministic daily reports. Additional checks cover draft POST ambiguity and restart durability, CRM failure after Gmail acceptance, duplicate reply/send events, Google auth expiration, RAW row writes/header mismatches, Gemini quota retries/daily caps, test-only recipients, public email requirement, private-address/robots blocking and no Gmail send endpoints.

An expanded adapter test initially found that the local Gemini budget exception was caught as a network exception. The implementation was corrected to perform the budget reservation outside the network retry catch. A report regression also checks that completed earlier stages and repeated meeting rows are not overcounted.

The setup/status review found that the initial draft batch limit was applied before skipping existing operations. Already drafted leads could therefore prevent later leads from receiving drafts. Existing intents are now excluded before selecting the next batch, including uncertain intents that must remain blocked. Two additional regression tests verify batch progression, the batch limit, and proceeding past an uncertain operation without retrying it. Earlier test totals are superseded by the latest 84-test run.

## Mail tracker implementation and verification

The optional MV3 extension, Worker/D1 tracking API, local preview and draft-only agency integration were added on 2026-10-11. Thirty additional tests cover metadata-only registration, one image per compose, changed-recipient blocking, Cc rejection, saved draft restoration, Gmail confirmation/Undo, separate toast/compose mutations, extension sender checks and trusted credential storage. Worker tests exercise the documented entry point, authenticated APIs, pagination, token secrecy, idempotent registration/confirmation, 45-second arming delay, cancellation/deletion, scanner/HEAD filtering and retention using real SQLite. Agency tests verify escaped multipart MIME, tracker registration failure, approval revocation during registration, verified Sent Mail arming and unchanged CRM scoring.

The local dashboard was rendered in the Codex browser with explicitly synthetic sample records. Search filtering and the connection panel were inspected; an initial relative stylesheet path error was found and fixed. Preview routes block cross-site/same-site script loads, and the private-key shim has a same-origin resource policy. API checks confirmed these guards and unauthenticated rejection. These browser observations do not establish installed Chrome-extension or actual Gmail behavior.

`npm run tracking:setup` generated the private tracker key in ignored local settings. `npm run tracking:build` generated the unpacked extension. The real n8n polling smoke test passed again after adding jsdom as a development dependency. All eleven workflows were imported locally, with schedules inactive. No Cloudflare resources were deployed and no Google Sheets TRACKING migration was executed.

## Remaining live validation

**Not tested live:** Google consent/refresh with an actual account, actual Google Sheets reads/writes, actual Gemini model/key access and account quota, actual Gmail draft creation/manual sending/Sent Mail reconciliation/opt-out replies, real company's website collection, a wall-clock live 4-day/7-day sequence, installed Chrome/Gmail tracking, Chrome notification delivery, Cloudflare deployment/D1 and hosted-to-Sheets synchronization. Mock fixtures and a successful n8n local HTTP workflow do not establish these outcomes. Follow docs/google-setup.md, docs/live-testing.md and docs/mail-tracker.md with accounts you control.

## Dependency and runtime findings

The refreshed `npm audit --omit=dev --json` reported **164 dependency findings: 11 critical, 54 high, 96 moderate, 3 low**, superseding the earlier 174-entry snapshot after the development dependency lock update. These counts include transitive/meta-vulnerability entries, not 164 proven exploitable paths in this workflow. The selected n8n stable package inherits findings in its broad integration dependency tree; our helper and tracker server themselves use built-in Node/Worker APIs. The standalone extension does not run n8n. No claim of an audit-clean installation is made.

Examples include LangChain community loaders/SQL components, simple-git, expr-eval, XML parsing, form-data, Handlebars and tar dependency advisories. These were reviewed at the package/advisory level; reachability and exploit testing were not completed. The built workflows do not use LangChain, SQL-agent, Git, XML, compression or template-evaluation nodes. The n8n editor and HTTP node still use their own upstream dependencies, so loopback binding alone does not eliminate dependency risks. Use only trusted workflow files and your own local owner account. Community package installation is disabled. No public tunnel is configured.

The original audit's suggested direct n8n change was a downgrade to **1.17.0**, which would replace the chosen supported version and is not an appropriate blanket fix. No forced audit fix or incompatible dependency override was applied. Review upstream supported patches before upgrades and rerun imports/tests. The latest machine-generated audit file remains in ignored scratch/npm-audit-tracker.json for local review; rerunning `npm audit --omit=dev` gives current findings.

n8n warned that non-container and internal-task-runner operation will be removed in a future version. Official npm docs say npm installs are deprecated from 3.0; the pinned 2.42.6 did install/start/import/execute successfully without Docker. n8n also warned that its internal Python virtual environment was missing. These workflows only use JavaScript; the JS node in the real mocked polling execution succeeded. No Python installation or local AI model was added.
