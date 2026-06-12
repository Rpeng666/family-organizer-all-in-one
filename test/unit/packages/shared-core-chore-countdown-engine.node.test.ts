import { describe, expect, it } from 'vitest';
import {
    computeCountdownTimelines,
    offsetToTimestampMs,
    type CountdownChoreInput,
    type CountdownEngineInput,
    type CountdownSettings,
    type SharedScheduleSettings,
    type SharedRoutineMarkerStatusLike,
    type SharedChoreLike,
    DEFAULT_COUNTDOWN_SETTINGS,
    getDefaultScheduleSettings,
} from '@family-organizer/shared-core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_DATE = new Date('2026-03-31T00:00:00Z');
const SCHEDULE = getDefaultScheduleSettings(); // dayBoundary = 03:00

function makeChoreInput(overrides: Partial<CountdownChoreInput> = {}): CountdownChoreInput {
    return {
        id: overrides.id ?? 'chore-1',
        title: overrides.title ?? 'Test chore',
        estimatedDurationSecs: 'estimatedDurationSecs' in overrides ? overrides.estimatedDurationSecs! : 300,
        weight: overrides.weight ?? null,
        sortOrder: overrides.sortOrder ?? 0,
        isJoint: overrides.isJoint ?? false,
        assigneeIds: overrides.assigneeIds ?? ['person-a'],
        timingMode: overrides.timingMode ?? 'before_time',
        timingConfig: overrides.timingConfig ?? { mode: 'before_time', time: '09:00' },
        timeBucket: overrides.timeBucket ?? null,
        completedAt: overrides.completedAt ?? null,
        memberCompletions: overrides.memberCompletions ?? {},
    };
}

function makeChoreLike(input: CountdownChoreInput): SharedChoreLike {
    return {
        id: input.id,
        title: input.title,
        startDate: TEST_DATE.toISOString().slice(0, 10),
        timingMode: input.timingMode,
        timingConfig: input.timingConfig,
        timeBucket: input.timeBucket,
        sortOrder: input.sortOrder,
        weight: input.weight,
        isJoint: input.isJoint,
        assignees: input.assigneeIds.map((id) => ({ id })),
        completions: [],
    };
}

function makeInput(
    chores: CountdownChoreInput[],
    overrides: Partial<Omit<CountdownEngineInput, 'chores'>> = {},
): CountdownEngineInput {
    return {
        chores,
        routineMarkerStatuses: overrides.routineMarkerStatuses ?? [],
        allChoresRaw: overrides.allChoresRaw ?? chores.map(makeChoreLike),
        countdownSettings: overrides.countdownSettings ?? { ...DEFAULT_COUNTDOWN_SETTINGS, stackBufferSecs: 0 },
        scheduleSettings: overrides.scheduleSettings ?? SCHEDULE,
        now: overrides.now ?? new Date('2026-03-31T07:00:00'), // 7 AM local
        date: overrides.date ?? TEST_DATE,
        manualStarts: overrides.manualStarts,
        collisionDecisions: overrides.collisionDecisions,
    };
}

/**
 * Get the offset in ms from family day start (03:00) for a given local time string.
 * E.g. '09:00' with boundary 03:00 → offset = 360 minutes = 21600000 ms.
 */
function localTimeToMs(timeStr: string): number {
    return offsetToTimestampMs(
        parseTimeToOffset(timeStr),
        TEST_DATE,
        SCHEDULE,
    );
}

/** Convert HH:MM to family-day offset in minutes (boundary = 03:00). */
function parseTimeToOffset(timeStr: string): number {
    const [h, m] = timeStr.split(':').map(Number);
    const minuteOfDay = h * 60 + m;
    const boundary = 180; // 03:00
    return minuteOfDay >= boundary ? minuteOfDay - boundary : 1440 - boundary + minuteOfDay;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chore-countdown-engine', () => {
    describe('basic deadline packing', () => {
        it('places a single before_time chore ending at the deadline', () => {
            const chore = makeChoreInput({
                id: 'brush-teeth',
                title: 'Brush teeth',
                estimatedDurationSecs: 170,
                timingMode: 'before_time',
                timingConfig: { mode: 'before_time', time: '09:00' },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            const timeline = result.timelines['person-a'];

            expect(timeline).toBeDefined();
            expect(timeline.slots).toHaveLength(1);

            const slot = timeline.slots[0];
            expect(slot.choreId).toBe('brush-teeth');
            expect(slot.countdownEndMs).toBe(localTimeToMs('09:00'));
            expect(slot.durationSecs).toBe(170);
            // Start should be 170 seconds before 9:00.
            expect(slot.countdownStartMs).toBe(localTimeToMs('09:00') - 170_000);
        });

        it('stacks two chores right-to-left against the same deadline', () => {
            const chores = [
                makeChoreInput({
                    id: 'make-bed',
                    title: 'Make bed',
                    estimatedDurationSecs: 150,
                    sortOrder: 0,
                }),
                makeChoreInput({
                    id: 'brush-teeth',
                    title: 'Brush teeth',
                    estimatedDurationSecs: 170,
                    sortOrder: 1,
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));
            const slots = result.timelines['person-a'].slots;

            expect(slots).toHaveLength(2);
            // Both share deadline 09:00. sortOrder 1 (brush teeth) is closer to deadline.
            // brush-teeth: ends at 09:00, starts at 09:00 - 170s
            // make-bed: ends at brush-teeth.start, starts at that - 150s
            expect(slots[0].choreId).toBe('make-bed');
            expect(slots[1].choreId).toBe('brush-teeth');
            expect(slots[1].countdownEndMs).toBe(localTimeToMs('09:00'));
            expect(slots[0].countdownEndMs).toBe(slots[1].countdownStartMs);
        });

        it('inserts buffer between stacked deadline chores', () => {
            const chores = [
                makeChoreInput({
                    id: 'a',
                    title: 'A',
                    estimatedDurationSecs: 60,
                    sortOrder: 0,
                }),
                makeChoreInput({
                    id: 'b',
                    title: 'B',
                    estimatedDurationSecs: 60,
                    sortOrder: 1,
                }),
            ];

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                stackBufferSecs: 30,
            };
            const result = computeCountdownTimelines(
                makeInput(chores, { countdownSettings: settings }),
            );
            const slots = result.timelines['person-a'].slots;

            expect(slots).toHaveLength(2);
            // B ends at 09:00, A ends at B.start - 30s buffer.
            const gap = slots[1].countdownStartMs - slots[0].countdownEndMs;
            expect(gap).toBe(30_000);
        });
    });

    describe('named_window deadline', () => {
        it('uses the window end time as deadline for named_window chores', () => {
            // 'morning' window: startMinute=420 (7:00), endMinute=660 (11:00)
            const chore = makeChoreInput({
                id: 'morning-chore',
                title: 'Morning chore',
                estimatedDurationSecs: 600, // 10 min
                timingMode: 'named_window',
                timingConfig: { mode: 'named_window', namedWindowKey: 'morning' },
                timeBucket: 'morning',
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            const slot = result.timelines['person-a'].slots[0];

            expect(slot.countdownEndMs).toBe(localTimeToMs('11:00'));
            expect(slot.durationSecs).toBe(600);
        });
    });

    describe('between_times deadline', () => {
        it('uses window endTime as deadline', () => {
            const chore = makeChoreInput({
                id: 'homework',
                title: 'Homework',
                estimatedDurationSecs: 1800, // 30 min
                timingMode: 'between_times',
                timingConfig: {
                    mode: 'between_times',
                    window: { startTime: '15:00', endTime: '17:00' },
                },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            const slot = result.timelines['person-a'].slots[0];

            expect(slot.countdownEndMs).toBe(localTimeToMs('17:00'));
        });
    });

    describe('start-driven packing', () => {
        it('places an after_time chore at anchor + delay', () => {
            const chore = makeChoreInput({
                id: 'after-chore',
                title: 'After school task',
                estimatedDurationSecs: 600,
                timingMode: 'after_time',
                timingConfig: { mode: 'after_time', time: '15:00' },
            });

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                afterAnchorDefaultDelaySecs: 300, // 5 min
            };
            const result = computeCountdownTimelines(
                makeInput([chore], { countdownSettings: settings }),
            );
            const slot = result.timelines['person-a'].slots[0];

            expect(slot.countdownStartMs).toBe(localTimeToMs('15:00') + 300_000);
            expect(slot.scheduleType).toBe('start');
        });

        it('stacks multiple start-driven chores left-to-right', () => {
            const chores = [
                makeChoreInput({
                    id: 'a',
                    title: 'A',
                    estimatedDurationSecs: 120,
                    sortOrder: 0,
                    timingMode: 'after_time',
                    timingConfig: { mode: 'after_time', time: '15:00' },
                }),
                makeChoreInput({
                    id: 'b',
                    title: 'B',
                    estimatedDurationSecs: 180,
                    sortOrder: 1,
                    timingMode: 'after_time',
                    timingConfig: { mode: 'after_time', time: '15:00' },
                }),
            ];

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                afterAnchorDefaultDelaySecs: 0,
                stackBufferSecs: 0,
            };
            const result = computeCountdownTimelines(
                makeInput(chores, { countdownSettings: settings }),
            );
            const slots = result.timelines['person-a'].slots;

            expect(slots).toHaveLength(2);
            expect(slots[0].choreId).toBe('a');
            expect(slots[1].choreId).toBe('b');
            expect(slots[1].countdownStartMs).toBe(slots[0].countdownEndMs);
        });
    });

    describe('per-marker delay override', () => {
        it('uses per-marker delay when configured', () => {
            const chore = makeChoreInput({
                id: 'after-breakfast',
                title: 'After breakfast chore',
                estimatedDurationSecs: 300,
                timingMode: 'after_marker',
                timingConfig: {
                    mode: 'after_marker',
                    anchor: { sourceType: 'routine', routineKey: 'breakfast', relation: 'after', fallbackTime: '08:30' },
                },
            });

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                afterAnchorDefaultDelaySecs: 300,
                perMarkerAfterDelaySecs: { breakfast: 120 }, // 2 min override
            };
            const result = computeCountdownTimelines(
                makeInput([chore], { countdownSettings: settings }),
            );
            const slot = result.timelines['person-a'].slots[0];

            // Anchor = fallback 08:30 + 120s delay.
            const expectedStart = localTimeToMs('08:30') + 120_000;
            expect(slot.countdownStartMs).toBe(expectedStart);
        });
    });

    describe('duration from weight fallback', () => {
        it('uses weight × 60 when estimatedDurationSecs is null', () => {
            const chore = makeChoreInput({
                id: 'weighted',
                title: 'Weighted chore',
                estimatedDurationSecs: null,
                weight: 3, // 3 XP = 180 seconds
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            const slot = result.timelines['person-a'].slots[0];

            expect(slot.durationSecs).toBe(180);
        });

        it('skips chores with zero or negative weight and no duration', () => {
            const chores = [
                makeChoreInput({
                    id: 'zero-weight',
                    title: 'Zero weight',
                    estimatedDurationSecs: null,
                    weight: 0,
                }),
                makeChoreInput({
                    id: 'negative-weight',
                    title: 'Negative weight',
                    estimatedDurationSecs: null,
                    weight: -1,
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));
            expect(result.timelines['person-a']).toBeUndefined();
        });
    });

    describe('completed chore exclusion', () => {
        it('excludes fully completed chores', () => {
            const chore = makeChoreInput({
                completedAt: '2026-03-31T08:00:00Z',
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            expect(result.timelines['person-a']).toBeUndefined();
        });

        it('marks per-member completed chores as completed and keeps active members', () => {
            const chore = makeChoreInput({
                assigneeIds: ['person-a', 'person-b'],
                memberCompletions: { 'person-a': '2026-03-31T08:00:00Z' },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            // person-a should have a completed slot.
            expect(result.timelines['person-a']?.slots).toHaveLength(1);
            expect(result.timelines['person-a'].slots[0].state).toBe('completed');
            // person-b should have an active/upcoming slot.
            expect(result.timelines['person-b']?.slots).toHaveLength(1);
            expect(result.timelines['person-b'].slots[0].state).not.toBe('completed');
        });
    });

    describe('slot states', () => {
        it('marks slot as upcoming when now < start', () => {
            const chore = makeChoreInput({
                timingConfig: { mode: 'before_time', time: '12:00' },
                estimatedDurationSecs: 60,
            });

            const result = computeCountdownTimelines(
                makeInput([chore], { now: new Date('2026-03-31T07:00:00') }),
            );
            expect(result.timelines['person-a'].slots[0].state).toBe('upcoming');
        });

        it('marks slot as active when now is within the slot', () => {
            const chore = makeChoreInput({
                timingConfig: { mode: 'before_time', time: '09:00' },
                estimatedDurationSecs: 300, // 5 min before 9:00 = starts 8:55
            });

            // 8:57 is within 8:55-9:00
            const result = computeCountdownTimelines(
                makeInput([chore], { now: new Date('2026-03-31T08:57:00') }),
            );
            expect(result.timelines['person-a'].slots[0].state).toBe('active');
        });

        it('marks slot as overdue_active when now > end and not completed', () => {
            const chore = makeChoreInput({
                timingConfig: { mode: 'before_time', time: '09:00' },
                estimatedDurationSecs: 60,
            });

            const result = computeCountdownTimelines(
                makeInput([chore], { now: new Date('2026-03-31T09:05:00') }),
            );
            expect(result.timelines['person-a'].slots[0].state).toBe('overdue_active');
        });

        it('marks slot as completed when member has completion', () => {
            const chore = makeChoreInput({
                memberCompletions: { 'person-a': '2026-03-31T08:58:00Z' },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            expect(result.timelines['person-a'].slots[0].state).toBe('completed');
        });
    });

    describe('anytime chores', () => {
        it('excludes anytime chores unless manually started', () => {
            const chore = makeChoreInput({
                timingMode: 'anytime',
                timingConfig: { mode: 'anytime' },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            expect(result.timelines['person-a']).toBeUndefined();
        });

        it('includes anytime chores when manually started', () => {
            const chore = makeChoreInput({
                id: 'anytime-chore',
                timingMode: 'anytime',
                timingConfig: { mode: 'anytime' },
            });

            const result = computeCountdownTimelines(
                makeInput([chore], {
                    manualStarts: { 'anytime-chore': '2026-03-31T08:00:00' },
                }),
            );
            expect(result.timelines['person-a']?.slots).toHaveLength(1);
            expect(result.timelines['person-a'].slots[0].scheduleType).toBe('manual');
        });
    });

    describe('collision detection', () => {
        it('detects overlap between start-driven and deadline-driven slots', () => {
            const chores = [
                // Start-driven: starts at 8:30 + 0 delay, 60 min → 8:30-9:30
                makeChoreInput({
                    id: 'start-chore',
                    title: 'Long task',
                    estimatedDurationSecs: 3600,
                    sortOrder: 0,
                    timingMode: 'after_time',
                    timingConfig: { mode: 'after_time', time: '08:30' },
                }),
                // Deadline-driven: before 9:15, 10 min → 9:05-9:15
                makeChoreInput({
                    id: 'deadline-chore',
                    title: 'Quick task',
                    estimatedDurationSecs: 600,
                    sortOrder: 0,
                    timingMode: 'before_time',
                    timingConfig: { mode: 'before_time', time: '09:15' },
                }),
            ];

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                afterAnchorDefaultDelaySecs: 0,
                stackBufferSecs: 0,
            };
            const result = computeCountdownTimelines(
                makeInput(chores, { countdownSettings: settings }),
            );
            const timeline = result.timelines['person-a'];

            expect(timeline.collisions).toHaveLength(1);
            expect(timeline.collisions[0].startDrivenChoreId).toBe('start-chore');
            expect(timeline.collisions[0].deadlineDrivenChoreId).toBe('deadline-chore');
        });
    });

    describe('joint chore constraint propagation', () => {
        it('aligns joint chore start to the earliest participant need', () => {
            // Sarala: make-bed (3m) + clean-living-room (10m, joint) before 11:00
            // Judah: clean-living-room (10m, joint) + sweep-floor (5m) before 11:00
            // Judah's schedule is tighter, so clean-living-room must start at
            // 11:00 - 5m - 10m = 10:45, which pushes Sarala's make-bed to 10:42.
            const chores = [
                makeChoreInput({
                    id: 'make-bed',
                    title: 'Make your bed',
                    estimatedDurationSecs: 180,
                    sortOrder: 0,
                    assigneeIds: ['sarala'],
                    timingMode: 'named_window',
                    timingConfig: { mode: 'named_window', namedWindowKey: 'morning' },
                    timeBucket: 'morning',
                }),
                makeChoreInput({
                    id: 'clean-living-room',
                    title: 'Clean the living room',
                    estimatedDurationSecs: 600,
                    sortOrder: 1,
                    isJoint: true,
                    assigneeIds: ['sarala', 'judah'],
                    timingMode: 'named_window',
                    timingConfig: { mode: 'named_window', namedWindowKey: 'morning' },
                    timeBucket: 'morning',
                }),
                makeChoreInput({
                    id: 'sweep-floor',
                    title: 'Sweep the floor',
                    estimatedDurationSecs: 300,
                    sortOrder: 2,
                    assigneeIds: ['judah'],
                    timingMode: 'named_window',
                    timingConfig: { mode: 'named_window', namedWindowKey: 'morning' },
                    timeBucket: 'morning',
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));

            const saralaSlots = result.timelines['sarala']?.slots ?? [];
            const judahSlots = result.timelines['judah']?.slots ?? [];

            // Find clean-living-room for both.
            const saralaCLR = saralaSlots.find((s) => s.choreId === 'clean-living-room');
            const judahCLR = judahSlots.find((s) => s.choreId === 'clean-living-room');

            expect(saralaCLR).toBeDefined();
            expect(judahCLR).toBeDefined();
            // Joint chore should start at the same time for both.
            expect(saralaCLR!.countdownStartMs).toBe(judahCLR!.countdownStartMs);

            // Judah's sweep should end at 11:00, CLR before it.
            const sweepSlot = judahSlots.find((s) => s.choreId === 'sweep-floor');
            expect(sweepSlot).toBeDefined();
            expect(sweepSlot!.countdownEndMs).toBe(localTimeToMs('11:00'));

            // Sarala's make-bed should be before CLR.
            const makeBedSlot = saralaSlots.find((s) => s.choreId === 'make-bed');
            expect(makeBedSlot).toBeDefined();
            expect(makeBedSlot!.countdownEndMs).toBeLessThanOrEqual(saralaCLR!.countdownStartMs);
        });
    });

    describe('target timestamps, manual starts, and stacked chaining', () => {
        it('populates targetStartMs/targetEndMs equal to initial countdown times when no shift', () => {
            const chore = makeChoreInput({
                estimatedDurationSecs: 300,
                timingConfig: { mode: 'before_time', time: '09:00' },
            });
            const result = computeCountdownTimelines(makeInput([chore]));
            const slot = result.timelines['person-a'].slots[0];
            expect(slot.targetEndMs).toBe(localTimeToMs('09:00'));
            expect(slot.targetStartMs).toBe(localTimeToMs('09:00') - 300_000);
            expect(slot.countdownStartMs).toBe(slot.targetStartMs);
            expect(slot.countdownEndMs).toBe(slot.targetEndMs);
        });

        it('manual start shifts effective start and end for a single chore', () => {
            const chore = makeChoreInput({
                estimatedDurationSecs: 300,
                timingConfig: { mode: 'before_time', time: '09:00' },
            });
            // Target start is 08:55, target end is 09:00.
            // Manually start at 08:50 (5 min early).
            const manualStartIso = '2026-03-31T08:50:00';
            const result = computeCountdownTimelines(
                makeInput([chore], { manualStarts: { 'chore-1': manualStartIso } }),
            );
            const slot = result.timelines['person-a'].slots[0];
            const manualMs = new Date(manualStartIso).getTime();

            // Effective times are shifted.
            expect(slot.countdownStartMs).toBe(manualMs);
            expect(slot.countdownEndMs).toBe(manualMs + 300_000);
            // Target times are unchanged.
            expect(slot.targetStartMs).toBe(localTimeToMs('09:00') - 300_000);
            expect(slot.targetEndMs).toBe(localTimeToMs('09:00'));
        });

        it('manual start without completion does not shift stacked successor', () => {
            // Two stacked chores (brush then bed, same deadline).
            const chores = [
                makeChoreInput({
                    id: 'bed',
                    estimatedDurationSecs: 60,
                    sortOrder: 1,
                }),
                makeChoreInput({
                    id: 'brush',
                    estimatedDurationSecs: 60,
                    sortOrder: 0,
                }),
            ];

            // Manually start brush early but don't complete it.
            // Bed stays at its target time until brush is completed.
            const manualStartIso = '2026-03-31T08:57:00';
            const result = computeCountdownTimelines(
                makeInput(chores, {
                    countdownSettings: { ...DEFAULT_COUNTDOWN_SETTINGS, stackBufferSecs: 15 },
                    manualStarts: { brush: manualStartIso },
                }),
            );
            const brush = result.timelines['person-a'].slots.find((s) => s.choreId === 'brush')!;
            const bed = result.timelines['person-a'].slots.find((s) => s.choreId === 'bed')!;

            const manualMs = new Date(manualStartIso).getTime();
            expect(brush.countdownStartMs).toBe(manualMs);
            expect(brush.countdownEndMs).toBe(manualMs + 60_000);
            // Bed stays at target — brush isn't completed yet.
            expect(bed.countdownStartMs).toBe(bed.targetStartMs);
            expect(bed.countdownEndMs).toBe(bed.targetEndMs);
        });

        it('completing a stacked chore late pushes the successor', () => {
            // Brush (3 min) stacked before bed (3 min), deadline 09:00, buffer 15s.
            // Right-to-left packing: bed ends at 09:00, brush ends before bed.
            const chores = [
                makeChoreInput({
                    id: 'bed',
                    estimatedDurationSecs: 180,
                    sortOrder: 1,
                }),
                makeChoreInput({
                    id: 'brush',
                    estimatedDurationSecs: 180,
                    sortOrder: 0,
                    memberCompletions: {
                        // 30s late relative to brush's target end.
                        'person-a': '2026-03-31T08:57:15',
                    },
                }),
            ];

            const result = computeCountdownTimelines(
                makeInput(chores, {
                    countdownSettings: { ...DEFAULT_COUNTDOWN_SETTINGS, stackBufferSecs: 15 },
                    now: new Date('2026-03-31T08:57:30'),
                }),
            );
            const bed = result.timelines['person-a'].slots.find((s) => s.choreId === 'bed')!;

            // Target times unchanged.
            expect(bed.targetEndMs).toBe(localTimeToMs('09:00'));

            // Bed chains from brush completion: starts at 08:57:15 + 15s buffer.
            const completedMs = new Date('2026-03-31T08:57:15').getTime();
            expect(bed.countdownStartMs).toBe(completedMs + 15_000);
            expect(bed.countdownEndMs).toBe(completedMs + 15_000 + 180_000);
        });

        it('completing a stacked chore early pulls the successor earlier', () => {
            const chores = [
                makeChoreInput({
                    id: 'bed',
                    estimatedDurationSecs: 60,
                    sortOrder: 1,
                }),
                makeChoreInput({
                    id: 'brush',
                    estimatedDurationSecs: 60,
                    sortOrder: 0,
                    memberCompletions: {
                        // 30s early.
                        'person-a': '2026-03-31T08:58:15',
                    },
                }),
            ];

            const result = computeCountdownTimelines(
                makeInput(chores, {
                    countdownSettings: { ...DEFAULT_COUNTDOWN_SETTINGS, stackBufferSecs: 15 },
                }),
            );
            const bed = result.timelines['person-a'].slots.find((s) => s.choreId === 'bed')!;

            const completedMs = new Date('2026-03-31T08:58:15').getTime();
            expect(bed.countdownStartMs).toBe(completedMs + 15_000); // 08:58:30
            expect(bed.countdownEndMs).toBe(completedMs + 15_000 + 60_000); // 08:59:30
            // 30s ahead.
            expect((bed.targetEndMs - bed.countdownEndMs) / 1000).toBe(30);
        });

        it('does NOT chain unstacked chores (different deadlines with a gap)', () => {
            const chores = [
                makeChoreInput({
                    id: 'dining',
                    estimatedDurationSecs: 300, // 5 min → 12:35–12:40
                    sortOrder: 0,
                    timingConfig: { mode: 'before_time', time: '12:40' },
                    memberCompletions: {
                        'person-a': '2026-03-31T12:37:00', // 3 min early
                    },
                }),
                makeChoreInput({
                    id: 'dishes',
                    estimatedDurationSecs: 600, // 10 min → 12:50–13:00
                    sortOrder: 1,
                    timingConfig: { mode: 'before_time', time: '13:00' },
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));
            const dishes = result.timelines['person-a'].slots.find((s) => s.choreId === 'dishes')!;

            // Dishes should not have shifted — not stacked with dining.
            expect(dishes.countdownStartMs).toBe(dishes.targetStartMs);
            expect(dishes.countdownEndMs).toBe(dishes.targetEndMs);
        });

        it('chains through a 3-chore stack when first two are completed during countdown', () => {
            // A → B → C, all stacked with 15s buffer, deadline 09:00.
            // Each 60s. Packing (right-to-left):
            //   C: 08:59:00–09:00:00
            //   B: 08:57:45–08:58:45
            //   A: 08:56:30–08:57:30
            //
            // A completes at 08:57:00 (during its countdown) → B chains at 08:57:15
            // B completes at 08:57:45 (during its chained countdown) → C chains at 08:58:00
            const chores = [
                makeChoreInput({
                    id: 'c',
                    estimatedDurationSecs: 60,
                    sortOrder: 2,
                }),
                makeChoreInput({
                    id: 'b',
                    estimatedDurationSecs: 60,
                    sortOrder: 1,
                    memberCompletions: {
                        'person-a': '2026-03-31T08:57:45',
                    },
                }),
                makeChoreInput({
                    id: 'a',
                    estimatedDurationSecs: 60,
                    sortOrder: 0,
                    memberCompletions: {
                        'person-a': '2026-03-31T08:57:00',
                    },
                }),
            ];

            const result = computeCountdownTimelines(
                makeInput(chores, {
                    countdownSettings: { ...DEFAULT_COUNTDOWN_SETTINGS, stackBufferSecs: 15 },
                    now: new Date('2026-03-31T08:58:00'),
                }),
            );
            const slotC = result.timelines['person-a'].slots.find((s) => s.choreId === 'c')!;

            // B completed at 08:57:45 → C chains at 08:58:00.
            const bCompletedMs = new Date('2026-03-31T08:57:45').getTime();
            expect(slotC.countdownStartMs).toBe(bCompletedMs + 15_000);
            expect(slotC.countdownEndMs).toBe(bCompletedMs + 15_000 + 60_000);
        });

        it('ignores stale manual start for a completed chore', () => {
            // A chore was started early via "Start Now", then completed. The
            // manual start record still exists but should be ignored since the
            // chore is already done — otherwise the countdown page would show
            // the chore as hours overdue on its next occurrence.
            const chore = makeChoreInput({
                estimatedDurationSecs: 300,
                timingConfig: { mode: 'before_time', time: '09:00' },
                memberCompletions: {
                    'person-a': '2026-03-31T08:56:00',
                },
            });
            const manualStartIso = '2026-03-31T07:00:00'; // stale: 2 hours early
            const result = computeCountdownTimelines(
                makeInput([chore], { manualStarts: { 'chore-1': manualStartIso } }),
            );
            const slot = result.timelines['person-a'].slots[0];

            // Manual start should be ignored — chore uses target times.
            expect(slot.countdownStartMs).toBe(slot.targetStartMs);
            expect(slot.countdownEndMs).toBe(slot.targetEndMs);
            expect(slot.state).toBe('completed');
        });

        it('after_chore chains with buffer (not afterDelay) when anchor completes during countdown', () => {
            // Chore A (after_time 08:00, 5 min duration, afterDelay 5 min)
            // → target: 08:05–08:10. Completed at 08:08 (during countdown).
            // Chore B (after_chore anchored to A) should chain at
            // completionTime + buffer (not afterDelay).
            const choreA = makeChoreInput({
                id: 'chore-a',
                title: 'Chore A',
                estimatedDurationSecs: 300,
                timingMode: 'after_time',
                timingConfig: { mode: 'after_time', time: '08:00' },
                sortOrder: 0,
                memberCompletions: {
                    'person-a': '2026-03-31T08:08:00', // completed during countdown
                },
            });
            const choreB = makeChoreInput({
                id: 'chore-b',
                title: 'Chore B',
                estimatedDurationSecs: 300,
                timingMode: 'after_chore',
                timingConfig: {
                    mode: 'chore_anchor',
                    anchor: { relation: 'after', sourceChoreId: 'chore-a' },
                },
                sortOrder: 1,
            });
            const chores = [choreA, choreB];

            const allChoresRaw = chores.map((c) => {
                const like = makeChoreLike(c);
                if (c.id === 'chore-a') {
                    like.completions = [{
                        completed: true,
                        dateDue: '2026-03-31',
                        dateCompleted: '2026-03-31T08:08:00',
                    }];
                }
                return like;
            });

            const result = computeCountdownTimelines(
                makeInput(chores, {
                    allChoresRaw,
                    countdownSettings: {
                        ...DEFAULT_COUNTDOWN_SETTINGS,
                        stackBufferSecs: 15,
                        afterAnchorDefaultDelaySecs: 300,
                    },
                    now: new Date('2026-03-31T08:09:00'),
                }),
            );
            const slotB = result.timelines['person-a'].slots.find((s) => s.choreId === 'chore-b')!;

            const completedMs = new Date('2026-03-31T08:08:00').getTime();
            expect(slotB.countdownStartMs).toBe(completedMs + 15_000);
            expect(slotB.countdownEndMs).toBe(completedMs + 15_000 + 300_000);
        });

        it('after_chore uses afterDelay (not buffer) when anchor completed before countdown', () => {
            // Chore A (after_time 08:00, 5 min duration, afterDelay 5 min)
            // → target: 08:05–08:10. Completed at 08:03 (BEFORE countdown
            // started — done from chores list). The timing resolver places
            // chore B at completionTime + afterDelay. The engine should NOT
            // override that with buffer-only chaining.
            const choreA = makeChoreInput({
                id: 'chore-a',
                title: 'Chore A',
                estimatedDurationSecs: 300,
                timingMode: 'after_time',
                timingConfig: { mode: 'after_time', time: '08:00' },
                sortOrder: 0,
                memberCompletions: {
                    'person-a': '2026-03-31T08:03:00', // before countdown started
                },
            });
            const choreB = makeChoreInput({
                id: 'chore-b',
                title: 'Chore B',
                estimatedDurationSecs: 300,
                timingMode: 'after_chore',
                timingConfig: {
                    mode: 'chore_anchor',
                    anchor: { relation: 'after', sourceChoreId: 'chore-a' },
                },
                sortOrder: 1,
            });
            const chores = [choreA, choreB];

            const allChoresRaw = chores.map((c) => {
                const like = makeChoreLike(c);
                if (c.id === 'chore-a') {
                    like.completions = [{
                        completed: true,
                        dateDue: '2026-03-31',
                        dateCompleted: '2026-03-31T08:03:00',
                    }];
                }
                return like;
            });

            const result = computeCountdownTimelines(
                makeInput(chores, {
                    allChoresRaw,
                    countdownSettings: {
                        ...DEFAULT_COUNTDOWN_SETTINGS,
                        stackBufferSecs: 15,
                        afterAnchorDefaultDelaySecs: 300,
                    },
                    now: new Date('2026-03-31T08:04:00'),
                }),
            );
            const slotB = result.timelines['person-a'].slots.find((s) => s.choreId === 'chore-b')!;

            // Chore B should use the timing resolver's placement (afterDelay),
            // NOT the buffer-only chain. Target start stays as placed.
            expect(slotB.countdownStartMs).toBe(slotB.targetStartMs);
            expect(slotB.countdownEndMs).toBe(slotB.targetEndMs);
        });
    });

    describe('multiple people with independent timelines', () => {
        it('creates separate timelines for different people', () => {
            const chores = [
                makeChoreInput({
                    id: 'chore-a',
                    assigneeIds: ['person-a'],
                    estimatedDurationSecs: 120,
                }),
                makeChoreInput({
                    id: 'chore-b',
                    assigneeIds: ['person-b'],
                    estimatedDurationSecs: 180,
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));

            expect(result.timelines['person-a']?.slots).toHaveLength(1);
            expect(result.timelines['person-a'].slots[0].choreId).toBe('chore-a');
            expect(result.timelines['person-b']?.slots).toHaveLength(1);
            expect(result.timelines['person-b'].slots[0].choreId).toBe('chore-b');
        });
    });

    describe('sortOrder respected', () => {
        it('uses sortOrder for ordering within same deadline', () => {
            const chores = [
                makeChoreInput({
                    id: 'z-chore',
                    title: 'Z chore',
                    sortOrder: 2,
                    estimatedDurationSecs: 60,
                }),
                makeChoreInput({
                    id: 'a-chore',
                    title: 'A chore',
                    sortOrder: 1,
                    estimatedDurationSecs: 60,
                }),
            ];

            const result = computeCountdownTimelines(makeInput(chores));
            const slots = result.timelines['person-a'].slots;

            // sortOrder 1 (a-chore) should come first (earlier in timeline).
            expect(slots[0].choreId).toBe('a-chore');
            expect(slots[1].choreId).toBe('z-chore');
        });
    });

    describe('empty input', () => {
        it('returns empty timelines for no chores', () => {
            const result = computeCountdownTimelines(makeInput([]));
            expect(Object.keys(result.timelines)).toHaveLength(0);
        });
    });

    describe('warnings', () => {
        it('warns when chores are pushed before family day start', () => {
            // Create many long chores that overflow the morning window.
            const chores = Array.from({ length: 20 }, (_, i) =>
                makeChoreInput({
                    id: `chore-${i}`,
                    title: `Chore ${i}`,
                    estimatedDurationSecs: 1800, // 30 min each = 600 min total
                    sortOrder: i,
                    timingMode: 'before_time',
                    timingConfig: { mode: 'before_time', time: '09:00' },
                }),
            );

            const result = computeCountdownTimelines(makeInput(chores));
            const timeline = result.timelines['person-a'];

            expect(timeline.warnings.length).toBeGreaterThan(0);
            expect(timeline.warnings[0].severity).toBe('warning');
        });
    });

    describe('collision decisions', () => {
        it('applies deadline_driven_first decision by pushing start-driven chore later', () => {
            const chores = [
                makeChoreInput({
                    id: 'start-chore',
                    title: 'Long task',
                    estimatedDurationSecs: 3600,
                    timingMode: 'after_time',
                    timingConfig: { mode: 'after_time', time: '08:30' },
                }),
                makeChoreInput({
                    id: 'deadline-chore',
                    title: 'Quick task',
                    estimatedDurationSecs: 600,
                    timingMode: 'before_time',
                    timingConfig: { mode: 'before_time', time: '09:15' },
                }),
            ];

            const settings: CountdownSettings = {
                ...DEFAULT_COUNTDOWN_SETTINGS,
                afterAnchorDefaultDelaySecs: 0,
                stackBufferSecs: 0,
            };
            const result = computeCountdownTimelines(
                makeInput(chores, {
                    countdownSettings: settings,
                    collisionDecisions: {
                        'start-chore:deadline-chore': 'deadline_driven_first',
                    },
                }),
            );
            const slots = result.timelines['person-a'].slots;

            // Deadline chore should be in its original position (ends at 9:15).
            const deadlineSlot = slots.find((s) => s.choreId === 'deadline-chore');
            expect(deadlineSlot).toBeDefined();
            expect(deadlineSlot!.countdownEndMs).toBe(localTimeToMs('09:15'));

            // Start-driven chore should be pushed to after deadline chore ends.
            const startSlot = slots.find((s) => s.choreId === 'start-chore');
            expect(startSlot).toBeDefined();
            expect(startSlot!.countdownStartMs).toBeGreaterThanOrEqual(deadlineSlot!.countdownEndMs);

            // No unresolved collisions.
            expect(result.timelines['person-a'].collisions).toHaveLength(0);
        });
    });

    describe('before_marker with fallback time', () => {
        it('uses fallback time when marker has not fired', () => {
            const chore = makeChoreInput({
                id: 'before-breakfast',
                title: 'Before breakfast',
                estimatedDurationSecs: 300,
                timingMode: 'before_marker',
                timingConfig: {
                    mode: 'before_marker',
                    anchor: {
                        sourceType: 'routine',
                        routineKey: 'breakfast',
                        relation: 'before',
                        fallbackTime: '08:00',
                    },
                },
            });

            const result = computeCountdownTimelines(makeInput([chore]));
            const slot = result.timelines['person-a'].slots[0];

            // Deadline = breakfast default time (08:00 from preset) or fallback.
            // The resolver uses the marker's defaultTime (08:00 from defaults).
            expect(slot.countdownEndMs).toBe(localTimeToMs('08:00'));
        });

        it('uses actual marker time when marker has fired', () => {
            const chore = makeChoreInput({
                id: 'before-breakfast',
                title: 'Before breakfast',
                estimatedDurationSecs: 300,
                timingMode: 'before_marker',
                timingConfig: {
                    mode: 'before_marker',
                    anchor: {
                        sourceType: 'routine',
                        routineKey: 'breakfast',
                        relation: 'before',
                        fallbackTime: '08:00',
                    },
                },
            });

            const markerStatus: SharedRoutineMarkerStatusLike = {
                markerKey: 'breakfast',
                date: '2026-03-31',
                startedAt: '2026-03-31T07:45:00',
                completedAt: '2026-03-31T07:45:00',
            };

            const result = computeCountdownTimelines(
                makeInput([chore], { routineMarkerStatuses: [markerStatus] }),
            );
            const slot = result.timelines['person-a'].slots[0];

            // Should use the actual marker time (7:45).
            expect(slot.countdownEndMs).toBe(localTimeToMs('07:45'));
        });
    });
});
