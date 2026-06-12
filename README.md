<div align="center">

<img src="public/icon-192x192.png" alt="Family Organizer" width="96" height="96" />

# Family Organizer

**Open-source self-hosted family management — shared family calendar, chores, curriculum, messages, and finances, synced in real time**

**A privacy-first, self-hosted alternative to Cozi**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-0080ff?logo=expo)](https://expo.dev)
[![InstantDB](https://img.shields.io/badge/Database-InstantDB-6c47ff)](https://instantdb.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org)

[Features](#-features) · [Screenshots](#-screenshots) · [Quick Start](#-quick-start) · [Docker](#-docker--self-hosting) · [Stack](#-stack)

**Language:** English | [中文](./README.zh.md) | [Español](./README.es.md) | [Français](./README.fr.md) | [Deutsch](./README.de.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Português](./README.pt-BR.md)

</div>

---

<div align="center">

### Don't want to self-host? Also check out Nestify Family Organizer

<a href="https://www.nestifyapp.org">
  <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=256&q=75" alt="Nestify" height="48" />
</a>

**[Nestify Family Organizer](https://www.nestifyapp.org)** — AI-powered · Voice input · Meal planning · No setup required

[![App Store](https://img.shields.io/badge/App_Store-Download-black?logo=apple&logoColor=white)](https://apps.apple.com/us/app/nestify-family-organizer/id6751864069)
[![Google Play](https://img.shields.io/badge/Google_Play-Download-black?logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.nestify.familyorganizerapp)

</div>

---

## ✨ What Is This

Family Organizer is an open-source **family management web + mobile app** designed for shared devices. Each family member logs in with a PIN. Chore completions, curriculum progress, messages, and allowance balances stay **in sync across all devices in real time**. Parent and child permissions are fully separated, and every action is attributed to whoever was logged in.

> Built from real family needs. Best suited for households that want full data ownership and are comfortable with self-hosting.

### Family Organizer vs. Nestify

| | <img src="public/icon-192x192.png" height="20"/> Family Organizer | <img src="https://nestifyapp.org/_next/image?url=%2Flogo.png&w=64&q=75" height="20"/> [Nestify Family Organizer](https://www.nestifyapp.org) |
|---|---|---|
| | *(screenshots coming soon)* | <a href="https://www.nestifyapp.org"><img src="https://nestifyapp.org/_next/image?url=%2Fimgs%2Ffamily-modes%2Ffm-calendar.png%3Fv%3D2026060726&w=1200&q=75" width="280"/></a> |
| Deployment | Self-hosted, requires a server | No setup, works out of the box |
| AI assistant | ❌ | ✅ Nestie AI |
| Mobile app | Build from source (Expo) | App Store / Google Play |
| Meal planning | ❌ | ✅ |
| Data ownership | Fully yours | E2E encrypted, cloud-hosted |

---

## 🎯 Features

### 📋 Chore Management
- **rrule recurrence** — daily, weekly, or monthly schedules with start/end dates and pause support
- **Member rotation** — automatically assigns chores to different members on a cycle
- **Up-for-grabs rewards** — set a fixed reward; whoever completes it earns it
- **Completion tracking** — records which logged-in member marked each chore, useful on shared devices

### 📚 Task Series (great for homeschooling)
- **Rolling queue** — tasks advance based on completion, not calendar date
- **Nested subtasks + day breaks** — multi-level structure and multi-day session scheduling
- **Response fields + grading** — students submit answers; parents annotate and grade
- **File attachments** — attach images, PDFs, audio, or video to any task

### 📅 Calendar
- **Dual calendar system** — Gregorian and Bikram Samvat (Nepali) side by side
- **Multiple views** — day, multi-day, month, and year (year view still shows individual events)
- **Apple Calendar sync** — one-way CalDAV import from iCloud; server-side polling, no browser required
- **Chore overlay** — see chore assignments directly on the calendar

### 💬 Family Messages
- **Thread-based** — conversations organized by topic, not a single running stream
- **Read receipts** — mark messages as requiring acknowledgement
- **Attachments** — share images and files directly in conversation
- **Parental oversight** — parents can view all household threads

### 💰 Finances
- **Envelope budgeting** — multiple envelopes per member (with optional savings goals), multi-currency support
- **Allowance distribution** — weighted chore completion automatically calculates payouts
- **Fixed rewards** — up-for-grabs completions deposit directly to the earner's envelope
- **Full transaction history** — deposits, withdrawals, transfers, and recurring allowances

### 🗂️ File Storage
- **Centralized storage** — S3/MinIO object storage; images auto-resized to 64/320/1200px via Sharp
- **Attachment system** — messages and tasks can reference any file in the library

### 📊 Dashboard & History
- **Family + personal views** — web has both a family overview and per-member widget dashboard; mobile shows a daily summary
- **Audit log** — full history of chore, task, and finance changes across the app

---

## 📸 Screenshots

> 🚧 Screenshots coming soon — PRs welcome!

<!-- To add screenshots, place images in docs/screenshots/ and uncomment below.

<p align="center">
  <img src="docs/screenshots/dashboard.png" width="48%" alt="Dashboard" />
  <img src="docs/screenshots/chores.png" width="48%" alt="Chores" />
</p>
<p align="center">
  <img src="docs/screenshots/calendar.png" width="48%" alt="Calendar" />
  <img src="docs/screenshots/finance.png" width="48%" alt="Finance" />
</p>
-->

---

## 📱 Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Web (Next.js) | ✅ Full | Installable as PWA |
| iOS / Android (Expo) | ✅ Core features | Chores, calendar, messages, finance, and more |
| Offline support | 🚧 Partial | Basic functionality works; full offline not yet complete |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- [InstantDB](https://instantdb.com) account (free)
- S3-compatible object storage (MinIO is included in the Docker Compose setup)

### 1. Clone & install

```bash
git clone https://github.com/Rpeng666/family-organizer.git
cd family-organizer
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
cp mobile/.env.example mobile/.env
```

Fill in the required values in `.env`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_INSTANT_APP_ID` | InstantDB app ID (client) |
| `INSTANT_APP_ADMIN_TOKEN` | InstantDB admin token |
| `DEVICE_ACCESS_KEY` | Shared secret for device activation (any string you choose) |
| `NEXT_PUBLIC_S3_ENDPOINT` | MinIO/S3 public endpoint |
| `S3_ENDPOINT` | MinIO/S3 internal server endpoint |
| `S3_BUCKET_NAME` | Storage bucket name |
| `S3_ACCESS_KEY_ID` | S3 access key ID |
| `S3_SECRET_ACCESS_KEY` | S3 secret access key |

> `INSTANT_APP_ID` (server-side) usually matches `NEXT_PUBLIC_INSTANT_APP_ID`. Apple Calendar sync variables are documented in [`.env.example`](./.env.example).

### 3. Push InstantDB schema

```bash
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```

### 4. Start the dev server

```bash
# Web
npm run dev

# Mobile (separate terminal)
npm run mobile:start
# or on iOS simulator
npm run mobile:ios
```

### 5. Activate your device

After the server starts, open:

```
http://localhost:3000/?activate=<DEVICE_ACCESS_KEY>
```

This sets the device auth cookie and redirects to the main dashboard.

---

## 🐳 Docker / Self-Hosting

`docker-compose.yml` includes:
- Next.js app
- MinIO object storage
- Bucket bootstrap
- Apple Calendar sync worker

```bash
# First run
docker compose up -d --build

# Upgrade
git pull && docker compose up -d --build
```

<details>
<summary>HTTPS reverse proxy config (linuxserver.io SWAG)</summary>

Add these two files to `swag/config/nginx/proxy-conf/`:

**`family-organizer.subdomain.conf`**
```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name fam.*;

    include /config/nginx/ssl.conf;
    client_max_body_size 0;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        set $upstream_app family-organizer;
        set $upstream_port 3000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

**`s3.subdomain.conf`**
```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name s3.*;

    include /config/nginx/ssl.conf;
    client_max_body_size 10G;
    proxy_buffering off;
    proxy_request_buffering off;

    location / {
        include /config/nginx/proxy.conf;
        include /config/nginx/resolver.conf;

        set $upstream_app minio;
        set $upstream_port 9000;
        set $upstream_proto http;
        proxy_pass $upstream_proto://$upstream_app:$upstream_port;
    }
}
```

</details>

---

## 📅 Apple Calendar Sync

One-way CalDAV import from Apple Calendar into Family Organizer. Server-side polling — no browser or phone needs to stay open.

<details>
<summary>Setup instructions</summary>

### Required environment variables

```bash
CALDAV_CREDENTIAL_ENCRYPTION_KEY=replace-with-a-random-32-byte-secret
CALDAV_CREDENTIAL_ENCRYPTION_KEY_VERSION=v1
CALENDAR_SYNC_CRON_SECRET=replace-with-a-long-random-secret
```

Optional tuning:

```bash
APPLE_CALDAV_SYNC_WINDOW_PAST_DAYS=90
APPLE_CALDAV_SYNC_WINDOW_FUTURE_DAYS=365
APPLE_CALDAV_POLL_BASE_SECONDS=15
```

### Steps

1. Create an **app-specific password** for Family Organizer in your Apple account settings (requires 2FA)
2. Log in as a parent and go to **Settings → Apple Calendar Sync**
3. Enter your Apple ID email and app-specific password, then click **Connect**
4. Select the calendars to import and save
5. Click **Sync now** to trigger the first import

### Sync endpoint

```bash
POST /api/calendar-sync/apple/run
Authorization: Bearer <CALENDAR_SYNC_CRON_SECRET>
```

Trigger every 15–30 seconds. The server uses adaptive backoff — frequent ticks during active changes, automatic slowdown when idle. The Docker Compose setup includes a worker that handles this automatically.

</details>

---

## 🛠 Stack

| Layer | Technology |
|-------|------------|
| Web framework | Next.js 16 + React 18 + TypeScript |
| Mobile | Expo / React Native |
| Database & realtime | InstantDB (client SDK + Admin SDK) |
| File storage | MinIO / S3-compatible + Sharp image processing |
| Rich text | TipTap 3 |
| UI components | Radix UI + Tailwind CSS |
| Drag and drop | Atlaskit Pragmatic DnD |
| Calendar | rrule + nepali-date-converter |
| Testing | Vitest + Playwright |
| Monorepo | npm workspaces |

---

## 🧪 Testing

```bash
npm test                # Unit & integration tests (Vitest)
npm run test:e2e        # E2E tests (Playwright, auto-starts dev server)
npm run test:all        # All tests
npm run test:coverage   # Coverage report
```

---

## 📐 Project Structure

```
.
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── countdown/          # Chore countdown engine UI
│   ├── dashboard/          # Dashboard widgets
│   ├── messages/           # Messaging system
│   └── ui/                 # Base UI components
├── lib/                    # Core business logic
│   ├── chore-utils.ts      # Chore scheduling & allowance calculation
│   ├── task-scheduler.ts   # Task series rolling queue
│   └── device-auth.ts      # Device authentication
├── packages/
│   ├── shared-core/        # Shared logic for web & mobile (countdown engine)
│   └── mobile-contracts/   # API contract types
├── mobile/                 # Expo mobile app
├── instant.schema.ts       # InstantDB schema (single source of truth)
└── instant.perms.ts        # InstantDB permission rules
```

---

## 🤝 Contributing

Issues and PRs are welcome. This is a personal project — iteration pace follows real family needs, but good contributions get a careful look.

---

## 📄 License

Licensed under the [Apache License 2.0](./LICENSE).

This project is a fork of [fivestones/family-organizer](https://github.com/fivestones/family-organizer), originally created by **David Thomas** and released under the MIT License. The full MIT license text is preserved in [LICENSE](./LICENSE).
