# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReplyPilot is a SaaS lead generation and outreach platform. Users complete an AI-driven onboarding to define their ICP (Ideal Customer Profile), then discover leads via Google Places, enrich them with scraped data, and track outreach messages and replies.

## Commands

### Backend
```bash
cd backend
npm run dev      # nodemon index.js (auto-reload, port 3001)
npm start        # node index.js (production)
```

### Frontend
```bash
cd frontend
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # Production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

### Database
```bash
cd backend
npx prisma migrate dev    # Apply migrations in dev
npx prisma studio         # Open Prisma Studio UI
npx prisma generate       # Regenerate Prisma client after schema changes
```

## Architecture

### Monorepo Structure
- `backend/` — Node.js + Express 5, Prisma ORM, PostgreSQL
- `frontend/` — React 19, Vite 7, React Router 7, Bootstrap 5

### Backend Request Flow
```
Request → authenticate middleware (JWT) → route handler → service/GPT layer → Prisma → PostgreSQL
```

Key files:
- `backend/index.js` — Express app entry, route mounting, Stripe webhook
- `backend/middleware/authenticate.js` — JWT verification (`JWT_SECRET`)
- `backend/middleware/checkTokens.js` — Subscription token gating
- `backend/prisma/schema.prisma` — Full data model

### Frontend Routing & Guards
`App.jsx` wraps protected routes with `ProtectedRoute`, which enforces this check order:
1. Authenticated → else `/login`
2. Subscription active → else `/pricing`
3. ICP profile complete (`user.profile.icpSummary`) → else `/onboarding`

Providers wrapping the app: `AuthContext` → `LeadContext` → `IntakeFormContext`

Key files:
- `frontend/src/App.jsx` — Router and provider tree
- `frontend/src/ProtectedRoute.jsx` — Auth/subscription/onboarding gate
- `frontend/src/context/AuthContext.jsx` — Login, logout, user state
- `frontend/src/context/LeadContext.jsx` — Lead and list CRUD, filtering

### Onboarding (GPT Slot-Filling)
12 questions across 3 categories (Business, Audience, Offer). Each user message is processed by a single GPT-4o call (`backend/service/onboarding/routeGpt.js`) that:
- Classifies intent: `ANSWER_SLOT | ASK_QUESTION_IN_SCOPE | OFF_TOPIC | META_FLOW`
- Returns a `profile_delta` with extracted fields
- Updates `UserProfile` in a Prisma transaction with atomic completion flags

Once all 12 slots are filled, `icpSummary` is generated and written — this unlocks dashboard access.

### Lead Enrichment Pipeline
Three goals: `IDENTITY → CONTACT → SOCIAL`. Each runs as a sequential pipeline:
1. `GET_LEAD` — fetch lead record
2. `GET_SOURCE` — determine next scrape target
3. `SCRAPE_SOURCE` — Puppeteer scrape
4. `EVALUATE_GPT` — GPT extracts structured fields + ICP match score

Steps logged to `LeadEnrichmentLog` with status `STARTED | SUCCESS | ERROR`.

Services: `backend/service/enrichLead/{identity,contact,social}.js`

### Search & Token Economy
- `GET /api/search/nearby` and `/api/search/text` consume `searchTokens` from `Subscription`
- 1 token = 1 Places API result returned
- Tokens provisioned by Stripe webhook on `checkout.session.completed`

### API Base URL
Frontend uses `VITE_API_URL` (default `http://localhost:3001/api`) via `frontend/src/api/index.js` (Axios instance with JWT from `localStorage`).

## Key Data Models

```
User → UserProfile (ICP fields + completion flags)
     → Subscription (Stripe, searchTokens)
     → Lead → LeadSource, LeadEnrichmentLog, LeadList
     → List ↔ Lead (many-to-many via LeadList)
     → Message → Reply
     → SearchResult
```

Priority enum: `CERTAIN | HIGH | MEDIUM | LOW`
Message method: `EMAIL | SOCIAL | SMS | PHONE`
Reply category: `INTERESTED | GHOSTED | SOFT_NO | IRRELEVANT`

## Environment Variables

**Backend** (`.env`):
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Token signing secret
- `OPENAI_API_KEY` — GPT-4o calls
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Billing
- `GOOGLE_MAPS_KEY` — Places API
- `CUSTOM_SEARCH_API_KEY`, `SERP_API_KEY` — Web search enrichment

**Frontend** (`.env`):
- `VITE_API_URL` — Backend base URL
- `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_BASE_OUTREACH_PRICE_ID`
- `VITE_GOOGLE_MAPS_API_KEY`
