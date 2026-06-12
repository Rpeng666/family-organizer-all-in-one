# Allowance and Finance System Reference

This document describes the current allowance and finance system across the shared backend model, the web app, and the iPhone app. It is meant to do two jobs at once:

1. Give a human-readable inventory of what the product already does.
2. Give another LLM or engineer enough implementation detail to improve the system without re-discovering the architecture from scratch.

## Scope

This write-up covers:

- Shared backend and data model behavior that powers allowance and finance.
- Web finance and allowance distribution flows.
- iPhone finance and allowance-related screens.
- Important gaps, inconsistencies, and missing features that matter before expanding the system.

This write-up does not try to cover unrelated chores, calendar, or task-series behavior except where those features directly affect allowance calculation.

## High-level Product Model

The app models family money as a lightweight household ledger on top of InstantDB.

- Each `familyMember` can have allowance settings such as amount, currency, recurrence rule, start date, and payout delay.
- Each `familyMember` can have one or more `allowanceEnvelopes`.
- Each envelope stores a denormalized `balances` object keyed by currency or custom unit code.
- Every money movement is supposed to create one or more `allowanceTransactions` rows.
- Chore completions feed allowance distribution. Weighted chores contribute a percentage of the base allowance. Up-for-grabs chores can add either weighted contribution or fixed rewards.
- `unitDefinitions` define how money and custom units are displayed across finance and chore reward UI.

The system is not a classic server-owned banking backend. Most finance mutations are performed directly by web and mobile clients through InstantDB transactions.

## Architecture At A Glance

### Shared backend/server responsibilities

Relevant files:

- `instant.schema.ts`
- `instant.perms.ts`
- `lib/instant-admin.ts`
- `lib/chore-utils.ts`
- `lib/currency-utils.ts`
- `scripts/backfill-savings-envelopes.js`

### Web app entry points

Relevant files:

- `app/familyMemberDetail/page.tsx`
- `components/allowance/FamilyAllowanceView.tsx`
- `components/allowance/MemberAllowanceDetail.tsx`
- `components/allowance/*.tsx`
- `app/allowance-distribution/page.tsx`
- `components/dashboard/WebFamilyDashboard.tsx`
- `components/FamilyMembersList.tsx`

### iPhone app entry points

Relevant files:

- `mobile/app/(tabs)/finance.js`
- `mobile/app/more/allowance-distribution.js`
- `mobile/app/more/settings.js`
- `mobile/src/providers/FamilyAuthProvider.js`
- `mobile/src/hooks/useParentActionGate.js`
- `mobile/src/lib/instant-db.js`

## Shared Backend And Data Model

### 1. Core entities

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

### 2. Important links

The main relationships are:

- `familyMembers -> allowanceEnvelopes`
- `allowanceEnvelopes -> transactions`
- `allowanceTransactions -> envelope`
- `allowanceTransactions -> sourceEnvelope`
- `allowanceTransactions -> destinationEnvelope`
- `familyMembers -> completedChores`
- `choreCompletions -> chore`

This means finance behavior is spread across money data and chore data. Allowance payout is not isolated from the chore model.

### 3. Permissions and auth rules

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

### 4. Ledger model versus cached balances

Envelope balances are stored twice:

- As a denormalized `balances` object on each envelope.
- As a replayable ledger in `allowanceTransactions`.

The intended model is: transactions are the audit trail, balances are a convenience cache.

There is a `reconcileEnvelope` helper in `lib/currency-utils.ts` that recomputes balances from transaction history and repairs mismatches, but it is not wired into the UI today. That means balance correctness currently depends on every mutation path updating both the envelope balance and the transaction ledger correctly.

### 5. What counts as "server" today

There is no dedicated finance REST API or finance-specific Next server action today.

Server/backend behavior for finance is mostly:

- InstantDB schema and permissions.
- Admin utilities in `lib/instant-admin.ts`.
- One admin backfill script, `scripts/backfill-savings-envelopes.js`, that creates default `Savings` envelopes for members missing them.

Finance CRUD is otherwise client-driven from web and mobile.

### 6. Exchange rate model

Currency conversion exists only in the web app right now.

- Rates are cached in the `exchangeRates` table.
- The web client fetches USD-based rates from Open Exchange Rates.
- The helper can use direct cached rates, compute cross rates through USD, or fall back to stale data.
- There is no dedicated server-owned exchange rate sync job.

## Shared Finance Behavior And Invariants

### Envelope lifecycle expectations

The product generally assumes each member should have at least one default envelope, usually named `Savings`.

Current behaviors:

- Creating a family member on web also creates a default `Savings` envelope.
- Web finance auto-repairs missing envelopes or missing default flags when loading a member detail screen.
- The admin backfill script can create missing `Savings` envelopes in bulk.
- Mobile does not auto-create an envelope on finance screen entry. It asks the user to create one first.

### Transaction types currently in use

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

### Allowance calculation model

Allowance payout is derived from chores, not from standalone allowance period rows.

The current rules are:

- Regular weighted chores contribute to `totalWeight` and `completedWeight`.
- Base allowance payout is `completedWeight / totalWeight * allowanceAmount`.
- Up-for-grabs chores with `rewardType === 'weight'` increase `completedWeight` without increasing `totalWeight`.
- Up-for-grabs chores with `rewardType === 'fixed'` accumulate fixed rewards per currency.
- `allowanceAwarded` on `choreCompletions` is the main dedup flag used to avoid paying the same completion twice.

There is no persisted payout-period ledger entity in active use today. The system recalculates periods live from chores and completions whenever the web distribution screen is opened.

## Web App: What Exists Today

### 1. Main finance surfaces

The web app has two major finance routes:

- `/familyMemberDetail`
  - Detailed per-member finance management.
- `/allowance-distribution`
  - Parent-only allowance payout workflow.

There is also lighter finance visibility on the dashboard:

- `components/dashboard/WebFamilyDashboard.tsx` shows each member's current total envelope balances in summary cards.

### 2. `/familyMemberDetail` and `FamilyAllowanceView`

`app/familyMemberDetail/page.tsx` is a thin wrapper around `FamilyAllowanceView`.

`FamilyAllowanceView` does the following:

- Queries all family members, all envelopes, and all unit definitions.
- Computes the list of monetary currencies currently in use.
- Renders a member list in the left column.
- Renders `MemberAllowanceDetail` for the selected member.

This screen is basically the web finance hub.

### 3. Member finance detail screen

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

### 4. Envelope management on web

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

### 5. Balance display and currency conversion on web

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

### 6. Savings goals on web

Each envelope can optionally have:

- `goalAmount`
- `goalCurrency`

The UI:

- Shows the goal on the envelope card.
- Converts all monetary balances into the goal currency.
- Displays percent complete and the value accumulated toward the goal.
- Ignores non-monetary balances for goal calculations.

### 7. Web transaction history

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

### 8. Web money movement actions

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

### 9. Web allowance configuration

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

### 10. Web allowance distribution workflow

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

## iPhone App: What Exists Today

### 1. Main finance surfaces on iPhone

The iPhone app currently exposes:

- `Finance` tab
- `More > Allowance Distribution`
- `More > Settings` unit definition management
- Dashboard finance summary card linking into the finance tab

### 2. Finance tab overview

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

### 3. iPhone balance and member filtering

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

### 4. iPhone permission and parent-elevation behavior

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

### 5. iPhone finance actions that exist today

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

### 6. Allowance visibility on iPhone

The native finance tab shows allowance summary cards per visible member.

It currently surfaces:

- configured allowance amount
- recurrence summary
- allowance start date
- payout delay
- total value already sitting in envelopes

It does not currently let the user edit allowance configuration from the native finance tab.

### 7. Envelope display on iPhone

Envelope cards show:

- envelope name
- description
- default badge
- current balances
- savings goal label if a goal already exists in the data

Important limitation:

- Native UI can display goal info if present, but native finance does not currently provide goal editing.

### 8. Transaction list on iPhone

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

### 9. Native allowance distribution screen

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

### 10. Native settings support for finance-related data

`mobile/app/more/settings.js` exposes parent-only unit definition management.

That means native users can already create and review:

- shared currencies
- points
- stars
- other custom reward units

This shared catalog affects both:

- finance display and data entry
- chore reward display

## Current Feature Parity Summary

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

## Important Gaps, Risks, And Mismatches

These are the most important implementation notes for anyone improving this area.

### 1. No dedicated finance backend service

Most money movement is performed directly from clients through InstantDB transactions.

That means:

- business rules are duplicated across web and iPhone
- transaction shape can drift between platforms
- there is no single server-owned source of truth for payout orchestration

### 2. `calculatedAllowancePeriods` exists but is unused

The schema has a `calculatedAllowancePeriods` entity, but the current app does not persist or consume it.

Practical result:

- payout periods are recalculated live every time
- there is no durable record of "this period was reviewed, paid, or skipped"
- allowance processing is inferred mostly from `allowanceAwarded` flags on chore completions

### 3. Web payout execution is not atomic with completion marking

In web allowance distribution, the app:

- posts money first
- then marks completions as awarded in a separate write

If the second step fails after the first succeeds, a retry can produce duplicate payout behavior.

### 4. Web distribution only truly pays the primary-currency fixed rewards

The web payout screen can display fixed rewards in other currencies, but the write path currently processes only:

- edited weighted amount
- plus fixed rewards in the member's primary allowance currency

The file explicitly notes that fixed rewards in other currencies are ignored for the primary transaction. The UI text suggests those other currencies matter, but they are not actually deposited before completions are marked awarded.

This is one of the biggest current gaps.

### 5. Cross-platform transaction type mismatch

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

### 6. Envelope creation is inconsistent between web and iPhone

Web envelope creation helpers create an `init` transaction row.

Mobile add-envelope does not.

This means transaction history completeness depends on which client created the envelope.

### 7. Delete-envelope behavior is inconsistent between web and iPhone

Web:

- allows delete with automatic transfer of positive balances to another envelope

iPhone:

- requires the envelope to be emptied first

This is not necessarily wrong, but it is different product behavior that should be treated as a deliberate decision, not an accident.

### 8. Exchange-rate fetch is client-owned

The web client fetches exchange rates directly and writes them into the database.

That has several consequences:

- no centralized scheduled refresh
- no guaranteed freshness window beyond client usage
- the API integration is not server-owned

### 9. No pagination in transaction-heavy views

Both platforms load recent or full transaction sets without a robust paging strategy.

This is fine for a small family dataset but will become a scaling issue if transaction history grows.

### 10. Native finance is still behind web finance

The biggest missing native capabilities are:

- allowance configuration editing
- allowance payout execution
- exchange-rate conversion
- transaction filtering
- envelope editing
- goal editing
- dedicated transfer-to-person UX

### 11. Some planned finance helpers exist but are not productized

`lib/currency-utils.ts` contains logic or comments for:

- `reconcileEnvelope`
- `distributeAllowance` by percentages
- `canInitiateTransaction`

These are useful signals for future direction, but they are not the current product path.

## Best Entry Points For Future Improvements

If a future LLM needs to improve this area, these are the fastest files to inspect first.

### Shared/backend first

- `instant.schema.ts`
- `instant.perms.ts`
- `lib/currency-utils.ts`
- `lib/chore-utils.ts`

### Web first

- `components/allowance/MemberAllowanceDetail.tsx`
- `app/allowance-distribution/page.tsx`
- `components/allowance/TransactionHistoryView.tsx`
- `components/allowance/AddEditEnvelopeForm.tsx`
- `components/allowance/TransferToPersonForm.tsx`

### iPhone first

- `mobile/app/(tabs)/finance.js`
- `mobile/app/more/allowance-distribution.js`
- `mobile/src/hooks/useParentActionGate.js`
- `mobile/src/providers/FamilyAuthProvider.js`

## Existing Tests Worth Reading Before Changing Finance

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

## Bottom Line

The current system is already a meaningful household finance product, especially on the web:

- multi-envelope balances
- multi-currency display
- transaction history
- savings goals
- parent-managed allowance schedules
- chore-driven allowance payouts

The system is not yet a fully unified finance platform across surfaces.

Today, the web app is the source of truth for advanced finance behavior, while the iPhone app is a strong but partial native port. The backend is mostly a shared data model and permission layer, not a central finance orchestration service.
