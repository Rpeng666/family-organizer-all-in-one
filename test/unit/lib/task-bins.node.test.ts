import { describe, expect, it } from 'vitest';
import { buildTaskBinEntries, groupByAttention, type TaskBinTask } from '@/lib/task-bins';

const makeSeries = () => ({
    id: 'series-1',
    name: 'Science',
    startDate: '2026-03-18',
    scheduledActivity: {
        startDate: '2026-03-18',
        rrule: 'FREQ=DAILY',
        exdates: [],
    },
});

const makeTask = (id: string, overrides: Partial<TaskBinTask> = {}): TaskBinTask => ({
    id,
    text: `Task ${id}`,
    isCompleted: false,
    isDayBreak: false,
    order: 0,
    workflowState: 'not_started',
    taskSeries: makeSeries(),
    updates: [],
    ...overrides,
});

describe('buildTaskBinEntries', () => {
    it('marks a later task-day block as overdue with contextual copy', () => {
        const series = makeSeries();
        const tasks: TaskBinTask[] = [
            makeTask('task-1', { order: 1, taskSeries: series }),
            makeTask('break-1', { isDayBreak: true, order: 2, taskSeries: series }),
            makeTask('task-2', { order: 3, taskSeries: series }),
        ];

        const entries = buildTaskBinEntries(tasks, {}, '2026-03-20');
        const overdueEntry = entries.find((entry) => entry.task.id === 'task-2');

        expect(overdueEntry?.lateness?.kind).toBe('overdue');
        expect(overdueEntry?.lateness?.label).toBe('1 day overdue');
        expect(overdueEntry?.lateness?.scheduledDate).toBe('2026-03-19');
    });

    it('uses the actual submission transition for submitted-late copy', () => {
        const series = makeSeries();
        const task = makeTask('task-1', {
            workflowState: 'needs_review',
            taskSeries: series,
            updates: [
                {
                    id: 'feedback-later',
                    isDraft: false,
                    fromState: 'needs_review',
                    toState: 'needs_review',
                    note: 'General feedback after submission',
                    scheduledForDate: '2026-03-20',
                    createdAt: new Date('2026-03-20T12:00:00Z').valueOf(),
                },
                {
                    id: 'submitted-late',
                    isDraft: false,
                    fromState: 'in_progress',
                    toState: 'needs_review',
                    scheduledForDate: '2026-03-19',
                    createdAt: new Date('2026-03-19T12:00:00Z').valueOf(),
                    responseFieldValues: [{ richTextContent: '<p>Here is my answer.</p>' }],
                },
            ],
        });

        const [entry] = buildTaskBinEntries([task], {}, '2026-03-20');

        expect(entry.lateness?.kind).toBe('submitted_late');
        expect(entry.lateness?.label).toBe('submitted 1 day late');
        expect(entry.lateness?.referenceDate).toBe('2026-03-19');
    });

    it('keeps noted late tasks out of needs-attention grouping', () => {
        const series = makeSeries();
        const task = makeTask('task-1', {
            taskSeries: series,
            notedUntilDate: '2026-03-25',
        });

        const entries = buildTaskBinEntries([task], { showNoted: true }, '2026-03-20');
        const grouped = groupByAttention(entries);

        expect(entries[0]?.lateness?.label).toBe('2 days overdue');
        expect(grouped.needsAttention).toHaveLength(0);
        expect(grouped.all).toHaveLength(1);
    });
});
