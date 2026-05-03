# ModPilot-X

A Reddit mod-queue triage and team coordination tool built on Devvit. ModPilot-X helps moderators work faster by surfacing risk signals for every post and comment, coordinating reviews across the mod team, and detecting patterns like spam waves and brigading — all without any external AI or third-party dependencies.

## Features

### X-Ray Risk Analysis
- Every post and comment is automatically scored 1–10 on submission
- Score is based on author trust tier, account age, prior removals, text hedging density, sentence uniformity, vocabulary diversity (TTR), Flesch-Kincaid grade, and structural patterns
- Moderators can open **"View ModPilot X-Ray"** from any post or comment to see the full breakdown and take action directly from the panel

### Quick Actions
From the X-Ray panel, mods can approve, remove, snooze (24h), or flag an item for team review — all in one click.

### Claim System
- Mods can claim an item to signal "I'm reviewing this"
- Claims auto-expire (configurable, default 30 min)
- Other mods see who has the item claimed, preventing duplicate work

### Team Review Queue
- Flag high-ambiguity items for collective review
- Open **"Team Review Queue"** from the subreddit menu to vote approve/remove/discuss on up to 5 items at once
- Auto-executes the winning action when the vote threshold is reached

### Daily Digest
- Aggregates daily stats: items enriched, removals, approvals, top patterns, mod agreement rate
- Delivered as a Discord embed if a webhook URL is configured
- Trigger on-demand via **"Send ModPilot Digest Now"** from the subreddit menu

### Pattern Detection
Runs hourly to detect:
- **Spam waves** — users posting more than 5 times in a single hour
- **Brigading** — high-risk queue doubling in size within an hour
- **Repeat offenders** — users accumulating removals above threshold

### Community Baseline Mode
Set a number of observation days on install. During baseline, ModPilot scores items silently without adding them to the high-risk queue — letting the scoring model warm up before it starts acting.

### Feedback Loop
Every mod action (approve/remove) is compared against the predicted risk tier to compute a running agreement rate, surfaced in the daily digest.

## Tech Stack

- [Devvit](https://developers.reddit.com/) `@devvit/web` v0.12.22 — Reddit's app platform
- [Hono](https://hono.dev/) — lightweight HTTP routing
- [Vite](https://vite.dev/) — build tooling
- [TypeScript](https://www.typescriptlang.org/) — fully typed throughout
- [Vitest](https://vitest.dev/) — unit tests for pure-function core logic

## Project Structure

```
src/
├── index.ts                  Main server — mounts all Hono route groups
├── core/
│   ├── redis.ts              All domain types + typed Redis helpers
│   ├── authorProfiler.ts     Trust tier from Reddit account signals
│   ├── textAnalyzer.ts       5 heuristic text signals (pure TS, no I/O)
│   ├── riskScorer.ts         Weighted 1–10 score + rationale string
│   ├── enrichment.ts         Orchestrates profiler → analyzer → scorer → Redis
│   ├── xrayDisplay.ts        Builds X-Ray FormField[] from EnrichedItem
│   ├── quickActions.ts       approve / remove / snooze / flag-for-team
│   ├── claimSystem.ts        Claim / release with Redis TTL
│   ├── patternDetector.ts    Spam wave, brigading, repeat offender detection
│   ├── digestBuilder.ts      Daily stats aggregation + Discord webhook POST
│   ├── feedbackLoop.ts       Mod agreement tracking
│   ├── textAnalyzer.test.ts  Unit tests — textAnalyzer
│   └── riskScorer.test.ts    Unit tests — riskScorer
└── routes/
    ├── api.ts                Public API endpoints
    ├── forms.ts              Form submission handlers (X-Ray, Team Queue)
    ├── menu.ts               Context menu handlers
    ├── triggers.ts           PostSubmit / PostReport / ModAction / AppInstall
    └── scheduler.ts          Daily digest + hourly pattern detection
```

## Subreddit Settings

Configure ModPilot-X from your subreddit's app settings:

| Setting | Default | Description |
|---|---|---|
| Risk score threshold | 7 | Items at or above this score enter the high-risk queue |
| Auto-snooze below | 0 (off) | Items at or below this score are auto-snoozed |
| Claim expiry (minutes) | 30 | How long a mod's claim is held before expiring |
| Team review votes required | 2 | Votes needed to trigger auto-action on a queued item |
| Discord webhook URL | — | If set, the daily digest is posted here |
| Baseline observation days | 0 (off) | Days to observe silently before scoring becomes active |

## Commands

```bash
npm run dev          # Start devvit playtest (live reload in dev subreddit)
npm run build        # Production build
npm run type-check   # TypeScript type checking
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run deploy       # type-check + lint + test + devvit upload
npm run launch       # deploy + devvit publish (submits for app review)
```

## Menu Items

All menu items are moderator-only.

| Location | Label | Action |
|---|---|---|
| Post / Comment | View ModPilot X-Ray | Opens risk score panel with quick actions |
| Post / Comment | Claim for review | Marks item as being reviewed by you |
| Post / Comment | Mop comments | Bulk-remove a comment thread |
| Post | Mop post comments | Bulk-remove all comments on a post |
| Subreddit | Team Review Queue | Opens voting panel for flagged items |
| Subreddit | Send ModPilot Digest Now | Triggers the daily digest immediately |
| Subreddit | Exit ModPilot Baseline Mode | Ends observation mode, activates scoring |

## Deployment

```bash
npm run deploy    # Upload to Reddit (runs checks first)
npm run launch    # Submit for public app review
```
