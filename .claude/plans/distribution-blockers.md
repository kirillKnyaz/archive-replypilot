# ReplyPilot — Distribution Blockers SOW

Goal: Fix every issue that would cause a real user to hit a wall, crash, or dead end. No new features. Just make what exists actually work end-to-end.

---

## Spine 1: User Entry (Register → Onboarding → Subscribe → Dashboard)

### 1.1 Mount missing backend routes
- **What:** `backend/index.js` never registers onboarding or billing routers
- **Fix:** Add `app.use('/api/onboarding', authenticate, require('./routes/onboarding'))` and `app.use('/api/billing', authenticate, require('./routes/billing'))`
- **Without this:** `/api/onboarding/*` and `/api/billing/*` return 404. New users stuck immediately.

### 1.2 Rebuild Subscription model in Prisma
- **What:** Migration `rebuild_phase1` dropped the `Subscription` table. All billing code references it and crashes.
- **Fix:** Add `Subscription` model back to `schema.prisma` with fields: `id, userId, stripeId, tier, active, searchTokens, createdAt`. Run migration.
- **Without this:** Every billing endpoint throws "relation does not exist".

### 1.3 Rebuild UserProfile model in Prisma
- **What:** `UserProfile` was dropped but onboarding code (`routes/onboarding.js` lines 76-78, 120-121, 136-150) still reads/writes it.
- **Fix:** Add `UserProfile` model back to `schema.prisma` with ICP fields, completion flags, and `icpSummary`. Run migration.
- **Without this:** Onboarding crashes on every request.

### 1.4 `/auth/me` must return profile + subscription
- **What:** Endpoint (`auth.js:76`) only returns `{ id, email }`. Frontend needs `user.profile` (for onboarding gate) and `user.subscription` (for billing gate).
- **Fix:** Add `include: { profile: true, subscription: true }` to the Prisma query.
- **Without this:** ProtectedRoute can't check onboarding/subscription status. Guards break silently.

### 1.5 Add Stripe webhook handler
- **What:** No endpoint receives Stripe events. Payment completes in Stripe but local DB never updates.
- **Fix:** Add `POST /webhook` route in `index.js` (raw body parser) handling `checkout.session.completed` → create/update Subscription record with `active: true` and token allocation.
- **Without this:** Users pay but app doesn't know. Subscription stays null forever.

### 1.6 Add frontend routes for billing and onboarding
- **What:** `App.jsx` has no routes for `/billing`, `/pricing`, or `/onboarding`. UserMenu links to them → blank page.
- **Fix:** Import and wire PricingPage, BillingPage, PaymentSuccessfulPage, PaymentCancelPage, OnboardingPage, OnboardingChatPage into App.jsx router.
- **Without this:** Navigation dead ends. Users click menu links and see nothing.

### 1.7 Fix registration auth state sync
- **What:** `RegisterPage.jsx:56` stores token and navigates but never calls `AuthContext.login()`. Race condition — user hits protected route before auth state updates.
- **Fix:** After registration, call the auth context's login/setUser method before navigating.
- **Without this:** Intermittent redirect loops after signup.

### 1.8 Fix token expiration mismatch
- **What:** Register token = 7d, login token = 1d, cookie maxAge = 1h. Three different lifetimes.
- **Fix:** Align all to a single duration (7d for token, 7d for cookie).
- **Without this:** Users get silently logged out at inconsistent times.

### 1.9 Wire context providers in App.jsx
- **What:** `LeadProvider` and `IntakeFormProvider` are exported but never wrap the component tree.
- **Fix:** Wrap the router/outlet with both providers in App.jsx.
- **Without this:** Any component calling `useLeads()` or `useContext(IntakeFormContext)` crashes.

### 1.10 Wire checkTokens middleware to search routes
- **What:** `backend/middleware/checkTokens.js` exists but is never imported. Search endpoints have no token gating.
- **Fix:** Apply `checkTokens` middleware to `GET /api/search/nearby` and `GET /api/search/text`.
- **Without this:** Any authenticated user can burn unlimited Google Places API quota with no cost.

---

## Spine 2: Campaign Pipeline (Discover → Enrich → Qualify → Message)

### 2.1 Fix identity enrichment — missing sources relation
- **What:** `identity.js:11` fetches lead without `include: { sources: true }`. Later `getNextSource()` accesses `lead.sources.length` → TypeError.
- **Fix:** Add `include: { sources: true }` to the `prisma.lead.findUnique` call.
- **Without this:** Identity enrichment crashes for every lead. Pipeline dead.

### 2.2 Fix Claude model name in message generation
- **What:** `generateMessage.js:48` uses `"claude-sonnet-4-6"` which is not a valid Anthropic API model ID.
- **Fix:** Change to `"claude-sonnet-4-6-20250514"` or use the model constant from `claude.js`.
- **Without this:** Message generation fails with API error for every qualified lead. No messages get written.

### 2.3 Fix broken switch statement in getNextSource
- **What:** `getNextSource.js:96` uses `switch(url) { case url.includes('facebook.com'): ... }` — this compares a string against a boolean, never matches.
- **Fix:** Replace with `if/else if` chain: `if (url.includes('facebook.com')) { ... } else if (url.includes('instagram.com')) { ... }`.
- **Without this:** Social media links from search results are never detected. Social enrichment always fails.

### 2.4 Add timeout to contact enrichment page.goto
- **What:** `contact.js:151` calls `page.goto(url, { waitUntil: 'networkidle2' })` with no timeout. Identity enrichment has `timeout: 30000` but contact doesn't.
- **Fix:** Add `timeout: 30000` to the page.goto options.
- **Without this:** A single slow/broken website hangs the entire campaign run indefinitely. With 50 leads, this is almost guaranteed to happen.

### 2.5 Fix enrichAndQualify error handling
- **What:** `enrichAndQualify.js:19` logs when enrichment returns no data but continues to qualification anyway. Leads get qualified on empty data.
- **Fix:** Return early with an error status when enrichment fails. Set lead status to reflect the failure rather than proceeding to qualification.
- **Without this:** Leads with no enrichment data get scored, qualified, and receive messages based on nothing. Garbage output to the user.

### 2.6 Fix lead status set before qualification
- **What:** `enrichAndQualify.js:31-40` reloads lead, then updates status to `ENRICHED`, then passes the stale (pre-update) object to `qualifyLead()`.
- **Fix:** Update status first, then reload, then pass to qualification. Or just set the status field on the object before passing.
- **Without this:** Qualification logic receives a lead with `status: DISCOVERED` instead of `ENRICHED`. Inconsistent state.

### 2.7 Add campaign config validation before run
- **What:** `campaignRunner.js` starts running without checking that the campaign has all required fields (vertical, location, offer, userId).
- **Fix:** Validate required fields at the top of `runCampaign()`. Return early with clear error if incomplete.
- **Without this:** Incomplete campaigns fail deep in the pipeline with cryptic errors.

### 2.8 Add error handling for Google Places API
- **What:** `searchPlaces.js:49` calls Places API with no try-catch. Invalid key or quota exhaustion crashes the run.
- **Fix:** Wrap in try-catch, return empty array on failure, log the error.
- **Without this:** One API error kills the entire campaign run.

---

## Spine 3: Frontend Runtime Stability

### 3.1 Fix `e` vs `event` variable bug in CampaignDetailPage
- **What:** `CampaignDetailPage.jsx:906` in `EventLine()`, the `lead_qualified` case references `e.status` but the parameter is named `event`.
- **Fix:** Replace all `e.` references with `event.` in that case block.
- **Without this:** Live campaign run view crashes when a lead gets qualified. User sees React error screen.

### 3.2 Fix PricingPage state access crash
- **What:** `PricingPage.jsx:40` does `location.state.message` — crashes if `location.state` is null.
- **Fix:** Change to `location.state?.message`.
- **Without this:** Navigating to pricing page directly (not from redirect) crashes the page.

### 3.3 Remove or fix dead UserMenu links
- **What:** UserMenu links to `/onboarding` and `/billing` which don't have routes (until 1.6 is done).
- **Fix:** Either wire the routes (1.6) or remove the links until they work.
- **Without this:** Users click nav links and see blank pages. Feels broken.

### 3.4 Fix forgot password dead link
- **What:** `LoginPage.jsx:69` has a "forgot password?" `<Link>` with no `to` attribute and no handler.
- **Fix:** Either implement password reset or remove the link.
- **Without this:** Dead interactive element. Users click it expecting functionality.

### 3.5 Add loading states for auth check and DefaultCampaign
- **What:** `ProtectedRoute.jsx:8` returns `null` during auth check. `DefaultCampaign` fetches campaigns with no loading indicator.
- **Fix:** Return a spinner/skeleton instead of null.
- **Without this:** Users see blank flashes on every page load. Feels broken.

---

## Priority Order for Execution

**Week 1 — Make the door open:**
1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9

**Week 2 — Make the engine run:**
2.1, 2.2, 2.3, 2.4, 2.5, 2.6

**Week 3 — Polish the edges:**
1.8, 1.10, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5

After week 3: distribute. No new features until 20 real users have tried it.
