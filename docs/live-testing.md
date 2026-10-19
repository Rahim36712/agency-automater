# Safe first end-to-end test

Use two email accounts you control and, ideally, a small public website you own containing genuine company/services/contact information. Never put a real prospect in TEST_RECIPIENTS. Leave every imported workflow inactive during this procedure.

1. Configure your sender identity, owned recipient, Sheets and Gemini. Keep `OUTREACH_MODE=test`. Run `npm start`, then `npm run crm:check` and `npm run gemini:test` from another terminal. Those are the first live adapter checks; they were not run during project creation because no credentials were supplied.
2. Add the owned website in LEADS, set Research Allowed true, and run `npm run run -- research`. Check that every observation is an exact quote from its source. A blocked site or invalid AI response should produce an error and no fabricated facts.
3. Review the score evidence honestly. To exercise qualification without faking a real company's budget or needs, use your owned test site with explicitly labelled test partner/budget/timing facts. Keep test fixtures separate from prospects. Ensure the six review/approval fields are set only when the test evidence supports them. Run `npm run run -- qualify` and confirm an A score if justified.
4. Replace the test lead's email with your configured second owned account if needed. Test mode allows this even if it is not published on your site. Set Contact Verified, Outreach Approved and Follow-up Allowed true. Run `npm run run -- drafts`. Inspect Gmail Drafts. Confirm the recipient, source quote, service, physical address and unsubscribe text. Nothing should be in Sent Mail.
5. Run `drafts` again. Expect the same single draft, the same operation ID and no second draft. Run `reconcile` before sending: expect Draft Status `draft`, Sent Date blank and no next follow-up date.
6. Send this test draft **personally through Gmail** to your second account. Keep its Reference line. Run `reconcile`: expect one real Sent Date, the Gmail message/thread IDs, and next follow-up 4 days after that send. Run it again: the send count must stay one.
7. Reply from your second account with `Please unsubscribe me`. Run `replies`. Expect SUPPRESSION to include that email, Reply Status `Opt-out`, and follow-ups disabled. Run it again: there should be one processing event for the same Gmail message.
8. Import a different company URL with that same owned email. It must remain suppressed. Run `drafts` and `followups`: no new draft for that email.
9. Run `report`. Compare the REPORTS counts with Gmail, OUTREACH and ACTIVITY LOG. Drafts and sent messages are different counts.

For follow-up timing, automated offline tests simulate 4-day and 7-day boundaries and an entire two-follow-up sequence. A real live timing test requires waiting those intervals using an unsuppressed second owned contact. Do not shorten production timing or falsify Sent Date: the journal owns the actual-send proof. Any incoming reply, including an automatic or uncertain response, stops follow-ups for review.

For error tests, disconnect the network temporarily and run a task. Reconnect and rerun; an uncertain draft POST must remain blocked or recover to the already-created draft, never create a duplicate. Restore credentials locally after any auth test. Do not erase `.data/` to reset a test. Use a separate copied project, independent sheet, independent n8n user folder and an owned account for destructive reset experiments.

After live checks succeed, choose the desired schedules in n8n and activate them. Verify the timezone and helper credential first. Never use a workflow with a send-mail node.
