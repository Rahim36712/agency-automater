# Evidence scoring

There are six dimensions, each 0–2, for a total 0–12. The exact thresholds and plain-language rules are in `templates/scoring-rules.json`. Defaults: A >=9, B >=5, C below5. Edit thresholds deliberately and rerun qualification. Point rules are applied by the founder reviewing Gemini suggestions against exact public quotes. Do not let an AI suggestion stand in for your review.

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Relevance | Unknown | Adjacent public service | Exact service match |
| Possible need | Speculation only | Evidence of a possible opportunity | Explicit technology or partner request |
| Decision-maker | Unknown | Relevant public role/contact | Named appropriate decision-maker |
| Budget | Unknown | Documented funding/paid project | Explicit suitable project budget |
| Timing | Unknown | Recent dated initiative | Current request/deadline |
| Delivery | Unconfirmed | Not used | Founder confirms the recommended service is deliverable |

Company size, a polished website or a US address does not establish budget. Agency services alone do not establish an outsourcing need. Dates must actually be current. Contact identity must be verified before outreach. A high score is a priority suggestion, not permission to promise delivery or accept a project.

`Score Inputs` is a JSON object. Each scored dimension needs integer `points`, `reason`, `quote`, `url`. Every quote/URL pair must appear in `Verified Observations`, which the helper checks against its local collected source evidence. Missing or invalid evidence scores 0. Founder delivery is controlled separately by `Delivery Confirmed=true` and an allowed Recommended Service.

Example (fictional, for format only):

```json
{
  "relevance": {
    "points": 2,
    "reason": "The public service directly matches web application development.",
    "quote": "We develop custom web applications for clients.",
    "url": "https://agency.example/"
  }
}
```

Review what the quote really proves. Set Score Reviewed to true only after editing misleading suggestions. Unknowns remain 0. Research resets all drafting approvals. To research a B/C lead again, clear approvals and set Lead Status to `new`; the existing lead ID and journal remain. Re-research resets review, requires public facts again, and cannot create a second initial outreach operation.
