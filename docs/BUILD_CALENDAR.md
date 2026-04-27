# ReplyPilot — Build Calendar

One feature per day. Each day has a clear spec, the files that change, and what "done" looks like.

**Status:** Days 1-9 shipped. Day 10 (user override tracking) is next.

---

## Day 1 — goodFitSignals + Qualification Prompt Rewrite ✓ DONE

Shipped. Campaigns have `goodFitSignals`, qualification prompt rewritten, `inactive_suspected` removed. Commit: see schema migration `20260413000000_add_good_fit_signals`.

---

## Day 2 — Qualification Threshold + Requalify Button ✓ DONE

Shipped. `qualifyThreshold` configurable per campaign. Requalify button re-scores ARCHIVED/QUEUED/QUALIFIED leads using current config, reuses runTracker + SSE. Commit: see schema migration `20260415000000_add_qualify_threshold`.

---

## Day 3 — Location Grid + Query Rotation ✓ DONE

Shipped. Migration `20260415010000_add_search_grid` added `searchCenters`, `gridRadiusMeters`, `gridSpacingMeters`, `cellsPerRun`, `rotateQueries`, `searchQueryHistory` to Campaign. Grid builds lazily on first run — hexagonal-equivalent cell layout over the area radius. Each run rotates through oldest-searched cells. Query rotation ships as opt-in toggle (off by default) after the user's insight that forcing "fresh phrasings" may hurt per-cell quality more than it helps coverage.

**Original plan below kept for reference:**

**Why:** the app queries Google Places at the same exact lat/lng every run. Campaigns plateau after the first run because every subsequent discovery returns the same 40-60 businesses (deduped by placesId). The search also regenerates similar queries each time. Without fixing this, more runs = wasted quota, not more leads.

**Two problems to fix:**

### 3a. Single-point searching → grid-based rotation

**Schema changes:**

Add to Campaign model:
```prisma
searchCenters        Json?     // array of { lat, lng, lastSearchedAt }
gridRadiusMeters     Int       @default(2000)   // per-cell radius
gridSpacingMeters    Int       @default(3000)   // distance between cell centers
cellsPerRun          Int       @default(5)      // how many cells to rotate through each run
```

Migration: add columns, default spacing 3000m / radius 2000m gives overlapping coverage.

**Backend changes:**

`backend/service/searchPlaces.js`:

- New function `buildSearchGrid({ centerLat, centerLng, areaRadiusMeters, spacingMeters })`:
  - Generates a hexagonal grid of points covering a circular area
  - Returns `[{ lat, lng }]` — typically 30-100 cells for a city-sized area
  - Uses standard formula: lat offset = `meters / 111320`, lng offset = `meters / (111320 * cos(lat))`

- On campaign creation (or first run), call `buildSearchGrid()` and populate `searchCenters` with all cells marked `lastSearchedAt: null`

- In `discoverPlaces()`, replace the single `locationLat/locationLng` query with:
  - Fetch `searchCenters` from campaign
  - Sort by `lastSearchedAt` ascending (nulls first)
  - Take `cellsPerRun` oldest cells
  - Run the text queries against each cell separately
  - Update each cell's `lastSearchedAt` after querying
  - Persist back to `campaign.searchCenters`

- Each cell uses `campaign.gridRadiusMeters` instead of `campaign.radiusMeters` for the Places API `locationBias.circle.radius`

### 3b. Repeated query phrasings → query rotation

**Schema changes:**

Add to Campaign model:
```prisma
searchQueryHistory   String[]  @default([])  // phrasings we've already used
```

**Backend changes:**

`backend/service/searchPlaces.js` in `generateSearchQueries()`:

- Pass the campaign's `searchQueryHistory` into the Claude prompt:
  ```
  Do NOT reuse these exact phrasings (already searched):
  {searchQueryHistory.slice(-20).join('\n')}

  Generate 3 FRESH phrasings that approach the same targeting from different angles.
  ```
- After generating, append the new queries to `searchQueryHistory`
- Keep the array capped at last 50 entries to avoid prompt bloat

**Frontend changes:**

`frontend/src/pages/campaigns/CampaignDetailPage.jsx`:
- Add a "Search coverage" card showing:
  - Total cells in grid
  - Cells searched this week
  - Cells never touched
- Advanced config: grid radius + spacing sliders (hide behind "Advanced" toggle — defaults should just work)

**Done when:**
- Creating a campaign auto-generates a location grid
- Each run picks fresh cells from the grid
- After 5 runs, you've covered 25 different geographic points, not the same one 5 times
- Query history prevents Claude from regenerating identical phrasings
- Previously-plateaued campaigns start producing new leads again

---

## Day 4 — Browser Extension Mode 1 (App-Triggered Maps Enrichment) ✓ DONE

Shipped. Migration `20260415020000_add_maps_enrichment` added 9 Maps fields to Lead (reviewCount, reviewAvg, reviewSamples, photoCount, hoursText, attributes, ownerClaimed, ownerResponseRate, lastMapsSyncAt) plus `apiToken` on User. Extension rewritten (Manifest V3, side panel, bridge content script on 5173, programmatic injection on Maps tabs, screenshot+vision fallback for missing fields). Auth middleware extended to accept `rp_`-prefixed tokens. Settings page UI for generating/copying token. LeadPage shows "Enrich via Maps" button + Google Maps data card; LeadsTable has bulk action with sequential orchestration and 3-5s random delays. Tab-based binding (tabId → leadId) rather than URL-matching solved the redirect problem.

**5 follow-up items logged in `.claude/to-do/` as F001-F005.**

**Original plan below kept for reference:**

**Why:** The Places API gives us name/phone/website — that's it. The qualification AI is blind to review count, ratings, photos, owner engagement. All of that is on the Maps page, which we can't scrape from the backend (Google blocks headless Puppeteer with consent walls). The user's real browser session bypasses every protection. Path B.

**Schema changes:**

Add to Lead model:
```prisma
reviewCount          Int?
reviewAvg            Float?
reviewSamples        Json?     // array of up to 10 recent review snippets
photoCount           Int?
hoursText            String?   // "Mon-Fri 9-5" serialized
attributes           String[]  @default([])  // ["Appointment required", "Online orders", ...]
ownerClaimed         Boolean?
ownerResponseRate    Float?    // 0-1, fraction of reviews owner has responded to
lastMapsSyncAt       DateTime?
```

**Extension rewrite — `browser-extension/`:**

Upgrade the existing extension to Manifest V3 with side panel:

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "ReplyPilot Maps Assistant",
  "version": "2.0",
  "permissions": ["storage", "sidePanel", "activeTab"],
  "host_permissions": ["https://www.google.com/maps/*", "http://localhost:3001/*", "https://<prod-domain>/*"],
  "content_scripts": [{
    "matches": ["https://www.google.com/maps/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "panel.html" },
  "options_page": "options.html",
  "action": { "default_title": "ReplyPilot" }
}
```

New files:
- `content.js` — scraper, runs on Maps pages
- `background.js` — service worker, handles messaging + API calls
- `panel.html` + `panel.js` — side panel UI
- `options.html` + `options.js` — one-time token setup
- `scraper.js` — shared scraping logic (selectors for review count, rating, photos, hours, attributes)

**Scraping logic in `scraper.js`:**

Wait for the Maps sidebar to render (polling selector), then extract:
```js
{
  name: ..., address: ..., phone: ..., website: ..., mapsUrl: ...,
  reviewCount: ..., reviewAvg: ...,
  reviewSamples: [{ author, rating, text, date }, ...],
  photoCount: ...,
  hoursText: ..., popularTimes: ...,
  attributes: [...],
  ownerClaimed: ..., ownerResponseRate: ...
}
```

Use defensive selectors — try multiple fallbacks, wrap each extraction in try/catch, fail gracefully (return partial data rather than nothing).

**App-triggered flow:**

1. ReplyPilot LeadPage → new "Enrich via Maps" button
2. Button opens `lead.mapsUri` in a new tab with `window.name = JSON.stringify({ leadId, apiBase })`
3. Content script detects the marker, starts scraping after page load
4. Content script sends results to background worker
5. Background worker POSTs to `/api/leads/:id/maps-data` with the token
6. Side panel shows progress: "Capturing reviews... photos... hours... done"
7. Tab auto-closes with a 2-second cancelable countdown
8. ReplyPilot gets a toast via polling or a push channel

**Backend changes:**

`backend/routes/leads.js` — new endpoint:
```
POST /api/leads/:id/maps-data
Body: { reviewCount, reviewAvg, reviewSamples, photoCount, hoursText, attributes, ownerClaimed, ownerResponseRate }
```
- Validates ownership (`userId` match)
- Updates lead with Maps data + `lastMapsSyncAt: now()`
- Returns updated lead

**Options page — `options.html`:**
- "Paste your ReplyPilot API token here"
- Stored in `chrome.storage.sync`
- Instructions: "Get your token from ReplyPilot → Settings → API token"

**Backend — expose API token:**

Add to `backend/routes/auth.js`:
```
POST /api/auth/token  — generate/regenerate an API token
GET  /api/auth/token  — retrieve current token (if one exists)
```
- Store `apiToken` on User model (new column, nullable)
- Token is a separate credential from the JWT — persistent, revocable

**Frontend — settings UI:**

Small settings section somewhere (DashboardPage Settings tab already exists but is empty):
- "Your API token for the browser extension"
- Copy button + regenerate button
- Instructions link

**Done when:**
- You install the updated extension, paste your token once
- Click "Enrich via Maps" on a lead → tab opens, scrapes, closes, lead in ReplyPilot now has review count, rating, photos, etc.
- You can bulk-trigger: "Enrich next 10 leads" opens them sequentially with delays

---

## Day 5 — Browser Extension Mode 2 (Discovery from Maps)

**Why now:** Day 4 covers enriching existing leads. Day 5 lets you discover new leads directly from Maps — you're browsing a neighborhood, see a promising business, and pull it into a campaign with one click. Faster than text-searching through the ReplyPilot UI.

**Extension changes:**

`panel.js` — side panel UI enhancements:

When on a Maps business page NOT linked to an existing ReplyPilot lead:
- Side panel shows:
  - Business name/preview from scraped data
  - Dropdown: "Add to campaign: [select your campaigns]"
  - "Add lead" button
  - Optional checkbox: "Auto-enrich (capture reviews, photos, etc.)"

When on a Maps page that IS an existing lead (matched by placesId or URL):
- Side panel shows existing lead status, score, notes
- "Refresh Maps data" button (same as Mode 1 enrichment)
- Link: "Open in ReplyPilot"

**Campaign matching logic:**

Content script sends the Maps URL + scraped basics to background worker. Background worker POSTs:
```
POST /api/leads/lookup-by-maps
Body: { mapsUrl: "..." }
→ { exists: true, lead: {...} }  OR  { exists: false }
```

If exists → show existing-lead UI
If not → show add-to-campaign UI

**Backend changes:**

`backend/routes/leads.js`:

New endpoint:
```
POST /api/leads/lookup-by-maps
Body: { mapsUrl }
```
- Parses `mapsUrl` to extract placesId (if in URL) or matches by coordinates
- Returns existing lead or `{ exists: false }`

New endpoint:
```
POST /api/leads/from-maps
Body: { campaignId, mapsUrl, name, address, phone?, website?, ...mapsData }
```
- Creates Lead record in the given campaign
- Status: `QUALIFIED` (skips discovery + enrichment since user manually picked it)
- Stores all Maps data immediately
- Returns the new lead

**Campaign selector — GET `/api/campaigns/list-for-extension`:**

Lightweight endpoint returning just `{ id, name, setupComplete }` for the dropdown.

**Extension auth flow:**

Options page stores token. Extension sends `Authorization: Bearer <token>` on every request. If 401, panel shows "Token invalid — open settings."

**Done when:**
- You open any business on Google Maps
- ReplyPilot side panel appears with current campaign list
- One click adds the business as a QUALIFIED lead in the chosen campaign, with review count, rating, photos, etc. already populated
- You can build a prospect list by just browsing Maps

---

## Day 6 — Lead Quality Signals (HTML + Maps) in Qualification

**Why now:** Days 4-5 filled the Maps data pipeline. Day 6 teaches the qualification AI to use it. Also wraps in the original Day 3 plan — HTML-based website quality scoring — since both are "concrete quality signals the AI needs."

**Schema changes:**

Add to Lead model (from original Day 3):
```prisma
websiteQuality        Int?      // 1-10, null if no website
websiteQualityReason  String?
```

Migration: add columns.

**Backend changes — website quality (from original Day 3):**

`backend/service/enrichLead/identity.js` — when scraping, extract HTML signals alongside `innerText`:
```js
const signals = await page.evaluate(() => ({
  hasViewport: !!document.querySelector('meta[name="viewport"]'),
  hasDoctype: document.doctype !== null,
  hasMetaDescription: !!document.querySelector('meta[name="description"]'),
  stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
  hasTableLayout: document.querySelectorAll('table[border]').length > 0,
  hasFontTags: document.querySelectorAll('font').length > 0,
  imgCount: document.images.length,
  brokenImgCount: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length,
  linkCount: document.links.length,
  titleLength: document.title?.length || 0,
  isMobileOptimized: window.matchMedia('(max-width: 768px)').matches
}));
```

New service function `scoreWebsiteQuality(signals, bodyText)`:
- Deterministic scoring (no LLM call needed):
  - Start at 5
  - +2 if `hasViewport && hasDoctype && hasMetaDescription`
  - +1 if `stylesheetCount > 0` and no `hasTableLayout`
  - -3 if `hasTableLayout || hasFontTags`
  - -2 if `!hasViewport`
  - -1 if `brokenImgCount > 2`
  - +1 if `titleLength >= 20`
  - Clamp 1-10
- Returns `{ score, reason }` — reason is a human-readable sentence explaining the deductions

**Backend changes — qualification prompt upgrade:**

`backend/service/enrichLead/qualifyLead.js` — BUSINESS section gets richer:

```
=== BUSINESS ===
Name: {name}
Type: {type}
Location: {location}
Description: {description}

Website: {website || "none"}
Website quality: {websiteQuality}/10 — {websiteQualityReason}  (if websiteQuality set)

Google reviews: {reviewCount} reviews, {reviewAvg} avg rating  (if reviewCount set)
Photos on listing: {photoCount}  (if set)
Owner engagement: {ownerClaimed ? "claimed" : "unclaimed"}, {ownerResponseRate * 100}% response rate  (if set)

Has email: {yes/no}
Has phone: {yes/no}
Has social: {yes/no}

Recent review snippets (if helpful for context):
{reviewSamples.slice(0, 3).map(r => `- "${r.text}" (${r.rating}/5)`).join('\n')}
```

The `goodFitSignals` from Day 1 can now reference these fields concretely:
> "High fit: no website OR website quality < 4. Extra signal: 30+ reviews (active business), owner claimed listing (engaged). Low fit: website quality > 7 or franchise."

The AI now has the full picture instead of guessing from "has website yes/no."

**Frontend changes:**

`frontend/src/pages/leads/LeadPage.jsx`:
- New "Google Maps data" card showing reviewCount, reviewAvg, photoCount, hours, attributes, owner status
- Website quality badge next to website link
- Recent review snippets in a collapsible section

`frontend/src/components/campaigns/LeadsTable.jsx`:
- Optional column: review count / rating (compact: "47 reviews · 4.2")
- Optional column: website quality badge
- Filters: "Has 30+ reviews", "No website or quality < 4"

**Done when:**
- Qualification prompt receives website quality + full Maps data
- Campaigns produce dramatically better fit scores
- Leads with 100+ reviews and no website (perfect web-dev prospects) score 9-10
- Leads with 3 reviews and a sketchy listing score 2-3 even if they have no website

---

## Day 7 — Reach Model + API

**Why now:** Days 1-6 fixed lead qualification end to end. Day 7 starts the architecture shift — tracking every interaction as structured data.

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

enum ReachChannel { EMAIL PHONE DM DROP_IN }

enum ReachResult {
  NO_ANSWER VOICEMAIL GATEKEEPER CONVERSATION
  POSITIVE NEGATIVE FOLLOW_UP_REQUESTED NOT_NOW DO_NOT_CONTACT
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
- Computes and sets `nextFollowUpAt` based on hardcoded rules (see Day 9)

`backend/index.js` — Mount new route.

**Done when:**
- Reach table exists
- You can POST a reach and GET reach history for a lead
- Lead's `lastReachedAt` and `followUpCount` update automatically

---

## Day 8 — Reach Log UI on LeadPage + UI Rebuild

See [`UI_REBUILD_CALENDAR.md`](UI_REBUILD_CALENDAR.md) for the full spec. Day 8 reach log is built as part of Step 3 of that sprint alongside a table cleanup, URL-persisted filters, and a visual sharpness pass.

**Why now:** Day 7 created the data layer. Day 8 makes it usable.

**Frontend changes:**

`frontend/src/pages/leads/LeadPage.jsx` — Add a Reach section:

1. **Generated message card** — unchanged
2. **Log a reach card:**
   - Channel buttons: EMAIL / PHONE / DM / DROP_IN (button group)
   - Result buttons: common ones (NO_ANSWER, VOICEMAIL, POSITIVE, NEGATIVE, FOLLOW_UP_REQUESTED, NOT_NOW). Dropdown for less common (GATEKEEPER, CONVERSATION, DO_NOT_CONTACT).
   - Transcript textarea — optional, auto-expands on focus
   - "Log reach" button — clears form on save
3. **Reach history** — list, newest first:
   - Channel icon + result badge + relative timestamp + transcript preview
   - Expandable for full transcript

**Design:**
- Channel icons + colors for scanability
- Result badge colors: green (POSITIVE), red (NEGATIVE, DO_NOT_CONTACT), yellow (FOLLOW_UP_REQUESTED, NOT_NOW), gray (NO_ANSWER, VOICEMAIL, GATEKEEPER, CONVERSATION)
- Log a reach in 3 clicks + optional notes

`frontend/src/components/campaigns/LeadsTable.jsx`:
- `followUpCount` badge on lead name ("3 reaches")
- `lastReachedAt` column or tooltip

**Done when:**
- Log a reach from LeadPage in under 5 seconds
- History shows channel, result, timestamp, transcript
- LeadsTable surfaces reach counts

---

## Day 9 — Hardcoded Next-Action Logic + Follow-Up Queue

**Why now:** Days 7-8 built the reach system. Day 9 makes it intelligent — the app tells you what to do next.

**Backend changes:**

`backend/service/nextAction.js` — New service.

`computeNextFollowUp({ lead, latestReach, reachCount })` returns `{ nextFollowUpAt, suggestedAction }`:

```
PHONE + NO_ANSWER (1st)    → +48hr, "Call again, different time"
PHONE + NO_ANSWER (2nd)    → +24hr, "Switch to email or DM"
PHONE + VOICEMAIL          → same day, "Send email referencing voicemail"
PHONE + CONVERSATION       → +1hr, "Send recap email"
PHONE + FOLLOW_UP_REQUESTED→ exact date or +7 days, "Call back as promised"
PHONE + POSITIVE           → +24hr, "Send mockup or proposal"
PHONE + NEGATIVE           → null, lead is LOST
PHONE + NOT_NOW            → +60 days, "Re-engage"

EMAIL + no reply (1st f/u) → +72hr, "Follow up, different angle"
EMAIL + no reply (2nd f/u) → +4 days, "Final short message"
EMAIL + no reply (3rd)     → +60 days, "Dormant"
EMAIL + POSITIVE           → ASAP (null = now), "Respond immediately"
EMAIL + NEGATIVE           → null, lead is LOST
EMAIL + NOT_NOW            → +60 days, "Re-engage"

DM + no reply              → +48hr, "Switch channel"
DM + POSITIVE              → ASAP, "Move to email — get their address"

DROP_IN + POSITIVE         → +2hr, "Send follow-up email referencing meeting"
DROP_IN + owner not there  → scheduled return, "Go back at suggested time"
DROP_IN + NEGATIVE         → null, lead is LOST
```

Update `backend/routes/reaches.js` POST handler — call `computeNextFollowUp()` after creating reach, write `nextFollowUpAt`.

`backend/routes/leads.js` — new endpoint:
```
GET /api/leads/action-queue
```
- Returns leads where `nextFollowUpAt <= now()` OR status QUALIFIED with no reaches
- Sorted: overdue callbacks, positive replies waiting, follow-ups due, new leads
- Includes latest reach data per lead

**Frontend changes:**

New **Action Queue** view (new tab or primary dashboard):
- Grouped by urgency: Overdue (red), Due today, New leads (blue)
- Each item: lead name, campaign, suggested action, channel icon, last reach summary
- Click → LeadPage to log next reach
- Nav badge: "14 leads need action"

**Done when:**
- Logging a reach auto-sets the next follow-up
- Action queue shows what to do today
- No mental math about timing — the app drives cadence

---

## Day 10 — User Override Tracking

**Why now:** System is functional. Day 10 adds the learning loop — corrections train the system.

**Schema changes:**
- Add `userOverride Boolean @default(false)` to Lead
- Add `aiOriginalStatus String?` to Lead

**Backend changes:**

`backend/routes/leads.js` PATCH `/:id/status`:
- If new status differs from what the AI set, flag `userOverride = true`, store `aiOriginalStatus`

`backend/routes/campaigns.js`:
```
GET /api/campaigns/:id/overrides
```
- Returns leads where `userOverride = true`, grouped by direction (promoted vs demoted)
- Includes score, reason, lead details — the training data set

**Frontend changes:**

LeadsTable — override indicator + filter.
CampaignDetailPage — override count stat.

**Done when:**
- Manual status changes flag the override
- Override view shows every correction
- Data exists for future prompt improvement via few-shot examples

---

## Day 11 — qualificationGuide + Campaign Cloning

**Why now:** Power-user qualification tuning + setup speed.

**Schema changes:** Add `qualificationGuide String?` to Campaign.

**Backend changes:**

`backend/service/enrichLead/qualifyLead.js` — inject `qualificationGuide` into prompt (after goodFitSignals/qualifier) when non-empty.

`backend/routes/campaigns.js`:
- Add `qualificationGuide` to allowed PATCH fields
- New endpoint `POST /api/campaigns/:id/clone` — copies all config fields, not leads/runs

`backend/service/campaignSetup/steps.js` — add optional guide step.

**Frontend changes:**
- qualificationGuide textarea in config editor
- "Clone campaign" button with name prompt

**Done when:**
- qualificationGuide editable, injected into prompt
- One-click campaign clone
- Setting up 5 vertical campaigns takes 5 minutes

---

## Day 12 — Reach-Aware Message Generation

**Why now:** Reach system exists. The AI should use it.

**Backend changes:**

`backend/service/generateMessage.js` — include reach history in prompt:

```
Previous outreach history:
- Reach #1 (Apr 10, EMAIL): Sent initial message. No reply.
- Reach #2 (Apr 13, PHONE): Called, no answer.

This is reach #3. Write a message that acknowledges previous attempts
without being pushy. Try a different angle.
```

If no reaches → standard cold open. If reaches → instruct Claude NOT to repeat opener, reference history naturally, adjust CTA based on count.

`backend/routes/leads.js` — new endpoint `POST /api/leads/:id/generate-message` — runs generator with fresh reach context.

**Frontend changes:**

LeadPage — "Regenerate message" button next to textarea, loading spinner, replaces content.

**Done when:**
- First message is a cold open
- Follow-ups reference previous attempts naturally
- Messages feel like a real salesperson, not a bot repeating itself

---

## Day 13 — Analytics Dashboard

**Why now:** Data exists. Make decisions from it.

**Backend changes:**

`backend/routes/campaigns.js`:
```
GET /api/campaigns/:id/analytics
```
Returns aggregate stats: totalLeads, qualified/archived counts, reaches by channel + result, positive rate per channel, avg reaches to conversion, override counts, lead state counts.

**Frontend changes:**

New "Analytics" tab on CampaignDetailPage:
- Funnel: Discovered → Qualified → Contacted → Positive → Won (with drop-off %)
- Channel breakdown table
- Result distribution
- Override summary
- Key metric cards

Bootstrap tables + colored badges. No chart library.

**Done when:**
- Analytics tab shows full funnel and channel breakdown
- See at a glance whether phone or email is working
- Override count tells you AI correction rate

---

## Summary

| Day | Feature | Status |
|---|---|---|
| 1 | goodFitSignals + prompt rewrite | ✓ DONE |
| 2 | Qualify threshold + requalify button | ✓ DONE |
| 3 | Location grid + query rotation | ✓ DONE |
| 4 | Browser extension Mode 1 (app-triggered Maps enrichment) | ✓ DONE |
| 5 | Browser extension Mode 2 (discovery from Maps) | ✓ DONE |
| 6 | Lead quality signals (HTML + Maps) in qualification | ✓ DONE |
| 7 | Reach model + API | ✓ DONE |
| 8 | Reach log UI on LeadPage + UI rebuild | ✓ DONE |
| 9 | Next-action logic + follow-up queue | ✓ DONE |
| 10 | User override tracking | — |
| 11 | qualificationGuide + campaign cloning | — |
| 12 | Reach-aware message generation | — |
| 13 | Analytics dashboard | — |

**Arcs:**
- **Days 1-2 (DONE):** Fix qualification prompt + control
- **Days 3-6:** Fix discovery + enrichment quality. Without this, more intelligence on top of bad inputs is wasted.
- **Days 7-9:** Build the reach system — the operator cockpit
- **Days 10-13:** Intelligence and polish that compound with real usage
