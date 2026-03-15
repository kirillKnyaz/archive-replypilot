# ReplyPilot — Rebuild Plan

## Context & Goal

ReplyPilot is being rebuilt from a generic SaaS outreach platform into a **personal automated lead generation system** for one user (the owner). The goal is to run daily, discover and qualify local businesses, write personalised cold outreach messages via Claude, and surface a daily shortlist of 10-20 leads ready to copy-paste into inboxes.

**The core problem being solved:** inconsistency. The system runs whether or not the user opens it. The user's only job is: open the app → read the leads → copy the message → send it → mark as contacted. ~15 minutes a day.

**No payment system. No multi-tenancy concerns. Simple login.**

---

## Product Decisions (Locked)

### Campaign Model
Each campaign is the atomic unit: `vertical + location + offer`. Multiple campaigns can run simultaneously with different verticals, locations, and offers. Examples:
- "Restaurant websites — Bristol"
- "Hair salon social media — Manchester"

### Channel
Messages are copy-pasted by the user manually. No automated sending. The system's job is discovery + qualification + copywriting only.

### Lead Volume
10–20 qualified leads/day across all active campaigns combined.

### AI
All AI calls use Claude (Anthropic SDK). Never OpenAI.
- **claude-haiku-4-5-20251001** — enrichment eval, routing (cheap, fast)
- **claude-sonnet-4-6** — message generation, campaign setup questions (quality matters)

### Inactive Business Detection
Google Places API returns `businessStatus: CLOSED_PERMANENTLY | CLOSED_TEMPORARILY | OPERATIONAL`. Hard filter on `CLOSED_PERMANENTLY`. Additional signals: no reviews in 18+ months, sparse listing. Flag with `inactiveSuspected: true` rather than hard-drop (these might be opportunities).

### No Contact Info Found
If enrichment finds no email/phone/social → set `noContactFound: true`, keep lead with `status: QUEUED`, flag for potential in-person visit (high priority).

### Qualification Logic
If a business clearly doesn't need the offer (e.g. they have a modern website and the offer is website design), they get `status: ARCHIVED` with `icpFitReason` explaining why. Claude evaluates fit against the campaign's `qualifier` field (what makes a bad fit).

### Lead Status Pipeline
```
DISCOVERED → ENRICHED → QUALIFIED → QUEUED → CONTACTED → ARCHIVED
```
User only sees `QUEUED` leads in the daily review. After copy-pasting, they mark `CONTACTED`. `ARCHIVED` = filtered out (bad fit, inactive, duplicate).

### Campaign Setup
Guided chat with Claude using slot-filling — same pattern as old onboarding, applied per-campaign. 6 slots:
1. **vertical** — type of business being targeted
2. **location** — area (geocoded server-side)
3. **offer** — what's being pitched
4. **angle** — specific problem being solved for this vertical
5. **qualifier** — what makes a business a BAD fit (filter criteria)
6. **tone** — casual / professional / direct

Once all 6 slots are filled, campaign `setupComplete` is set to `true` and the campaign can be activated.

---

## Data Model (Current Schema)

### Key Models
```
User
  → Campaign (vertical, location, offer, angle, qualifier, tone, voiceExamples[], active, dailyTarget, setupComplete)
  → CampaignRun (per daily run: leadsDiscovered, leadsFiltered, leadsQueued, status)
  → Lead (campaignId, status: LeadStatus, icpFitScore, icpFitReason, generatedMessage, noContactFound, inactiveSuspected)
  → Message → Reply
  → List ↔ Lead (many-to-many via LeadList)
  → SearchResult
```

### Lead Fields Added in Phase 1
- `campaignId` — nullable FK to Campaign
- `status LeadStatus` — pipeline status (replaces `priority`)
- `icpFitScore Float?` — 0-10 from Claude evaluation
- `icpFitReason String?` — Claude's explanation
- `generatedMessage String?` — Claude-written outreach message
- `noContactFound Boolean` — no email/phone/social found
- `inactiveSuspected Boolean` — signs of inactivity

### Removed in Phase 1
- `UserProfile` — replaced by per-campaign config
- `Subscription` — no payments
- `OnboardingFlow` — replaced by per-campaign setup chat
- `Priority` enum — replaced by `LeadStatus` enum
- `RiskTolerance`, `TonePreference` enums — unused

---

## Phase Plan

### Phase 1 — Foundation ✅ COMPLETE
- [x] Prisma schema: add Campaign, CampaignRun, update Lead, remove Subscription/UserProfile/OnboardingFlow
- [x] Remove Stripe from index.js and billing route
- [x] Remove token middleware from search routes
- [x] Simplify ProtectedRoute to auth-only (no subscription or onboarding gate)
- [x] Swap OpenAI → Anthropic SDK in all service files
- [x] Install @anthropic-ai/sdk, remove openai and stripe
- [ ] Run `npx prisma migrate dev --name phase1_campaign_system` (user runs this)
- [ ] Add `ANTHROPIC_API_KEY` to `.env`, remove `OPENAI_API_KEY` and `STRIPE_SECRET_KEY`

---

### Phase 2 — Campaign Setup Chat
**Goal:** User can create a campaign via a guided Claude chat. All 6 slots filled → campaign marked `setupComplete: true` → can be activated.

**Backend:**
- `POST /api/campaigns` — create campaign (name only, starts setup)
- `GET /api/campaigns` — list user's campaigns
- `GET /api/campaigns/:id` — get single campaign
- `PATCH /api/campaigns/:id` — update fields (activate/pause, edit config)
- `DELETE /api/campaigns/:id` — delete campaign
- `POST /api/campaigns/:id/chat` — slot-filling chat endpoint (Claude-driven)
  - Uses `routeGpt.js` (now Claude-backed) to extract campaign fields
  - Detects when all 6 slots are filled → sets `setupComplete: true`
  - Returns assistant reply + updated campaign config

**Slot fields to track completion:**
```js
const REQUIRED_SLOTS = ['vertical', 'location', 'offer', 'angle', 'qualifier', 'tone'];
const isComplete = (campaign) => REQUIRED_SLOTS.every(f => campaign[f]);
```

**Frontend:**
- `/campaigns` — list view with status (setup incomplete / paused / active)
- `/campaigns/new` — triggers immediate chat interface
- `/campaigns/:id/setup` — chat interface for completing setup
- `/campaigns/:id` — campaign detail (leads, runs, settings)

---

### Phase 3 — Daily Run Engine
**Goal:** Each active campaign runs daily at a set time (6am), discovers new businesses via Google Places, deduplicates, and creates `DISCOVERED` leads.

**Backend:**
- `node-cron` job in `index.js` — runs `runAllCampaigns()` at 6am daily
- `service/campaignRunner.js` — orchestrates the full pipeline per campaign
- `service/searchPlaces.js` — Claude generates queries → Places API → filter closed/duplicate

**Places API flow:**
1. Claude generates 2-3 search query strings from `campaign.vertical + campaign.location`
2. Geocode `campaign.location` (Google Geocoding API or Places text search)
3. `places:searchText` with `businessStatus` field requested
4. Filter: skip `businessStatus === 'CLOSED_PERMANENTLY'`
5. Filter: skip `placesId` already in DB for this user
6. Create Lead records with `status: DISCOVERED`, link `campaignId`
7. Log to `CampaignRun`

**Manual trigger:**
- `POST /api/campaigns/:id/run` — trigger a run outside the cron (for testing)

---

### Phase 4 — Enrichment + Qualification
**Goal:** Each `DISCOVERED` lead gets enriched and scored against the campaign. Good fits become `QUALIFIED`, bad fits become `ARCHIVED`.

**Backend:**
- Adapt existing `enrichIdentity.js` and `enrichContact.js` to accept `campaignId`
- New `service/enrichLead/qualifyLead.js` — Claude evaluates:
  - ICP fit score (0-10) against campaign offer + qualifier
  - Inactive signals (no recent reviews, no website, sparse listing)
  - Sets `icpFitScore`, `icpFitReason`, `inactiveSuspected`
- Threshold: `icpFitScore >= 6` → `QUALIFIED`, else `ARCHIVED`
- `contactComplete` simplified: `true` if ANY of (email, phone, instagram, facebook, tiktok) is found
- If enrichment finds nothing useful AND `noContactFound: true` → still `QUALIFIED` but flagged for in-person

**Enrichment prompt context for Claude:**
```
Campaign offer: {offer}
Campaign angle: {angle}
Bad fit signals: {qualifier}

Business: {name}, {type}, {location}
Description: {description}
Website content: {scrapedText}

Score this business 0-10 for fit. 10 = clearly needs what we're offering.
```

---

### Phase 5 — Message Generation
**Goal:** Each `QUALIFIED` lead gets a personalised outreach message written by Claude → status becomes `QUEUED`.

**Backend:**
- `service/generateMessage.js` — Claude Sonnet writes the message
- Prompt uses: lead name, type, description, location, specific detail from website, campaign offer, angle, tone, and `voiceExamples` if available
- Message stored in `lead.generatedMessage`
- Status set to `QUEUED`

**Message prompt structure:**
```
You're writing a cold outreach message for a local business owner.

Campaign context:
- Offer: {offer}
- Angle: {angle}
- Tone: {tone}
- Voice examples: {voiceExamples}

Business:
- Name: {name}
- Type: {type}
- Location: {location}
- Description: {description}
- Key detail from their website: {specific_detail}

Write a short (3-5 sentence), personalised cold outreach message.
Lead with something specific about their business.
End with a low-friction CTA.
No subject line. No sign-off. Just the message body.
```

---

### Phase 6 — Review UI
**Goal:** Daily review experience. Open app → see today's leads → copy message → mark contacted. Done in 15 minutes.

**Frontend views:**
- `/` (dashboard) — "Today's leads" grouped by campaign
  - Count badge per campaign: "14 leads ready"
  - Lead cards: business name, type, location, fit score, fit reason, generated message
  - Actions: `[Copy message]` → `[Mark contacted]` | `[Archive]`
  - Copy button copies message to clipboard, auto-advances to next lead
- `/campaigns` — campaign list with run history
- `/campaigns/:id` — campaign detail: all leads, run logs, edit settings

**Lead card data displayed:**
- Business name + type
- Location
- ICP fit reason (why Claude thinks they're a good fit)
- `noContactFound` flag → "No contact found — visit in person?"
- `inactiveSuspected` flag → shown as warning
- The generated message (full text, copyable)

**Status transitions from UI:**
- Mark contacted → `PATCH /api/leads/:id` with `{ status: 'CONTACTED' }`
- Archive → `PATCH /api/leads/:id` with `{ status: 'ARCHIVED' }`

---

## Environment Variables

**Backend `.env`:**
```
DATABASE_URL=
JWT_SECRET=
ANTHROPIC_API_KEY=        # replaces OPENAI_API_KEY
GOOGLE_MAPS_KEY=
CUSTOM_SEARCH_API_KEY=    # optional, for web enrichment
PORT=3001
CLIENT_URL=http://localhost:5173
```

**Frontend `.env`:**
```
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_MAPS_API_KEY=   # only if map visualisation is kept
```

---

## Key Files Reference

| File | Purpose |
|---|---|
| `backend/prisma/schema.prisma` | Full data model |
| `backend/index.js` | Express entry, route mounting, cron job (Phase 3+) |
| `backend/routes/campaigns.js` | Campaign CRUD + chat endpoint (Phase 2) |
| `backend/service/claude.js` | Claude utilities (search query gen, etc.) |
| `backend/service/campaignRunner.js` | Daily run orchestrator (Phase 3) |
| `backend/service/enrichLead/enrichGpt.js` | Claude-based identity evaluation |
| `backend/service/enrichLead/qualifyLead.js` | ICP fit scoring (Phase 4) |
| `backend/service/generateMessage.js` | Claude message writer (Phase 5) |
| `backend/service/onboarding/routeGpt.js` | Claude slot-filling for campaign setup |
| `frontend/src/ProtectedRoute.jsx` | Auth-only guard |
| `frontend/src/routes/campaigns/` | Campaign UI (Phase 2+) |
