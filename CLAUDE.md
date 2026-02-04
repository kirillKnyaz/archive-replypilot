# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ReplyPilot is an AI-powered SaaS for automating outbound sales. It discovers leads via Google Places/Search, enriches them with AI-extracted data, generates personalized messages, and tracks reply performance to optimize outreach.

## Development Commands

### Frontend (React + Vite)
```bash
cd frontend
npm run dev      # Start dev server with HMR
npm run build    # Production build
npm run lint     # ESLint checks
npm run preview  # Preview production build
```

### Backend (Express + Prisma)
```bash
cd backend
npm run dev      # Start with nodemon (auto-reload)
npm start        # Production server
npx prisma migrate dev    # Run migrations
npx prisma generate       # Regenerate Prisma client
npx prisma studio         # Database GUI
```

## Architecture

```
ReplyPilot/
├── backend/           # Express API server (port 3001)
│   ├── routes/        # API endpoints (auth, billing, leads, onboarding, search, lists, message)
│   ├── service/       # Business logic
│   │   ├── gpt.js           # OpenAI integration
│   │   ├── onboarding/      # GPT-driven slot-filling flow
│   │   └── enrichLead/      # Multi-step lead enrichment pipeline
│   ├── middleware/    # JWT auth, token validation
│   └── prisma/        # Database schema & migrations
├── frontend/          # React SPA (Vite)
│   └── src/
│       ├── pages/     # Route components (Auth, Dashboard, Onboarding, Billing)
│       ├── components/# UI components (dashboard/, leads/, utils/)
│       ├── context/   # AuthContext, IntakeFormContext, LeadContext
│       ├── hooks/     # useAuth, useStepValidation
│       └── api/       # Axios client with bearer token interceptor
└── extra/             # Standalone scraping utilities
```

## Key Architectural Patterns

### GPT-Driven Onboarding
Located in `backend/service/onboarding/`:
- `metaFlow.js` - Orchestrates multi-step chat flow
- `routeGpt.js` - Classifies user responses to determine which ICP field to fill
- `answererGpt.js` - Extracts structured data from free-form answers
- `slotPicker.js` - Determines next missing field to ask about
- `steps.js` - Question definitions for business/audience/offer categories

### Lead Enrichment Pipeline
Located in `backend/service/enrichLead/`:
- Three-stage process: Identity → Contact → Social
- `getNextSource.js` - Selects next URL to scrape (website, Google search, social)
- `identity.js` - Extracts business name, type, description, keywords via GPT
- `contact.js` - Scrapes email, phone, website using Puppeteer + GPT
- `logger.js` - Tracks enrichment progress with `LeadEnrichmentLog`

### State Management
Frontend uses React Context API (no Redux):
- `AuthContext` - User session, JWT token
- `LeadContext` - Lead data, enrichment state
- `IntakeFormContext` - Onboarding form state

## Database Schema (Prisma)

Core models and relationships:
- **User** → UserProfile (ICP fields), Subscription, Lead[], List[], OnboardingFlow[]
- **Lead** → LeadSource[], LeadEnrichmentLog[], LeadList[], Message[]
- **Message** → Reply (sentiment, category)

Key enums: `Priority`, `EnrichmentStep`, `EnrichmentStatus`, `SourceGoal`, `SourceType`

UserProfile tracks three completion flags: `businessComplete`, `audienceComplete`, `offerComplete`

## API Structure

Base: `/api` with JWT authentication (cookie or Bearer token)

| Route | Purpose |
|-------|---------|
| `/api/auth/` | Register, login, session validation |
| `/api/onboarding/` | Start flow, submit answers, get progress |
| `/api/billing/` | Stripe subscription management |
| `/api/leads/` | CRUD, enrichment, bulk operations |
| `/api/search/` | Google Places nearby/text search |
| `/api/lists/` | Lead list management |
| `/api/message/` | Message operations |

Stripe webhooks handled directly in `backend/index.js` at `/webhook`.

## Environment Variables

**Frontend** (`frontend/.env`):
- `VITE_API_URL` - Backend API URL
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

**Backend** (`backend/.env`):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `GOOGLE_API_KEY`, `GOOGLE_CSE_ID`

## Deployment

- Frontend: Vercel (SPA rewrites in `vercel.json`)
- Backend: Railway
- Database: PostgreSQL on Railway
