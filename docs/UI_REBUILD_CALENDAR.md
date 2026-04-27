# ReplyPilot — UI Rebuild Calendar

A focused UI sprint running parallel to the feature build calendar. Covers table usability, URL-persisted filters, LeadPage hierarchy, Day 8 reach log, and a visual sharpness pass.

**Status:** Steps 1-4 complete. Step 5 (rename) deferred.

---

## Step 1 — URL-Persisted Filters

**Why first:** Pure logic, no visual risk. Unblocks table testing — once filters survive navigation you can actually verify the table refactor.

**Files:**
- `frontend/src/components/campaigns/LeadsTable.jsx`

**What changes:**

Sync all filter state to/from `URLSearchParams` using React Router's `useSearchParams`. On mount, read initial state from the URL. On any filter change, write back to the URL (replace, not push, so the back button isn't polluted).

Filters to persist: `name`, `status`, `score`, `email`, `phone`, `facebook`, `maps`, `sortBy`, `sortDir`, `page`.

**Done when:**
- Apply a filter, navigate to a lead, hit back — filter is exactly where you left it
- Filtered URL is bookmarkable and shareable

---

## Step 2 — Table Action Cleanup

**Why second:** Depends on nothing. Makes the table scannable before we move focus to LeadPage.

**Files:**
- `frontend/src/components/campaigns/LeadsTable.jsx`

**What changes:**

Remove all per-row status buttons (Contacted, Replied, Won). These create inconsistent columns and imply lead management belongs in the table — it doesn't.

Each row keeps exactly three actions:
- **✎** — open LeadPage
- **↻** — rescrape
- **×** — delete

Bulk actions toolbar is unchanged — bulk status changes stay there.

The score column gets a compact review count appended when available: `7/10 · 42★` (score + review count as secondary signal, no extra column).

**Done when:**
- Every row has the same three actions regardless of status
- No status-dependent logic in the row renderer
- Table feels like a list to scan and select, not a place to manage individual leads

---

## Step 3 — LeadPage Layout + Reach Log (Day 8)

**Why third:** Biggest change. Build the layout once with the reach section already in it rather than doing two separate passes.

**Files:**
- `frontend/src/pages/leads/LeadPage.jsx`

**Layout — top to bottom, left to right:**

```
[Name · Type · Location]          [Fit score badge · Status badge]
[Campaign link · offer]

[Action buttons row]
─────────────────────────────────────────────────────
LEFT (5/12)                        RIGHT (7/12)
─────────────────────────────────────────────────────
Contact info card                  Log a reach card
                                   ─ Channel buttons (EMAIL/PHONE/DM/DROP_IN)
Google Maps data card              ─ Result buttons (common) + dropdown (rare)
─ reviews, photos, owner           ─ Transcript textarea (optional)
─ collapsible review snippets      ─ "Log reach" button

Business details card              Reach history
─ description, keywords            ─ newest first
                                   ─ channel icon · result badge · timestamp
                                   ─ transcript preview, expandable

                                   Outreach message card
                                   ─ textarea + copy/save
```

**Reach log — "Log a reach" card:**

Channel: pill button group — EMAIL · PHONE · DM · DROP_IN. One selected at a time, highlighted.

Result: common results as pill buttons — NO_ANSWER · VOICEMAIL · POSITIVE · NEGATIVE · FOLLOW_UP_REQUESTED · NOT_NOW. Rare ones (GATEKEEPER · CONVERSATION · DO_NOT_CONTACT) in a small dropdown below.

Transcript: textarea, hidden until user clicks "Add note ↓", auto-focuses on expand.

Submit: "Log reach" button. On success, clears form, prepends new entry to history.

**Reach history entries:**
- Channel icon (✉ email, ☎ phone, 💬 DM, 🚶 drop-in) + result badge + relative time
- Result badge colors: green (POSITIVE), red (NEGATIVE, DO_NOT_CONTACT), yellow (FOLLOW_UP_REQUESTED, NOT_NOW), gray (everything else)
- Transcript shown as one truncated line, click to expand

**API calls:**
- On mount: `GET /api/leads/:id/reaches`
- On submit: `POST /api/leads/:id/reaches` → prepend result to history, update `lead.followUpCount`

**Done when:**
- Clear top-to-bottom reading order: who → fit → contact → act → history → message
- Log a reach in under 5 seconds
- History shows channel, result, timestamp, optional transcript
- No section feels randomly placed

---

## Step 4 — Visual Sharpness Pass

**Why fourth:** Layout is settled. Style after structure, not before.

**Files:**
- `frontend/src/index.css` (or equivalent global styles)
- Component-level `style={}` props tightened throughout

**What changes:**

Typography:
- Base font size 13px (down from 16px Bootstrap default) for density
- Headings: `font-weight: 600`, not bold
- Muted text: `#6b7280` (cooler gray, less Bootstrap-brown)

Colors:
- Primary: `#2563eb` (sharper blue, replaces Bootstrap's `#0d6efd`)
- Danger: `#dc2626`, Success: `#16a34a` — more saturated, less pastel
- Badge backgrounds: dark-on-light instead of Bootstrap's washed pastels

Borders and radius:
- `border-radius: 6px` across cards and inputs (down from Bootstrap's 8px)
- Border color: `#e5e7eb` (cooler, lighter)
- Card shadow: `0 1px 3px rgba(0,0,0,0.08)` — subtle depth instead of flat

Spacing:
- Card padding: `16px` uniform (Bootstrap's `.card-body` default is 20px)
- Table row height tighter: `padding: 6px 8px` per cell

Buttons:
- Slightly smaller: `padding: 5px 12px` for `.btn-sm`
- No text-transform on any button

**Done when:**
- UI feels current — high contrast, tight spacing, confident typography
- No Bootstrap default colors visible in the primary flows

---

## Step 5 — App Rename (deferred)

Name TBD. When decided:

**Files to update:**
- `frontend/index.html` — `<title>`
- `frontend/src/` — any hardcoded "ReplyPilot" strings
- `browser-extension/manifest.json` — `name`, `description`
- `browser-extension/panel.html` — heading
- `docs/` — document headers

---

## Summary

| Step | What | Status |
|------|------|--------|
| 1 | URL-persisted filters | ✓ DONE |
| 2 | Table action cleanup | ✓ DONE |
| 3 | LeadPage layout + reach log (Day 8) | ✓ DONE |
| 4 | Visual sharpness pass | ✓ DONE |
| 5 | App rename | deferred |
