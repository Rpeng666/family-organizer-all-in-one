# Family Organizer Mobile

This is the Expo / React Native client for Family Organizer.

It shares the same InstantDB-backed data model as the web app, but it also depends on the Next.js server for device activation, parent elevation, mobile configuration, and some file-related APIs.

## Features

- **Dashboard.** The dashboard is a member-centered daily overview. It pulls together XP, due chores, scheduled task-series work, upcoming calendar items, unread message activity, and current finance balances so someone can open the app and quickly see what matters today. It also acts as a launch point into the deeper task-series, messages, calendar, and finance flows.

- **Chores.** The chores tab is the day-by-day execution view for family work. It lets you move through dates, filter by family member, see only the chores due on that day, and mark work complete directly from the list. It also respects recurring schedules, rotating assignees, shared/joint chores, up-for-grabs chores, and per-user view settings like whether descriptions and task details should stay visible.

- **Calendar.** The calendar tab is a mobile event board for both family-created events and imported Apple-synced events. It supports Gregorian and Bikram Samvat context, all-day and timed events, local event editing, tags, descriptions, and event metadata, with parent-mode restrictions where appropriate. In practice it works as the family schedule surface, while still keeping imported Apple events visible alongside local ones.

- **Tasks.** The app has a task-series system. This is a way to make a list of related tasks, where a set of tasks are set to be done per day, and then those days of tasks are projected on to a chore's schedule whenever it occurs. We usually use this for home schooling assignments; with all the tasks for a given day of a certain subject set as a task in the task series (e.g., each task for each day of 9th grade science, which is then projected onto the days were the chore "Science" is scheduled for a given person). The Tasks area gives each person a view of their assigned task series, opens the live checklist for the work scheduled today, and keeps a history of updates, responses, and progress over time. For parents, the mobile app also includes task-series management, review, and editing screens, so a series can be planned, adjusted, reviewed, and worked through from the phone instead of only on the web.

- **Messages.** The messages tab is a full thread-based family messaging experience, not just a simple inbox. Family members can read and send messages, reply inline, react, acknowledge messages that need acknowledgement, and attach photos, videos, and documents. Parents can also enter an oversee mode to watch threads across the household, while notification preferences and quiet-hour settings stay tied to each member.

- **Allowance / finance.** The finance tab is built around per-member envelopes and transaction history. It shows balances across currencies, lets parents create envelopes, deposit, withdraw, and transfer funds, and keeps a readable ledger of what changed and when. It also surfaces each member's allowance configuration so the mobile app can serve as both a quick balance checker and a lightweight finance management surface.

- **Management.**
    - device activation with a configurable server URL
    - shared-device lock screen with family member selection and PIN entry
    - parent elevation and shared-device parent timeout handling
    - additional screens for family members, files, settings, and allowance preview

## Local Development

1. From the repo root, install dependencies:

```bash
npm install
```

2. Copy the mobile env file:

```bash
cp mobile/.env.example mobile/.env
```

3. Set `EXPO_PUBLIC_API_BASE_URL` so the app can reach the Next.js server.

4. Start the web app from the repo root:

```bash
npm run dev
```

5. Start Expo:

```bash
npm run mobile:start
```

For iOS simulator development:

```bash
npm run mobile:ios
```

## Notes

- Instant configuration is loaded from `/api/mobile/config`
- The mobile client uses `@instantdb/react-native` for live queries and writes
- Privileged flows still go through the Next.js `/api/mobile/*` routes
