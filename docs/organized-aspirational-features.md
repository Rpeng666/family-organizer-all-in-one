# Organized Aspirational Features and To-Do List

This document consolidates the unfinished aspirational/to-do material from the README and the additional freeform notes, checked against the current docs in this repo.

Fully shipped items have been removed. When something is marked as partially shipped, that means there is already a real foundation in the app today, but the specific details listed under that heading are still not finished.

## Dashboards, Daily Views, and Wall Displays

- [ ] iPhone dashboard refinement. Partially shipped now: the native iPhone dashboard already shows member-specific balances/XP, due chores, and task-series work, but the remaining desired behavior is still:
  - Needs just the top chore and top task series task.
  - Maybe in smaller letters/fading, show the two after the current one.
  - Can link to another page that shows all the tasks: the task series page.
  - When a chore has a task series, it shows that it has one, maybe just shows the top task, and links to the task series page.
  - Also shows calendar items for today, and finance totals.

- [ ] iPad dashboard:
  - Maybe the same as the iPhone one but a bit more info. More tasks.
  - Or not more? Focus mode: just keep it at one thing. The current chore. Or if the current chore has unfinished tasks, then the current task item.

- [ ] Personal dashboard. Partially shipped now: there is already an iPhone day view that covers some of this, and the web app has a household dashboard, but there is not yet a fully realized personal dashboard that does all of the following together:
  - Once you’re logged in, you should see a dashboard for you.
  - It should show your name, or probably just avatar, somewhere top right.
  - This should be a menu. One of the things you can do is switch users, not log in as a different user, but view a different user’s dashboard.
  - A title.
  - Your XP for today, x out of x.
  - Today’s date.
  - This should be a button to open a calendar from which you can pick other days just before and just after, basically the same as what is in the app right now in the `Date` section.
  - List of chores you have due today.
  - Can check off chores there.
  - Move finished chores at the bottom of the list.
  - Make a separate section for any school task lists, and for each of those list their items for today. This belongs above the chores section.
  - Can check off items here.
  - Can click on links here to open documents or link to outside apps.
  - At the bottom show the user’s currency totals.
  - Tapping will take you to the finance area.

- [ ] Dashboard progress indicators at a glance:
  - Maybe an icon with a circle that gradually completes in the bar at the top.
  - Completion each task series’ items for today, using the weights of the tasks.
  - Chores completed today.

- [ ] Dashboard photo / household photo moments:
  - A photo in the dashboard, something randomly selected from our family photos.

- [ ] Dashboard view designed for keyboardless/mouseless usage:
  - A view designed for keyboardless/mouseless usage, for example a tablet on the wall.

## Goals, Progress, and Motivation

- [ ] Progress toward a goal feature. This is broader than envelope savings goals:
  - If it’s a task series: could directly pull from the weight assigned to tasks in a task series, use those for showing a weighted percentage finished.
  - But that’s with the caveat that you’d have to have finished assigning the task series for it to give you an accurate percentage.
  - You could just add a task with a large weight at the end of what you’ve got so far to estimate how much more there will be.
  - Could also be something else: just a starting and ending number with a description.
  - Starting weight / goal weight. Then you update it whenever and it shows you how close you are to your goal, or what percentage of the way you are.
  - Also should show you your slope and maybe acceleration.
  - Memorizing verses: starting is `0`, ending is the number of verses to memorize. Make new entries along the way.
  - Writing a book: a bit tricky because how do you know how many pages there are? Maybe you can put zero as the starting number and leave the other blank. Then you just have an open-ended goal, with the word count showing how far you’ve gone. Can still get slope/acceleration that way.
  - What about group goals? Everyone to do `3000` pushups in the quarter. Starting is zero, ending is `3000`. Need a goal date/time too, so it can tell you if you’re on track or not. But need a way for the group to show all the different people doing it.
  - How about training for a marathon? How would that be updated? Maybe based on the daily training plan and following that?

- [ ] Goals / goal tracking beyond just envelope savings goals. Partially shipped now: envelope savings goals already exist, but broader goal tracking does not.

- [ ] Prize system for non-monetary currencies, for example:
  - `10` stars for candy.
  - `100` for a show.
  - Maybe a time-limited option to convert stars to monetary currency, for example this week `100` stars = `$1`.

## Chores, Scheduling, and Chore Views

Already partially implemented now: the core value/weight system for chores and allowance is in place. The items below are the remaining chore aspirations and missing workflow pieces.

- [ ] Time-of-day chores and richer timing windows:
  - Allow chores to be assigned during specific time periods of the day, using `timeOfDayDefinitions`.
  - This might include meal-based timings like `Before Breakfast`, which ends when breakfast is marked as started, or auto-ends at a set time like `11 am`.
  - Or `After Dinner`, which starts when dinner is marked done, or auto-starts at `7:30 pm`.
  - Need a way to manually short chores.
  - Also am/pm chores, or chores before/after certain things.

- [ ] Chore reminders:
  - At specific times of day?

- [ ] Chore preview / scheduling refinement. Partially shipped now: the detailed chore form already has an assignment preview, but it still needs:
  - Show completed vs. uncompleted chores in the assignment preview when editing a chore, to see historical status.
  - Make the chore preview more flexible to show other dates, for example for chores starting in the future or past.
  - Maybe implement lazy loading: load a month before and after what’s shown, and if the user scrolls towards the beginning/end, calculate and add another month of data.

- [ ] One-off and exception-day chore changes:
  - Add a one-off day to a chore.
  - What about moving a chore from one kid to another for the day? I think it creates an exception for the original kid for that day, and makes a new chore for the new kid for just a single day.

- [ ] Chore end dates, pauses, restarts, and schedule changes:
  - Ability to set end dates for chores.
  - Make a break: choose start and end date for the break. Can add multiple breaks.
  - This can be called a `pause`.
  - You should be able to put a chore on pause, and there is no need for the end of the pause.
  - It just modifies the end date of the RRULE, but needs to save the original one.
  - Then when it is unpaused later, it replaces the end date with the original end date, and inserts a series of exceptions to cover the time that was paused.
  - Implement pausing and restarting chores, potentially with an option to schedule these pauses/restarts.
  - `Restart` a chore: takes the end date, uses that as the start of an exception date range, and the end of the exception date range is the date they want to restart it.
  - Could optionally have a new end date or no end date.
  - Change the schedule for a chore.
  - Internally just split it into two events, each with their own RRULEs.
  - Should make use of exceptions.
  - Notify the user if they exist and will affect the new schedule, and ask if they still want to use them.

- [ ] Chore deletion and cleanup:
  - Refine chore deletion processes.

- [ ] Chore media:
  - Add a photo to completed chores.
  - Let chores have a photo or image.
  - Attachments on chores.

- [ ] Chore charts and matrix views:
  - Chore chart that displays all chores at once.
  - Chores assignment chart: show all chores as a column, and the family members as a row, and check marks for who is assigned to which chore.
  - Chores chart: show each chore vertically, with each kid who is assigned to that chore underneath the chore, and on the x axis show the dates, and show who has done their chore, and allow check offs there too.
  - Show the current period at the top on the calendar part.

- [ ] Show chores on the calendar:
  - Show all the chores on the calendar.
  - Can have filters:
    - show only a single chore
    - show only chores that are assigned to a given person or people
    - show both chores and calendar events or only one or the other
    - show or don’t show a given task series
  - If we have to do items, can show those too.
  - And even routines? For morning routines if I ever make that.

- [ ] Use the calendar recurrence logic in chore creation:
  - Put the calendar logic for making recurrences in the chore creation.

## Task Series, To-Dos, and Homeschool Workflows

Partially shipped now: task-series management, editing, hierarchy, day breaks, task notes, task attachments, and dashboard/day-view task completion all exist. The items below are the remaining aspirations.

- [ ] Task series completion states:
  - Task series needs another completion type: unable to fully complete now.
  - With a description of what is needed to be able to fully complete it.
  - So you have unfinished, complete, and unable to complete now.

- [ ] Task series answer/response fields:
  - Needs more fields.
  - Should have a way to enter an answer or a response.

- [ ] Task dependencies and sequencing. Partially shipped now: the current scheduler already handles the ordinary “next task in sequence” pattern inside a series, but the following are still unfinished:
  - Ability for tasks to start when another task is finished, for example previous day’s assignments.
  - If the preceding assignment is done, the next one appears on the next scheduled day for that subject.
  - This is essentially already implemented, but doesn’t yet allow one to have a task’s scheduling be based on tasks from other task series.
  - Assignments could depend on multiple other tasks, for example this one has to be after `X` but before `Y`.

- [ ] Dynamic subject / series rollover:
  - Chores, like school subjects, could change dynamically.
  - For example, `7th Grade English` gets marked as completely finished when all its To-Dos are done, and then `8th Grade English` starts if it’s after a certain date, for example `Aug 1st`.

- [ ] Work-ahead controls:
  - Need a way to work ahead.
  - Move on to the next assignment on the same day if desired, get ahead.
  - Possibly configurable per subject or assignment.

- [ ] Calendar-driven task-series editing:
  - Maybe could use the calendar interface as an alternate or extra way to edit/modify/create a task series.
  - Would have to make days in which the associated chore occurs editable and those in which it doesn’t not editable.
  - Show something about them so you can see the difference.
  - Could still stick in day breaks.
  - Bumps all the later tasks down a day.

- [ ] To-Do items as their own model or as a chore variant:
  - To do items. Like tasks that aren’t attached to any chore? Maybe.
  - But normally to do items can be scheduled for a certain day, or have a deadline at least.
  - Do we need deadlines for the task series items?
  - Associate To-Dos with a particular person.
  - Simple, effective regular lists.
  - Maybe To-Dos are just a specific kind of chore that only occurs once? Something to ponder.

- [ ] Homeschool / homework tracking extensions:
  - Kid homeschool/homework tracker, with items tagged for whether they can do it alone or only with a parent.
  - Building on the chores / homeschooling ideas above.

## Calendar, Events, Views, and Planning

Partially shipped now: the web calendar is already a substantial calendar product, and the iPhone app already has a simpler month-grid calendar. The items below are the remaining aspirations and gaps.

- [ ] Kid-created calendar items and family approval workflow:
  - Kids can make calendar items that pertain to them or other kids, but not to parents.
  - Can they make items that pertain to everyone?
  - Maybe we have parents approve those items, in a list of items to approve, before they get synced back to iCloud.
  - Or we have parents approve deletions of events in the case that the event was not made by the kid before those sync.
  - We need to keep track of which kid made any event.
  - Also we should only put tombstones on events that were deleted by kids so the deletion can be reversed.

- [ ] Calendar views and navigation:
  - Cleaner individual calendar views for multiple people.
  - More views.
  - Day view.
  - `3-4` day view.
  - Weekly view.
  - Agenda view, or list view.
  - Full year view.
  - `x` number of days view, can adjust from `1-7`, or maybe like `1-10`.
  - Probably could add infinite scroll to that one.
  - More views, lazy loading with scrolling to other weeks/months/years.
  - Already have `1` month, but should add in settings a button to show `1` single month.
  - A view that shows events on multiple weeks but with time markings, maybe only if only `2` weeks or less are shown.

- [ ] Calendar display controls:
  - Better controls to turn on/off Gregorian and Bikram Samvat.

- [ ] Event emphasis / visual metadata:
  - Calendar events need an emphasis number, `1-15`, if they are circled or underlined.
  - Need to add the circles/underlines.
  - Need to adjust those so they can show a chosen color instead of a random one.
  - Should remain centered on the item.
  - They should also have something to mark them as important, in the context of a whole year, to show them on the years calendar.
  - Custom metadata for events: circle or highlight events, mark an event as `major`, to show only major events on yearly/other views.

- [ ] More flexible event timing models:
  - Flexible event timings:
    - all-day
    - specific time
    - no particular time, which shows differently from all-day
    - broader time periods:
      - Early morning
      - Morning
      - Mid-day
      - Afternoon
      - Evening
      - Night
      - Middle of the night

- [ ] Better multi-day event rendering. Partially shipped now: the web calendar already does same-week single-block rendering for multi-day events, but the remaining desired behavior is still:
  - The year calendar that shows months vertically needs a way to show a multi-day event, especially if there are multiple multi-day events overlapping.
  - Need to show multi-day events as a single block on the monthly calendar, and across the top of a week calendar.
  - Can also use Greedy Interval Coloring Algorithm to put multiday events on the vertical month year-long calendar.

- [ ] Timed-event layout and dense-calendar handling:
  - Need robust UI and code for calendar items scheduled at a certain time of day, on a day view or a several days view which shows the hours.
  - Can use the Greedy Interval Coloring Algorithm to put all day events on the top bar.
  - When viewing a month calendar, should put the time of an event next to its title or under it.
  - Should constrain the height of a single calendar day and make it scrollable within the day when there are too many events.

- [ ] Event creation / interaction polish. Partially shipped now: drag/drop rescheduling exists on the web, but the following still do not:
  - Click and drag across days, or across times, to make multi-day events.

- [ ] Calendar media:
  - Add photos to events on the calendar.
  - Attachments on calendar events.

- [ ] Calendar sync and external calendar interoperability:
  - Maybe syncing with Google or Apple calendars.
  - Two-way sync with Google Calendar, Apple Calendar, or CalDAV servers.

## Finance, Allowance, and Money Tools

Partially shipped now: the web finance system is already real and broad, and the native iPhone finance area already exists. The items below are the unfinished aspirational pieces.

- [ ] Sophisticated deposit rules:
  - Set up sophisticated rules for deposits.
  - For example, first `$2` into envelope `A`, then of the remainder: `20%` into envelope `B` and `80%` into envelope `C`.

- [ ] Native iPhone finance parity. Partially shipped now: the native finance tab exists and the native allowance-distribution screen is a preview, but it still needs to get closer to the fuller web workflow, especially around allowance distribution.

- [ ] Transaction viewing improvements:
  - Add a graph next to the transaction list.
  - This graph should somehow incorporate savings goal amounts for envelopes.
  - Maybe different colors for each envelope, with the total in its own color, showing progress towards goals.
  - Include a running total in the transaction list, either per currency or as a combined total in a chosen currency.
  - Allow filtering transactions by envelope.

- [ ] Simulated-date / future-period behavior:
  - Figure out the best way to handle future periods that are simulated and then marked as done.
  - Should deposits also be marked as simulated?
  - Or maybe simplify/hide the simulated date option.

- [ ] Transfer security / approval:
  - Kid’s passcode needed to activate transfers out.
  - Parent passcode already activates parent mode, full transfer/deposit rights.

- [ ] Finance UI integration:
  - Integrate the `familyMemberDetail` page more smoothly into the main interface.
  - Perhaps as a pop-up or section accessible from a family member’s chore list.

- [ ] Allowance adjustments over time:
  - Develop a system for managing changes to set allowance amounts.
  - For example, schedule future raises, change currencies, or apply changes retroactively or from the current time.

- [ ] Use the envelope allowance system as a foundation for a fuller budgeting system:
  - Use the envelope allowance system as a foundation for a full multi-currency, YNAB-style envelope budgeting system.

## Search, Communication, and Family Life

- [ ] Search:
  - Search for calendar items.
  - Search for chores.
  - Search for other stuff?

- [ ] Family rules.

- [ ] Status updates, announcements, or notes:
  - Just a field that prominently displays somewhere that you can put whatever text in.
  - Rich?
  - Md?

- [ ] The stories we tell of our family, what God has done.

- [ ] Prayer requests.

- [ ] Family Bible memory passage display:
  - Current family Bible memory passage display.

- [ ] Hymn / song of the week:
  - Hymn of the week.
  - Current family hymn/song of the week.

- [ ] Messaging:
  - Simple messaging between family members within the app.

- [ ] Email:
  - Email inside the app. Maybe.

- [ ] Audio / text to speech:
  - Use fish audio Goku voice?
  - Or clone one of our kids.
  - `F5-tts` with cloned Judah sounds pretty good.
  - Maybe use that?

## Integrations, Platforms, and Extensibility

- [ ] Meal planning:
  - Connections to Mealie, or another self-hosted recipe app, for recipes and meal planning.

- [ ] Photo stream:
  - Connect to an Immage photo server for a family photostream.

- [ ] Better offline / broader platform reach. Partially shipped now: there is already a web app, a native iPhone app, and PWA support, but the remaining aspirations are:
  - Make the Progressive Web App, PWA, much better for full offline use on any device.
  - Keep rounding out the native iOS app.
  - Maybe Android too.

- [ ] Routine manager:
  - Routine manager, for example passage of time-aware items to playback as part of a morning routine.

- [ ] Open-ended extensibility:
  - And whatever else sounds fun or useful.

## Bugs, Correctness Issues, and Behavior Gaps

- [ ] Envelope deletion edge case:
  - If an empty envelope is deleted, it should just give an `are you sure` message and not ask where to transfer funds to, since there are none.

- [ ] Up-for-grabs / allowance-distribution bugs:
  - Non-monetary up-for-grabs chores aren’t getting properly deposited along with monetary chores, even though they show up in the allowance distribution calculation.
  - The way chore period allowance distribution info, especially with up-for-grabs items, is shown needs to be arranged more clearly.
  - When an up-for-grabs chore is done, while it disables it for others, it doesn’t give them a message about who has already done it.
  - When an up-for-grabs chore is done, and you are viewing the chore list of the person who completed it, its name shouldn’t be struck through, as it’s a completed task for them, not an unavailable one.

- [ ] Currency / undefined-unit bug:
  - If a new currency is made and is not defined, for example no exchange rate or type, and money in that currency is deposited, the `familyMemberDetail` Total Balance hangs on loading.
