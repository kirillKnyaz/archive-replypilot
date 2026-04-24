# ReplyPilot — Build Calendar

One feature per day. Each day has a clear spec, the files that change, and what "done" looks like.

---

## Day 1 — goodFitSignals + Qualification Prompt Rewrite

**Why first:** The app is actively producing wrong results. Every campaign run sorts leads incorrectly. This is the root cause — the AI has no idea what GOOD looks like for your campaign.

**Schema changes:**
- Add `goodFitSignals String?` to Campaign model in `backend/prisma/schema.prisma`
- Migration: `ALTER TABLE "Campaign" ADD COLUMN "goodFitSignals" TEXT;`

**Backend changes:**

`backend/service/enrichLead/qualifyLead.js` — Rewrite the qualification prompt:
- Current prompt only passes: `offer`, `angle`, `qualifier` (bad-fit), `vertical`
- New prompt adds: `goodFitSignals` prominently ABOVE bad-fit signals
- Remove the `inactive_suspected` field from the AI output entirely. It conflates "no website" with "inactive" which is exactly backwards for a web developer.
- Replace with a neutral `websitePresent: true/false` fact that the prompt uses in context with `goodFitSignals`
- Drop `inactiveSuspected` from the Lead update (line 79) — stop writing this field

New prompt structure:
```
=== CAMPAIGN ===
Vertical: {vertical}
Offer: {offer}
Angle: {angle}

Good-fit signals (score HIGHER when these apply): {goodFitSignals}
Bad-fit signals (score LOWER when these apply): {qualifier}

=== BUSINESS ===
(same as current)

=== TASK ===
Score 0-10 where 10 = perfect fit based on the good-fit and bad-fit signals above.
Return JSON: { "score": <0-10>, "reason": "<1-2 sentences>" }
```

`backend/routes/campaigns.js` — Allow `goodFitSignals` in PATCH:
- Add `"goodFitSignals"` to `ALLOWED_FIELDS` set (line 13). Currently built from `REQUIRED_SLOTS` — either add it there or extend the set separately.

`backend/service/campaignSetup/steps.js` — Add setup slot:
- Add new step after `qualifier`:
```js
{
  id: "goodFitSignals",
  prompt: "What makes a business a GOOD fit for your offer? (e.g. 'no website, outdated website, few Google photos, owner-operated')",
  category: "filter",
}
```
- This becomes the 7th slot. Update `isSetupComplete` if needed — but `goodFitSignals` should be optional, not required. The 6 current required slots stay required. `goodFitSignals` is asked during setup but doesn't block completion.

**Frontend changes:**

`frontend/src/pages/campaigns/CampaignDetailPage.jsx` — Add to config editor:
- Add `goodFitSignals` textarea between `angle` and `qualifier` fields
- Label: "Good-fit signals" with hint "(score leads higher when these apply)"
- Add to `startEditing()` field initialization (line 66)
- Add to read-only display card (line 203)

**Done when:**
- Campaign config shows and saves `goodFitSignals`
- Running a campaign uses the new prompt
- A lead with no website in a web-dev campaign scores 7+ instead of getting archived

---

## Day 2 — Qualification Threshold + Requalify Button

**Why now:** Day 1 fixed the prompt. Day 2 gives you control over the cutoff and lets you re-sort all existing leads with the new criteria.

**Schema changes:**
- Add `qualifyThreshold Int @default(4)` to Campaign model
- Migration: `ALTER TABLE "Campaign" ADD COLUMN "qualifyThreshold" INTEGER NOT NULL DEFAULT 4;`

**Backend changes:**

`backend/service/enrichLead/qualifyLead.js`:
- Change line 67 from hardcoded `icpFitScore >= 4` to `icpFitScore >= campaign.qualifyThreshold`
- Requires passing `campaign` through the full chain (it's already passed — just use the field)

`backend/routes/campaigns.js` — Add requalify endpoint:
```
POST /api/campaigns/:id/requalify
```
- Fetches all leads for the campaign with status ARCHIVED or QUEUED
- For each lead, re-runs `qualifyLead({ lead, campaign })` with the current campaign config
- Returns `{ requalified: number, qualified: number, archived: number }`
- Should support SSE streaming (same pattern as campaign run) since this could take minutes for hundreds of leads

- Also add `qualifyThreshold` to `ALLOWED_FIELDS` in PATCH route

`backend/routes/campaigns.js` — Pass campaign to qualifyLead:
- The campaign runner already passes the campaign object through. Verify `qualifyThreshold` is included when the campaign is fetched.

**Frontend changes:**

`frontend/src/pages/campaigns/CampaignDetailPage.jsx`:
- Add threshold slider/input to config editor (min 1, max 10, default 4)
- Label: "Qualify threshold" with hint "(leads scoring below this get archived)"
- Add "Requalify leads" button next to "Run now" in the campaign header
- Show a confirmation: "Re-score all archived and queued leads with current criteria?"
- Progress indicator while requalifying (reuse live run panel pattern or simple spinner + count)

**Done when:**
- Threshold is editable per campaign
- Changing threshold from 4 to 2 and hitting requalify rescues previously archived leads
- Leads that now score below threshold get archived even if previously queued

---

## Day 3 — Website Quality Scoring

**Why now:** Days 1-2 fixed the qualification logic and controls. Day 3 gives the AI the signal it's been completely missing — how good or bad the lead's actual website is.

**Schema changes:**
- Add `websiteQuality Int?` to Lead model (1-10 scale, null if no website)
- Add `websiteQualityReason String?` to Lead model (one-line explanation)
- Migration: add both columns

**Backend changes:**

`backend/service/enrichLead/identity.js` — Add website quality assessment:
- After the existing Puppeteer scrape that extracts `document.body.innerText`, also extract HTML signals:
  - `document.querySelector('meta[name="viewport"]')` — has responsive viewport?
  - `document.querySelectorAll('link[rel="stylesheet"]').length` — how many stylesheets
  - `document.title` — has a title tag?
  - `document.querySelector('meta[name="description"]')` — has meta description?
  - `window.getComputedStyle(document.body).fontFamily` — using a system font or custom?
  - Check for common outdated patterns: `<table>` layouts, inline styles, `<font>` tags, `<marquee>`, missing `<!DOCTYPE html>`
  - Count total links, images, check for broken image paths
- Bundle these signals into a JSON object and pass to a new `evaluateWebsiteQuality()` function

`backend/service/enrichLead/enrichGpt.js` — Add website quality evaluation:
- New function `evaluateWebsiteQuality({ htmlSignals, bodyText })`:
  - Prompt: "Given these HTML signals and page content, rate this website 1-10 on professionalism and modernity. 1 = broken/ancient/template garbage. 10 = polished modern site. Return JSON: { score: N, reason: 'one sentence' }"
  - Use Haiku (cheap, fast)
  - Or skip the LLM call entirely and compute a deterministic score from the HTML signals alone — no viewport = -3, `<table>` layout = -3, no meta description = -1, etc. Start from 5 and adjust. Cheaper and faster than an API call.

`backend/service/enrichLead/qualifyLead.js` — Include website quality in prompt:
- Add to the BUSINESS section: `Website quality: ${lead.websiteQuality}/10 — ${lead.websiteQualityReason}` (or "No website" if null)
- The `goodFitSignals` from Day 1 can now reference this: "Score higher when website quality is below 4"

**Frontend changes:**

`frontend/src/pages/leads/LeadPage.jsx`:
- Show `websiteQuality` as a badge next to the website link: "Site quality: 2/10"
- Show `websiteQualityReason` as tooltip or small text

`frontend/src/components/campaigns/LeadsTable.jsx`:
- Optional: add website quality column or indicator

**Done when:**
- Enrichment scores every lead's website 1-10
- Leads with no website show "No website" (which goodFitSignals already handles)
- Leads with garbage websites score low on quality and high on ICP fit
- A plumber with a 2009 GoDaddy site scores 8+ in a web-dev campaign

---

## Day 4 — Reach Model + API

**Why now:** Days 1-3 fixed lead qualification. Day 4 starts the architecture shift — tracking every interaction as structured data.

**Schema changes:**

Add to `backend/prisma/schema.prisma`:
```prisma
model Reach {
  id          String       @id @default(cuid())
  leadId      String
  lead        Lead         @relation(fields: [leadId], references: [id], onDelete: Cascade)
  campaignId  String?
  campaign    Campaign?    @relation(fields: [campaignId], references: [id])
  userId      String

  channel     ReachChannel
  result      ReachResult
  transcript  String?

  createdAt   DateTime     @default(now())

  @@index([leadId, createdAt])
  @@index([userId, createdAt])
}

enum ReachChannel {
  EMAIL
  PHONE
  DM
  DROP_IN
}

enum ReachResult {
  NO_ANSWER
  VOICEMAIL
  GATEKEEPER
  CONVERSATION
  POSITIVE
  NEGATIVE
  FOLLOW_UP_REQUESTED
  NOT_NOW
  DO_NOT_CONTACT
}
```

Add relation on Lead: `reaches Reach[]`
Add relation on Campaign: `reaches Reach[]`

Add follow-up fields to Lead:
```prisma
  nextFollowUpAt    DateTime?
  lastReachedAt     DateTime?
  followUpCount     Int       @default(0)
  activeChannel     ReachChannel?
  lostReason        String?
```

**Backend changes:**

`backend/routes/reaches.js` — New route file:
```
POST   /api/leads/:id/reaches      — Log a new reach
GET    /api/leads/:id/reaches      — List all reaches for a lead (newest first)
```

POST body: `{ channel, result, transcript? }`
- Creates Reach record
- Updates Lead: `lastReachedAt`, `followUpCount++`, `activeChannel`
- Computes and sets `nextFollowUpAt` based on hardcoded rules (see Day 6)
- For now, just save the reach and update the timestamps. Next-action logic comes Day 6.

`backend/index.js` — Mount new route:
```js
app.use('/api/leads', authenticate, require('./routes/reaches'));
```
(Or nest under leads routes directly in `routes/leads.js`)

**Frontend changes:**

None yet — Day 5 builds the UI. Day 4 is data model + API only.

**Done when:**
- Reach table exists in database
- You can POST a reach and GET reach history for a lead
- Lead's `lastReachedAt` and `followUpCount` update automatically

---

## Day 5 — Reach Log UI on LeadPage

**Why now:** Day 4 created the data layer. Day 5 makes it usable.

**Frontend changes:**

`frontend/src/pages/leads/LeadPage.jsx` — Replace the "Outreach message" card with a Reach section:

**New layout for right column:**

1. **Generated message card** (keep existing) — the AI-drafted message, editable textarea, copy button
2. **Log a reach card** — the operator input:
   - Channel selector: EMAIL / PHONE / DM / DROP_IN (button group, not dropdown — speed matters)
   - Result selector: buttons for the common results (NO_ANSWER, VOICEMAIL, POSITIVE, NEGATIVE, FOLLOW_UP_REQUESTED, NOT_NOW). Show full list in a dropdown for less common ones (GATEKEEPER, CONVERSATION, DO_NOT_CONTACT).
   - Transcript textarea: optional, expands on focus. Placeholder: "Notes about this interaction..."
   - "Log reach" button. Clears the form after saving.
3. **Reach history** — list of past reaches, newest first:
   - Each entry: channel icon + result badge + timestamp + transcript preview
   - Expandable to show full transcript
   - Compact — should show 5-6 entries without scrolling

**Design notes:**
- Channel buttons should have distinct colors/icons so you can scan history at a glance
- Result badges color-coded: green (POSITIVE), red (NEGATIVE, DO_NOT_CONTACT), yellow (FOLLOW_UP_REQUESTED, NOT_NOW), gray (NO_ANSWER, VOICEMAIL, GATEKEEPER, CONVERSATION)
- Timestamp shown as relative ("2 hours ago", "3 days ago")
- The whole section should feel fast — log a reach in 3 clicks + optional notes

`frontend/src/components/campaigns/LeadsTable.jsx` — Add reach indicators:
- Show `followUpCount` as a small badge on the lead name (e.g., "3 reaches")
- Show `lastReachedAt` as a column or tooltip

**Done when:**
- You can log a reach from LeadPage in under 5 seconds
- Reach history shows on the lead with channel, result, timestamp, transcript
- LeadsTable shows which leads have been contacted and how many times

---

## Day 6 — Hardcoded Next-Action Logic + Follow-Up Queue

**Why now:** Days 4-5 built the reach system. Day 6 makes it intelligent — the app tells you what to do next.

**Backend changes:**

`backend/service/nextAction.js` — New service:

Function `computeNextFollowUp({ lead, latestReach, reachCount })`:
- Takes the most recent reach and returns `{ nextFollowUpAt: Date, suggestedAction: String }`
- Hardcoded rules:

```
PHONE + NO_ANSWER (1st time)      → +48hr, "Call again, different time"
PHONE + NO_ANSWER (2nd time)      → +24hr, "Switch to email or DM"
PHONE + VOICEMAIL                 → same day, "Send email referencing voicemail"
PHONE + CONVERSATION              → +1hr, "Send recap email"
PHONE + FOLLOW_UP_REQUESTED       → exact date from transcript (or +7 days default), "Call back as promised"
PHONE + POSITIVE                  → +24hr, "Send mockup or proposal"
PHONE + NEGATIVE                  → null, lead is LOST
PHONE + NOT_NOW                   → +60 days, "Re-engage"

EMAIL + no reply (1st follow-up)  → +72hr, "Follow up, different angle"
EMAIL + no reply (2nd follow-up)  → +4 days, "Final short message"
EMAIL + no reply (3rd)            → +60 days, "Dormant"
EMAIL + POSITIVE                  → ASAP (null = now), "Respond immediately"
EMAIL + NEGATIVE                  → null, lead is LOST
EMAIL + NOT_NOW                   → +60 days, "Re-engage"

DM + no reply                     → +48hr, "Switch channel"
DM + POSITIVE                     → ASAP, "Move to email — get their address"

DROP_IN + POSITIVE                → +2hr, "Send follow-up email referencing meeting"
DROP_IN + owner not there         → scheduled return, "Go back at suggested time"
DROP_IN + NEGATIVE                → null, lead is LOST
```

- Also sets `lead.activeChannel` based on the channel of the latest reach

Update `backend/routes/reaches.js` POST handler:
- After creating the reach, call `computeNextFollowUp()` and write `nextFollowUpAt` to the lead

`backend/routes/leads.js` — Add action queue endpoint:
```
GET /api/leads/action-queue
```
- Returns leads where `nextFollowUpAt <= now()` OR status is QUALIFIED with no reaches yet
- Sorted by: overdue callbacks first, then positive replies waiting, then follow-ups due, then new leads
- Include latest reach data on each lead for context

**Frontend changes:**

New component or page: **Action Queue**
- Could be a new tab on Dashboard, or the new default view on the campaigns page
- Shows a list grouped by urgency:
  - "Overdue" (nextFollowUpAt is in the past) — red accent
  - "Due today" (nextFollowUpAt is today) — normal
  - "New leads" (qualified, no reaches yet) — blue accent
- Each item shows: lead name, campaign name, suggested action, channel icon, last reach summary
- Click opens LeadPage where you can log the next reach
- Count badge in the nav: "14 leads need action"

**Done when:**
- After logging a reach, the app sets the next follow-up date automatically
- Opening the action queue shows you exactly what needs to happen today
- No manual thinking about timing — the app drives the cadence

---

## Day 7 — User Override Tracking

**Why now:** The system is now functional. Day 7 adds the learning loop — every correction you make teaches the system what it got wrong.

**Schema changes:**
- Add `userOverride Boolean @default(false)` to Lead model
- Add `aiOriginalStatus String?` to Lead model (what the AI decided before the user changed it)
- Migration: add both columns

**Backend changes:**

`backend/routes/leads.js` — Update PATCH `/:id/status`:
- When user changes status, check if it differs from what the AI assigned
- If different, set `userOverride = true` and store the AI's original decision in `aiOriginalStatus`
- E.g., AI archived a lead (score 3), user restores to QUEUED → `userOverride = true`, `aiOriginalStatus = "ARCHIVED"`

`backend/routes/campaigns.js` — Add override analysis endpoint:
```
GET /api/campaigns/:id/overrides
```
- Returns all leads in the campaign where `userOverride = true`
- Grouped by direction: "User promoted" (AI archived → user queued) vs "User demoted" (AI qualified → user archived)
- Include `icpFitScore`, `icpFitReason`, lead details for each
- This is the training data set

Future enhancement (not Day 7): Feed override examples into the qualification prompt as few-shot corrections. "The following leads were manually overridden by the user. Leads like [example] should score higher. Leads like [example] should score lower."

**Frontend changes:**

`frontend/src/components/campaigns/LeadsTable.jsx`:
- Add a visual indicator on overridden leads (small icon or dot)
- Filter option: "Show overrides only"

`frontend/src/pages/campaigns/CampaignDetailPage.jsx`:
- Add override count in campaign stats: "12 user overrides"
- Link to filtered view showing just the overridden leads

**Done when:**
- Manually changing a lead's status flags the override
- You can see all overrides for a campaign in one view
- The data exists for future prompt improvement (feeding overrides as examples)

---

## Day 8 — qualificationGuide + Campaign Cloning

**Why now:** Wrapping up qualification with the power-user escape hatch, plus a quality-of-life feature that saves time when launching new campaigns.

**Schema changes:**
- Add `qualificationGuide String?` to Campaign model
- Migration: add column

**Backend changes — qualificationGuide:**

`backend/service/enrichLead/qualifyLead.js`:
- Add `qualificationGuide` to the prompt after goodFitSignals/qualifier:
```
Additional evaluation instructions from the user:
{qualificationGuide}
```
- Only include this block if `qualificationGuide` is non-empty

`backend/routes/campaigns.js`:
- Add `qualificationGuide` to allowed PATCH fields
- Add to campaign setup (optional slot, like goodFitSignals)

`backend/service/campaignSetup/steps.js`:
- Add optional step:
```js
{
  id: "qualificationGuide",
  prompt: "Any specific instructions for how leads should be evaluated? (optional — e.g. 'websites built before 2020 are outdated, score them high')",
  category: "filter",
}
```

**Backend changes — Campaign cloning:**

`backend/routes/campaigns.js` — New endpoint:
```
POST /api/campaigns/:id/clone
Body: { name: "New campaign name" }
```
- Copies all config fields from source campaign: `vertical`, `location`, `offer`, `angle`, `qualifier`, `goodFitSignals`, `qualificationGuide`, `tone`, `voiceExamples`, `dailyTarget`, `qualifyThreshold`, `radiusMeters`
- Sets `active = false`, `setupComplete` = recomputed from copied fields
- Does NOT copy leads or runs
- Returns the new campaign

**Frontend changes:**

`frontend/src/pages/campaigns/CampaignDetailPage.jsx`:
- Add `qualificationGuide` textarea to config editor
- Label: "Qualification guide" with hint "(optional — detailed instructions for the AI evaluator)"

`frontend/src/pages/campaigns/CampaignListPage.jsx` (or CampaignDetailPage):
- Add "Clone campaign" button
- Opens a small modal/prompt for new campaign name
- Creates the clone and navigates to it

**Done when:**
- qualificationGuide is editable and injected into qualification prompt
- You can clone a campaign in one click and just swap the vertical
- Setting up 5 campaigns across verticals takes 5 minutes instead of 30

---

## Day 9 — Reach-Aware Message Generation

**Why now:** The reach system exists. The AI should use it. Follow-up messages that acknowledge history convert dramatically better than repeated cold opens.

**Backend changes:**

`backend/service/generateMessage.js` — Rewrite prompt to include reach history:
- Fetch all reaches for the lead: `prisma.reach.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' } })`
- Build a reach history block for the prompt:
```
Previous outreach history:
- Reach #1 (Apr 10, EMAIL): Sent initial message. No reply.
- Reach #2 (Apr 13, PHONE): Called, no answer.
- Reach #3 (Apr 14, EMAIL): Follow-up email. No reply.

This is reach #4. Write a message that acknowledges the previous attempts
without being pushy. Try a different angle.
```
- If no reaches exist, generate a standard cold open (current behavior)
- If reaches exist, the prompt should instruct Claude to:
  - NOT repeat the same opener
  - Reference the history naturally ("I reached out a few days ago...")
  - Adjust the CTA based on reach count (reach #1: low friction. Reach #3: more direct)

**Frontend changes:**

`frontend/src/pages/leads/LeadPage.jsx`:
- Add a "Regenerate message" button next to the message textarea
- When clicked, calls `POST /api/leads/:id/generate-message` which runs `generateMessage` with full reach context
- Shows a loading spinner while generating
- The new message replaces the textarea content (user can still edit before copying/sending)

`backend/routes/leads.js` — Add endpoint:
```
POST /api/leads/:id/generate-message
```
- Fetches the lead with its campaign
- Calls `generateMessage({ lead, campaign })` (which now includes reach history)
- Returns `{ message: string }`

**Done when:**
- First message to a lead is a cold open
- Follow-up messages reference previous attempts naturally
- "Regenerate" button creates a fresh message with full context
- Messages feel like a real salesperson following up, not a bot repeating itself

---

## Day 10 — Analytics Dashboard

**Why now:** You've been running campaigns and logging reaches for a week. The data exists. Now surface it so you can make decisions.

**Backend changes:**

`backend/routes/campaigns.js` — Add analytics endpoint:
```
GET /api/campaigns/:id/analytics
```
Returns:
```json
{
  "totalLeads": 145,
  "qualified": 87,
  "archived": 58,
  "totalReaches": 234,
  "reachesByChannel": { "EMAIL": 120, "PHONE": 80, "DM": 30, "DROP_IN": 4 },
  "reachesByResult": { "NO_ANSWER": 45, "POSITIVE": 18, "NEGATIVE": 12, ... },
  "positiveRate": 0.077,
  "positiveRateByChannel": { "EMAIL": 0.05, "PHONE": 0.12, "DM": 0.06, "DROP_IN": 0.25 },
  "avgReachesToConversion": 3.4,
  "overrides": { "promoted": 8, "demoted": 3 },
  "leadsWon": 4,
  "leadsDormant": 23,
  "leadsActive": 31
}
```
- All computed from Reach + Lead tables with aggregate queries
- No new tables needed

**Frontend changes:**

New tab on CampaignDetailPage: "Analytics" (alongside Leads and Runs)

Display:
- **Funnel:** Discovered → Qualified → Contacted → Positive → Won (with counts and drop-off %)
- **Channel breakdown:** Bar chart or simple table showing reaches and positive rate per channel
- **Result distribution:** What happens when you reach out? Pie chart or breakdown of results
- **Override summary:** "8 leads promoted, 3 demoted" — link to override view from Day 7
- **Key metrics cards:** Total reaches, positive rate, avg reaches to close, leads won

Keep it simple — no charting library unless one is already installed. Bootstrap tables and colored badges can convey everything. A fancy chart adds zero signal over a well-formatted number.

**Done when:**
- Campaign analytics tab shows the full funnel and channel breakdown
- You can see at a glance whether phone or email is working better
- Override count tells you how much you're correcting the AI

---

## Summary

| Day | Feature | Impact |
|---|---|---|
| 1 | goodFitSignals + prompt rewrite | Fixes root cause of bad qualification |
| 2 | Qualify threshold + requalify button | Immediate control + recovers mis-sorted leads |
| 3 | Website quality scoring | Gives AI the #1 missing signal |
| 4 | Reach model + API | Data foundation for interaction tracking |
| 5 | Reach log UI on LeadPage | Makes reaches usable — log in 3 clicks |
| 6 | Next-action logic + follow-up queue | The killer feature — app tells you what to do |
| 7 | User override tracking | Learning loop — corrections train the system |
| 8 | qualificationGuide + campaign cloning | Power user tuning + setup speed |
| 9 | Reach-aware message generation | Follow-ups that acknowledge history |
| 10 | Analytics dashboard | Data-driven decisions on what's working |

Days 1-3: Fix qualification (the broken thing).
Days 4-6: Build the reach system (the missing thing).
Days 7-10: Intelligence and polish (the compounding things).
