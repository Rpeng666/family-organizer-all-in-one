# Family Organizer App System Reference

This document is the current implementation guide for the Family Organizer app. It is meant to serve as the single high-level reference for how the app works today across web, iPhone, InstantDB, and the small amount of server code around auth, files, and bootstrap flows.

The major app areas covered here are:

1. Authentication, device activation, and principal/session switching
2. Dashboard and top-level app shell behavior on web and iPhone
3. Chores and task series
4. Calendar
5. Allowance and finance
6. Family administration and settings
7. Files, attachments, and media
8. Cross-cutting sync, PWA, and debug tooling
9. The `/childwidget` demo route

## Scope

This document describes the current implementation across:

- InstantDB schema, links, and permissions
- the Next.js web app
- the Expo / iPhone app
- the small amount of server code that exists for auth, files, and bootstrap support

It is intentionally descriptive, not aspirational. When the code and older notes disagree, trust the code.

## App-Wide Architecture

At a high level, the product is still a client-heavy InstantDB application.

- InstantDB is the main source of truth for family members, chores, task series, calendar items, allowance data, settings, units, and attachments.
- The web app uses `@instantdb/react` through `lib/db.ts`.
- The iPhone app uses `@instantdb/react-native` through `mobile/src/lib/instant-db.js`.
- Most CRUD flows happen directly from clients with `db.useQuery(...)` and `db.transact(...)`.
- The server layer mainly exists for device activation, auth token minting, S3 signing, and a few admin/backfill scripts.

Important consequence: if behavior is wrong, the fix is usually in client components or shared helpers, not in API routes.

## Top-Level Surface Map

### Web routes

- `/` -> household dashboard
- `/chores` -> chores management
- `/calendar` -> event calendar
- `/task-series` -> task-series manager
- `/task-series/new` and `/task-series/[seriesId]` -> editor flows
- `/familyMemberDetail` -> detailed finance management
- `/allowance-distribution` -> allowance payout workflow
- `/settings` -> family administration and currency settings
- `/files` -> web file browser
- `/activate` -> web/PWA device activation
- `/childwidget` -> static demo widget

### iPhone routes

- `/activate` -> native device activation
- `/lock` -> family-member selection and PIN entry
- tabs:
  - `/dashboard`
  - `/chores`
  - `/calendar`
  - `/finance`
  - `/more`
- More screens:
  - `/more/task-series`
  - `/more/family-members`
  - `/more/allowance-distribution`
  - `/more/files`
  - `/more/settings`
  - `/more/dev-tools`

## Shared Data Model

The most relevant Instant entities for the currently implemented product are:

| Entity | Main purpose |
| --- | --- |
| `familyMembers` | Household roster, roles, PINs, preferences, allowance settings, photo metadata |
| `allowanceEnvelopes` | Member-owned balance buckets |
| `allowanceTransactions` | Ledger rows for deposits, withdrawals, transfers, and setup |
| `calendarItems` | Household events and recurring event overrides |
| `chores` | Recurring or one-off chores, including reward metadata |
| `choreAssignments` | Rotation order for rotating chores |
| `choreCompletions` | Per-member, per-date completion rows |
| `taskSeries` | Multi-step plans tied to a member and optionally to a chore |
| `tasks` | Individual checklist nodes inside a series |
| `taskAttachments` | File metadata attached to tasks |
| `unitDefinitions` | Shared formatting for currencies and custom units |
| `settings` | Shared app settings like enabled currencies and family photo URLs |
| `exchangeRates` | Cached conversion data used by web finance |
| `calculatedAllowancePeriods` | Present in schema but not meaningfully used today |
| `deviceSessions` | Present in schema but not materially used by the current runtime device-session flow |

Other schema entities like `timeOfDayDefinitions` and `todos` exist, but I did not find meaningful product surfaces using them right now.

## Authentication, Activation, And Session Model

This area affects almost every screen in the app.

### Core model

The app effectively uses three layers of identity:

1. Device authorization
2. Instant principal authorization (`kid` or `parent`)
3. Selected family member for household UX

Those layers are related but not identical.

### Web activation and auth flow

Relevant files:

- `app/activate/page.tsx`
- `components/auth/DeviceActivationForm.tsx`
- `app/api/device-activate/route.ts`
- `components/InstantFamilySessionProvider.tsx`
- `components/AuthProvider.tsx`
- `components/auth/LoginModal.tsx`
- `components/auth/useInstantPrincipalSwitching.ts`
- `lib/instant-principal-storage.ts`

Current behavior:

- Web device activation is cookie-based.
- `POST /api/device-activate` validates `DEVICE_ACCESS_KEY` and sets `family_device_auth=true`.
- The `/activate` route redirects home if the cookie is already valid.
- After activation, the web app bootstraps an Instant session through `InstantFamilySessionProvider`.
- The provider prefers a cached parent principal only when parent mode was already unlocked and a cached token exists.
- Otherwise it ensures the `kid` principal and later elevates to `parent` only when needed.

### Web login behavior

Current web login is a family-member picker, not email/password auth.

- `LoginModal` queries `familyMembers`, displays avatars, and lets the user pick a member.
- Child accounts can log in immediately if no PIN is set.
- Child accounts with a PIN verify the hash locally when possible, with a server-side hash fallback.
- Parent login requires parent principal elevation through `/api/instant-auth-parent-token`.
- Parent mode can be marked as "shared device", which enables automatic timeout and demotion behavior.
- `AuthProvider` stores the selected family-member id in local storage and can auto-logout after one hour unless "remember me" is enabled.

### Web parent mode and principal switching

The web app separates:

- selected current family member
- active Instant principal

That means:

- a child selection normally runs on the `kid` principal
- a parent selection must elevate the principal to `parent`
- logging out or timing out a shared-device parent session explicitly demotes the principal back to `kid`

Shared-device parent state is persisted in local storage:

- cached kid token
- cached parent token
- parent unlocked flag
- shared-device flag
- last parent activity timestamp
- preferred principal

### iPhone activation and auth flow

Relevant files:

- `mobile/app/_layout.js`
- `mobile/app/index.js`
- `mobile/app/activate.js`
- `mobile/app/lock.js`
- `mobile/src/providers/DeviceSessionProvider.js`
- `mobile/src/providers/InstantPrincipalProvider.js`
- `mobile/src/providers/FamilyAuthProvider.js`
- `mobile/src/providers/AppProviders.js`
- `app/api/mobile/device-activate/route.ts`
- `app/api/mobile/device-session/refresh/route.ts`
- `app/api/mobile/device-session/revoke/route.ts`
- `app/api/mobile/config/route.ts`
- `app/api/mobile/instant-auth-token/route.ts`
- `app/api/mobile/instant-auth-parent-token/route.ts`
- `lib/device-auth-server.ts`

Current behavior:

- iPhone activation is bearer-token based, not cookie-based.
- `POST /api/mobile/device-activate` validates the access key and issues a signed device session token.
- `DeviceSessionProvider` loads the token from device storage, refreshes it on launch and on foreground resume, and clears it when the server rejects it.
- `mobile/app/_layout.js` fetches server config first, then initializes Instant with the app id and optional API/WebSocket URIs.
- The lock screen is the family-member selector and PIN gate for mobile.
- Parent login uses server-backed elevation.
- Child login reuses or restores the kid principal.

### iPhone shared-device parent mode

Mobile has a similar concept to web shared-device parent mode:

- parent unlock state is stored separately from the current family-member selection
- parent shared-device sessions track last activity
- inactivity demotes the session back to kid mode
- the More tab and admin subscreens use `useParentActionGate` to interrupt navigation and request parent elevation when needed

## Dashboard And App Shell

This is a real product surface, not just framing around the app.

### Web shell

Relevant files:

- `app/layout.tsx`
- `components/MainNav.tsx`
- `components/auth/UserMenu.tsx`
- `components/SyncStatusBadge.tsx`
- `components/NavbarDate.tsx`
- `components/CalendarHeaderControls.tsx`
- `components/PwaServiceWorkerRegistration.tsx`
- `components/debug/DebugTimeWidget.tsx`

The global web shell currently provides:

- a persistent header
- main navigation between dashboard, chores, calendar, task series, finance, allowance distribution, and settings
- current date plus route-specific calendar settings and filters in the header when `/calendar` is active
- sync status derived from browser online state plus Instant connection state
- a user menu that reflects parent mode and shared-device timeout state
- PWA service worker registration
- a development-only time-travel widget

### Web dashboard

Relevant files:

- `app/page.tsx`
- `components/dashboard/WebFamilyDashboard.tsx`

The web dashboard is a live household overview, not just a landing page.

It queries:

- `familyMembers`
- `allowanceEnvelopes`
- `unitDefinitions`
- `chores`
- `calendarItems`
- task series through nested chore data

It computes:

- per-member combined balances
- daily XP
- chores due today
- overdue chores
- recently completed chores
- upcoming task-series work
- upcoming calendar items

It also renders a rotating beatitudes quote block, which is a real UI detail but not an architectural dependency.

### iPhone dashboard

Relevant files:

- `mobile/app/(tabs)/dashboard.js`

The iPhone dashboard is more action-oriented than the web dashboard.

It supports:

- selecting which family member to view
- moving across a short date strip
- seeing per-member balances and XP
- viewing due chores and task-series work
- toggling chore completion directly from the dashboard
- opening attachment links and task links

This means mobile dashboard behavior overlaps both chores and task series, not just "home."

### Demo widget route

Relevant files:

- `app/childwidget/page.tsx`
- `components/dashboard/ChildWidget.tsx`

`/childwidget` is currently a static demo route with hardcoded sample data. It is useful as a design/prototype surface but it is not wired to live app data.

## Family Administration And Settings

This area covers both household administration and shared app-level settings.

### Web settings

Relevant files:

- `app/settings/page.tsx`
- `components/FamilyMembersList.tsx`
- `components/CurrencySettings.tsx`
- `app/actions.ts`
- `lib/photo-urls.ts`

Current web settings behavior:

- parent-gated
- shows family members ordered by `order`
- uses `FamilyMembersList` in always-edit mode
- supports member creation, editing, deletion, and drag reordering
- supports roles and PIN hashing
- supports profile photo uploads with generated `64`, `320`, and `1200` variants
- supports family photo storage via the `settings` row `familyPhotoUrls`
- can internally compute balance and XP summaries from shared data when needed
- exposes simple enabled-currency toggles through the `settings` row `enabledCurrencies`

### Mobile settings and family administration

Relevant files:

- `mobile/app/more/settings.js`
- `mobile/app/more/family-members.js`

Current mobile behavior:

- More > Settings is partly local and partly shared
- theme selection is local to the device
- unit-definition creation is shared through Instant and parent-gated
- server URL can be changed on-device, which forces a reconnect/re-activation path
- More > Family Members is parent-gated and currently functions as a live roster snapshot
- mobile family roster shows roles, PIN state, email, envelope count, and view preferences
- photo editing and drag reordering are still web-first features

### Settings model notes

The `settings` entity is being used as a flexible bucket for shared app-level values. In practice today that includes at least:

- `enabledCurrencies`
- `familyPhotoUrls`

That is simple, but it also means settings are not strongly typed by entity shape in the way core domain data is.

## Files, Attachments, And Media

This is a real subsystem on both web and mobile.

### Core file/storage architecture

Relevant files:

- `app/files/page.tsx`
- `components/FileManager.tsx`
- `app/actions.ts`
- `lib/s3-file-service.ts`
- `app/files/[filename]/route.ts`
- `app/api/mobile/files/route.ts`
- `app/api/mobile/files/presign/route.ts`
- `app/api/mobile/files/[filename]/route.ts`
- `mobile/app/more/files.js`
- `mobile/src/lib/api-client.js`

Current behavior:

- storage is backed by S3-compatible infrastructure, usually MinIO in local/dev setups
- uploads use presigned POSTs
- web file listing uses a server action gated by device auth
- web download/display uses `/files/[filename]`, which returns a 307 redirect to a presigned S3 URL
- mobile file listing uses bearer-auth JSON routes
- mobile file open/download uses a route that returns a presigned URL in JSON because React Native image/file consumers do not reliably follow redirects

### File access differences

Web:

- hidden route from nav, but fully implemented
- gated by device auth cookie in server actions and route handlers
- not explicitly parent-gated in the page component

Mobile:

- exposed from More > Files
- parent-gated
- uses device-session bearer auth

### Task attachments and media

Task attachments are part of the task-series model and connect to the file system.

- `taskAttachments` store metadata and URLs
- mobile dashboard can open task links and attachments
- mobile also has a dedicated presign route for uploading `task-attachment` files

### Avatar and family photo media

Photo handling is another real storage subsystem:

- member profile photos are stored as multiple size variants
- family photo URLs are stored in `settings`
- `lib/photo-urls.ts` chooses the preferred size URL for rendering

## Cross-Cutting Sync, PWA, And Debug Tooling

These are cross-cutting platform and operational concerns that affect multiple features.

### Sync and connectivity

Relevant files:

- `components/SyncStatusBadge.tsx`
- `lib/sync-status.ts`
- `mobile/src/providers/NetworkStatusProvider.js`

Current behavior:

- web sync badge combines browser online/offline state with Instant connection state
- mobile providers track online state and expose it to tabs and admin screens
- many mobile admin screens surface connectivity in status chips

### PWA support

Relevant files:

- `app/layout.tsx`
- `components/PwaServiceWorkerRegistration.tsx`

Current behavior:

- the web app registers `/sw.js` in production
- metadata and viewport are configured for PWA/home-screen installation
- `/activate` exists partly to support installed-device activation flows cleanly

### Debug and testing tools

Relevant files:

- `components/debug/DebugTimeWidget.tsx`
- `lib/time-machine.ts`
- `mobile/app/more/dev-tools.js`

Current behavior:

- web includes a development-only time-machine widget that patches `Date`
- the root layout also injects an early date-patching script before hydration
- mobile More > Dev Tools shows a live session snapshot for simulator/device debugging

These are not business features, but they matter when reasoning about date-sensitive chores, calendar recurrence, and shared-device behavior.

## Detailed Domain Deep Dives

The sections below preserve the full detailed implementation references for allowance and finance, calendar, and chores/task-series inside this one file. The goal is for this document to be comprehensive enough that a future engineer or LLM can work from here without having to reconstruct the app from scattered notes.

## Allowance and Finance System Reference

This document describes the current allowance and finance system across the shared backend model, the web app, and the iPhone app. It is meant to do two jobs at once:

1. Give a human-readable inventory of what the product already does.
2. Give another LLM or engineer enough implementation detail to improve the system without re-discovering the architecture from scratch.

### Scope

This write-up covers:

- Shared backend and data model behavior that powers allowance and finance.
- Web finance and allowance distribution flows.
- iPhone finance and allowance-related screens.
- Important gaps, inconsistencies, and missing features that matter before expanding the system.

This write-up does not try to cover unrelated chores, calendar, or task-series behavior except where those features directly affect allowance calculation.

### High-level Product Model

The app models family money as a lightweight household ledger on top of InstantDB.

- Each `familyMember` can have allowance settings such as amount, currency, recurrence rule, start date, and payout delay.
- Each `familyMember` can have one or more `allowanceEnvelopes`.
- Each envelope stores a denormalized `balances` object keyed by currency or custom unit code.
- Every money movement is supposed to create one or more `allowanceTransactions` rows.
- Chore completions feed allowance distribution. Weighted chores contribute a percentage of the base allowance. Up-for-grabs chores can add either weighted contribution or fixed rewards.
- `unitDefinitions` define how money and custom units are displayed across finance and chore reward UI.

The system is not a classic server-owned banking backend. Most finance mutations are performed directly by web and mobile clients through InstantDB transactions.

### Architecture At A Glance

#### Shared backend/server responsibilities

Relevant files:

- `instant.schema.ts`
- `instant.perms.ts`
- `lib/instant-admin.ts`
- `lib/chore-utils.ts`
- `lib/currency-utils.ts`
- `scripts/backfill-savings-envelopes.js`

#### Web app entry points

Relevant files:

- `app/familyMemberDetail/page.tsx`
- `components/allowance/FamilyAllowanceView.tsx`
- `components/allowance/MemberAllowanceDetail.tsx`
- `components/allowance/*.tsx`
- `app/allowance-distribution/page.tsx`
- `components/dashboard/WebFamilyDashboard.tsx`
- `components/FamilyMembersList.tsx`

#### iPhone app entry points

Relevant files:

- `mobile/app/(tabs)/finance.js`
- `mobile/app/more/allowance-distribution.js`
- `mobile/app/more/settings.js`
- `mobile/src/providers/FamilyAuthProvider.js`
- `mobile/src/hooks/useParentActionGate.js`
- `mobile/src/lib/instant-db.js`

### Shared Backend And Data Model

#### 1. Core entities

The finance system depends on the following InstantDB entities:

| Entity | Purpose | Important fields |
| --- | --- | --- |
| `familyMembers` | Household people and their allowance settings | `allowanceAmount`, `allowanceCurrency`, `allowanceRrule`, `allowanceStartDate`, `allowancePayoutDelayDays`, `lastDisplayCurrency`, `role`, `pinHash` |
| `allowanceEnvelopes` | Buckets of money or custom units owned by one member | `name`, `balances`, `description`, `isDefault`, `goalAmount`, `goalCurrency` |
| `allowanceTransactions` | Ledger rows for deposits, withdrawals, transfers, and envelope creation | `amount`, `currency`, `transactionType`, `description`, `createdAt`, `createdBy`, `createdByFamilyMemberId` |
| `exchangeRates` | Cached currency conversion rates | `baseCurrency`, `targetCurrency`, `rate`, `lastFetchedTimestamp` |
| `unitDefinitions` | Shared display metadata for monetary and non-monetary units | `code`, `name`, `symbol`, `isMonetary`, `symbolPlacement`, `symbolSpacing`, `decimalPlaces` |
| `chores` | Allowance-driving work items | `weight`, `isUpForGrabs`, `rewardType`, `rewardAmount`, `rewardCurrency`, `rrule`, `startDate` |
| `choreCompletions` | Completion records used to decide what has and has not been paid | `completed`, `dateDue`, `dateCompleted`, `allowanceAwarded` |
| `calculatedAllowancePeriods` | Intended cache layer for period calculations | Currently present in schema but not actively used by the app |

#### 2. Important links

The main relationships are:

- `familyMembers -> allowanceEnvelopes`
- `allowanceEnvelopes -> transactions`
- `allowanceTransactions -> envelope`
- `allowanceTransactions -> sourceEnvelope`
- `allowanceTransactions -> destinationEnvelope`
- `familyMembers -> completedChores`
- `choreCompletions -> chore`

This means finance behavior is spread across money data and chore data. Allowance payout is not isolated from the chore model.

#### 3. Permissions and auth rules

`instant.perms.ts` currently establishes these practical rules:

- Family principals can read finance data.
- `allowanceTransactions` are append-only for normal clients.
- Creating an `allowanceTransactions` row requires `data.createdBy == auth.id`.
- Parents can delete allowance transactions. Clients cannot update historical rows.
- `allowanceEnvelopes` are readable by family principals and writable by both parent and kid principals in the current v1 model.
- `familyMembers` are parent-writable, except kid principals can update only a small safe field subset.

The system uses two identities at once:

- An Instant principal (`kid` or `parent`) for database access control.
- A selected `familyMember` identity for household UX and audit context.

On web, finance helpers stamp:

- `createdBy`: the Instant auth user ID
- `createdByFamilyMemberId`: the selected family member stored in local storage

On iPhone, finance actions stamp:

- `createdBy`: the Instant auth user ID
- `createdByFamilyMemberId`: the currently logged-in family member

#### 4. Ledger model versus cached balances

Envelope balances are stored twice:

- As a denormalized `balances` object on each envelope.
- As a replayable ledger in `allowanceTransactions`.

The intended model is: transactions are the audit trail, balances are a convenience cache.

There is a `reconcileEnvelope` helper in `lib/currency-utils.ts` that recomputes balances from transaction history and repairs mismatches, but it is not wired into the UI today. That means balance correctness currently depends on every mutation path updating both the envelope balance and the transaction ledger correctly.

#### 5. What counts as "server" today

There is no dedicated finance REST API or finance-specific Next server action today.

Server/backend behavior for finance is mostly:

- InstantDB schema and permissions.
- Admin utilities in `lib/instant-admin.ts`.
- One admin backfill script, `scripts/backfill-savings-envelopes.js`, that creates default `Savings` envelopes for members missing them.

Finance CRUD is otherwise client-driven from web and mobile.

#### 6. Exchange rate model

Currency conversion exists only in the web app right now.

- Rates are cached in the `exchangeRates` table.
- The web client fetches USD-based rates from Open Exchange Rates.
- The helper can use direct cached rates, compute cross rates through USD, or fall back to stale data.
- There is no dedicated server-owned exchange rate sync job.

### Shared Finance Behavior And Invariants

#### Envelope lifecycle expectations

The product generally assumes each member should have at least one default envelope, usually named `Savings`.

Current behaviors:

- Creating a family member on web also creates a default `Savings` envelope.
- Web finance auto-repairs missing envelopes or missing default flags when loading a member detail screen.
- The admin backfill script can create missing `Savings` envelopes in bulk.
- Mobile does not auto-create an envelope on finance screen entry. It asks the user to create one first.

#### Transaction types currently in use

Across web and mobile, the following transaction types exist or can be created:

- `init`
- `deposit`
- `withdrawal`
- `transfer-in`
- `transfer-out`
- `transfer-in-person`
- `transfer-out-person`

Important nuance:

- Web uses `transfer-in-person` and `transfer-out-person` for member-to-member transfers.
- Mobile uses `transfer-in` and `transfer-out` for all transfers, including cross-member transfers.

That means transaction semantics are not fully normalized across platforms.

#### Allowance calculation model

Allowance payout is derived from chores, not from standalone allowance period rows.

The current rules are:

- Regular weighted chores contribute to `totalWeight` and `completedWeight`.
- Base allowance payout is `completedWeight / totalWeight * allowanceAmount`.
- Up-for-grabs chores with `rewardType === 'weight'` increase `completedWeight` without increasing `totalWeight`.
- Up-for-grabs chores with `rewardType === 'fixed'` accumulate fixed rewards per currency.
- `allowanceAwarded` on `choreCompletions` is the main dedup flag used to avoid paying the same completion twice.

There is no persisted payout-period ledger entity in active use today. The system recalculates periods live from chores and completions whenever the web distribution screen is opened.

### Web App: What Exists Today

#### 1. Main finance surfaces

The web app has two major finance routes:

- `/familyMemberDetail`
  - Detailed per-member finance management.
- `/allowance-distribution`
  - Parent-only allowance payout workflow.

There is also lighter finance visibility on the dashboard:

- `components/dashboard/WebFamilyDashboard.tsx` shows each member's current total envelope balances in summary cards.

#### 2. `/familyMemberDetail` and `FamilyAllowanceView`

`app/familyMemberDetail/page.tsx` is a thin wrapper around `FamilyAllowanceView`.

`FamilyAllowanceView` does the following:

- Queries all family members, all envelopes, and all unit definitions.
- Computes the list of monetary currencies currently in use.
- Renders a member list in the left column.
- Renders `MemberAllowanceDetail` for the selected member.

This screen is basically the web finance hub.

#### 3. Member finance detail screen

`components/allowance/MemberAllowanceDetail.tsx` is the largest and most complete finance UI in the repo.

It supports:

- Viewing a member's total envelope balances.
- Viewing combined balance in a chosen display currency.
- Viewing non-monetary balances alongside converted money totals.
- Automatic default-envelope repair.
- Automatic initial `Savings` envelope creation if a member has no envelopes.
- Creating envelopes.
- Editing envelopes.
- Deleting envelopes.
- Transfer between a member's own envelopes.
- Withdrawal from an envelope.
- Transfer to another family member's default envelope.
- Viewing transaction history.
- Configuring allowance amount, allowance currency, recurrence, start date, and payout delay.
- Creating custom unit definitions from the finance UI.
- Defining envelope savings goals and showing progress toward them.

#### 4. Envelope management on web

The web envelope system is fairly full-featured.

#### Create envelope

Users can create:

- A name
- Optional default status
- Optional goal amount
- Optional goal currency

Creation behavior:

- Web helper creates the envelope row.
- Links it to the family member.
- Creates an `init` transaction row with amount `0`.
- If marked default, older defaults are unset.

#### Edit envelope

Users can update:

- Name
- Default flag
- Goal amount
- Goal currency

The UI prevents nonsensical default-state changes, such as unsetting the only default without naming a replacement.

#### Delete envelope

Web delete is balance-aware.

- The user must choose where remaining funds go.
- If deleting the default envelope, the user must choose a new default.
- Positive balances are transferred into the chosen target envelope before deletion.
- Transfer ledger rows are created for the moved balances.

This is more advanced than mobile delete behavior.

#### 5. Balance display and currency conversion on web

Web has the only true multi-currency aggregation UI today.

`CombinedBalanceDisplay` and the surrounding logic support:

- Original per-currency balance display.
- Choosing a display currency.
- Converting all monetary balances into that currency.
- Keeping non-monetary balances separate.
- Showing a tooltip breakdown of how the combined total was calculated.
- Remembering the selected display currency in `familyMembers.lastDisplayCurrency`.

Exchange-rate behavior:

- Cached rates are loaded from InstantDB.
- If a direct rate is missing, the app can calculate through USD if the needed USD legs exist.
- If needed, the web client fetches fresh rates from Open Exchange Rates and writes them back to `exchangeRates`.

#### 6. Savings goals on web

Each envelope can optionally have:

- `goalAmount`
- `goalCurrency`

The UI:

- Shows the goal on the envelope card.
- Converts all monetary balances into the goal currency.
- Displays percent complete and the value accumulated toward the goal.
- Ignores non-monetary balances for goal calculations.

#### 7. Web transaction history

`TransactionHistoryView` supports:

- Member-only mode
- All-transactions mode
- Currency filtering
- Human-readable type labels and descriptions
- Source and destination envelope context
- Actor attribution from `createdByFamilyMemberId`

There is special logic to suppress duplicate-looking rows in member mode:

- Intra-member transfers create both `transfer-out` and `transfer-in`.
- Member history hides the `transfer-out` row and keeps the `transfer-in` row so the user sees one cleaner transfer entry instead of two.

#### 8. Web money movement actions

Current supported money moves:

- Manual deposit to default envelope
- Withdrawal from a selected envelope
- Transfer between own envelopes
- Transfer to another member
- Allowance payout deposit/withdrawal into default envelope

Implementation pattern:

- Update source and/or destination envelope `balances`
- Create one or two `allowanceTransactions`
- Link the transactions back to the relevant envelopes

#### 9. Web allowance configuration

Parents can configure per member:

- Allowance amount
- Allowance currency
- Recurrence rule
- Start date
- Payout delay days

Notes:

- The recurrence form supports `once`, `daily`, `weekly`, and `monthly`.
- In practice, allowance distribution requires a saved RRULE, so clearing recurrence effectively disables automated period processing for that member.
- Weekly and monthly schedules are built through the shared recurrence form used elsewhere in the app.

#### 10. Web allowance distribution workflow

`app/allowance-distribution/page.tsx` is the most complex allowance screen.

It is parent-gated and does live period computation from:

- family member allowance config
- chores
- chore completions
- envelope data
- unit definitions

The screen does the following:

- Lets the parent choose a simulated date.
- Scans each member with allowance config.
- Builds allowance period boundaries from the member RRULE and start date.
- Applies payout delay days.
- Looks at already-awarded completions to decide where to resume.
- Builds period summaries.
- Shows periods that are either pending or in progress.
- Computes base weighted payout and fixed rewards.
- Allows editing the weighted payout amount per period.
- Allows paying a single period or the full pending total.
- Allows skipping a period without moving money.

#### Period states

A period can appear as:

- `in-progress`
  - Current period has started but is not yet due.
- `pending`
  - Payout due date has arrived or passed.

Only pending periods can actually be processed.

#### What happens on payout

For a given pending period, the web flow:

1. Calculates the final amount to move.
2. Calls `executeAllowanceTransaction(...)`.
3. Marks all covered `choreCompletions` as `allowanceAwarded = true`.

`executeAllowanceTransaction(...)` finds or creates the member's default envelope and then deposits or withdraws the amount there.

#### What happens on skip

Skipping a period does not create a money transaction.

It only marks the covered completions as `allowanceAwarded = true`.

This means "skip" is really "treat as handled without a payout."

### iPhone App: What Exists Today

#### 1. Main finance surfaces on iPhone

The iPhone app currently exposes:

- `Finance` tab
- `More > Allowance Distribution`
- `More > Settings` unit definition management
- Dashboard finance summary card linking into the finance tab

#### 2. Finance tab overview

`mobile/app/(tabs)/finance.js` is the native finance hub.

It loads:

- family members
- allowance envelopes
- unit definitions
- allowance transactions

It then presents:

- family or per-member balance totals
- a member filter chip row
- finance action buttons
- allowance summary cards
- envelope cards
- recent transaction list

#### 3. iPhone balance and member filtering

The tab can show:

- All members combined
- A single selected member

For the visible scope, it shows:

- Total balances inline by currency
- Member-specific envelope lists
- Member-specific or family-wide recent transactions

Unlike web:

- There is no currency conversion layer.
- There is no chosen display currency.
- There is no combined converted total.
- There is no rate cache usage.

#### 4. iPhone permission and parent-elevation behavior

The native app has a stronger explicit "parent action gate" flow than the web app.

Important behavior:

- Parent principal can run all finance actions.
- Kid self-serve users can only run a subset of actions for themselves.
- Deposit and withdraw are parent-only.
- Kid self-serve users can add envelope, delete envelope, and transfer, but only for their own member row.
- When a restricted action is requested, the app stores a pending action and sends the user to the lock screen for parent elevation.
- After successful elevation, the app resumes the pending finance action.

This is handled by:

- `mobile/src/hooks/useParentActionGate.js`
- `mobile/src/providers/FamilyAuthProvider.js`
- finance tab resume logic in `mobile/app/(tabs)/finance.js`

#### 5. iPhone finance actions that exist today

The finance tab currently supports:

- Add envelope
- Delete envelope
- Deposit
- Withdraw
- Transfer

#### Add envelope on iPhone

Current fields:

- name
- description
- default toggle

Not supported in native add-envelope yet:

- savings goal amount
- savings goal currency
- edit existing envelope

Behavior difference from web:

- Mobile add-envelope does not create an `init` transaction row.
- It creates the envelope and links it to the member.
- If it becomes default, older defaults are unset.

#### Delete envelope on iPhone

Current native delete is intentionally simpler than web delete.

- The envelope must already be empty.
- If it is the default and siblings exist, the first sibling becomes default.
- No transfer helper is run during delete.

This is a meaningful product difference from web, where delete can move remaining balances automatically.

#### Deposit on iPhone

Native deposit:

- updates the selected envelope balance
- creates a `deposit` transaction
- links the transaction back to that envelope

#### Withdraw on iPhone

Native withdraw:

- validates available funds in the selected currency
- updates envelope balance
- creates a `withdrawal` transaction
- links the transaction back to that envelope

#### Transfer on iPhone

Native transfer:

- can move funds between any two envelopes in the family, including cross-member transfers
- creates paired `transfer-out` and `transfer-in` rows
- updates both envelopes

Important nuance:

- There is no separate native "transfer to person" flow.
- Cross-member transfers are just transfers between envelopes.
- Because of that, mobile never creates `transfer-in-person` or `transfer-out-person`.

#### 6. Allowance visibility on iPhone

The native finance tab shows allowance summary cards per visible member.

It currently surfaces:

- configured allowance amount
- recurrence summary
- allowance start date
- payout delay
- total value already sitting in envelopes

It does not currently let the user edit allowance configuration from the native finance tab.

#### 7. Envelope display on iPhone

Envelope cards show:

- envelope name
- description
- default badge
- current balances
- savings goal label if a goal already exists in the data

Important limitation:

- Native UI can display goal info if present, but native finance does not currently provide goal editing.

#### 8. Transaction list on iPhone

The native finance tab shows the latest 20 transactions for the selected scope.

It currently supports:

- sign and tone styling for positive and negative amounts
- human-readable type labels
- source or destination envelope context
- description text
- filtering by currently selected member scope

It does not currently support:

- transaction pagination
- transaction currency filtering
- transaction search
- transaction type filters

#### 9. Native allowance distribution screen

`mobile/app/more/allowance-distribution.js` is a preview-only screen.

What it does:

- Parent-only access
- Loads family members and their envelopes
- Shows which members appear "ready" for payout setup
- Displays amount, recurrence label, and envelope count

What it does not do:

- calculate actual allowance periods
- calculate weighted payout amounts
- create payout transactions
- mark completions awarded
- edit payout amounts
- skip periods

The file itself explicitly describes the screen as a preview while the full execution workflow is still being ported.

#### 10. Native settings support for finance-related data

`mobile/app/more/settings.js` exposes parent-only unit definition management.

That means native users can already create and review:

- shared currencies
- points
- stars
- other custom reward units

This shared catalog affects both:

- finance display and data entry
- chore reward display

### Current Feature Parity Summary

| Capability | Web | iPhone |
| --- | --- | --- |
| View balances by member | Yes | Yes |
| View balances for all members | Indirectly via dashboard and finance lists | Yes |
| Combined converted total | Yes | No |
| Exchange-rate cache and conversion | Yes | No |
| Add envelope | Yes | Yes |
| Edit envelope | Yes | No |
| Delete envelope with automatic transfer of remaining funds | Yes | No |
| Delete empty envelope | Yes | Yes |
| Set default envelope | Yes | Yes |
| Envelope savings goals | Yes, editable | Visible if present, not editable |
| Manual deposit | Yes | Yes |
| Manual withdraw | Yes | Yes |
| Transfer between own envelopes | Yes | Yes |
| Transfer to another member | Yes, dedicated flow | Yes, but only as generic envelope transfer |
| Transaction history filtering | Yes, currency filter | No |
| Allowance config editing | Yes | No |
| Allowance distribution preview | Yes | Yes |
| Allowance distribution execution | Yes | No |
| Custom unit creation from finance-adjacent UI | Yes | Yes, via Settings |

### Important Gaps, Risks, And Mismatches

These are the most important implementation notes for anyone improving this area.

#### 1. No dedicated finance backend service

Most money movement is performed directly from clients through InstantDB transactions.

That means:

- business rules are duplicated across web and iPhone
- transaction shape can drift between platforms
- there is no single server-owned source of truth for payout orchestration

#### 2. `calculatedAllowancePeriods` exists but is unused

The schema has a `calculatedAllowancePeriods` entity, but the current app does not persist or consume it.

Practical result:

- payout periods are recalculated live every time
- there is no durable record of "this period was reviewed, paid, or skipped"
- allowance processing is inferred mostly from `allowanceAwarded` flags on chore completions

#### 3. Web payout execution is not atomic with completion marking

In web allowance distribution, the app:

- posts money first
- then marks completions as awarded in a separate write

If the second step fails after the first succeeds, a retry can produce duplicate payout behavior.

#### 4. Web distribution only truly pays the primary-currency fixed rewards

The web payout screen can display fixed rewards in other currencies, but the write path currently processes only:

- edited weighted amount
- plus fixed rewards in the member's primary allowance currency

The file explicitly notes that fixed rewards in other currencies are ignored for the primary transaction. The UI text suggests those other currencies matter, but they are not actually deposited before completions are marked awarded.

This is one of the biggest current gaps.

#### 5. Cross-platform transaction type mismatch

Web member-to-member transfers use:

- `transfer-out-person`
- `transfer-in-person`

Mobile member-to-member transfers use:

- `transfer-out`
- `transfer-in`

This complicates:

- analytics
- transaction history normalization
- shared reporting
- future backend reconciliation

#### 6. Envelope creation is inconsistent between web and iPhone

Web envelope creation helpers create an `init` transaction row.

Mobile add-envelope does not.

This means transaction history completeness depends on which client created the envelope.

#### 7. Delete-envelope behavior is inconsistent between web and iPhone

Web:

- allows delete with automatic transfer of positive balances to another envelope

iPhone:

- requires the envelope to be emptied first

This is not necessarily wrong, but it is different product behavior that should be treated as a deliberate decision, not an accident.

#### 8. Exchange-rate fetch is client-owned

The web client fetches exchange rates directly and writes them into the database.

That has several consequences:

- no centralized scheduled refresh
- no guaranteed freshness window beyond client usage
- the API integration is not server-owned

#### 9. No pagination in transaction-heavy views

Both platforms load recent or full transaction sets without a robust paging strategy.

This is fine for a small family dataset but will become a scaling issue if transaction history grows.

#### 10. Native finance is still behind web finance

The biggest missing native capabilities are:

- allowance configuration editing
- allowance payout execution
- exchange-rate conversion
- transaction filtering
- envelope editing
- goal editing
- dedicated transfer-to-person UX

#### 11. Some planned finance helpers exist but are not productized

`lib/currency-utils.ts` contains logic or comments for:

- `reconcileEnvelope`
- `distributeAllowance` by percentages
- `canInitiateTransaction`

These are useful signals for future direction, but they are not the current product path.

### Best Entry Points For Future Improvements

If a future LLM needs to improve this area, these are the fastest files to inspect first.

#### Shared/backend first

- `instant.schema.ts`
- `instant.perms.ts`
- `lib/currency-utils.ts`
- `lib/chore-utils.ts`

#### Web first

- `components/allowance/MemberAllowanceDetail.tsx`
- `app/allowance-distribution/page.tsx`
- `components/allowance/TransactionHistoryView.tsx`
- `components/allowance/AddEditEnvelopeForm.tsx`
- `components/allowance/TransferToPersonForm.tsx`

#### iPhone first

- `mobile/app/(tabs)/finance.js`
- `mobile/app/more/allowance-distribution.js`
- `mobile/src/hooks/useParentActionGate.js`
- `mobile/src/providers/FamilyAuthProvider.js`

### Existing Tests Worth Reading Before Changing Finance

Useful tests already present:

- `test/unit/lib/currency-utils-core.node.test.ts`
- `test/unit/lib/currency-utils-mutations.node.test.ts`
- `test/unit/lib/currency-utils-audit.dom.test.ts`
- `test/dom/components/AllowanceForms.dom.test.tsx`
- `test/dom/components/TransactionHistoryView.dom.test.tsx`
- `test/dom/components/FamilyAllowanceView.dom.test.tsx`
- `e2e/family-allowance-smoke.spec.ts`
- `test/FEATURE_TEST_MATRIX.md`

These tests already cover a lot of the expected helper behavior and will save time when making changes.

### Bottom Line

The current system is already a meaningful household finance product, especially on the web:

- multi-envelope balances
- multi-currency display
- transaction history
- savings goals
- parent-managed allowance schedules
- chore-driven allowance payouts

The system is not yet a fully unified finance platform across surfaces.

Today, the web app is the source of truth for advanced finance behavior, while the iPhone app is a strong but partial native port. The backend is mostly a shared data model and permission layer, not a central finance orchestration service.

## Calendar System Overview

This document describes the current calendar implementation across the data layer, the web app, and the iPhone app. It is meant to be useful in two ways:

- Human-readable product inventory: what the app can and cannot do today.
- Engineering map for future LLMs or developers: where the logic lives, how recurrence works, and which files matter when making changes.

This document is based on the current code, not on older README claims. When the code and the README disagree, trust the code.

### Scope and boundaries

The app has more than one calendar-like surface:

- Main event calendar on the web: `app/calendar/page.tsx` and `components/Calendar.tsx`
- Main event calendar on iPhone: `mobile/app/(tabs)/calendar.js`
- Chore assignment preview calendar: `components/ChoreCalendarView.tsx`

The first two are the real event calendar. `ChoreCalendarView` is a separate chore preview widget and is not the same system as the event calendar.

### High-level architecture

There is no dedicated server-side calendar service. The calendar is primarily a client-side InstantDB feature.

- Data lives in the InstantDB `calendarItems` entity.
- The web app uses `@instantdb/react` via `lib/db.ts`.
- The iPhone app uses `@instantdb/react-native` through the mobile app session provider.
- Calendar recurrence expansion is done client-side in the web app.
- Calendar CRUD is done client-side on both web and mobile.
- The server side mainly contributes schema, permissions, auth/device/session plumbing, and one admin backfill script.

Important consequence: if you are changing calendar behavior, most of the real logic is in client components, not in API routes.

### Source-of-truth files

These are the most important calendar files:

- Data model: `instant.schema.ts`
- Permissions: `instant.perms.ts`
- Web Instant client: `lib/db.ts`
- Calendar header state/event bus: `lib/calendar-controls.ts`
- Chore assignment helper used by calendar overlays: `lib/chore-utils.ts`
- Web calendar route: `app/calendar/page.tsx`
- Web calendar renderer and drag/drop engine: `components/Calendar.tsx`
- Web event editor and recurrence editor: `components/AddEvent.tsx`
- Recurrence scope dialog: `components/RecurrenceScopeDialog.tsx`
- Web day cell drop target: `components/DroppableDayCell.tsx`
- Web event chip: `components/DraggableCalendarEvent.tsx`
- Web route header controls: `components/CalendarHeaderControls.tsx`
- Calendar styles: `styles/Calendar.module.css`
- iPhone calendar screen: `mobile/app/(tabs)/calendar.js`
- Admin metadata repair script: `scripts/backfill-calendar-events.js`
- Calendar DOM tests: `test/dom/components/Calendar.dom.test.tsx`
- Add-event DOM tests: `test/dom/components/AddEvent.dom.test.tsx`
- Event-chip DOM tests: `test/dom/components/DraggableCalendarEvent.dom.test.tsx`
- Header-controls DOM tests: `test/dom/components/CalendarHeaderControls.dom.test.tsx`
- Live permissions smoke: `test/live/instant-perms-live.node.test.ts`
- Web calendar Playwright smoke: `e2e/calendar-event-regression.spec.ts`

### Data model: `calendarItems`

The event system is stored in a single InstantDB entity: `calendarItems`.

#### Core event fields

| Field | Meaning | Notes |
|---|---|---|
| `title` | Event title | Required |
| `description` | Event notes | Optional |
| `startDate` | Start timestamp or date | Timed events use ISO datetime strings; all-day events use `YYYY-MM-DD` |
| `endDate` | End timestamp or date | All-day events use exclusive end dates |
| `isAllDay` | All-day vs timed | Controls parsing, recurrence, rendering, and transparency defaults |
| `year` / `month` / `dayOfMonth` | Indexed start-date mirror fields | Used for month-based querying |
| `pertainsTo` | Many-to-many link to `familyMembers` | Empty means the event applies to everyone |

#### Recurrence and series fields

| Field | Meaning | Notes |
|---|---|---|
| `rrule` | Main recurrence rule | Stored as an RRULE string |
| `rdates` | Extra included dates | Stored as an array of recurrence tokens |
| `exdates` | Excluded dates | Stored as an array of recurrence tokens |
| `recurrenceLines` | ICS-like recurrence lines | Usually contains `RRULE:...`, `RDATE:...`, `EXDATE:...` |
| `recurringEventId` | Parent/master event id | Present on override rows |
| `recurrenceId` | Original occurrence being overridden | Critical for moved/split overrides |
| `recurrenceIdRange` | Recurrence range metadata | Present in schema and form, lightly used today |
| `xProps` | Extra recurrence UI metadata | Used to round-trip date ranges for exceptions and one-off additions |

#### Metadata fields

| Field | Meaning | Notes |
|---|---|---|
| `uid` | Stable external-style event identifier | Defaults to row id or derived override id |
| `sequence` | Revision counter | Incremented on many edits |
| `status` | Event status | Usually `confirmed`, `tentative`, or `cancelled` |
| `timeZone` | Time zone label | Stored but not deeply enforced |
| `createdAt` / `updatedAt` / `dtStamp` / `lastModified` | Calendar metadata timestamps | Web and mobile both stamp these |
| `eventType` / `visibility` / `transparency` | Display/sync metadata | Stored and preserved, but not heavily surfaced in UI |
| `alarms` | Alarm metadata array | Stored by the web editor; there is no delivery engine in this repo |
| `travelDurationBeforeMinutes` / `travelDurationAfterMinutes` | Travel metadata | Stored and preserved |

#### Fields present in schema but not materially surfaced today

These fields exist in the schema but I did not find meaningful UI or renderer usage in the main calendar:

- `attendees`
- `conferenceData`
- `organizer`
- `priority`
- `url`

Those are more like future-proof metadata fields right now than fully implemented features.

### All-day event semantics

All-day events use exclusive end dates across the system.

Example:

- A one-day all-day event on March 15 is stored as:
  - `startDate = 2026-03-15`
  - `endDate = 2026-03-16`

This is important because:

- The web editor adds one day to the chosen all-day end date before saving.
- The mobile editor does the same.
- Multi-day rendering logic depends on this exclusive-end convention.

Timed events use ISO datetime strings and keep their real end timestamps.

### Recurrence model

The web app has a fairly sophisticated recurrence system. The mobile app does not currently match it.

#### How recurrence is represented

Recurring series use a master event row plus optional override rows.

- The master row has `rrule` and optional `rdates` / `exdates`.
- Override rows usually have:
  - `recurringEventId = <master id>`
  - `recurrenceId = <original occurrence slot>`
  - no `rrule`

This means:

- The master row generates ordinary occurrences.
- Override rows replace or move specific occurrences.
- `recurrenceId` tells the renderer which generated occurrence should be suppressed.

#### Why `recurrenceLines` and `xProps` both exist

The system stores recurrence data in multiple shapes:

- `rrule`, `rdates`, and `exdates` are the main structured storage.
- `recurrenceLines` stores ICS-like lines and is used as a compatibility/helper representation.
- `xProps.recurrenceExceptionRows` and `xProps.recurrenceRdateRows` preserve range-based UI state that flat `EXDATE` and `RDATE` token arrays cannot represent cleanly.

That layered storage is a real implementation detail, not redundancy by accident.

### Permissions and server-side responsibilities

#### Permissions

`instant.perms.ts` makes `calendarItems` parent-mutable:

- Family principals can view calendar items.
- Parents can create, update, delete, link, and unlink calendar items.
- Kids cannot write calendar items.

There is already a live permissions smoke test covering this:

- Kid create should fail.
- Parent create/delete should succeed.

#### What the server does not do

There is no custom Next.js calendar CRUD API route. Calendar CRUD does not flow through a server controller.

The server-side calendar responsibilities are mainly:

- shipping the schema
- shipping the permissions
- minting auth/session state used by the clients
- running one admin repair script

#### Admin repair script

`scripts/backfill-calendar-events.js` backfills missing metadata on existing rows.

It repairs or normalizes:

- `uid`
- `status`
- `createdAt`
- `updatedAt`
- `dtStamp`
- `lastModified`
- `sequence`
- `timeZone`
- `eventType`
- `visibility`
- `transparency`
- `rrule`
- `rdates`
- `exdates`
- `recurrenceLines`
- `alarms`

It runs as a dry run by default and writes only when called with `--apply`.

### Web app calendar

#### Route shape

The web calendar route is simple:

- `app/calendar/page.tsx` renders `components/Calendar.tsx`

The complexity lives in the component, not the route.

#### What the web calendar currently does

The web calendar is the most complete calendar implementation in the repo. It supports:

- scrollable multi-week table view
- Gregorian and Bikram Samvat labeling
- sticky month header with animated month transitions
- variable day-cell height
- variable visible-week density
- "Today" jump
- quick-add modal opening
- family-member event filtering
- default-off chore overlays with member and specific-chore filtering
- create/edit/delete event modal
- recurring event creation and editing
- recurring delete scopes
- drag/drop rescheduling
- recurring drag/drop scopes
- optimistic UI updates
- same-week single-block rendering for multi-day events

#### Header controls

`components/CalendarHeaderControls.tsx` controls the main calendar route through window custom events.

Available controls:

- Settings popover
  - day height slider
  - visible weeks slider
  - default-off "show chores on calendar" toggle
- Filter popover
  - everyone toggle
  - per-member selection
  - select all / none behavior
  - when chore overlays are visible, a collapsible "Specific chores" section
  - per-chore select all / none behavior
- Today button
- Add Event button

State and commands are coordinated through `lib/calendar-controls.ts`.

That event bus now carries density, visible-week count, the persisted show-chores toggle, the member filter state, and the optional specific-chore selection state.

This is a lightweight route-specific event bus, not React context.

#### Query model on the web

The web calendar queries `calendarItems` plus the `pertainsTo` relation. It also queries `chores` with `assignees` and dated `assignments.familyMember` links so the renderer can synthesize chore overlays when that toggle is enabled.

The query intentionally includes three categories of rows:

1. events whose indexed start month is inside the buffered visible range
2. recurring masters with non-null `rrule`
3. override rows whose `recurrenceId` month prefix matches the visible range

That third category matters because moved overrides may now live on a different visible date than the original occurrence they replace. The renderer still needs them in memory so it can suppress the original generated occurrence.

#### Rendering pipeline on the web

The web renderer does these major steps:

1. Fetch raw `calendarItems` and `chores`.
2. Merge in optimistic local event changes.
3. Apply member filtering to calendar events.
4. Build a suppression map from override rows.
5. Expand recurring masters into visible occurrences.
6. If chore overlays are enabled, walk the visible days, compute assigned members for each chore on that date, apply the member filter plus the optional specific-chore filter, and inject synthetic all-day chore items.
7. Split visible items into:
   - single-day items for cell rendering
   - multi-day week-local segments for span-row rendering
8. Sort same-day items by start time.
9. Assign multi-day segments to lanes using a greedy interval-coloring pass.

Joint and up-for-grabs chores follow the same member-filter rule as other chore overlays: if any assigned member survives the active member filter, the chore is shown.

#### Multi-day rendering on the web

Multi-day rendering is now week-aware.

- If an occurrence spans more than one calendar day, the renderer does not draw the event chip separately in every day cell.
- Instead, it slices the event into week-local segments.
- Each week gets one or more extra rows under the main week row.
- Each segment is rendered as one block using `colSpan`.

Lane assignment is done greedily:

- sort by start column
- tie-break by longer span first
- place each segment into the first lane that is free before the segment start
- otherwise open a new lane

This is the right mental model if someone later needs to improve packing or visual ordering.

#### Day cells and event chips

Important rendering files:

- `components/DroppableDayCell.tsx`
- `components/DraggableCalendarEvent.tsx`

Current web event chips show:

- title
- audience badges based on `pertainsTo`

When chore overlays are enabled, they reuse the same chip component and badge layout. They render in a separate color, carry `calendarItemKind: 'chore'`, and deliberately skip drag behavior.

Current web event chips do not show much of the richer metadata inline:

- no inline time label on the month chip
- no inline location
- no inline description
- no attendee/conference UI

#### Drag/drop behavior on the web

Drag/drop is powered by Atlaskit pragmatic drag-and-drop.

- Events are draggable.
- Day cells are drop targets.
- Simple non-recurring moves patch the event directly.

Recurring drag/drop has scope choices:

- `single`
- `following`
- `all`

There are also keyboard shortcuts while dragging:

- `Alt` means "only this event"
- `Shift` means "all events" if dragging the original occurrence, otherwise "this and following"

The UI shows a floating drag indicator while those modifiers are held.

#### Add/edit modal on the web

The web event editor is `components/AddEvent.tsx`.

It supports:

- title
- description
- status
- time zone
- location
- all-day toggle
- start/end date
- start/end time for timed events
- family-member linking via `pertainsTo`
- recurrence presets and custom recurrence editing
- raw RRULE editing
- date and range exceptions
- date and range one-off inclusions
- recurrence end conditions
- advanced recurrence metadata fields
- alarm metadata
- travel metadata
- delete for both ordinary and recurring events

#### Recurrence editing on the web

The web editor has three major recurring-edit behaviors.

#### Edit only this occurrence

When editing one occurrence of a recurring series:

- the master gets an added exclusion for that occurrence
- a new override row is created
- the override carries the edited event data
- the override stores:
  - `recurringEventId = master id`
  - `recurrenceId = original occurrence slot`

#### Edit this and following

When editing from the middle of a series:

- the old master gets capped with `UNTIL`
- the series is split
- a new master row is created for the edited occurrence and everything after it
- later override rows may be reparented to the new series
- stored exception/rdate range metadata in `xProps` is split as well

If the edit is on the first occurrence, there is no split. The series is simply updated in place.

#### Edit all events

When editing from the first occurrence and choosing "all":

- the existing master row is updated in place

Override edits are special:

- if the selected row is already an override, the editor preserves its recurrence linkage instead of treating it like a new master recurrence definition

#### Delete behavior on the web

Recurring delete also has scope-aware behavior.

#### Delete only this occurrence

- the master gets an added `EXDATE`
- if the selected row is already an override, that override row is deleted too

#### Delete this and following

- if deleting from the first occurrence, the whole series is deleted
- otherwise the master series is capped before the chosen occurrence
- future override rows for that series are deleted

#### Delete all events

- the master row is deleted
- related override rows are deleted

#### Recurrence scope dialog

`components/RecurrenceScopeDialog.tsx` is shared by edit, drag, and delete flows.

It can offer:

- `Only this event`
- `This and following events`
- `This and all following events`
- `All events`

Which second option appears depends on whether the selected occurrence is treated as the first/original occurrence of the series.

#### Optimistic behavior on the web

The web calendar closes the modal quickly and applies optimistic local merges for smoother UI.

Important detail:

- `components/Calendar.tsx` keeps an `optimisticItemsById` map.
- It merges optimistic rows with server rows.
- It later removes optimistic entries once the server version is judged equivalent enough.

Important save-path detail in `AddEvent.tsx`:

- the save path first writes a "legacy/basic" payload
- then best-effort writes the richer metadata patch

This means a base event can succeed even if some extended metadata patch later fails. That is an intentional compatibility strategy in the current implementation.

#### Web UX details that are worth knowing

- The calendar is not a classic fixed month view; it is a scrollable week table with expanding memory windows.
- The sticky month box is derived from the currently visible day markers, not from a route parameter.
- Family member filters treat empty `pertainsTo` as "everyone" events.
- Chore overlays are default-off, persisted locally, and filtered by both the member filter and an optional per-chore selection list.
- The web route currently has no explicit parent-only UI gate on add/edit/delete controls. Permissions still prevent kid writes, but the UI does not appear to hide those affordances ahead of time.

That last point is a real behavior difference from the iPhone app.

### iPhone app calendar

#### Screen shape

The iPhone calendar is `mobile/app/(tabs)/calendar.js`.

It is a real screen, not a placeholder. It supports:

- month navigation
- real month grid
- Bikram Samvat day labels
- per-day event dots
- selected-day event list
- parent-gated add/edit/delete modal
- all-day and timed events

The mobile screen is much simpler than the web calendar and should be thought of as a partial implementation, not parity.

#### What the iPhone calendar currently does

- Builds a 42-day month grid, Sunday-first
- Queries `calendarItems` for the months touched by the visible grid
- Shows small dots in day cells for events on that day
- Shows the selected day's events in a detail panel below the grid
- Lets parents create or edit simple event rows
- Lets parents delete an event row
- Lets kids view events, but routes editing attempts through parent-login handoff

#### Parent gating on iPhone

The mobile calendar has better UI-level permission handling than the web route.

- It reads `principalType` from the mobile app session.
- Parents can edit directly.
- Kids are shown read-only states.
- If a kid tries to add/edit/delete, the screen triggers a parent handoff flow through `useParentActionGate`.
- After parent login, the screen can resume the pending calendar action.

#### Mobile save behavior

The mobile modal exposes a much smaller edit surface:

- title
- description
- all-day toggle
- start date
- end date
- start time and end time for timed events

Under the hood, the mobile save path also preserves or stamps extra metadata like:

- `status`
- `uid`
- `sequence`
- `location`
- `timeZone`
- `rrule`
- `rdates`
- `exdates`
- `recurrenceLines`
- `recurrenceId`
- `recurringEventId`
- `recurrenceIdRange`
- `alarms`
- `eventType`
- `visibility`
- `transparency`
- travel durations

But those fields are mostly not editable from the mobile UI today. The mobile screen preserves them more than it truly manages them.

#### What the iPhone calendar does not currently do

The iPhone calendar does not currently match the web calendar in several important ways.

- No recurrence UI
- No recurrence expansion engine
- No recurring edit scope dialog
- No recurring delete scope dialog
- No drag/drop
- No family-member filter
- No `pertainsTo` editing UI
- No audience badges
- No week-spanning multi-day block renderer
- No alarm editor
- No travel editor
- No location/status/time-zone editor surface
- No attendee/conference UI

#### Most important mobile limitation: recurrence is not really implemented

The mobile file stores and preserves recurrence-related metadata, but it does not implement the web recurrence model.

Specifically:

- It queries rows by visible start months only.
- It does not fetch all recurring masters the way the web app does.
- It does not expand `rrule` occurrences into concrete visible items.
- It does not suppress generated occurrences with override logic.
- It does not split or reparent recurring series.

So, in practice, recurrence is currently a web feature. Mobile mostly preserves recurrence-related fields when editing existing rows, but it does not behave like the web recurrence engine.

#### Most important mobile limitation: multi-day rendering is simpler

Mobile multi-day events are recognized by overlap with a day:

- day cells show dots
- selected-day list shows the event on each overlapping day

But there is no "single block across the week" presentation like the web calendar now has.

### Feature comparison: web vs iPhone

| Feature | Web | iPhone |
|---|---|---|
| View type | Scrollable multi-week table | Fixed month grid with selected-day detail panel |
| Gregorian labels | Yes | Yes |
| Bikram Samvat labels | Yes | Yes |
| Sticky current-month display | Yes | No |
| Settings for density/day height | Yes | No |
| Member filter | Yes | No |
| Main-calendar chore overlays | Yes, default-off | No |
| Specific chore filter | Yes, when chores are visible | No |
| Create basic all-day events | Yes | Yes |
| Create basic timed events | Yes | Yes |
| Edit basic title/date/time | Yes | Yes |
| Delete event rows | Yes | Yes |
| Recurrence UI | Yes | No |
| Recurrence expansion | Yes | No |
| Recurring scope dialog | Yes | No |
| Drag/drop rescheduling | Yes | No |
| Drag recurring with scope choices | Yes | No |
| Multi-day single-block rendering by week | Yes | No |
| `pertainsTo` editing | Yes | No |
| Inline audience display | Yes | No |
| Alarm metadata editing | Yes | No |
| Travel metadata editing | Yes | No |
| UI-level parent gating | No, perms enforce writes | Yes, parent handoff flow |

### Calendar-related things the product docs currently overstate

Some high-level docs describe more than the current code actually delivers.

The biggest examples:

- README and CLAUDE notes describe chores or task overlays in the main calendar.
- The current main web calendar can render chore overlays, but only behind a default-off toggle and only for chores, not task-series work.
- The current iPhone calendar still renders `calendarItems` only, not chore overlays.
- The repo does have `components/ChoreCalendarView.tsx`, but that is a separate chore preview component.

If someone asks an LLM to improve the "calendar overlays" feature, the first step is to confirm whether they mean:

- the main web event calendar with optional chore overlays
- the iPhone calendar, which still has no chore overlays
- the chore preview calendar
- or a future task-series overlay that does not currently exist in the main calendar code

### Testing status

#### Web coverage that exists

There is meaningful web calendar test coverage:

- `test/dom/components/Calendar.dom.test.tsx`
  - modal opening
  - drag/drop
  - recurrence expansion basics
  - recurrence drag scope behavior
  - member filtering
  - chore overlay visibility
  - chore member filtering, including joint and up-for-grabs cases
  - specific chore filtering
  - recurring-masters query behavior
- `test/dom/components/AddEvent.dom.test.tsx`
  - all-day create
  - timed edit
  - recurrence rule building
  - exception and one-off date range handling
  - recurring edit scopes
  - recurring delete scopes
  - override editing
- `test/dom/components/CalendarHeaderControls.dom.test.tsx`
  - human-readable filter summary states
  - default-off show-chores toggle
  - specific-chore filter expansion plus select all / select none behavior
- `test/dom/components/DraggableCalendarEvent.dom.test.tsx`
  - drag metadata for event rows
  - shared non-draggable chip rendering for chore overlays
- `e2e/calendar-event-regression.spec.ts`
  - env-gated smoke for parent create/edit of an all-day event
- `test/live/instant-perms-live.node.test.ts`
  - kid cannot create calendar items
  - parent can create/delete calendar items

#### Mobile coverage that I found

I did not find dedicated automated tests for the iPhone calendar screen comparable to the web calendar DOM tests.

That means:

- the mobile calendar is less protected against regression
- mobile/web parity gaps are easier to introduce accidentally

### Things that are implemented as metadata only

These concepts exist in storage or form state but are not fully realized as end-user product features across the app:

- alarms
- travel durations
- recurrence sync metadata fields
- attendees
- conference data
- organizer
- priority
- URL

The web editor can store some of these, but I did not find downstream rendering, device scheduling, or external sync behavior that turns them into a complete end-user feature.

### Things the calendar does not currently have

Across the full product, I did not find current implementation for:

- Google Calendar sync
- Apple Calendar sync
- CalDAV sync
- ICS import/export
- agenda/day/week/year views
- search
- categories or color-coded calendars
- server-side alarm scheduling
- a dedicated calendar backend service
- mobile parity for recurrence editing
- main-calendar task-series overlays in the current event calendar code

### Best starting points for future improvements

If a future LLM or developer is asked to improve the calendar, these are the best entry points:

#### Event data model or permissions

- `instant.schema.ts`
- `instant.perms.ts`
- `scripts/backfill-calendar-events.js`
- `test/live/instant-perms-live.node.test.ts`

#### Web rendering, scrolling, filters, and drag/drop

- `components/Calendar.tsx`
- `components/DroppableDayCell.tsx`
- `components/DraggableCalendarEvent.tsx`
- `components/CalendarHeaderControls.tsx`
- `styles/Calendar.module.css`
- `test/dom/components/Calendar.dom.test.tsx`

#### Web event editor and recurrence logic

- `components/AddEvent.tsx`
- `components/RecurrenceScopeDialog.tsx`
- `test/dom/components/AddEvent.dom.test.tsx`

#### iPhone calendar improvements

- `mobile/app/(tabs)/calendar.js`

If mobile recurrence parity is ever a goal, the best long-term direction would be to extract recurrence parsing and expansion into shared utilities instead of keeping web-only recurrence logic embedded inside `components/Calendar.tsx` and `components/AddEvent.tsx`.

### Practical summary

If you want the simplest accurate summary:

- The web calendar is the real calendar product today.
- Main-calendar chore overlays are currently web-only and opt-in.
- The iPhone calendar is a good basic month-view CRUD screen, but it is not feature-parity with the web calendar.
- The server side does not own calendar logic beyond schema, permissions, auth plumbing, and admin maintenance.
- Recurrence is currently a web-first feature.
- Multi-day week-span rendering is currently a web-only feature.
- Some schema fields are already there for future calendar richness, but many of them are still metadata-only.

## Chores and Task Series: Current Implementation Guide

### Purpose

This document describes the **current real implementation** of the chores system and the task-series system across:

- InstantDB / shared backend logic
- the Next.js web app
- the Expo / iPhone app

It is meant to be useful in two ways:

- **Human-readable**: you can scan it to see what the app currently does and does not do.
- **LLM-friendly**: another model should be able to use this as a working spec and know where to look before making changes.

This document is intentionally descriptive, not aspirational. If something is only partially implemented, that is called out explicitly.

### High-Level Architecture

- **Database**: InstantDB is the source of truth.
- **Web app**: mostly client-side `db.useQuery(...)` plus direct `db.transact(...)` writes.
- **iPhone app**: also queries/writes Instant directly from the client, with some server routes for device auth and file access.
- **Server layer**: there is **no dedicated chores/task-series CRUD API**. The server mostly handles auth/session bootstrapping and file signing/serving.
- **Shared logic**:
  - chore/date/XP helpers exist in both [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts) and [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts)
  - task-series scheduling logic lives in [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts)

### Important Architectural Warning

There are two big duplication points:

- **Chore assignment / XP logic is duplicated** between [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts) and [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts).
- **Task-series status logic is duplicated** between the web manager in [`components/task-series/TaskSeriesManager.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesManager.tsx) and the mobile summary screen in [`mobile/app/more/task-series.js`](/Users/david/development/family-organizer/mobile/app/more/task-series.js).

Any improvement to scheduling, rotation, XP, or status logic should check both places.

### Canonical Data Model

The schema lives in [`instant.schema.ts`](/Users/david/development/family-organizer/instant.schema.ts).

#### Chore-related entities

- `chores`
  - core fields actually used now:
    - `title`
    - `description`
    - `startDate`
    - `rrule`
    - `rotationType`
    - `weight`
    - `isUpForGrabs`
    - `isJoint`
    - `rewardType`
    - `rewardAmount`
    - `rewardCurrency`
  - links:
    - `assignees` -> `familyMembers`
    - `assignments` -> `choreAssignments`
    - `completions` -> `choreCompletions`
    - `taskSeries` -> `taskSeries`

- `choreAssignments`
  - used only for rotating chores
  - fields:
    - `order`
  - links:
    - `familyMember`
    - `chore`

- `choreCompletions`
  - the real completion record; the `chores.done` field is not the authoritative completion source
  - fields:
    - `completed`
    - `dateDue`
    - `dateCompleted`
    - `allowanceAwarded`
  - links:
    - `completedBy`
    - `markedBy`
    - `chore`

#### Task-series entities

- `taskSeries`
  - core fields actually used now:
    - `name`
    - `description`
    - `startDate`
    - `targetEndDate`
    - `updatedAt`
    - `createdAt`
    - `dependsOnSeriesId` (status logic reads it; editor does not expose it)
  - links:
    - `familyMember`
    - `scheduledActivity` -> chore
    - `tasks`

- `tasks`
  - fields actually used now:
    - `text`
    - `order`
    - `indentationLevel`
    - `isDayBreak`
    - `isCompleted`
    - `completedAt`
    - `completedOnDate`
    - `childTasksComplete`
    - `notes`
    - `specificTime` (preserved in duplicate logic, not actively edited in UI)
    - `overrideWorkAhead` (same)
  - links:
    - `parentTask`
    - `subTasks`
    - `attachments`
    - `taskSeries`

- `taskAttachments`
  - fields:
    - `name`
    - `type`
    - `url`
    - `createdAt`
    - `updatedAt`

#### Family-member fields used by chores/task series

- `role`
- `pinHash`
- `viewShowChoreDescriptions`
- `viewShowTaskDetails`
- allowance-related fields are used indirectly because chore completions feed allowance calculations

#### Schema fields that exist but are not meaningfully surfaced yet

These are worth knowing because they suggest planned functionality, but the current UI does not really implement them:

- on `chores`:
  - `advanceCompletionLimit`
  - `allowExtraDays`
  - `area`
  - `canCompleteInAdvance`
  - `canCompletePast`
  - `difficultyRating`
  - `dueTimes`
  - `endDate`
  - `imageUrl`
  - `isPaused`
  - `pastCompletionLimit`
  - `recurrenceRule` (the app uses `rrule`, not this)
- on `taskSeries`:
  - `workAheadAllowed`
  - `breakType`
  - `breakStartDate`
  - `breakDelayValue`
  - `breakDelayUnit`
- on `tasks`:
  - `specificTime`
  - `overrideWorkAhead`
  - `prerequisites` / `subsequentTasks` link exists in schema, but current task-series editor/scheduler does not use it

### Permissions and Roles

Permissions live in [`instant.perms.ts`](/Users/david/development/family-organizer/instant.perms.ts).

- `chores`, `choreAssignments`, and `taskSeries` are **parent-mutable**.
  - family principals can view
  - only parents can create/update/delete
- `choreCompletions`, `tasks`, and `taskAttachments` are **family-mutable**.
  - this means kids can mark chores/tasks done and can create task completion metadata
- `familyMembers` can be updated by kids only for a small safe subset:
  - `lastDisplayCurrency`
  - `viewShowChoreDescriptions`
  - `viewShowTaskDetails`
- UI gating mirrors this:
  - web chore create/edit/delete is parent-only
  - web task-series pages are behind [`ParentGate.tsx`](/Users/david/development/family-organizer/components/auth/ParentGate.tsx)
  - mobile task-series manager view is parent-gated via [`useParentActionGate.js`](/Users/david/development/family-organizer/mobile/src/hooks/useParentActionGate.js)

### Shared Chore Semantics

#### Date model

- Chore due dates are normalized to UTC day keys.
- Mobile uses `localDateToUTC(...)` so “today” means the user’s local day represented as UTC midnight.
- Web chore code also normalizes heavily to UTC midnight.

#### One-time vs recurring chores

- If a chore has no `rrule`, it is only due on its `startDate`.
- If it has an `rrule`, the app checks whether that recurrence occurs on the selected UTC date.

#### Rotation

- Rotation is only active when:
  - `rotationType !== 'none'`
  - there are `choreAssignments`
  - the chore is **not** `isUpForGrabs`
- Rotation types currently supported:
  - `daily`
  - `weekly`
  - `monthly`
- Assignment order is determined by sorting `choreAssignments` by `order`.
- Rotating chores effectively choose one assignee for a due date.

#### Up-for-grabs chores

- Up-for-grabs chores ignore rotation.
- They are available to all direct assignees on a due date.
- First completed assignee “claims” the chore for that date.
- Other assignees are blocked from completing it once claimed.
- Reward modes:
  - `rewardType = 'weight'`: contributes weight/XP-style value
  - `rewardType = 'fixed'`: contributes a fixed amount/currency to allowance logic

#### Joint chores

- `isJoint` is a display/interpretation flag for multi-assignee chores.
- It changes the copy shown in the web list (“with X”).
- It does **not** create a separate shared completion object; completions are still recorded per member.

#### Chore completion records

- A completion is scoped by:
  - chore
  - assignee (`completedBy`)
  - `dateDue`
- A separate `markedBy` link records who clicked/toggled it.
- This allows “I marked my sibling’s chore” without losing who the chore was completed for.

#### XP calculation

Current XP rules, implemented in both chore helper files:

- fixed-reward chores contribute **0 XP**
- zero-weight chores contribute **0 XP**
- standard chores:
  - positive weight adds to `possible`
  - completion adds to `current`
- up-for-grabs chores:
  - if unclaimed, positive weight is possible for all assignees
  - if claimed, the completer gets the possible/current value
- negative weights are allowed and count toward `current`, but do not add to `possible`

#### Allowance calculation

Allowance logic lives mainly in [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts).

Current behavior:

- normal recurring chores contribute to `totalWeight`
- completed normal chores contribute to `completedWeight`
- up-for-grabs chores do **not** add to `totalWeight`
- up-for-grabs weighted chores do add to `completedWeight`
- up-for-grabs fixed chores accumulate into a per-currency fixed-reward map
- completions can later be marked `allowanceAwarded = true`

This means allowance is already connected to chores, but the chore CRUD screens themselves are not the main allowance UI.

### Shared Task-Series Semantics

#### Core scheduling model

Task-series behavior is driven by [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts).

The current model is a **rolling queue**, not a simple “task N belongs to fixed date N” system.

#### How a series is structured

- Tasks are stored as a flat ordered list.
- Hierarchy is represented by:
  - `indentationLevel`
  - `parentTask` links
- `isDayBreak = true` inserts a boundary between daily blocks.

#### Anchor-date behavior

The task queue anchors to:

- `today`, or
- the series `startDate`,

whichever is later.

This is important:

- **past dates** show only tasks completed on that historical date
- **today / anchor day** shows the current first remaining block
- **future dates** project remaining blocks onto future scheduled chore occurrences

#### Day-break behavior

- Tasks before the first day break are “block 0”
- next segment is “block 1”, etc.
- leading “ghost” breaks after already-completed tasks are trimmed
- trailing breaks are trimmed so they do not create empty phantom future days

#### Interaction with chore schedule

- Task-series scheduling depends on the linked chore’s recurrence.
- If the chore is not scheduled for a future date, `getTasksForDate(...)` returns an empty list for that date.
- If the anchor day is not itself a scheduled occurrence, block 0 stays visible until the next scheduled occurrence.

#### Series start date

- `taskSeries.startDate` can delay when that queue begins showing up even if the chore itself already exists.

#### Active-range behavior

`isSeriesActiveForDate(...)` is used to decide whether a series should be considered active on a date.

A series is active only when:

- the linked chore is scheduled on that date, and
- the date falls between the projected first and last real task dates

#### Completion propagation

`getRecursiveTaskCompletionTransactions(...)` does two things:

- toggles the selected task’s `isCompleted`, `completedAt`, and `completedOnDate`
- bubbles `childTasksComplete` up to ancestors so parent/group rows know whether their subtree is done

#### Progress calculation

`getTaskSeriesProgress(...)` computes a ratio from **actionable leaf tasks only**.

- parent/header rows are excluded if they have scheduled children
- if there are no actionable tasks, progress is `null`

### Web App: Current Chores Features

The main web chores UI is [`components/ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx), routed from [`app/chores/page.tsx`](/Users/david/development/family-organizer/app/chores/page.tsx).

#### What the web chores page can do

- show chores for:
  - all family members
  - one selected member
- choose a date with a date carousel
- create chores (parent only)
- edit chores (parent only)
- delete chores (parent only)
- save two per-member view preferences:
  - show chore descriptions
  - show task details
- display assignee avatars with:
  - completion state
  - partial task-series progress ring
  - celebratory sparkles for positive chores
  - lightning effect for negative-weight chores
- toggle chore completion per assignee
- block up-for-grabs completion if someone else already claimed the chore
- show task-series labels inline on chores when active
- embed task-series checklists directly under chores

#### What the web chores page does not do

- it does **not** currently expose a real chore “calendar mode”
  - `viewMode` exists, but the actual alternate calendar view is effectively not implemented
- it does **not** support time-of-day chores
- it does **not** support end-date / pause / resume workflows in the UI
- it does **not** expose schema fields like “complete in advance” or “allow extra days”

#### Chore form behavior

The detailed chore form lives in [`components/DetailedChoreForm.tsx`](/Users/david/development/family-organizer/components/DetailedChoreForm.tsx).

Supported fields:

- title
- description
- start date
- recurrence
  - once
  - daily
  - weekly
  - monthly
- assignees
- joint chore toggle
- rotating assignee toggle
  - daily/weekly/monthly rotation
  - reorderable rotation order
- up-for-grabs toggle
- reward mode
  - weight
  - fixed amount + currency

It also includes a live **assignment preview** using [`components/ChoreCalendarView.tsx`](/Users/david/development/family-organizer/components/ChoreCalendarView.tsx).

#### Chore-list behavior worth preserving

The rendering and completion logic is in [`components/ChoreList.tsx`](/Users/david/development/family-organizer/components/ChoreList.tsx).

Important details:

- if a chore has a linked task series, clicking the avatar to complete the chore checks whether visible actionable tasks are still incomplete
- if tasks remain incomplete, the user gets a guardrail dialog:
  - “mark all done and complete”
  - or cancel
- up-for-grabs chores disable other assignees after one completion
- in single-member view, joint chores show “with X”
- task-series details can be globally shown or locally expanded per task

#### Known web chores implementation quirks

- chore deletion in [`ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx) deletes the `chores` entity, but does **not** explicitly delete linked `choreAssignments` or `choreCompletions`
- the `chores.done` field exists in schema but is not the real source of truth
- some logic uses [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts) while other parts of the app use [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts)

### Web App: Current Task-Series Features

#### Manager page

The manager lives in [`components/task-series/TaskSeriesManager.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesManager.tsx), routed from [`app/task-series/page.tsx`](/Users/david/development/family-organizer/app/task-series/page.tsx).

Current manager features:

- parent-only access
- list all series
- sort by `updatedAt` descending on the client
- status filters:
  - all
  - draft
  - pending
  - in progress
  - archived
- multi-select
- select all
- single delete
- bulk delete
- duplicate series
- open existing series
- create new series

#### Status meaning in the web manager

- `draft`
  - missing assignee or missing linked chore
- `pending`
  - blocked by dependency not archived yet, or effective start date is in the future
- `in_progress`
  - assigned and linked, not fully archived, and currently active
- `archived`
  - all real tasks are complete, and the series is effectively finished

The web manager is the most complete status implementation in the repo.

#### Duplicate behavior

Duplicate currently:

- copies:
  - name with “(copy)”
  - description
  - start / target end dates
  - some extra series fields
  - tasks as new records
  - indentation level
  - notes
- resets:
  - completion state
  - dependency link
  - assignee link
  - scheduled activity link
- does **not** rebuild parent-task links during the duplication transaction
- does **not** copy attachments

#### Editor

The editor lives in [`components/task-series/TaskSeriesEditor.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesEditor.tsx), routed from:

- [`app/task-series/new/page.tsx`](/Users/david/development/family-organizer/app/task-series/new/page.tsx)
- [`app/task-series/[seriesId]/page.tsx`](/Users/david/development/family-organizer/app/task-series/[seriesId]/page.tsx)

Current editor features:

- autosaves to Instant with debounce
- works for both new and existing series
- edits metadata:
  - name
  - description
  - assignee
  - linked chore
  - start date
  - target end date
- TipTap-based task editing
- indentation-based hierarchy
- drag-and-drop reordering with horizontal indentation control
- slash-command support
- keyboard shortcuts
- day breaks
- live date column showing projected dates/labels
- task metadata popover for notes and attachments
- file upload to S3-backed storage

#### Task editor commands and shortcuts

Defined in [`components/task-series/taskSeriesCommands.tsx`](/Users/david/development/family-organizer/components/task-series/taskSeriesCommands.tsx).

Current commands:

- `Task Details`
  - slash command
  - shortcut: `Mod-Alt-Enter`
- `Day Break`
  - slash command
  - shortcut: `Mod-Alt-B`

Additional keyboard behavior:

- `Enter` creates a new task item
- `Tab` / outdent logic adjusts indentation
- `Ctrl-Alt-,` and `Ctrl-Alt-.` navigate the task-details popover between adjacent tasks

#### Task metadata popover

The metadata popover lives in [`components/task-series/TaskDetailsPopover.tsx`](/Users/david/development/family-organizer/components/task-series/TaskDetailsPopover.tsx).

Current features:

- edit notes with debounce autosave
- upload attachments
- delete attachments
- navigate between task details panels
- preserve/restore selection
- use server-signed upload URLs from [`app/actions.ts`](/Users/david/development/family-organizer/app/actions.ts)

#### Embedded checklist behavior

The checklist renderer is [`components/TaskSeriesChecklist.tsx`](/Users/david/development/family-organizer/components/TaskSeriesChecklist.tsx).

Current behavior:

- builds a visible tree from scheduled tasks plus their ancestors
- auto-marks visible header/context rows complete in interactive mode
- treats headers differently from actionable rows
- supports notes and attachment previews inline
- allows per-task local “view details” expansion when the global setting is off
- supports read-only mode for past dates

### Web App: Dashboard-Level Chore/Task-Series Features

The root dashboard is [`components/dashboard/WebFamilyDashboard.tsx`](/Users/david/development/family-organizer/components/dashboard/WebFamilyDashboard.tsx), routed from [`app/page.tsx`](/Users/david/development/family-organizer/app/page.tsx).

This is **read-only summary UI**, not the main editing surface.

Current behavior:

- computes per-member:
  - chores due today
  - overdue chores
  - chores completed today
  - task-series items due soon
  - XP today
  - next chore preview
  - next task-series preview
- scans a date window to build these summaries
- links out to `/chores`, `/task-series`, `/calendar`, and `/familyMemberDetail`

This is useful context, but if an LLM is asked to change chore or task-series behavior, the real feature work usually belongs elsewhere.

### iPhone App: Current Chores Features

#### Chores tab

The main native chores screen is [`mobile/app/(tabs)/chores.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/chores.js).

Current features:

- top-strip status indicators for:
  - online/offline
  - Instant connection
  - current principal mode
- switch-user action
- date chooser
- family filter
- saved view toggles for:
  - chore descriptions
  - task details
- daily XP cards
- due-chore list
- per-member completion buttons
- up-for-grabs lockout messaging
- “Mark Visible Done” bulk action

Important note:

- the mobile chores tab **does not render task series at all**
- it also does **not** create/edit/delete chores

#### What the mobile chores tab does not do

- no native chore form
- no native chore editing
- no native chore deletion
- no rotation/joint/up-for-grabs configuration UI
- no task-series checklist beneath chores
- no inline task notes/attachments on this screen
- `viewShowTaskDetails` is stored, but on this screen it currently has no visible task-series effect because task series are not rendered here

### iPhone App: Current Task-Series Features

#### Today / dashboard tab

The main mobile place where task-series work actually appears is [`mobile/app/(tabs)/dashboard.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/dashboard.js).

Current dashboard task-series features:

- member-specific day view
- renders scheduled task-series cards for the selected member and date
- computes scheduled tasks using the shared root scheduler
- shows visible ancestor/header rows plus actionable tasks
- allows task completion toggles
- shows inline notes
- extracts links from:
  - task text
  - task notes
  - attachments
- opens links/attachments externally
- uses the mobile presigned-file endpoint when attachment URLs are S3 keys

This is the strongest native task-series surface today.

#### More > Task Series screen

Native task-series manager summary lives in [`mobile/app/more/task-series.js`](/Users/david/development/family-organizer/mobile/app/more/task-series.js).

Current features:

- parent-only access
- status filters
- status pill per series
- series cards showing:
  - assignee
  - linked chore
  - progress
  - updated date
  - target date

Current limitations:

- no create
- no edit
- no delete
- no duplicate
- no open-series drill-in editor
- status logic is simpler than web and can drift

#### Mobile task-series parity summary

What mobile has:

- viewing scheduled task-series items on dashboard
- toggling tasks complete on dashboard
- viewing notes and attachment links on dashboard
- parent-only status summary screen

What mobile does not have:

- native task-series editor
- native metadata editor
- native attachment uploader for task series
- native duplicate/delete manager actions
- native dependency editing

### Server / Backend Portion

#### What is actually server-side here

For chores and task series, the server mostly provides infrastructure, not domain CRUD:

- InstantDB schema and permissions
- device-auth-protected file access
- S3 presigned upload/download support

#### File support for task attachments

Relevant files:

- [`app/actions.ts`](/Users/david/development/family-organizer/app/actions.ts)
- [`app/files/[filename]/route.ts`](/Users/david/development/family-organizer/app/files/[filename]/route.ts)
- [`app/api/mobile/files/[filename]/route.ts`](/Users/david/development/family-organizer/app/api/mobile/files/[filename]/route.ts)
- [`app/api/mobile/files/route.ts`](/Users/david/development/family-organizer/app/api/mobile/files/route.ts)

Current behavior:

- web uploads use a server-generated presigned POST
- web file views use a 307 redirect to a presigned object URL
- mobile fetches JSON containing a presigned URL because React Native components do not reliably follow the redirect flow

#### What is not server-side

- there is no `POST /api/chores`
- there is no `POST /api/task-series`
- there is no server-owned scheduling job for task-series queues
- there is no server-owned chore assignment endpoint

Most business logic runs on the client or in shared utilities.

### Current “Have / Don’t Have” Summary

#### Chores: clearly implemented

- recurring and one-time chores
- rotation by assignee order
- up-for-grabs chores
- joint-chore labeling
- per-day completion records
- marked-by audit trail
- XP calculation
- allowance integration
- web create/edit/delete
- web assignment preview
- native due-chore list and native completion toggles

#### Chores: partial or missing

- no strong cleanup on chore delete
- no end-date / pause UI
- no time-of-day UI
- no advance/past completion policy UI
- no mobile create/edit/delete
- no real alternate chore calendar view on web chores page

#### Task series: clearly implemented

- series manager on web
- web series editor
- ordered task queue with day breaks
- projected date labels
- inline hierarchy
- task notes and attachments
- web checklist rendering inside chores
- mobile dashboard display of due task-series items
- task completion bubbling to parents

#### Task series: partial or missing

- dependency field exists, but editor does not expose it
- cross-series dependency scheduling is not implemented
- no real work-ahead UI despite schema hints
- break configuration fields exist but are not meaningfully surfaced
- mobile manager is summary-only
- no mobile editor
- duplicate does not fully preserve all structure/attachments

### Best File Map for Future Work

If another model is asked to improve this area, these are the most important files to read first.

#### Backend / data model

- [`instant.schema.ts`](/Users/david/development/family-organizer/instant.schema.ts)
- [`instant.perms.ts`](/Users/david/development/family-organizer/instant.perms.ts)

#### Shared logic

- [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts)
- [`packages/shared-core/src/date.ts`](/Users/david/development/family-organizer/packages/shared-core/src/date.ts)
- [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts)
- [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts)
- [`lib/task-series-progress.ts`](/Users/david/development/family-organizer/lib/task-series-progress.ts)

#### Web chores

- [`components/ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx)
- [`components/ChoreList.tsx`](/Users/david/development/family-organizer/components/ChoreList.tsx)
- [`components/DetailedChoreForm.tsx`](/Users/david/development/family-organizer/components/DetailedChoreForm.tsx)
- [`components/TaskSeriesChecklist.tsx`](/Users/david/development/family-organizer/components/TaskSeriesChecklist.tsx)
- [`components/ui/ToggleableAvatar.tsx`](/Users/david/development/family-organizer/components/ui/ToggleableAvatar.tsx)

#### Web task series

- [`components/task-series/TaskSeriesManager.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesManager.tsx)
- [`components/task-series/TaskSeriesEditor.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesEditor.tsx)
- [`components/task-series/TaskItem.tsx`](/Users/david/development/family-organizer/components/task-series/TaskItem.tsx)
- [`components/task-series/TaskDetailsPopover.tsx`](/Users/david/development/family-organizer/components/task-series/TaskDetailsPopover.tsx)
- [`components/task-series/taskSeriesCommands.tsx`](/Users/david/development/family-organizer/components/task-series/taskSeriesCommands.tsx)

#### Web dashboard overview

- [`components/dashboard/WebFamilyDashboard.tsx`](/Users/david/development/family-organizer/components/dashboard/WebFamilyDashboard.tsx)

#### iPhone app

- [`mobile/app/(tabs)/chores.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/chores.js)
- [`mobile/app/(tabs)/dashboard.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/dashboard.js)
- [`mobile/app/more/task-series.js`](/Users/david/development/family-organizer/mobile/app/more/task-series.js)
- [`mobile/src/lib/api-client.js`](/Users/david/development/family-organizer/mobile/src/lib/api-client.js)
- [`mobile/src/hooks/useParentActionGate.js`](/Users/david/development/family-organizer/mobile/src/hooks/useParentActionGate.js)

#### Tests worth checking after changes

- [`test/unit/lib/chore-utils-date-logic.node.test.ts`](/Users/david/development/family-organizer/test/unit/lib/chore-utils-date-logic.node.test.ts)
- [`test/unit/packages/shared-core-chores.node.test.ts`](/Users/david/development/family-organizer/test/unit/packages/shared-core-chores.node.test.ts)
- [`test/unit/lib/task-scheduler-date-logic.node.test.ts`](/Users/david/development/family-organizer/test/unit/lib/task-scheduler-date-logic.node.test.ts)
- [`test/unit/lib/task-series-progress.node.test.ts`](/Users/david/development/family-organizer/test/unit/lib/task-series-progress.node.test.ts)
- [`test/dom/components/ChoreList.dom.test.tsx`](/Users/david/development/family-organizer/test/dom/components/ChoreList.dom.test.tsx)
- [`test/dom/components/DetailedChoreForm.dom.test.tsx`](/Users/david/development/family-organizer/test/dom/components/DetailedChoreForm.dom.test.tsx)
- [`test/dom/components/TaskSeriesChecklist.dom.test.tsx`](/Users/david/development/family-organizer/test/dom/components/TaskSeriesChecklist.dom.test.tsx)
- [`test/dom/components/TaskSeriesManager.dom.test.tsx`](/Users/david/development/family-organizer/test/dom/components/TaskSeriesManager.dom.test.tsx)
- [`test/dom/components/TaskSeriesEditor.dom.test.tsx`](/Users/david/development/family-organizer/test/dom/components/TaskSeriesEditor.dom.test.tsx)
- [`e2e/chore-create-regression.spec.ts`](/Users/david/development/family-organizer/e2e/chore-create-regression.spec.ts)

### Short Version

If you only remember a few things:

- chores are direct Instant records with completion rows per assignee/day
- task series are rolling queues projected onto chore recurrence dates
- web has the real editor/manager
- iPhone currently has strong read/use flows, but weak admin/edit flows
- chore logic and task-series status logic each have duplication points that can drift

## Current Big-Picture Risks And Gaps

Across the whole app, the biggest structural themes are:

1. Most product logic is still client-owned, so consistency depends heavily on shared helpers and permissions rather than server-owned workflows.
2. Some important business logic is duplicated across web/mobile or shared/web implementations.
3. Mobile parity is improving, but calendar, finance, and family-admin flows are still not fully aligned with web.
4. Several schema entities or fields appear to be forward-looking rather than fully productized today.
5. Settings and media flows are real subsystems, not just side features.

## Best File Map For Future Work

### Auth and session

- `components/InstantFamilySessionProvider.tsx`
- `components/AuthProvider.tsx`
- `components/auth/LoginModal.tsx`
- `components/auth/useInstantPrincipalSwitching.ts`
- `mobile/src/providers/DeviceSessionProvider.js`
- `mobile/src/providers/InstantPrincipalProvider.js`
- `mobile/src/providers/FamilyAuthProvider.js`
- `lib/device-auth-server.ts`

### Dashboard and shell

- `app/layout.tsx`
- `components/MainNav.tsx`
- `components/dashboard/WebFamilyDashboard.tsx`
- `mobile/app/(tabs)/dashboard.js`

### Chores and task series

- `lib/chore-utils.ts`
- `packages/shared-core/src/chores.ts`
- `lib/task-scheduler.ts`
- `components/ChoresTracker.tsx`
- `components/task-series/*`
- `mobile/app/(tabs)/chores.js`
- `mobile/app/more/task-series.js`

### Calendar

- `components/Calendar.tsx`
- `components/AddEvent.tsx`
- `components/RecurrenceScopeDialog.tsx`
- `mobile/app/(tabs)/calendar.js`

### Finance

- `components/allowance/*`
- `lib/currency-utils.ts`
- `app/familyMemberDetail/page.tsx`
- `app/allowance-distribution/page.tsx`
- `mobile/app/(tabs)/finance.js`
- `mobile/app/more/allowance-distribution.js`

### Settings, files, and media

- `components/FamilyMembersList.tsx`
- `components/CurrencySettings.tsx`
- `app/actions.ts`
- `components/FileManager.tsx`
- `lib/s3-file-service.ts`
- `mobile/app/more/settings.js`
- `mobile/app/more/family-members.js`
- `mobile/app/more/files.js`

## Bottom Line

Family Organizer today is made of six major layers:

1. auth, activation, and principal switching
2. dashboard and shell
3. chores and task series
4. calendar
5. allowance and finance
6. settings, family admin, files, and media

If you are making changes in this repo, it is worth checking both the domain section you care about and the auth/session layer, because most non-trivial features depend on both.
