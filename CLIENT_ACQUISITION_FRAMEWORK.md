# ReplyPilot Client Acquisition Framework

A leverage-first system for acquiring web development clients using ReplyPilot. Every phase maps directly to a platform capability so the work compounds instead of repeating.

## Core Principle

**Leverage = Targeting × Automation × Proof × Volume**

Weakness in any factor collapses the whole system. A perfect message sent to the wrong vertical is worthless. A great target list with generic messaging gets ignored. High volume without proof assets closes nothing. This framework enforces all four.

---

## Phase 0 — Foundation (one-time setup)

### 0.1 Pick your battle: niche selection

Choose 3–5 verticals that share these traits:
- **Owner-operated** (decisions happen fast, no procurement cycles)
- **Revenue depends on local search** (people Google them before buying)
- **Low web-presence baseline** (most competitors have bad or no sites)
- **High customer LTV** (justifies a $1.5–3k website)

Baseline shortlist: plumbers, HVAC, dentists, chiropractors, auto shops, landscapers, cleaners, physical therapists, med spas, law firms (solo/small), roofers, pest control.

### 0.2 Offer design: three tiers

| Tier | Price | What's included |
|---|---|---|
| Starter | $1,500 | Single landing page, mobile-optimized, contact form, Google Business link |
| Growth | $2,500 | 5-page site, local SEO setup, booking/contact integration |
| Authority | $3,000 | Full Growth tier + copywriting, Google Business optimization, review funnel |

Monthly retainer option: $99–199/mo for hosting, updates, uptime monitoring. This is your compounding revenue layer — prioritize conversion to retainer over project size.

### 0.3 Proof asset library (build once, reuse forever)

Before sending a single message, create:
- **3 portfolio mockups** — one per top vertical, even if you have to build them speculatively. This is your trust floor.
- **1 Loom template** — 90-second script: "I looked at [business] and here's what I noticed…" You re-record the specifics per lead but the structure stays fixed.
- **1 mockup template in Figma/Framer** — swappable logo, colors, hero copy, service list. Target: 20-minute personalization per lead.
- **3 case-study one-pagers** (or testimonials once you have clients) — screenshot of before/after, revenue/booking impact, quote.

**Platform mapping:** Proof assets live outside ReplyPilot but are referenced in the `voiceExamples` and `angle` fields so AI-generated messages can cite them.

---

## Phase 1 — Campaign Architecture

One campaign per vertical. Never mix verticals in a single campaign — the AI's messaging loses specificity and scoring loses accuracy.

### 1.1 Campaign field playbook

For each campaign, fill these ReplyPilot fields deliberately:

**`vertical`** — Single specific noun phrase. Good: "residential plumbers". Bad: "home services".

**`location`** — Your city or metro. Start with one. Expand only after you've saturated it.

**`offer`** — One sentence naming the outcome, not the deliverable. Good: "A website that turns emergency Google searches into booked jobs within 2 weeks." Bad: "I build websites."

**`angle`** — The specific pain this vertical feels. This is the most important field for reply rates. Examples:
- Plumbers: "You're losing 2am emergency calls to the competitor who shows up on Google with a click-to-call button."
- Dentists: "New patients vet you online before booking. A missing or outdated site loses them to the practice next door."
- Restaurants: "Diners pick the place they can preview. No menu online = no reservation."

**`qualifier`** — Bad-fit signals to filter aggressively. Standard template: "Already has a modern professional website. Franchise or national chain. Fewer than 5 Google reviews. No phone number listed. Business marked as temporarily closed."

**`tone`** — Match the vertical. Plumbers/auto = direct and no-BS. Dentists/med spas = professional and reassuring. Restaurants = warm and conversational.

**`voiceExamples`** — Paste 2–3 real messages you've written that reflect your voice. This calibrates the AI to sound like you, not generic ChatGPT. Rewrite these quarterly as your voice evolves.

**`dailyTarget`** — Start at 15/day per campaign. Scale to 25–30 only after you've validated a ≥5% reply rate.

### 1.2 The 5-campaign launch portfolio

Launch this exact portfolio on day one:

| # | Vertical | Why |
|---|---|---|
| 1 | Plumbers/HVAC | Highest urgency, clearest ROI story |
| 2 | Dentists or chiropractors | High LTV, value trust signals |
| 3 | Auto repair shops | Visual before/after sells easily |
| 4 | Landscapers or cleaners | Seasonal pressure creates urgency |
| 5 | One wildcard from your city | A vertical unique to your area |

The wildcard is your experiment. Replace it every 2 weeks with a new test vertical. Kill it if it underperforms by week 2.

### 1.3 Platform gap — what to build into the app

For this framework to run at full leverage, ReplyPilot should support:

- **Campaign templates** — clone a campaign and swap vertical/angle in one action (currently requires rebuilding from scratch)
- **Proof asset attachment** — a field on Campaign for portfolio URLs and Loom template link, injected into `generateMessage` prompts
- **Reply rate per campaign** — surface this metric on the campaign dashboard, not just per-run counts
- **Auto-archive rule** — if a campaign's reply rate stays below 3% after 100 sends, flag it for review
- **Vertical library** — prebuilt `angle` and `qualifier` templates for the top 10 local service verticals

These are the highest-leverage product additions. Build them in this order.

---

## Phase 2 — Signal Amplification

This is where most outreach operators fail. They generate volume, get low reply rates, and scale up the broken system. Instead: amplify the signal on every lead that clears the qualification bar.

### 2.1 The daily operator loop

**Morning (30 min):**
1. Open ReplyPilot → filter leads by `status: QUEUED`, sort by `icpFitScore` desc
2. Take the top 5 per campaign (25 total)
3. For each, spend 2 min reviewing their Google listing and existing web presence
4. Kill any where the AI-generated message feels generic — regenerate or rewrite
5. Send

**Mid-morning (60 min):**
1. For the top 3 highest-scoring leads, record a personal Loom (90 seconds each)
2. Attach Loom to the outbound message
3. Send these as a second wave

**Afternoon (ongoing):**
1. Monitor replies in real time. Respond to any `INTERESTED` reply within 10 minutes — reply speed is the single biggest closing factor.
2. Within 24 hours of an interested reply, send a personalized mockup (20 min using your template)

**Evening (15 min):**
1. Review today's metrics: messages sent, replies received, reply rate, meetings booked
2. Log wins to your proof asset library

### 2.2 The proof escalation ladder

Every interested lead moves up this ladder until they say yes or disappear:

| Rung | Action | Time investment |
|---|---|---|
| 1 | Auto-generated message | 0 min (ReplyPilot) |
| 2 | + personal Loom | 2 min |
| 3 | + portfolio case study link | 1 min |
| 4 | + free mockup of their site | 20 min |
| 5 | + live call + walkthrough | 30 min |
| 6 | Proposal with 3 tiers | 15 min |

Never skip rungs. A Loom before a mockup. A mockup before a call. This calibrates your investment to their engagement.

### 2.3 Reply triage rules

ReplyPilot categorizes replies as `INTERESTED | GHOSTED | SOFT_NO | IRRELEVANT`. Act on each within fixed SLAs:

| Category | SLA | Action |
|---|---|---|
| INTERESTED | 10 min | Respond with rung 2 (Loom) |
| SOFT_NO | 24 hr | One follow-up with a different angle, then drop |
| GHOSTED | 3 days | One "bump" message, then archive |
| IRRELEVANT | Never | Archive immediately, feed pattern back into `qualifier` |

The last one matters: every IRRELEVANT reply is a signal your qualifier is too loose. Update it.

---

## Phase 3 — The Compound Loop

A framework only creates leverage when the loop closes and learnings feed the next iteration.

### 3.1 Weekly review (Fridays, 30 min)

Metrics to track per campaign:
- Messages sent
- Reply rate (replies / sent)
- Interest rate (INTERESTED / sent)
- Meeting rate (meetings booked / INTERESTED)
- Close rate (clients won / meetings)
- Revenue generated

Decision rules:
- **Reply rate < 3% after 100 sends:** kill the angle, rewrite `angle` and `voiceExamples`, relaunch
- **Reply rate 3–7%:** leave alone, keep sending
- **Reply rate > 7%:** double `dailyTarget`, expand to a second city
- **Interest rate high but close rate low:** your offer/pricing is wrong, not your targeting

### 3.2 The compounding layers

The framework generates four forms of compounding value:

1. **Retainers** — every closed client adds $99–199/mo. Target: 80% retainer attach rate.
2. **Referrals** — ask every happy client for 2 names in their network. Track these as a separate lead source with a different message template ("Your plumber buddy Joe mentioned you're growing...").
3. **Case studies** — every completed project becomes new proof assets that boost reply rates on future campaigns. Explicitly budget time to document results.
4. **Vertical expertise** — by month 3, you'll know plumber copy cold. Your speed and quality compounds.

### 3.3 Kill criteria (know when to stop)

Do not let a failing campaign run forever. Kill any campaign that:
- Hits 200 sends with < 2% reply rate
- Generates 0 clients after 500 sends
- Has cost you more in time than revenue for 4 consecutive weeks

When you kill, write a one-paragraph autopsy: what was the angle, what didn't land, what you'd test next. File it with the framework.

---

## The Expected Math

Assuming the framework is executed correctly:

| Metric | Week 1–2 | Week 3–4 | Month 2 | Month 3 |
|---|---|---|---|---|
| Active campaigns | 5 | 3 (after killing losers) | 3 validated + 2 new | 5 validated |
| Daily sends | 75 | 75 | 150 | 200 |
| Reply rate | 2–4% | 4–6% | 6–8% | 7–10% |
| Clients/week | 0–1 | 1–2 | 3–4 | 5–7 |
| MRR from retainers | $0 | $200 | $800 | $2,500 |
| Project revenue/mo | $0–2k | $4–6k | $12–18k | $20–30k |

Month 1 is the investment period. Month 3 is when the system starts paying exponentially.

---

## The One Rule

If you only remember one thing: **never send a generic message to a qualified lead.** ReplyPilot handles volume, qualification, and first-draft messages. Your only job is to be the human layer of proof and specificity on the top 10% of leads that matter. Everything else is automated. That's the leverage.
