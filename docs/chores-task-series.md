# Chores and Task Series: Current Implementation Guide

## Purpose

This document describes the **current real implementation** of the chores system and the task-series system across:

- InstantDB / shared backend logic
- the Next.js web app
- the Expo / iPhone app

It is meant to be useful in two ways:

- **Human-readable**: you can scan it to see what the app currently does and does not do.
- **LLM-friendly**: another model should be able to use this as a working spec and know where to look before making changes.

This document is intentionally descriptive, not aspirational. If something is only partially implemented, that is called out explicitly.

## High-Level Architecture

- **Database**: InstantDB is the source of truth.
- **Web app**: mostly client-side `db.useQuery(...)` plus direct `db.transact(...)` writes.
- **iPhone app**: also queries/writes Instant directly from the client, with some server routes for device auth and file access.
- **Server layer**: there is **no dedicated chores/task-series CRUD API**. The server mostly handles auth/session bootstrapping and file signing/serving.
- **Shared logic**:
  - chore/date/XP helpers exist in both [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts) and [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts)
  - task-series scheduling logic lives in [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts)

## Important Architectural Warning

There are two big duplication points:

- **Chore assignment / XP logic is duplicated** between [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts) and [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts).
- **Task-series status logic is duplicated** between the web manager in [`components/task-series/TaskSeriesManager.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesManager.tsx) and the mobile summary screen in [`mobile/app/more/task-series.js`](/Users/david/development/family-organizer/mobile/app/more/task-series.js).

Any improvement to scheduling, rotation, XP, or status logic should check both places.

## Canonical Data Model

The schema lives in [`instant.schema.ts`](/Users/david/development/family-organizer/instant.schema.ts).

### Chore-related entities

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

### Task-series entities

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

### Family-member fields used by chores/task series

- `role`
- `pinHash`
- `viewShowChoreDescriptions`
- `viewShowTaskDetails`
- allowance-related fields are used indirectly because chore completions feed allowance calculations

### Schema fields that exist but are not meaningfully surfaced yet

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

## Permissions and Roles

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

## Shared Chore Semantics

### Date model

- Chore due dates are normalized to UTC day keys.
- Mobile uses `localDateToUTC(...)` so “today” means the user’s local day represented as UTC midnight.
- Web chore code also normalizes heavily to UTC midnight.

### One-time vs recurring chores

- If a chore has no `rrule`, it is only due on its `startDate`.
- If it has an `rrule`, the app checks whether that recurrence occurs on the selected UTC date.

### Rotation

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

### Up-for-grabs chores

- Up-for-grabs chores ignore rotation.
- They are available to all direct assignees on a due date.
- First completed assignee “claims” the chore for that date.
- Other assignees are blocked from completing it once claimed.
- Reward modes:
  - `rewardType = 'weight'`: contributes weight/XP-style value
  - `rewardType = 'fixed'`: contributes a fixed amount/currency to allowance logic

### Joint chores

- `isJoint` is a display/interpretation flag for multi-assignee chores.
- It changes the copy shown in the web list (“with X”).
- It does **not** create a separate shared completion object; completions are still recorded per member.

### Chore completion records

- A completion is scoped by:
  - chore
  - assignee (`completedBy`)
  - `dateDue`
- A separate `markedBy` link records who clicked/toggled it.
- This allows “I marked my sibling’s chore” without losing who the chore was completed for.

### XP calculation

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

### Allowance calculation

Allowance logic lives mainly in [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts).

Current behavior:

- normal recurring chores contribute to `totalWeight`
- completed normal chores contribute to `completedWeight`
- up-for-grabs chores do **not** add to `totalWeight`
- up-for-grabs weighted chores do add to `completedWeight`
- up-for-grabs fixed chores accumulate into a per-currency fixed-reward map
- completions can later be marked `allowanceAwarded = true`

This means allowance is already connected to chores, but the chore CRUD screens themselves are not the main allowance UI.

## Shared Task-Series Semantics

### Core scheduling model

Task-series behavior is driven by [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts).

The current model is a **rolling queue**, not a simple “task N belongs to fixed date N” system.

### How a series is structured

- Tasks are stored as a flat ordered list.
- Hierarchy is represented by:
  - `indentationLevel`
  - `parentTask` links
- `isDayBreak = true` inserts a boundary between daily blocks.

### Anchor-date behavior

The task queue anchors to:

- `today`, or
- the series `startDate`,

whichever is later.

This is important:

- **past dates** show only tasks completed on that historical date
- **today / anchor day** shows the current first remaining block
- **future dates** project remaining blocks onto future scheduled chore occurrences

### Day-break behavior

- Tasks before the first day break are “block 0”
- next segment is “block 1”, etc.
- leading “ghost” breaks after already-completed tasks are trimmed
- trailing breaks are trimmed so they do not create empty phantom future days

### Interaction with chore schedule

- Task-series scheduling depends on the linked chore’s recurrence.
- If the chore is not scheduled for a future date, `getTasksForDate(...)` returns an empty list for that date.
- If the anchor day is not itself a scheduled occurrence, block 0 stays visible until the next scheduled occurrence.

### Series start date

- `taskSeries.startDate` can delay when that queue begins showing up even if the chore itself already exists.

### Active-range behavior

`isSeriesActiveForDate(...)` is used to decide whether a series should be considered active on a date.

A series is active only when:

- the linked chore is scheduled on that date, and
- the date falls between the projected first and last real task dates

### Completion propagation

`getRecursiveTaskCompletionTransactions(...)` does two things:

- toggles the selected task’s `isCompleted`, `completedAt`, and `completedOnDate`
- bubbles `childTasksComplete` up to ancestors so parent/group rows know whether their subtree is done

### Progress calculation

`getTaskSeriesProgress(...)` computes a ratio from **actionable leaf tasks only**.

- parent/header rows are excluded if they have scheduled children
- if there are no actionable tasks, progress is `null`

## Web App: Current Chores Features

The main web chores UI is [`components/ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx), routed from [`app/chores/page.tsx`](/Users/david/development/family-organizer/app/chores/page.tsx).

### What the web chores page can do

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

### What the web chores page does not do

- it does **not** currently expose a real chore “calendar mode”
  - `viewMode` exists, but the actual alternate calendar view is effectively not implemented
- it does **not** support time-of-day chores
- it does **not** support end-date / pause / resume workflows in the UI
- it does **not** expose schema fields like “complete in advance” or “allow extra days”

### Chore form behavior

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

### Chore-list behavior worth preserving

The rendering and completion logic is in [`components/ChoreList.tsx`](/Users/david/development/family-organizer/components/ChoreList.tsx).

Important details:

- if a chore has a linked task series, clicking the avatar to complete the chore checks whether visible actionable tasks are still incomplete
- if tasks remain incomplete, the user gets a guardrail dialog:
  - “mark all done and complete”
  - or cancel
- up-for-grabs chores disable other assignees after one completion
- in single-member view, joint chores show “with X”
- task-series details can be globally shown or locally expanded per task

### Known web chores implementation quirks

- chore deletion in [`ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx) deletes the `chores` entity, but does **not** explicitly delete linked `choreAssignments` or `choreCompletions`
- the `chores.done` field exists in schema but is not the real source of truth
- some logic uses [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts) while other parts of the app use [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts)

## Web App: Current Task-Series Features

### Manager page

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

### Status meaning in the web manager

- `draft`
  - missing assignee or missing linked chore
- `pending`
  - blocked by dependency not archived yet, or effective start date is in the future
- `in_progress`
  - assigned and linked, not fully archived, and currently active
- `archived`
  - all real tasks are complete, and the series is effectively finished

The web manager is the most complete status implementation in the repo.

### Duplicate behavior

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

### Editor

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

### Task editor commands and shortcuts

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

### Task metadata popover

The metadata popover lives in [`components/task-series/TaskDetailsPopover.tsx`](/Users/david/development/family-organizer/components/task-series/TaskDetailsPopover.tsx).

Current features:

- edit notes with debounce autosave
- upload attachments
- delete attachments
- navigate between task details panels
- preserve/restore selection
- use server-signed upload URLs from [`app/actions.ts`](/Users/david/development/family-organizer/app/actions.ts)

### Embedded checklist behavior

The checklist renderer is [`components/TaskSeriesChecklist.tsx`](/Users/david/development/family-organizer/components/TaskSeriesChecklist.tsx).

Current behavior:

- builds a visible tree from scheduled tasks plus their ancestors
- auto-marks visible header/context rows complete in interactive mode
- treats headers differently from actionable rows
- supports notes and attachment previews inline
- allows per-task local “view details” expansion when the global setting is off
- supports read-only mode for past dates

## Web App: Dashboard-Level Chore/Task-Series Features

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

## iPhone App: Current Chores Features

### Chores tab

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

### What the mobile chores tab does not do

- no native chore form
- no native chore editing
- no native chore deletion
- no rotation/joint/up-for-grabs configuration UI
- no task-series checklist beneath chores
- no inline task notes/attachments on this screen
- `viewShowTaskDetails` is stored, but on this screen it currently has no visible task-series effect because task series are not rendered here

## iPhone App: Current Task-Series Features

### Today / dashboard tab

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

### More > Task Series screen

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

### Mobile task-series parity summary

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

## Server / Backend Portion

### What is actually server-side here

For chores and task series, the server mostly provides infrastructure, not domain CRUD:

- InstantDB schema and permissions
- device-auth-protected file access
- S3 presigned upload/download support

### File support for task attachments

Relevant files:

- [`app/actions.ts`](/Users/david/development/family-organizer/app/actions.ts)
- [`app/files/[filename]/route.ts`](/Users/david/development/family-organizer/app/files/[filename]/route.ts)
- [`app/api/mobile/files/[filename]/route.ts`](/Users/david/development/family-organizer/app/api/mobile/files/[filename]/route.ts)
- [`app/api/mobile/files/route.ts`](/Users/david/development/family-organizer/app/api/mobile/files/route.ts)

Current behavior:

- web uploads use a server-generated presigned POST
- web file views use a 307 redirect to a presigned object URL
- mobile fetches JSON containing a presigned URL because React Native components do not reliably follow the redirect flow

### What is not server-side

- there is no `POST /api/chores`
- there is no `POST /api/task-series`
- there is no server-owned scheduling job for task-series queues
- there is no server-owned chore assignment endpoint

Most business logic runs on the client or in shared utilities.

## Current “Have / Don’t Have” Summary

### Chores: clearly implemented

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

### Chores: partial or missing

- no strong cleanup on chore delete
- no end-date / pause UI
- no time-of-day UI
- no advance/past completion policy UI
- no mobile create/edit/delete
- no real alternate chore calendar view on web chores page

### Task series: clearly implemented

- series manager on web
- web series editor
- ordered task queue with day breaks
- projected date labels
- inline hierarchy
- task notes and attachments
- web checklist rendering inside chores
- mobile dashboard display of due task-series items
- task completion bubbling to parents

### Task series: partial or missing

- dependency field exists, but editor does not expose it
- cross-series dependency scheduling is not implemented
- no real work-ahead UI despite schema hints
- break configuration fields exist but are not meaningfully surfaced
- mobile manager is summary-only
- no mobile editor
- duplicate does not fully preserve all structure/attachments

## Best File Map for Future Work

If another model is asked to improve this area, these are the most important files to read first.

### Backend / data model

- [`instant.schema.ts`](/Users/david/development/family-organizer/instant.schema.ts)
- [`instant.perms.ts`](/Users/david/development/family-organizer/instant.perms.ts)

### Shared logic

- [`packages/shared-core/src/chores.ts`](/Users/david/development/family-organizer/packages/shared-core/src/chores.ts)
- [`packages/shared-core/src/date.ts`](/Users/david/development/family-organizer/packages/shared-core/src/date.ts)
- [`lib/chore-utils.ts`](/Users/david/development/family-organizer/lib/chore-utils.ts)
- [`lib/task-scheduler.ts`](/Users/david/development/family-organizer/lib/task-scheduler.ts)
- [`lib/task-series-progress.ts`](/Users/david/development/family-organizer/lib/task-series-progress.ts)

### Web chores

- [`components/ChoresTracker.tsx`](/Users/david/development/family-organizer/components/ChoresTracker.tsx)
- [`components/ChoreList.tsx`](/Users/david/development/family-organizer/components/ChoreList.tsx)
- [`components/DetailedChoreForm.tsx`](/Users/david/development/family-organizer/components/DetailedChoreForm.tsx)
- [`components/TaskSeriesChecklist.tsx`](/Users/david/development/family-organizer/components/TaskSeriesChecklist.tsx)
- [`components/ui/ToggleableAvatar.tsx`](/Users/david/development/family-organizer/components/ui/ToggleableAvatar.tsx)

### Web task series

- [`components/task-series/TaskSeriesManager.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesManager.tsx)
- [`components/task-series/TaskSeriesEditor.tsx`](/Users/david/development/family-organizer/components/task-series/TaskSeriesEditor.tsx)
- [`components/task-series/TaskItem.tsx`](/Users/david/development/family-organizer/components/task-series/TaskItem.tsx)
- [`components/task-series/TaskDetailsPopover.tsx`](/Users/david/development/family-organizer/components/task-series/TaskDetailsPopover.tsx)
- [`components/task-series/taskSeriesCommands.tsx`](/Users/david/development/family-organizer/components/task-series/taskSeriesCommands.tsx)

### Web dashboard overview

- [`components/dashboard/WebFamilyDashboard.tsx`](/Users/david/development/family-organizer/components/dashboard/WebFamilyDashboard.tsx)

### iPhone app

- [`mobile/app/(tabs)/chores.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/chores.js)
- [`mobile/app/(tabs)/dashboard.js`](/Users/david/development/family-organizer/mobile/app/(tabs)/dashboard.js)
- [`mobile/app/more/task-series.js`](/Users/david/development/family-organizer/mobile/app/more/task-series.js)
- [`mobile/src/lib/api-client.js`](/Users/david/development/family-organizer/mobile/src/lib/api-client.js)
- [`mobile/src/hooks/useParentActionGate.js`](/Users/david/development/family-organizer/mobile/src/hooks/useParentActionGate.js)

### Tests worth checking after changes

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

## Short Version

If you only remember a few things:

- chores are direct Instant records with completion rows per assignee/day
- task series are rolling queues projected onto chore recurrence dates
- web has the real editor/manager
- iPhone currently has strong read/use flows, but weak admin/edit flows
- chore logic and task-series status logic each have duplication points that can drift
