# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules
- Do your very best to write code that is both perfectly functional and extremely good looking.
- When you finish coding something, do not test the UI unless you have been explicitly instructed to do so. I will do the UI testing for you. That means you must skip preview verification (unless I ask you to do so for a specific case).

## Commands

```bash
# Development
npm run dev              # Start Next.js with Turbopack

# Mobile (Expo)
npm run mobile:start     # Start Expo dev server
npm run mobile:ios       # Run on iOS simulator

# Testing
npm test                 # Run all Vitest tests
npm run test:watch       # Vitest watch mode
npm run test:coverage    # Vitest with coverage report
npm run test:e2e         # Playwright E2E tests (auto-starts dev server on port 3000)
npm run test:all         # Vitest + Playwright

# Run a single test file
npx vitest run test/unit/lib/task-scheduler-date-logic.node.test.ts

# Run live InstantDB permissions smoke test (requires env vars)
npm run test:perms:live

# InstantDB schema management (local dev)
INSTANT_CLI_DEV=1 INSTANT_CLI_API_URI="http://localhost:8888" npx instant-cli@latest push
INSTANT_CLI_DEV=1 INSTANT_CLI_API_URI="http://localhost:8888" npx instant-cli@latest pull
```

## Architecture

This is a **Next.js 16 + InstantDB** family management app. InstantDB is the sole database—there is no traditional backend DB. All data sync happens client-side via the InstantDB React SDK, with the server-side Admin SDK used only for privileged operations (auth token minting, admin writes).

### Key architectural layers

**Client DB** (`lib/db.ts`): `@instantdb/react` initialized with `instant.schema.ts` for typed queries. All client components use `db.useQuery(...)` for live data and `db.transact(...)` for writes.

**Server/Admin** (`lib/instant-admin.ts`): `@instantdb/admin` for operations requiring elevated privileges. Used in API routes under `app/api/`.

**Schema** (`instant.schema.ts`): Single source of truth for all entities and their links. Modify here and push with `instant-cli`. Key entities: `familyMembers`, `chores`, `choreAssignments`, `choreCompletions`, `taskSeries`, `tasks`, `allowanceEnvelopes`, `allowanceTransactions`, `calendarItems`, `deviceSessions`.

**Permissions** (`instant.perms.ts`): CEL-based rules pushed to InstantDB. Changes must be pushed to take effect.

### Auth / device access model

Two-layer auth:
1. **Device auth** (`lib/device-auth.ts`): A `DEVICE_ACCESS_KEY` cookie gates the entire app. `middleware.ts` enforces this — unauthenticated devices are redirected to `/activate`. The `/api/device-activate` endpoint validates a shared secret from the environment and sets the cookie.
2. **Principal/role** (`lib/instant-principal-types.ts`, `lib/parent-mode.ts`): Within the app, family members log in by PIN. Principals are `kid` | `parent` | `unknown`. Parent elevation goes through `lib/parent-elevation-rate-limit.ts` and mints short-lived tokens via `/api/instant-auth-parent-token`. `components/auth/ParentGate.tsx` is the component-level guard for parent-only pages and `components/auth/LoginModal.tsx` handles PIN entry and family member selection.

**Web session provider** (`components/InstantFamilySessionProvider.tsx`): Composes three layers for the web app — InstantDB auth (`db.useAuth()`) → principal type (kid/parent) → selected family member. Attempts cached token restoration on startup. Parent shared-device mode auto-expires after a configurable idle timeout.

### Web app pages and features

**Routes (App Router):**
- First, you have to activate the app. If you try to load any route before doing this, you will get a 404 not found error. After the server is running, get `DEVICE_ACCESS_KEY` from the .env file, and go to `http://<ip>:<port>/?activate=<DEVICE_ACCESS_KEY>`. This will activate you and immediately redirect you to `/`. Then you will be able to get to any of the other routes without a 404 error.
- `/activate` — Device activation screen (enter shared `DEVICE_ACCESS_KEY`). You should not use this to activate; it's for human use and you can use the method described above for quicker access.
- `/` — Main chore dashboard (`ChoresTracker` + `ChoreList`). Family member sidebar, date carousel, add/edit/delete chores, task series checklists with file attachment previews, marks completions.
- `/calendar` — Multi-week calendar with drag-and-drop events. Supports both Gregorian and Nepali (Bikram Samvat) views. Displays chore dates and calendar items.
- `/task-series` — Task series manager (parent-only). Lists all series with status filters (draft/pending/in_progress/archived), batch delete, progress tracking.
- `/task-series/new` and `/task-series/[seriesId]` — TipTap-based rich text editor for creating/editing task series. Supports slash commands, nested task indentation, drag-and-drop reordering, and day-break markers.
- `/familyMemberDetail` — Per-member allowance management: multiple currency envelopes, deposits/withdrawals/transfers between envelopes or to other members, transaction history, savings goals, recurring allowance schedule setup.
- `/allowance-distribution` — Parent-only allowance distribution workflow. Selects a period, calculates weight-based completion percentage, handles fixed up-for-grabs rewards, previews and executes payouts.
- `/files` — File manager backed by S3/MinIO. Upload images (resized server-side to 64/320/1200px via Sharp) and documents, grid gallery view, preview modal.
- `/settings` — Parent-only currency settings (toggle enabled currencies; at least one required).

**Key components to know:**
- `ChoresTracker.tsx` / `ChoreList.tsx` — the core chore UI; chore display, completion toggling, and the `DetailedChoreForm.tsx` dialog for creating/editing chores (rrule picker, rotation, weight, up-for-grabs, reward type/currency, date preview).
- `FamilyMembersList.tsx` — member management with photo upload (crop), drag-and-drop reorder (Atlaskit PDND), role and PIN configuration.
- `TaskSeriesChecklist.tsx` — renders the rolling-queue task list inside a chore row, including nested sub-tasks, file/note previews, and a completion fireworks animation.
- `components/countdown/FocusedCountdownPage.tsx` — real-time countdown view; computes live slot state, progress fraction, and stack delta (seconds ahead/behind plan). Renders `CollisionDecisionDialog` when start-driven and deadline-driven chores overlap.
- `components/allowance/MemberAllowanceDetail.tsx` — the full envelope finance UI for one member (the largest single component at ~61KB).

**Server API routes:**
- `POST /api/device-activate` — sets device auth cookie
- `GET /api/instant-auth-token` / `POST /api/instant-auth-parent-token` — mint InstantDB principal tokens
- `POST /api/upload` (pages/api) — image upload with Sharp resizing
- `POST /api/delete-image` (pages/api) — image deletion
- `/api/calendar-sync/apple/{connect,run,status,settings}` — Apple CalDAV sync
- `/api/messages/{route,threads,push-devices}` — in-app messaging and push notifications
- `/api/content/queue/{add,advance,current}` — content queue management
- `/api/mobile/*` — mobile-specific mirrors of auth/device/file endpoints

### Core business logic

- **Chore scheduling** (`lib/chore-utils.ts`): `rrule`-based recurrence. `createRRuleWithStartDate` / `toUTCDate` are the key helpers. Rotation types (`none` | `daily` | `weekly` | `monthly`) determine which family member is assigned on a given date. `getAssignedMembersForChoreOnDate()` returns the resolved assignee list. XP (`calculateDailyXP`) and allowance (`CalculatedPeriod` / `calculatePeriodDetails`) are separate calculations — XP is weight-only; allowance combines weighted completion percentage with fixed rewards from up-for-grabs chores.
- **Chore pause/resume** (`lib/chore-schedule.ts`): `ChorePauseState` state machine distinguishes between `paused` (temporary) and `ended` (permanent) intent. `createOccurrenceSet()` builds an RRuleSet with normalized exdates. Use `normalizeChoreExdates()` to ensure consistent YYYY-MM-DD format.
- **Countdown engine** (`packages/shared-core/src/chore-countdown-engine.ts`): Two-pass scheduler — first resolves eligible chores, then builds per-person `PersonCountdownTimeline` slots. Timing modes split into deadline-driven (`before_time`, `before_marker`, `before_chore`, `named_window`, `between_times`) and start-driven (`after_time`, `after_marker`, `after_chore`). Start-driven chores that overlap deadline-driven ones trigger a `CollisionDecision` workflow. Configurable `stackBufferSecs` (default 30) inserts gaps between chained chores. `CountdownSlot` states: `upcoming` → `active` → `overdue_active` / `buffer` / `completed` / `waiting_decision`. Routine markers (`routineMarkerStatuses`) are named day-boundary-relative anchors (e.g., "Morning Routine" at 06:00) that other chores can reference for timing.
- **Task series scheduler** (`lib/task-scheduler.ts`): `getTasksForDate` implements the "rolling queue" — tasks in a series advance based on completion, not calendar date. Day-break entities (`isDayBreak: true`) act as paginators between sessions. `getRecursiveTaskCompletionTransactions()` builds batched write transactions.
- **Task progress** (`lib/task-progress.ts`): Task state machine (`not_started` → `in_progress` → `done` / `skipped` / `blocked` / `needs_review`). Tasks can carry structured `responseFields` with weights for graded feedback.
- **Allowance** (`lib/chore-utils.ts` `CalculatedPeriod`): Weight-based percentage completion, fixed rewards for "up for grabs" chores, multi-currency envelope deposits.
- **Time machine** (`lib/time-machine.ts`): Dev/test utility that patches `Date` via a `localStorage` offset (`debug_time_offset`). Hydration-safe — real `Date` cached in `window.__RealDate` by an inline layout script. `packages/shared-core/src/time-provider.ts` exposes `getNow()` which tests can override.

### File storage

S3-compatible object storage (MinIO in self-hosted setup). Presigned URLs generated server-side in `app/actions.ts`. Image uploads go through `pages/api/upload.ts` which uses Sharp to produce three sizes (64px, 320px, 1200px). Configured via `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` env vars.

### Monorepo workspace packages

- **`packages/shared-core`** (`@family-organizer/shared-core`): Pure TS utilities shared between web and mobile. Contains `chores.ts`, `date.ts`, `time-provider.ts`, plus the full countdown subsystem: `chore-countdown-engine.ts`, `chore-countdown-types.ts`, `chore-timing.ts`.
- **`packages/mobile-contracts`**: API contract types between the Next.js backend and the Expo mobile client.

### Mobile app (`mobile/`)

Expo/React Native app using Expo Router. Uses a **hybrid backend**: InstantDB (`@instantdb/react-native`) for live real-time queries/writes, plus the Next.js `/api/mobile/*` routes for auth token minting and device management. The mobile app does not talk to InstantDB admin directly — privileged ops go through the API. Base URL configured via `EXPO_PUBLIC_API_BASE_URL` (defaults to `http://localhost:3000`). API client lives in `mobile/src/lib/api-client.js`.

**Auth/session flow (mobile-specific):** Three provider layers compose in `mobile/src/providers/AppProviders.js`:
1. `DeviceSessionProvider` — device activation token persisted in AsyncStorage; refreshed on app resume. Activation calls `POST /api/mobile/device-activate`.
2. `InstantPrincipalProvider` — manages kid/parent InstantDB principal switching. Parent elevation calls `POST /api/mobile/instant-auth-parent-token` with PIN. In shared-device mode, parents are auto-demoted after a configurable idle timeout (default 15 min), tracked via `InteractionCapture`.
3. `FamilyAuthProvider` — tracks the currently selected family member; restores last selection on launch.

Navigation: unauthenticated device → `/activate`; no member selected → `/lock`; authenticated → tab navigator (`/dashboard`, `/chores`, `/calendar`, `/finance`, `/more`).

**Implemented screens:**
- **Dashboard** — XP scores, 7-day chore/task summary, recent transactions
- **Chores** — date-navigable chore list with per-member filtering and completion status
- **Calendar** — Gregorian + Nepali (Bikram Samvat) calendar views with chore/task overlays
- **Finance** — multi-currency envelope balances, transaction history, envelope management modals
- **More > Task Series** (parent) — live task series status and checklist progress
- **More > Family Members** (parent) — household roster with roles and photo profiles
- **More > Settings** — theme selection, unit/currency definitions
- **More > Files** (parent) — file browser backed by S3
- **More > Allowance Distribution** (parent, preview) — payout readiness preview
- **More > Dev Tools** (parent) — session state inspection and debug metadata
- **Lock screen** — multi-member grid with PIN entry, parent elevation, shared-device mode toggle

## Test conventions

Test files live under `test/` and `e2e/`:

- `*.node.test.ts` — Node environment (default vitest env)
- `*.dom.test.ts` — Browser environment; add `// @vitest-environment jsdom` at top of file
- `test/unit/` — Pure logic; `test/integration/` — route handlers/middleware; `test/contracts/` — schema/permission regression guards; `test/dom/` — React component behavior
- `e2e/` — Playwright browser flows

Time-sensitive tests (recurrence, allowance periods, parent idle expiry) should use `test/utils/fake-clock.ts` rather than raw `vi.useFakeTimers()`. E2E time travel uses `e2e/support/time-machine.ts`.

When mocking InstantDB in jsdom tests, mock `@/lib/db` to avoid booting the real Instant client/IndexedDB layer. Mock Radix UI primitives when testing form logic rather than UI internals.

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB app ID (client) |
| `INSTANT_APP_ID` | InstantDB app ID (server/admin) |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB admin token |
| `NEXT_PUBLIC_INSTANT_API_URI` | Override InstantDB API URL (local dev) |
| `NEXT_PUBLIC_INSTANT_WEBSOCKET_URI` | Override InstantDB WS URL (local dev) |
| `DEVICE_ACCESS_KEY` | Shared secret for device activation |
| `S3_ENDPOINT` / `NEXT_PUBLIC_S3_ENDPOINT` | MinIO/S3 endpoints (internal/public) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` | S3 credentials |

Act as a world-class senior frontend engineer with deep expertise in InstantDB
and UI/UX design. Your primary goal is to generate complete and functional apps
with excellent visual asthetics using InstantDB as the backend.

# About InstantDB aka Instant

Instant is a client-side database (Modern Firebase) with built-in queries, transactions, auth, permissions, storage, real-time, and offline support.

# Instant SDKs

Instant provides client-side JS SDKs and an admin SDK:

- `@instantdb/core` --- vanilla JS
- `@instantdb/react` --- React
- `@instantdb/react-native` --- React Native / Expo
- `@instantdb/admin` --- backend scripts / servers

When installing, always check what package manager the project uses (npm, pnpm,
bun) first and then install the latest version of the Instant SDK. If working in
React use Next and Tailwind unless specified otherwise.

# Managing Instant Apps

## Prerequisites

Look for `instant.schema.ts` and `instant.perms.ts`. These define the schema and permissions.
Look for an app id and admin token in `.env` or another env file.

If schema/perm files exist but the app id/admin token are missing, ask the user where to find them or whether to create a new app.

To create a new app:

```bash
npx instant-cli init-without-files --title <APP_NAME>
```

This outputs an app id and admin token. Store them in an env file.

If you get an error related to not being logged in tell the user to:

- Sign up for free or log in at https://instantdb.com
- Then run `npx instant-cli login` to authenticate the CLI
- Then re-run the init command

If you have an app id/admin token but no schema/perm files, pull them:

```bash
npx instant-cli pull --yes
```

## Schema changes

Edit `instant.schema.ts`, then push:

```bash
npx instant-cli push schema --yes
```

New fields = additions; missing fields = deletions.

To rename fields:

```bash
npx instant-cli push schema --rename 'posts.author:posts.creator stores.owner:stores.manager' --yes
```

## Permission changes

Edit `instant.perms.ts`, then push:

```bash
npx instant-cli push perms --yes
```

# CRITICAL Query Guidelines

CRITICAL: When using React make sure to follow the rules of hooks. Remember, you can't have hooks show up conditionally.

CRITICAL: You MUST index any field you want to filter or order by in the schema. If you do not, you will get an error when you try to filter or order by it.

Here is how ordering works:

```
Ordering:        order: { field: 'asc' | 'desc' }

Example:         $: { order: { dueDate: 'asc' } }

Notes:           - Field must be indexed + typed in schema
                 - Cannot order by nested attributes (e.g. 'owner.name')
```

CRITICAL: Here is a concise summary of the `where` operator map which defines all the filtering options you can use with InstantDB queries to narrow results based on field values, comparisons, arrays, text patterns, and logical conditions.

```
Equality:        { field: value }

Inequality:      { field: { $ne: value } }

Null checks:     { field: { $isNull: true | false } }

Comparison:      $gt, $lt, $gte, $lte   (indexed + typed fields only)

Sets:            { field: { $in: [v1, v2] } }

Substring:       { field: { $like: 'Get%' } }      // case-sensitive
                  { field: { $ilike: '%get%' } }   // case-insensitive

Logic:           and: [ {...}, {...} ]
                  or:  [ {...}, {...} ]

Nested fields:   'relation.field': value
```

CRITICAL: The operator map above is the full set of `where` filters Instant
supports right now. There is no `$exists`, `$nin`, or `$regex`. And `$like` and
`$ilike` are what you use for `startsWith` / `endsWith` / `includes`.

CRITICAL: Pagination keys (`limit`, `offset`, `first`, `after`, `last`, `before`) only work on top-level namespaces. DO NOT use them on nested relations or else you will get an error.

CRITICAL: If you are unsure how something works in InstantDB you fetch the relevant urls in the documentation to learn more.

# CRITICAL Permission Guidelines

Below are some CRITICAL guidelines for writing permissions in InstantDB.

## `data.ref`

- Use `data.ref("<path.to.attr>")` for linked attributes.
- Always returns a **list**.
- Must end with an **attribute**.

**Correct**

```cel
auth.id in data.ref('post.author.id') // auth.id in list of author ids
data.ref('owner.id') == [] // there is no owner
```

**Errors**

```cel
auth.id in data.post.author.id
auth.id in data.ref('author')
data.ref('admins.id') == auth.id
auth.id == data.ref('owner.id')
data.ref('owner.id') == null
data.ref('owner.id').length > 0
```

## `auth.ref`

- Same as `data.ref` but path must start with `$user`.
- Returns a list.

**Correct**

```cel
'admin' in auth.ref('$user.role.type')
auth.ref('$user.role.type')[0] == 'admin'
```

**Errors**

```cel
auth.ref('role.type')
auth.ref('$user.role.type') == 'admin'
```

## Unsupported

```cel
newData.ref('x')
data.ref(someVar + '.members.id')
```

## $users Permissions

- Default `view` permission is `auth.id == data.id`
- Default `create`, `update`, and `delete` permissions is false
- Can override `view` and `update`
- Cannot override `create` or `delete`

## $files Permissions

- Default permissions are all false. Override as needed to allow access.
- `data.ref` does not work for `$files` permissions.
- Use `data.path.startsWith(...)` or `data.path.endsWith(...)` to write
  path-based rules.

## Field-level Permissions

Restrict access to specific fields while keeping the entity public:

```json
{
  "$users": {
    "allow": {
      "view": "true"
    },
    "fields": {
      "email": "auth.id == data.id"
    }
  }
}
```

Notes:

- Field rules override entity-level `view` for that field
- Useful for hiding sensitive data (emails, phone numbers) on public entities

# Best Practices

## Pass `schema` when initializing Instant

Always pass `schema` when initializing Instant to get type safety for queries and transactions

```tsx
import schema from '@/instant.schema`

// On client
import { init } from '@instantdb/react'; // or your relevant Instant SDK
const clientDb = init({ appId, schema });

// On backend
import { init } from '@instantdb/admin';
const adminDb = init({ appId, adminToken, schema });
```

## Use `id()` to generate ids

Always use `id()` to generate ids for new entities

```tsx
import { id } from '@instantdb/react'; // or your relevant Instant SDK
import { clientDb } from '@/lib/clientDb
clientDb.transact(clientDb.tx.todos[id()].create({ title: 'New Todo' }));
```

## Use Instant utility types for data models

Always use Instant utility types to type data models

```tsx
import { AppSchema } from '@/instant.schema';

type Todo = InstaQLEntity<AppSchema, 'todos'>; // todo from clientDb.useQuery({ todos: {} })
type PostsWithProfile = InstaQLEntity<
  AppSchema,
  'posts',
  { author: { avatar: {} } }
>; // post from clientDb.useQuery({ posts: { author: { avatar: {} } } })
```

## Use `db.useAuth` or `db.subscribeAuth` for auth state

```tsx
import { clientDb } from '@/lib/clientDb';

// For react/react-native apps use db.useAuth
function App() {
  const { isLoading, user, error } = clientDb.useAuth();
  if (isLoading) { return null; }
  if (error) { return <Error message={error.message /}></div>; }
  if (user) { return <Main />; }
  return <Login />;
}

// For vanilla JS apps use db.subscribeAuth
function App() {
  renderLoading();
  db.subscribeAuth((auth) => {
    if (auth.error) { renderAuthError(auth.error.message); }
    else if (auth.user) { renderLoggedInPage(auth.user); }
    else { renderSignInPage(); }
  });
}
```

# Ad-hoc queries & transactions

Use `@instantdb/admin` to run ad-hoc queries and transactions on the backend.
Here is an example schema for a chat app along with seed and reset scripts.

```tsx
// instant.schema.ts
const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      displayName: i.string(),
    }),
    channels: i.entity({
      name: i.string().indexed(),
    }),
    messages: i.entity({
      content: i.string(),
      timestamp: i.number().indexed(),
    }),
  },
  links: {
    userProfile: {
      forward: { on: "profiles", has: "one", label: "user", onDelete: "cascade" }, // IMPORTANT: `cascade` can only be used in a has-one link
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    authorMessages: {
      forward: { on: "messages", has: "one", label: "author", onDelete: "cascade" },
      reverse: { on: "profiles", has: "many", label: "messages", },
    },
    channelMessages: {
      forward: { on: "messages", has: "one", label: "channel", onDelete: "cascade" },
      reverse: { on: "channels", has: "many", label: "messages" },
    },
  },
});

// scripts/seed.ts
import { id } from "@instantdb/admin";
import { adminDb } from "@/lib/adminDb";

const users: Record<string, User> = { ... }
const channels: Record<string, Channel> = { ... }
const mockMessages: Message[] = [ ... ]

function seed() {
  console.log("Seeding db...");
  const userTxs = Object.values(users).map(u => adminDb.tx.$users[u.id].create({}));
  const profileTxs = Object.values(users).map(u => adminDb.tx.profiles[u.id].create({ displayName: u.displayName }).link({ user: u.id }));
  const channelTxs = Object.values(channels).map(c => adminDb.tx.channels[c.id].create({ name: c.name }))
  const messageTxs = mockMessages.map(m => {
    const messageId = id();
    return adminDb.tx.messages[messageId].create({
      content: m.content,
      timestamp: m.timestamp,
    })
      .link({ author: users[m.author].id })
      .link({ channel: channels[m.channel].id });
  })

  adminDb.transact([...userTxs, ...profileTxs, ...channelTxs, ...messageTxs]);
}

seed();

// scripts/reset.ts
import { adminDb } from "@/lib/adminDb";

async function reset() {
  console.log("Resetting database...");
  const { $users, channels } = await adminDb.query({ $users: {}, channels: {} });

  // Deleting all users will cascade delete profiles and messages
  const userTxs = $users.map(user => adminDb.tx.$users[user.id].delete());

  const channelTxs = channels.map(channel => adminDb.tx.channels[channel.id].delete());
  adminDb.transact([...userTxs, ...channelTxs]);
}

reset();
```

# Instant Documentation

The bullets below are links to the Instant documentation. They provide detailed information on how to use different features of InstantDB. Each line follows the pattern of

- [TOPIC](URL): Description of the topic.

Fetch the URL for a topic to learn more about it.

- [Common mistakes](https://instantdb.com/docs/common-mistakes.md): Common mistakes when working with Instant
- [Initializing Instant](https://instantdb.com/docs/init.md): How to integrate Instant with your app.
- [Modeling data](https://instantdb.com/docs/modeling-data.md): How to model data with Instant's schema.
- [Writing data](https://instantdb.com/docs/instaml.md): How to write data with Instant using InstaML.
- [Reading data](https://instantdb.com/docs/instaql.md): How to read data with Instant using InstaQL.
- [Instant on the Backend](https://instantdb.com/docs/backend.md): How to use Instant on the server with the Admin SDK.
- [Patterns](https://instantdb.com/docs/patterns.md): Common patterns for working with InstantDB.
- [Auth](https://instantdb.com/docs/auth.md): Instant supports magic code, OAuth, Clerk, and custom auth.
- [Auth](https://instantdb.com/docs/auth/magic-codes.md): How to add magic code auth to your Instant app.
- [Managing users](https://instantdb.com/docs/users.md): How to manage users in your Instant app.
- [Presence, Cursors, and Activity](https://instantdb.com/docs/presence-and-topics.md): How to add ephemeral features like presence and cursors to your Instant app.
- [Instant CLI](https://instantdb.com/docs/cli.md): How to use the Instant CLI to manage schema.
- [Storage](https://instantdb.com/docs/storage.md): How to upload and serve files with Instant.
- [Stripe Payments](https://instantdb.com/docs/stripe-payments.md): How to integrate Stripe payments with Instant.

# Final Note

Think before you answer. Make sure your code passes typechecks `tsc --noEmit` and works as expected.
Remember! AESTHETICS ARE VERY IMPORTANT. All apps should LOOK AMAZING and have GREAT FUNCTIONALITY!

