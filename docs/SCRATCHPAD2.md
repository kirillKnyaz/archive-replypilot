# ReplyPilot — Reach Architecture Scratchpad

The core shift: separate the attempt from the lead. A lead is an entity. A reach is an event. The app should track every interaction as a structured data point, then use that history to drive what happens next.

---

## The Reach Model

A **Reach** is one outreach attempt on one lead. "Log a reach." "3 reaches on this lead." Short, natural, unambiguous.

```
Reach
  id            String
  leadId        String      → Lead
  campaignId    String      → Campaign
  channel       ReachChannel (EMAIL, PHONE, DM, DROP_IN)
  result        ReachResult  (see below)
  transcript    String?     — call notes, DM thread, email body. Free text.
  createdAt     DateTime
```

**ReachResult enum:**

| Result | Meaning |
|---|---|
| NO_ANSWER | Called, no pickup |
| VOICEMAIL | Left a voicemail |
| GATEKEEPER | Spoke to someone who isn't the decision-maker |
| CONVERSATION | Had a real conversation, no clear outcome yet |
| POSITIVE | Interested — wants to continue |
| NEGATIVE | Explicitly not interested |
| FOLLOW_UP_REQUESTED | "Call me back on Thursday" / "Email me next month" |
| NOT_NOW | Soft no — timing is wrong, not a hard rejection |
| DO_NOT_CONTACT | Hostile or opt-out. Permanent. |

No `previousReachId` needed. All reaches for a lead are queried by `leadId` ordered by `createdAt`. Simpler, same data.

**The transcript field replaces the separate notes system.** Every interaction is timestamped and structured. "Owner's name is Dave, likes fishing, mentioned on Facebook" is the transcript on that reach. No need for a parallel notes log — the reach history IS the log.

---

## Sessions — Skipped for Now

A session would be "I sat down for 90 minutes and made 40 calls." Useful for personal productivity tracking but adds complexity without changing what happens to leads. Skip it. Add later if needed for output metrics.

---

## What This Replaces

### Lead status becomes computed, not manual

Current model: user clicks buttons to set `lead.status = CONTACTED / ARCHIVED / etc.`

New model: lead status is derived from reach history.

| Computed status | Logic |
|---|---|
| NEW | No reaches yet, qualified |
| ACTIVE | Has reaches, most recent result is CONVERSATION, POSITIVE, or FOLLOW_UP_REQUESTED |
| WAITING | Follow-up scheduled, not yet due |
| NEEDS_ACTION | Follow-up is due today or overdue |
| DORMANT | 3+ reaches with no positive response, auto-shelved for 60-90 days |
| WON | Manually marked — deal closed |
| LOST | Last reach result was NEGATIVE, with `lostReason` |
| DO_NOT_CONTACT | Any reach with DO_NOT_CONTACT result |

The user never sets these directly (except WON and LOST). The app computes them from reach data. This eliminates the entire "manually click status buttons" workflow.

### Message model merges into Reach

A generated outreach message is just a reach where `channel = EMAIL` and the transcript contains the message body. The current `Message` and `Reply` models become redundant — a reply is a new reach logged with the response content.

### Follow-up metadata lives on the lead

| Field | Purpose |
|---|---|
| `nextFollowUpAt` | When the app should surface this lead again |
| `followUpCount` | Total reaches so far |
| `lastReachedAt` | Timestamp of most recent reach |
| `lostReason` | Why they said no (price, timing, has vendor, not interested) |
| `activeChannel` | Which channel is currently working (EMAIL, PHONE, DM, DROP_IN) |

---

## Automatic Next-Action Logic

Once reaches are structured, the app computes what to do next. Start with hardcoded defaults:

### After a PHONE reach:

| Result | Next action | Timing |
|---|---|---|
| NO_ANSWER | Call again, different time of day | 48hr |
| NO_ANSWER (2nd time) | Switch to email or DM | 24hr |
| VOICEMAIL | Send email referencing the voicemail | Same day |
| GATEKEEPER | Call back at suggested time, ask for owner by name | As scheduled |
| CONVERSATION + no commitment | Send recap email with next steps | Within 1hr |
| FOLLOW_UP_REQUESTED | Call back at requested time | Exact date |
| POSITIVE | Send mockup or proposal | Within 24hr |
| NEGATIVE | Mark lost with reason | Immediate |
| NOT_NOW | Schedule re-engagement | 60-90 days |

### After an EMAIL reach:

| Result | Next action | Timing |
|---|---|---|
| No reply (72hr) | Follow up, different angle | 72hr |
| No reply after follow-up #2 | Final short message | Day 7 |
| No reply after 3 emails | Mark dormant | Day 10, resurface 60 days |
| POSITIVE reply | Respond immediately, ask qualifying question | Within 10min |
| Asks for pricing | Don't give flat number, move to call/mockup | Within 1hr |
| NOT_NOW | Acknowledge, schedule follow-up | Their timeline or 60 days |
| NEGATIVE | One graceful close, then mark lost | Immediate |
| DO_NOT_CONTACT | Remove from all queues permanently | Immediate |

### After a DM reach:

| Result | Next action | Timing |
|---|---|---|
| No response (48hr) | Switch channel — try email or call, don't double-DM | 48hr |
| Viewed but no reply (24hr) | One follow-up with proof (screenshot of similar project) | 24hr after view |
| POSITIVE | Move off DM immediately — get their email | Within 10min |
| Left on read after follow-up | Move on, mark dormant | 5 days |

### After a DROP_IN reach:

| Result | Next action | Timing |
|---|---|---|
| POSITIVE — owner met you | Send email same day referencing the meeting | Within 2hr |
| Owner not there | Got name/callback time → schedule return | As scheduled |
| Owner busy / brushed off | Left card, send email | Same day |
| NEGATIVE | Mark lost | Immediate |

---

## Flows: Hardcoded First, Configurable Later

The next-action rules above should be **hardcoded defaults** that work for 90% of cases.

Phase 2: **Campaign-level overrides** for verticals that behave differently. Restaurants might need faster follow-up cadences than dentists. A campaign could override specific timing values.

Phase 3 (much later): **User-editable flows** — a visual workflow builder where the user defines "when X happens, do Y." This is a full product feature and premature right now.

Start hardcoded. Learn the right cadences from real usage. Make configurable once we know what levers actually matter.

---

## The Daily Action Queue

This is the killer UX change. Instead of a static lead list, the app shows you every morning:

```
14 leads need action today
─────────────────────────
5 follow-up calls      (no answer 48hr ago)
3 email follow-ups     (no reply in 72hr)
2 callbacks            (they said "call me Thursday")
4 new qualified leads  (first contact)
```

Sorted by priority:
1. Callbacks with a specific time (you promised you'd call)
2. Positive replies waiting for response (speed matters)
3. Follow-ups that are due (momentum)
4. New leads to contact for the first time (pipeline fill)

You open the app and it tells you WHAT TO DO RIGHT NOW. No scanning lists, no mental math about timing. The reach history drives everything.

---

## Better Message Generation

With reach history, `generateMessage` gets dramatically better context:

Current prompt context: campaign config + lead data (name, type, website, description)

New prompt context: all of the above PLUS:
- "This is reach #3 with this lead"
- "First was an email (no reply). Second was a DM (viewed, no reply)."
- "The user's offer is website development. The lead has no website and 47 Google reviews."
- "Previous message sent: [actual text]"
- "Suggested approach: try a different angle, reference something specific"

The AI can write a follow-up that acknowledges the history instead of sending the same cold open again.

---

## Real Analytics (from structured reaches)

Once every interaction is a structured data point:

- **Reply rate by channel** — are emails or calls working better for this vertical?
- **Average reaches to conversion** — how many touches to close?
- **Best time of day for calls** — when do owners actually answer?
- **Drop-off point** — most leads die after reach #2. Why?
- **Channel effectiveness by vertical** — plumbers answer the phone, dentists respond to email
- **Conversion funnel** — NEW → ACTIVE → WON, with drop-off at each stage
- **Cadence optimization** — are 48hr follow-ups too fast? Too slow? The data will tell you.

---

## Migration Path

This is a significant refactor. Rough order:

1. Add Reach model to Prisma schema (new table, no breaking changes)
2. Add API endpoints for creating/listing reaches on a lead
3. Build the reach log UI on LeadPage (replaces the current message section)
4. Add `nextFollowUpAt`, `lastReachedAt`, `followUpCount`, `activeChannel` to Lead
5. Build the daily action queue view (new page or dashboard tab)
6. Implement hardcoded next-action logic (compute `nextFollowUpAt` after each reach)
7. Migrate existing Message/Reply data into Reach records
8. Deprecate and remove old Message/Reply models
9. Update `generateMessage` to include reach history in prompt context
10. Add analytics dashboard

Steps 1-6 can ship as a first version. Steps 7-10 are cleanup and polish.

---

## Open Questions

- Should `lostReason` be free text or an enum? Enum is more structured (PRICE, TIMING, HAS_VENDOR, NOT_INTERESTED, OTHER) but free text captures nuance. Possibly both — enum for filtering, text for details.
- Should the app auto-create a reach when it sends a generated email? Or is every reach manually logged? For true automation later (auto-send emails), reaches should be auto-created. For now with manual sending, the user logs them.
- How does the dictate/call-recording feature (from SCRATCHPAD) connect? A recorded call becomes a reach with `channel = PHONE` and `transcript = AI-generated summary of the recording`.
