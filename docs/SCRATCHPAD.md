# ReplyPilot — Operator Optimization Scratchpad

The core insight: stop optimizing for automation. Optimize for the human operator's manual effort. The app should make YOU faster, not replace you.

---

## The Problem

Right now ReplyPilot is a batch pipeline: run campaign, wait, review output. But the actual user (Kirill) wants to be in the trenches — active, intense, fast. The app should be a power tool, not an autopilot.

Three specific pain points identified:

### 1. No notes on leads

When you're moving through leads fast, you need to jot things down. "Called, no answer." "Website is WordPress circa 2015." "Owner's name is Dave, mentioned on Facebook." There's nowhere to put this. You lose context between sessions.

**What to build:**
- `notes` field on Lead model — but as a **log**, not a single block
- Each entry is timestamped automatically. You type, hit enter, it's logged.
- UI: list of past entries (newest first) with a textarea at the top. Like a mini chat with yourself about this lead.
- PATCH endpoint to append a note entry
- Show a notes indicator icon in the leads table so you know which leads have notes at a glance

**Decision:** Log format, not single editable block. Gives the user power to track conversations over time ("Apr 10: called, voicemail. Apr 12: emailed. Apr 14: spoke to Dave, interested but wants to see examples."). Timestamps are automatic, zero friction.

**Data model option:** Either a JSON array on Lead (`notes: Json?`) or a separate `LeadNote` model with `leadId`, `content`, `createdAt`. Separate model is cleaner for querying/pagination but heavier. JSON array is simpler and fast enough for <100 notes per lead.

---

### 2. Qualification is backwards for web developers

The qualification prompt in `qualifyLead.js` treats "no website" and "sparse listing" as negative signals (`inactive_suspected: true`). For a web developer selling websites, those are the BEST signals. A business with no website is a 10/10 fit, not a suspect.

The root cause: the AI has no instructions from the user about what GOOD looks like. It only knows `campaign.qualifier` (bad-fit signals). It's guessing at good-fit signals based on generic logic.

**What to build:**
- `goodFitSignals` field on Campaign — "What makes a business a GOOD fit?"
  - Example: "No website or outdated website. Poor Google listing with few photos. Has reviews but no online presence. Owner-operated, not a franchise."
- `qualificationGuide` field on Campaign — free-form instructions for the AI evaluator
  - Example: "For this campaign, a missing or broken website is the #1 positive signal — score these leads 8+. A business with a modern professional website should score 2 or below. Don't penalize for sparse listings — that's our opportunity."
- Rewrite the qualification prompt to inject both fields prominently
- Remove the hardcoded `inactive_suspected` logic that equates "no website" with "possibly inactive"

      
- `qualificationGuide` is freeform: nuanced instructions for edge cases. Power users fill this in after running a few batches and seeing bad results.
- Most users only need `goodFitSignals`. `qualificationGuide` is the escape hatch for fine-tuning.

### 2b. The AI never actually sees the website

The enrichment pipeline (`identity.js`, `contact.js`) uses Puppeteer to scrape the lead's website and extracts text — business type, description, keywords, contact info. But `qualifyLead.js` only gets the extracted text. The AI has no idea if the website is good or bad. It can't tell a modern site from a broken 2009 GoDaddy template.

**This is the biggest blind spot for a web developer.** Website quality is literally the #1 signal.

**Options (ranked by signal quality):**

1. **Screenshot + vision model** — During enrichment, Puppeteer screenshots the homepage (one line of code). Pass the screenshot to a vision-capable model during qualification: "Rate this website 1-10 on design quality, mobile-friendliness, and professionalism." Most accurate signal. Costs one extra API call per lead.

2. **HTML signal extraction** — During the existing scrape, extract proxy signals from the HTML: responsive meta tags? Viewport tag? SSL? How old is the tech stack (jQuery version, WordPress theme age)? Mobile-friendly? These are cheap heuristics that don't need vision.

3. **Simple websiteQuality field** — Add a `websiteQuality` score (1-10) populated during enrichment by whichever method above. The qualification prompt uses this directly: "Website quality: 2/10 — outdated design, no mobile support."

**Recommendation:** Build option 2 first (cheap, no extra API cost), store in `websiteQuality` field. Add option 1 later as an upgrade path for users who want higher accuracy. Either way, the qualification prompt gets a concrete website quality signal instead of guessing.

---

### 3. No confidence in qualification results

The deeper issue: even with better prompts, the user doesn't trust the scores because they can't see or control the logic. Good leads end up archived, bad leads end up qualified.

**What to build (in priority order):**

**a) Make the qualification reasoning visible and actionable**
- `icpFitReason` already exists and is shown on LeadPage — good
- But it's buried. Surface it in the leads table as a tooltip or expandable row
- Show the score prominently in the table (it's there but could be bolder)

**b) User override tracking — train the AI from your corrections**
- Track `userOverride: Boolean` on Lead. When a user manually changes status away from what the AI decided, flip it to true.
- Every override is a labeled example of "the AI got this wrong."
- After enough overrides accumulate, two things become possible:
  - Feed override patterns back into the qualification prompt as few-shot examples ("leads like X were manually restored by the user — score similar leads higher")
  - Run batch analysis: "here are 20 leads the user disagreed with — what pattern did the AI miss?" — use this to suggest improvements to goodFitSignals/qualifier
- Cheap to build (one boolean field + set it on manual status change). The data it generates makes everything else better over time.

**c) Qualification threshold on the campaign**
- Currently hardcoded: `icpFitScore >= 4 ? "QUALIFIED" : "ARCHIVED"`
- Move to `qualifyThreshold` field on Campaign (default 4, adjustable 1-10)
- Simple slider in campaign config editor
- Note: this is a band-aid if the AI qualifies poorly. It's useful but secondary to fixing the prompt itself with goodFitSignals.

**d) Requalify button**
- After tweaking goodFitSignals/qualificationGuide/threshold, requalify leads in one click
- Runs on both ARCHIVED and QUEUED leads — re-sort the whole pile, not just rescue archived ones. Some QUEUED leads might drop, some ARCHIVED ones might rise.
- Backend: endpoint that re-runs `qualifyLead` on all leads with status ARCHIVED or QUEUED for a given campaign

---

## Implementation Priority

Ranked by "how much does this reduce wasted manual effort":

1. **goodFitSignals on Campaign + prompt rewrite** — fixes the root cause of bad qualification. Every campaign run after this produces better results.
2. **User override tracking** — cheap to build, generates data that compounds. Every correction makes the system smarter.
3. **qualifyThreshold on Campaign** — immediate control over filtering aggressiveness.
4. **Requalify button (ARCHIVED + QUEUED)** — recovers wrongly sorted leads after criteria changes.
5. **Website quality scoring during enrichment** — gives the qualification AI the signal it's completely missing today.
6. **Notes log on Lead** — reduces context loss between sessions. Quick to build.
7. **qualificationGuide on Campaign** — power user escape hatch. Build after the basics work.

---

## Ideas parking lot

Things that came up but aren't ready to build yet:

- **Campaign templates / cloning** — set up one campaign, clone it with a different vertical. Saves 5 min per campaign.
- **Proof asset fields on Campaign** — portfolio URL, Loom template link. Injected into message generation so AI can reference them.
- **Per-campaign reply rate metric** — surface on campaign dashboard. Currently you'd have to calculate manually.
- **Auto-flag underperforming campaigns** — if reply rate < 3% after 100 sends, show a warning.
- **Keyboard shortcuts in lead review** — j/k to navigate, a to archive, q to queue, n to open notes. For the operator who wants to fly.
- **Bulk requalify from leads table** — select multiple archived leads, hit "requalify with current criteria."

### Dictate feature — call capture and review

Record calls from within the app. Flow: you call a lead, hit "record," browser captures audio (MediaRecorder API), transcribes it (Whisper or similar), then AI extracts: outcome, next steps, sentiment, key details. Auto-populates a note log entry on the lead.

**Legal:** One-party vs two-party consent varies by state/country. Must ship with a clear "check your local recording consent laws" disclaimer. Some jurisdictions require informing the other party. The app should not make compliance decisions for the user — surface the warning, let them decide.

**Tech:** Browser MediaRecorder API for capture, send audio blob to backend, transcribe via Whisper API or Deepgram, summarize via Claude. Store transcript + summary as a note log entry.
