# ReplyPilot: AI-Powered Outbound Sales Autopilot

## Unique Value Proposition

ReplyPilot turns a vague idea of "who to sell to" into qualified leads with personalized messages — automatically, every day. Instead of manually searching for prospects, writing cold emails, and tracking replies, users describe their ideal customer in a guided AI conversation and ReplyPilot handles the rest: discovering businesses, enriching them with real data, scoring ICP fit, and drafting outreach in the user's own voice. It's the outbound sales engine solo founders and small teams can't afford to build themselves.

---

## Core Features

### 1. AI-Guided Onboarding & Campaign Setup
- Conversational onboarding (12 slots across Business, Audience, Offer) powered by Claude — no forms, just a chat
- Campaign setup wizard extracts vertical, location, offer, angle, qualifier, and tone from natural language
- Voice examples let users teach the AI their writing style
- ICP summary generated automatically once all slots are filled

### 2. Automated Lead Discovery
- Google Places API integration (nearby + text search)
- Claude generates optimized search queries from campaign config
- Deduplication by `placesId` across campaigns
- Search token economy tied to subscription tier

### 3. Lead Enrichment Pipeline
- Three-goal enrichment: **Identity** (business type, description, keywords) -> **Contact** (email, phone, Instagram, Facebook, TikTok) -> **Qualification**
- Puppeteer + stealth plugin scrapes business websites
- Claude evaluates each lead against campaign ICP and assigns a fit score + reasoning
- Every enrichment step logged (`GET_LEAD -> GET_SOURCE -> SCRAPE_SOURCE -> EVALUATE_GPT`) with status tracking

### 4. AI Message Generation
- Claude Sonnet 4.6 generates personalized cold outreach per lead
- Messages respect campaign tone, angle, and user-provided voice examples
- Edit/approve workflow before sending
- Multi-channel support: Email, Social, SMS, Phone

### 5. Campaign Automation
- One-click manual campaign runs with real-time SSE progress streaming
- Daily cron job (6am UTC) runs all active campaigns automatically
- Full pipeline per run: discover -> create leads -> enrich -> qualify -> generate messages
- Run history with stats (leads discovered, filtered, queued)

### 6. Conversation Tracking & Reply Analysis
- Reply recording with sentiment analysis (Positive / Negative / Neutral)
- Reply categorization: Interested / Ghosted / Soft No / Irrelevant
- Performance data feeds back into campaign optimization

### 7. CRM Dashboard & Lead Management
- Central dashboard with leads, discovery, and settings tabs
- Lead status workflow: Discovered -> Enriched -> Qualified -> Queued -> Contacted -> Archived
- Bulk operations (status update, delete)
- Custom lists with color coding
- Lead detail view with enrichment logs, messages, and rescrape capability

### 8. Billing & Subscriptions
- Stripe-based subscription tiers
- Checkout session creation, plan management, cancel/renew
- Search tokens provisioned per plan

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, React Router 7, Bootstrap 5 |
| **Backend** | Node.js, Express 5, Prisma 6, PostgreSQL |
| **AI** | Anthropic Claude (Haiku 4.5 for fast eval, Sonnet 4.6 for message gen) |
| **Scraping** | Puppeteer 24 + stealth plugin |
| **Maps** | Google Places API, @vis.gl/react-google-maps |
| **Billing** | Stripe (subscriptions, webhooks) |
| **Search** | Google Places Text Search, Google Custom Search API |
| **Scheduling** | node-cron (daily campaign runs) |
| **Auth** | JWT (7-day tokens), bcrypt, HTTP-only cookies |
| **Validation** | Zod schema validation |
| **Animation** | GSAP |

---

## Data Model

```
User -> UserProfile (ICP fields + completion flags)
     -> Subscription (Stripe, searchTokens)
     -> Campaign -> CampaignRun (run history + stats)
                 -> Lead -> LeadSource (website, GCS, social)
                         -> LeadEnrichmentLog (step-by-step tracking)
                         -> Message -> Reply (sentiment + category)
                         -> LeadList (many-to-many with List)
     -> List (custom grouping with color)
     -> SearchResult (history with token charges)
```

---

## Integrations

- **Anthropic Claude** — onboarding slot-filling, campaign setup, lead qualification, ICP scoring, message generation
- **Google Places API** — business discovery (nearby + text search)
- **Google Custom Search API** — web search for enrichment sources
- **Stripe** — subscription billing, checkout sessions, webhook-driven token provisioning
- **Puppeteer** — headless browser scraping for identity and contact enrichment

---

## Security & Infrastructure

- JWT + HTTPS with HTTP-only cookies
- CORS policies and rate limiting
- Authenticated middleware on all protected routes
- Subscription token gating via middleware
- PostgreSQL on Railway with Prisma migrations

---

## Outcome

ReplyPilot gives solo founders, marketers, and small sales teams a fully automated outbound pipeline — from ICP definition to qualified leads with ready-to-send messages — replacing hours of manual prospecting with a single AI-driven workflow that improves with every campaign run.
