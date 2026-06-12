# Calendar System Overview

This document describes the current calendar implementation across the data layer, the web app, and the iPhone app. It is meant to be useful in two ways:

- Human-readable product inventory: what the app can and cannot do today.
- Engineering map for future LLMs or developers: where the logic lives, how recurrence works, and which files matter when making changes.

This document is based on the current code, not on older README claims. When the code and the README disagree, trust the code.

## Scope and boundaries

The app has more than one calendar-like surface:

- Main event calendar on the web: `app/calendar/page.tsx` and `components/Calendar.tsx`
- Main event calendar on iPhone: `mobile/app/(tabs)/calendar.js`
- Chore assignment preview calendar: `components/ChoreCalendarView.tsx`

The first two are the real event calendar. `ChoreCalendarView` is a separate chore preview widget and is not the same system as the event calendar.

## High-level architecture

There is no dedicated server-side calendar service. The calendar is primarily a client-side InstantDB feature.

- Data lives in the InstantDB `calendarItems` entity.
- The web app uses `@instantdb/react` via `lib/db.ts`.
- The iPhone app uses `@instantdb/react-native` through the mobile app session provider.
- Calendar recurrence expansion is done client-side in the web app.
- Calendar CRUD is done client-side on both web and mobile.
- The server side mainly contributes schema, permissions, auth/device/session plumbing, and one admin backfill script.

Important consequence: if you are changing calendar behavior, most of the real logic is in client components, not in API routes.

## Source-of-truth files

These are the most important calendar files:

- Data model: `instant.schema.ts`
- Permissions: `instant.perms.ts`
- Web Instant client: `lib/db.ts`
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
- Header-controls DOM tests: `test/dom/components/CalendarHeaderControls.dom.test.tsx`
- Live permissions smoke: `test/live/instant-perms-live.node.test.ts`
- Web calendar Playwright smoke: `e2e/calendar-event-regression.spec.ts`

## Data model: `calendarItems`

The event system is stored in a single InstantDB entity: `calendarItems`.

### Core event fields

| Field | Meaning | Notes |
|---|---|---|
| `title` | Event title | Required |
| `description` | Event notes | Optional |
| `startDate` | Start timestamp or date | Timed events use ISO datetime strings; all-day events use `YYYY-MM-DD` |
| `endDate` | End timestamp or date | All-day events use exclusive end dates |
| `isAllDay` | All-day vs timed | Controls parsing, recurrence, rendering, and transparency defaults |
| `year` / `month` / `dayOfMonth` | Indexed start-date mirror fields | Used for month-based querying |
| `pertainsTo` | Many-to-many link to `familyMembers` | Empty means the event applies to everyone |

### Recurrence and series fields

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

### Metadata fields

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

### Fields present in schema but not materially surfaced today

These fields exist in the schema but I did not find meaningful UI or renderer usage in the main calendar:

- `attendees`
- `conferenceData`
- `organizer`
- `priority`
- `url`

Those are more like future-proof metadata fields right now than fully implemented features.

## All-day event semantics

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

## Recurrence model

The web app has a fairly sophisticated recurrence system. The mobile app does not currently match it.

### How recurrence is represented

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

### Why `recurrenceLines` and `xProps` both exist

The system stores recurrence data in multiple shapes:

- `rrule`, `rdates`, and `exdates` are the main structured storage.
- `recurrenceLines` stores ICS-like lines and is used as a compatibility/helper representation.
- `xProps.recurrenceExceptionRows` and `xProps.recurrenceRdateRows` preserve range-based UI state that flat `EXDATE` and `RDATE` token arrays cannot represent cleanly.

That layered storage is a real implementation detail, not redundancy by accident.

## Permissions and server-side responsibilities

### Permissions

`instant.perms.ts` makes `calendarItems` parent-mutable:

- Family principals can view calendar items.
- Parents can create, update, delete, link, and unlink calendar items.
- Kids cannot write calendar items.

There is already a live permissions smoke test covering this:

- Kid create should fail.
- Parent create/delete should succeed.

### What the server does not do

There is no custom Next.js calendar CRUD API route. Calendar CRUD does not flow through a server controller.

The server-side calendar responsibilities are mainly:

- shipping the schema
- shipping the permissions
- minting auth/session state used by the clients
- running one admin repair script

### Admin repair script

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

## Web app calendar

### Route shape

The web calendar route is simple:

- `app/calendar/page.tsx` renders `components/Calendar.tsx`

The complexity lives in the component, not the route.

### What the web calendar currently does

The web calendar is the most complete calendar implementation in the repo. It supports:

- scrollable multi-week table view
- Gregorian and Bikram Samvat labeling
- sticky month header with animated month transitions
- variable day-cell height
- variable visible-week density
- "Today" jump
- quick-add modal opening
- family-member event filtering
- create/edit/delete event modal
- recurring event creation and editing
- recurring delete scopes
- drag/drop rescheduling
- recurring drag/drop scopes
- optimistic UI updates
- same-week single-block rendering for multi-day events

### Header controls

`components/CalendarHeaderControls.tsx` controls the main calendar route through window custom events.

Available controls:

- Settings popover
  - day height slider
  - visible weeks slider
- Filter popover
  - everyone toggle
  - per-member selection
  - select all / none behavior
- Today button
- Add Event button

State and commands are coordinated through `lib/calendar-controls.ts`.

This is a lightweight route-specific event bus, not React context.

### Query model on the web

The web calendar queries `calendarItems` plus the `pertainsTo` relation.

The query intentionally includes three categories of rows:

1. events whose indexed start month is inside the buffered visible range
2. recurring masters with non-null `rrule`
3. override rows whose `recurrenceId` month prefix matches the visible range

That third category matters because moved overrides may now live on a different visible date than the original occurrence they replace. The renderer still needs them in memory so it can suppress the original generated occurrence.

### Rendering pipeline on the web

The web renderer does these major steps:

1. Fetch raw `calendarItems`.
2. Merge in optimistic local changes.
3. Apply member filtering.
4. Build a suppression map from override rows.
5. Expand recurring masters into visible occurrences.
6. Split visible items into:
   - single-day items for cell rendering
   - multi-day week-local segments for span-row rendering
7. Sort same-day items by start time.
8. Assign multi-day segments to lanes using a greedy interval-coloring pass.

### Multi-day rendering on the web

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

### Day cells and event chips

Important rendering files:

- `components/DroppableDayCell.tsx`
- `components/DraggableCalendarEvent.tsx`

Current web event chips show:

- title
- audience badges based on `pertainsTo`

Current web event chips do not show much of the richer metadata inline:

- no inline time label on the month chip
- no inline location
- no inline description
- no attendee/conference UI

### Drag/drop behavior on the web

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

### Add/edit modal on the web

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

### Recurrence editing on the web

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

### Delete behavior on the web

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

### Recurrence scope dialog

`components/RecurrenceScopeDialog.tsx` is shared by edit, drag, and delete flows.

It can offer:

- `Only this event`
- `This and following events`
- `This and all following events`
- `All events`

Which second option appears depends on whether the selected occurrence is treated as the first/original occurrence of the series.

### Optimistic behavior on the web

The web calendar closes the modal quickly and applies optimistic local merges for smoother UI.

Important detail:

- `components/Calendar.tsx` keeps an `optimisticItemsById` map.
- It merges optimistic rows with server rows.
- It later removes optimistic entries once the server version is judged equivalent enough.

Important save-path detail in `AddEvent.tsx`:

- the save path first writes a "legacy/basic" payload
- then best-effort writes the richer metadata patch

This means a base event can succeed even if some extended metadata patch later fails. That is an intentional compatibility strategy in the current implementation.

### Web UX details that are worth knowing

- The calendar is not a classic fixed month view; it is a scrollable week table with expanding memory windows.
- The sticky month box is derived from the currently visible day markers, not from a route parameter.
- Family member filters treat empty `pertainsTo` as "everyone" events.
- The web route currently has no explicit parent-only UI gate on add/edit/delete controls. Permissions still prevent kid writes, but the UI does not appear to hide those affordances ahead of time.

That last point is a real behavior difference from the iPhone app.

## iPhone app calendar

### Screen shape

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

### What the iPhone calendar currently does

- Builds a 42-day month grid, Sunday-first
- Queries `calendarItems` for the months touched by the visible grid
- Shows small dots in day cells for events on that day
- Shows the selected day's events in a detail panel below the grid
- Lets parents create or edit simple event rows
- Lets parents delete an event row
- Lets kids view events, but routes editing attempts through parent-login handoff

### Parent gating on iPhone

The mobile calendar has better UI-level permission handling than the web route.

- It reads `principalType` from the mobile app session.
- Parents can edit directly.
- Kids are shown read-only states.
- If a kid tries to add/edit/delete, the screen triggers a parent handoff flow through `useParentActionGate`.
- After parent login, the screen can resume the pending calendar action.

### Mobile save behavior

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

### What the iPhone calendar does not currently do

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

### Most important mobile limitation: recurrence is not really implemented

The mobile file stores and preserves recurrence-related metadata, but it does not implement the web recurrence model.

Specifically:

- It queries rows by visible start months only.
- It does not fetch all recurring masters the way the web app does.
- It does not expand `rrule` occurrences into concrete visible items.
- It does not suppress generated occurrences with override logic.
- It does not split or reparent recurring series.

So, in practice, recurrence is currently a web feature. Mobile mostly preserves recurrence-related fields when editing existing rows, but it does not behave like the web recurrence engine.

### Most important mobile limitation: multi-day rendering is simpler

Mobile multi-day events are recognized by overlap with a day:

- day cells show dots
- selected-day list shows the event on each overlapping day

But there is no "single block across the week" presentation like the web calendar now has.

## Feature comparison: web vs iPhone

| Feature | Web | iPhone |
|---|---|---|
| View type | Scrollable multi-week table | Fixed month grid with selected-day detail panel |
| Gregorian labels | Yes | Yes |
| Bikram Samvat labels | Yes | Yes |
| Sticky current-month display | Yes | No |
| Settings for density/day height | Yes | No |
| Member filter | Yes | No |
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

## Calendar-related things the product docs currently overstate

Some high-level docs describe more than the current code actually delivers.

The biggest examples:

- README and CLAUDE notes describe chores or task overlays in the main calendar.
- The current main web calendar and current iPhone calendar both render `calendarItems`, not chore overlays.
- The repo does have `components/ChoreCalendarView.tsx`, but that is a separate chore preview component.

If someone asks an LLM to improve the "calendar overlays" feature, the first step is to confirm whether they mean:

- the main event calendar
- the chore preview calendar
- or a future overlay that does not currently exist in the main calendar code

## Testing status

### Web coverage that exists

There is meaningful web calendar test coverage:

- `test/dom/components/Calendar.dom.test.tsx`
  - modal opening
  - drag/drop
  - recurrence expansion basics
  - recurrence drag scope behavior
  - member filtering
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
- `e2e/calendar-event-regression.spec.ts`
  - env-gated smoke for parent create/edit of an all-day event
- `test/live/instant-perms-live.node.test.ts`
  - kid cannot create calendar items
  - parent can create/delete calendar items

### Mobile coverage that I found

I did not find dedicated automated tests for the iPhone calendar screen comparable to the web calendar DOM tests.

That means:

- the mobile calendar is less protected against regression
- mobile/web parity gaps are easier to introduce accidentally

## Things that are implemented as metadata only

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

## Things the calendar does not currently have

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
- main-calendar chore overlays in the current event calendar code

## Best starting points for future improvements

If a future LLM or developer is asked to improve the calendar, these are the best entry points:

### Event data model or permissions

- `instant.schema.ts`
- `instant.perms.ts`
- `scripts/backfill-calendar-events.js`
- `test/live/instant-perms-live.node.test.ts`

### Web rendering, scrolling, filters, and drag/drop

- `components/Calendar.tsx`
- `components/DroppableDayCell.tsx`
- `components/DraggableCalendarEvent.tsx`
- `components/CalendarHeaderControls.tsx`
- `styles/Calendar.module.css`
- `test/dom/components/Calendar.dom.test.tsx`

### Web event editor and recurrence logic

- `components/AddEvent.tsx`
- `components/RecurrenceScopeDialog.tsx`
- `test/dom/components/AddEvent.dom.test.tsx`

### iPhone calendar improvements

- `mobile/app/(tabs)/calendar.js`

If mobile recurrence parity is ever a goal, the best long-term direction would be to extract recurrence parsing and expansion into shared utilities instead of keeping web-only recurrence logic embedded inside `components/Calendar.tsx` and `components/AddEvent.tsx`.

## Practical summary

If you want the simplest accurate summary:

- The web calendar is the real calendar product today.
- The iPhone calendar is a good basic month-view CRUD screen, but it is not feature-parity with the web calendar.
- The server side does not own calendar logic beyond schema, permissions, auth plumbing, and admin maintenance.
- Recurrence is currently a web-first feature.
- Multi-day week-span rendering is currently a web-only feature.
- Some schema fields are already there for future calendar richness, but many of them are still metadata-only.
