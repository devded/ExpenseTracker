# Notionance — Expense Tracker

A calm, editorial expense tracker that uses **your own Notion workspace as the database**. Users
connect by pasting a Notion integration token; the app finds — or creates — an `Notionance`
database, then reads and writes every expense through server-side API routes. The token never
touches the browser and there are **no CORS issues** with the Notion API.

Built with **Next.js (App Router) + TypeScript**, styled in the [kami](#design-language) design
language: warm parchment canvas, a single ink-blue accent, one serif throughout.

> The original static HTML/CSS mockup that started this project lives in [`index.html`](index.html).

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Connecting Notion](#connecting-notion)
- [Database schema](#database-schema)
- [Project structure](#project-structure)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Security & data](#security--data)
- [Design language](#design-language)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- **Bring-your-own database** — every expense is stored in the user's Notion workspace, not on our
  servers. Nothing to host, nothing to back up.
- **Zero-setup provisioning** — on connect, the app searches for an `Notionance` database. If
  it exists, any missing columns are added; if it doesn't, it's created for you.
- **Self-healing sessions** — if the stored database is later deleted or unshared, the app
  automatically re-finds or re-creates it instead of getting stuck on a dead reference.
- **Month-by-month view** — step through months; summary cards, the transaction list, and the
  category breakdown all follow the selected month.
- **Editable categories** — rename, recolor, add, or remove categories from the UI; they map
  directly to the `Category` select options in Notion.
- **Settings** — pick your currency (₺, $, €, £, ৳, ₹, ¥) and set your monthly budget; stored
  per-user and reflected everywhere.
- **At-a-glance metrics** — spent this month, budget remaining, daily average, active categories,
  and a spend-by-category bar chart.
- **Insights** — this-week-vs-last-week comparison, a daily-spend chart for the month, and a
  GitHub-style calendar heatmap of the last 12 months.
- **Mobile-friendly** — responsive down to small phones, with a stacking header and touch-sized
  controls.

---

## How it works

```
Browser (React)  ──►  Next.js API routes (server)  ──►  Notion API
   no token              reads httpOnly cookie            Bearer token
                         holds the token
```

1. The user pastes a Notion **integration token** on the connect screen.
2. `POST /api/notion/connect` validates it (`GET /users/me`), then ensures the database exists
   (search → add missing columns, or create under a shared page).
3. The token and database ID are saved in **httpOnly cookies** — never exposed to client JavaScript.
4. All Notion reads/writes happen inside server route handlers, so the browser only ever talks to
   this app's own `/api` endpoints. **This is why there's no CORS problem** and why the token
   stays server-side.

The provisioning logic lives in [`lib/notion.ts`](lib/notion.ts) (`ensureDatabase`).

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Plain CSS (kami design tokens), no UI library |
| Data store | Notion (per-user, via the official REST API `2022-06-28`) |
| Runtime | Node.js (route handlers) |
| Auth/session | httpOnly cookies |

> Pinned to Next **14.x** on purpose: the code uses the synchronous `cookies()` API, which becomes
> async in Next 15.

---

## Getting started

### Prerequisites

- Node.js 18.17+ (or 20+)
- A Notion account

### Install & run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other scripts

```bash
npm run build   # production build
npm run start   # serve the production build
npm run lint    # next lint
```

> **Tip:** If you ever switch between `npm run build` and `npm run dev` and see
> `Cannot find module './###.js'`, delete the build cache and restart: `rm -rf .next && npm run dev`.
> The two commands share the `.next/` folder but produce different chunk layouts.

---

## Connecting Notion

1. Create an internal integration at
   [notion.so/my-integrations](https://www.notion.so/my-integrations) and copy its
   **Internal Integration Secret**.
2. Open any Notion page → `···` menu → **Connections** → add your integration. This gives the app
   a place to create the database (and access to read/write it).
3. Paste the secret into the app's connect screen.

On success the app either finds your existing `Notionance` database or creates one inside the
first page shared with the integration.

> **Reusing an existing database:** if you already have an `Notionance` database, share **its**
> page with the integration before connecting so the app reuses it instead of creating a new one.
> Matching is by title (case-insensitive).

---

## Database schema

The app creates / maintains a Notion database named **`Notionance`** with these properties:

| Property | Type | Notes |
| --- | --- | --- |
| `Name` | Title | Expense description |
| `Amount` | Number (lira ₺) | Turkish Lira |
| `Category` | Select | Editable in-app; defaults: Food & Dining, Transport, Bills & Utilities, Leisure, Shopping |
| `Date` | Date | |
| `Notes` | Rich text | Optional |

If a pre-existing database is missing any of the non-title columns, they're added automatically on
connect.

---

## Project structure

```
app/
  layout.tsx                 Root layout + global CSS
  page.tsx                   Client orchestrator: loading → connect → dashboard
  globals.css                kami design system + responsive rules
  components/
    ConnectScreen.tsx        Token entry + setup instructions
    Dashboard.tsx            Metrics, month stepper, add-expense form, table, breakdown
    Stats.tsx                Week comparison, daily chart, calendar heatmap
    CategoriesModal.tsx      Edit category names / colors
    SettingsModal.tsx        Currency + monthly budget
  api/notion/
    connect/route.ts         POST — validate token, ensure DB, set cookie
    status/route.ts          GET  — verify connection, self-heal DB
    disconnect/route.ts      POST — clear cookies
    expenses/route.ts        GET list · POST add
    categories/route.ts      GET list · PUT replace
    settings/route.ts        GET prefs · PUT prefs (+ sync Notion Amount format)
lib/
  notion.ts                  Server-only Notion client + provisioning
  session.ts                 httpOnly cookie helpers (token, db, prefs)
  colors.ts                  Notion color → pill/swatch style map
  currencies.ts              Currency catalog (symbol + Notion format)
index.html                   Original static design mockup
```

---

## API reference

All routes are server-only and read the token from the session cookie.

| Method & path | Body | Returns |
| --- | --- | --- |
| `POST /api/notion/connect` | `{ token }` | `{ connected, workspace, databaseId, created, addedProperties }` |
| `GET /api/notion/status` | — | `{ connected, workspace?, databaseId?, reprovisioned? }` |
| `POST /api/notion/disconnect` | — | `{ connected: false }` |
| `GET /api/notion/expenses` | — | `{ expenses: Expense[] }` |
| `POST /api/notion/expenses` | `{ name, amount, category, date, notes? }` | `{ expense }` |
| `PATCH /api/notion/expenses/:id` | `{ name, amount, category, date }` | `{ expense }` |
| `DELETE /api/notion/expenses/:id` | — | `{ ok: true }` (archives the page) |
| `GET /api/notion/categories` | — | `{ categories: {id?, name, color}[] }` |
| `PUT /api/notion/categories` | `{ categories: {id?, name, color}[] }` | `{ categories }` |
| `GET /api/notion/settings` | — | `{ prefs: { currency, budget } }` |
| `PUT /api/notion/settings` | `{ currency, budget }` | `{ prefs }` |

`Expense = { id, name, amount, category, date, notes }`

---

## Configuration

Currency and monthly budget are set in-app via **Settings** and stored in a per-user cookie
(`lib/session.ts` → `Prefs`). Defaults live in `DEFAULT_PREFS` (`TRY`, ₺40,000). A few other values:

| What | Where | Default |
| --- | --- | --- |
| Cookie lifetime (token) | `THIRTY_DAYS` in `lib/session.ts` | 30 days |
| Cookie lifetime (prefs) | `ONE_YEAR` in `lib/session.ts` | 365 days |
| Notion API version | `NOTION_VERSION` in `lib/notion.ts` | `2022-06-28` |
| Supported currencies | `CURRENCIES` in `lib/currencies.ts` | 7 currencies |

There are no required environment variables — each user provides their own token at runtime.

---

## Security & data

- **No shared secrets.** The app persists nothing server-side: no database, no API keys. Each
  browser holds its own Notion token, so users are fully isolated.
- **Token storage.** The token is kept in an **httpOnly, SameSite=Lax** cookie (`Secure` in
  production), so page JavaScript cannot read it — this blocks XSS token theft.
- **Prototype limitation.** The token is stored **in plaintext inside the cookie**. That's fine for
  local/personal use, but before running this for other people you should:
  1. **Encrypt the token at rest** (or store a session ID that maps to an encrypted server-side
     store), and
  2. Consider **Notion OAuth** instead of pasted integration tokens, for scoped, centrally
     revocable access.

---

## Design language

Styled in **kami** — an editorial, print-inspired system:

- Parchment background `#f5f4ed` (never pure white)
- Single ink-blue accent `#1B365D`
- Warm-toned grays, one serif (Charter → Georgia fallback) throughout
- Whisper shadows, 8–12px radii, a signature 2.5px brand left-bar on section titles

Only the visual tokens are used here; the CSS in `globals.css` is original to this project. No
external fonts are bundled (system serif stack only).

---

## Roadmap

- Per-category budgets
- Encrypted token storage and/or Notion OAuth
- CSV export

---

## License

No license file is included yet. Until one is added, default copyright applies (all rights
reserved). MIT is recommended for an open-source release — add a `LICENSE` file to make reuse
explicit.

---

<sub>Built as a prototype → product. Design language: kami.</sub>
