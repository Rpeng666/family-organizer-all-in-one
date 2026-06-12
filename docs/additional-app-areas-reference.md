# Additional App Areas Reference

This document contains the standalone text for the app areas that were added beyond the original allowance/finance, calendar, and chores/task-series references.

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
- current date and calendar controls in the header
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
