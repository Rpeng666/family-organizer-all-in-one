// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    id: vi.fn(() => 'evt-new'),
    dbTransact: vi.fn(),
    dbUseQuery: vi.fn(),
    txOps: [] as any[],
}));

vi.mock('@instantdb/react', () => ({
    id: mocks.id,
    tx: {
        calendarItems: new Proxy(
            {},
            {
                get(_target, key) {
                    return {
                        update(data: any) {
                            const op = { entity: 'calendarItems', id: String(key), action: 'update', data };
                            mocks.txOps.push(op);
                            return op;
                        },
                        link(data: any) {
                            const op = { entity: 'calendarItems', id: String(key), action: 'link', data };
                            mocks.txOps.push(op);
                            return op;
                        },
                        unlink(data: any) {
                            const op = { entity: 'calendarItems', id: String(key), action: 'unlink', data };
                            mocks.txOps.push(op);
                            return op;
                        },
                        delete() {
                            const op = { entity: 'calendarItems', id: String(key), action: 'delete' };
                            mocks.txOps.push(op);
                            return op;
                        },
                    };
                },
            }
        ),
        calendarTags: new Proxy(
            {},
            {
                get(_target, key) {
                    return {
                        update(data: any) {
                            const op = { entity: 'calendarTags', id: String(key), action: 'update', data };
                            mocks.txOps.push(op);
                            return op;
                        },
                    };
                },
            }
        ),
    },
}));

vi.mock('@/lib/db', () => ({
    db: {
        transact: mocks.dbTransact,
        useQuery: mocks.dbUseQuery,
    },
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({ id, checked, onCheckedChange }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
    ),
}));

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ id, checked, onCheckedChange }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
    ),
}));

vi.mock('@/components/ui/alert-dialog', () => ({
    AlertDialog: ({ open, children }: any) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
    AlertDialogContent: ({ children }: any) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h3>{children}</h3>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogCancel: ({ children, onClick, ...props }: any) => (
        <button type="button" onClick={onClick} {...props}>
            {children}
        </button>
    ),
    AlertDialogAction: ({ children, onClick, ...props }: any) => (
        <button type="button" onClick={onClick} {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/RecurrenceScopeDialog', () => ({
    RecurrenceScopeDialog: ({ action, open, onSelect, scopeMode }: any) =>
        open ? (
            <div data-testid="recurrence-scope-dialog">
                <button type="button" onClick={() => onSelect('single')}>
                    Only this event
                </button>
                <button type="button" onClick={() => onSelect(action === 'delete' ? 'following' : scopeMode === 'all' ? 'all' : 'following')}>
                    {action === 'delete' ? 'This and all following events' : scopeMode === 'all' ? 'All events' : 'This and following events'}
                </button>
                <button type="button" onClick={() => onSelect('cancel')}>
                    Cancel
                </button>
            </div>
        ) : null,
}));

import AddEventForm from '@/components/AddEvent';

function renderForm(props?: Partial<React.ComponentProps<typeof AddEventForm>>) {
    const onClose = vi.fn();
    render(
        <AddEventForm
            selectedDate={new Date(2026, 2, 15)}
            selectedEvent={null}
            onClose={onClose}
            defaultStartTime="09:00"
            {...props}
        />
    );
    return { onClose };
}

function getOps() {
    expect(mocks.dbTransact).toHaveBeenCalled();
    const [ops] = mocks.dbTransact.mock.calls[0];
    expect(Array.isArray(ops)).toBe(true);
    return ops;
}

describe('AddEventForm', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.id.mockReset();
        mocks.id.mockReturnValue('evt-new');
        mocks.dbTransact.mockReset();
        mocks.dbUseQuery.mockReset();
        mocks.dbUseQuery.mockReturnValue({
            isLoading: false,
            error: null,
            data: {
                familyMembers: [
                    { id: 'mem-1', name: 'Judah' },
                    { id: 'mem-2', name: 'Leah' },
                    { id: 'mem-3', name: 'Noah' },
                ],
                calendarTags: [],
            },
        });
        mocks.txOps.length = 0;
    });

    it('focuses the title input when opened in create mode', async () => {
        renderForm();

        await waitFor(() => {
            expect(screen.getByLabelText('Title')).toHaveFocus();
        });
    });

    it('creates an all-day event with exclusive end date and calendar index fields', async () => {
        const { onClose } = renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title'), 'Family Dinner');
        await user.click(screen.getByRole('button', { name: /add event/i }));

        const [op] = getOps();
        expect(op).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-new',
            action: 'update',
            data: expect.objectContaining({
                title: 'Family Dinner',
                isAllDay: true,
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                year: 2026,
                month: 3,
                dayOfMonth: 15,
            }),
        });
        expect(getOps()).toHaveLength(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('creates member links when one or more family members are selected', async () => {
        const { onClose } = renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title'), 'Science Fair');
        await user.click(screen.getByLabelText('Judah'));
        await user.click(screen.getByLabelText('Leah'));
        await user.click(screen.getByRole('button', { name: /add event/i }));

        expect(getOps()).toEqual([
            expect.objectContaining({
                entity: 'calendarItems',
                id: 'evt-new',
                action: 'update',
            }),
            {
                entity: 'calendarItems',
                id: 'evt-new',
                action: 'link',
                data: { pertainsTo: 'mem-1' },
            },
            {
                entity: 'calendarItems',
                id: 'evt-new',
                action: 'link',
                data: { pertainsTo: 'mem-2' },
            },
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('lets imported Apple events update local details and tags', async () => {
        mocks.dbUseQuery.mockReturnValue({
            isLoading: false,
            error: null,
            data: {
                familyMembers: [
                    { id: 'mem-1', name: 'Judah' },
                ],
                calendarTags: [{ id: 'tag-school', name: 'School', normalizedName: 'school' }],
            },
        });
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-imported',
                title: 'Imported school event',
                description: '',
                startDate: '2026-03-15T14:30:00.000Z',
                endDate: '2026-03-15T15:30:00.000Z',
                isAllDay: false,
                sourceType: 'apple-caldav',
                sourceReadOnly: true,
                tags: [],
            } as any,
        });
        const user = userEvent.setup();

        const titleInput = screen.getByLabelText('Title');
        expect(titleInput).toBeEnabled();
        await user.clear(titleInput);
        await user.type(titleInput, 'Updated imported school event');
        await user.type(screen.getByLabelText('Tags'), 'School, Travel');
        await user.click(screen.getByRole('button', { name: /update event/i }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });

        expect(getOps()).toEqual([
            {
                entity: 'calendarItems',
                id: 'evt-imported',
                action: 'update',
                data: expect.objectContaining({
                    title: 'Updated imported school event',
                    startDate: '2026-03-15T14:30:00.000Z',
                    endDate: '2026-03-15T15:30:00.000Z',
                }),
            },
            {
                entity: 'calendarTags',
                id: 'evt-new',
                action: 'update',
                data: expect.objectContaining({
                    name: 'Travel',
                    normalizedName: 'travel',
                }),
            },
            {
                entity: 'calendarItems',
                id: 'evt-imported',
                action: 'link',
                data: { tags: 'tag-school' },
            },
            {
                entity: 'calendarItems',
                id: 'evt-imported',
                action: 'link',
                data: { tags: 'evt-new' },
            },
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows the original event timezone in inputs and summary when it differs from local time', async () => {
        renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-zoned',
                title: "Mandy's bible study",
                description: '',
                startDate: '2026-04-01T14:00:00.000Z',
                endDate: '2026-04-01T15:30:00.000Z',
                isAllDay: false,
                timeZone: 'America/Los_Angeles',
                rrule: 'RRULE:FREQ=WEEKLY',
                pertainsTo: [{ id: 'mem-1', name: 'Judah' }],
            } as any,
        });

        expect(screen.getByLabelText('Start Time')).toHaveValue('07:00');
        expect(screen.getByLabelText('End Time')).toHaveValue('08:30');
        expect(screen.getByText("Mandy's bible study")).toBeInTheDocument();
        expect(screen.getByText(/Repeats weekly/i)).toBeInTheDocument();
        expect(screen.getByText(/Pertains to Judah/i)).toBeInTheDocument();
        expect(screen.getByText(/No alerts/i)).toBeInTheDocument();
        expect(screen.getByText(/\(PDT\)/i)).toBeInTheDocument();
    });

    it('builds custom recurrence rules with repeat-end counts', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title'), 'Homework Club');
        await user.selectOptions(screen.getByLabelText('Repeat'), 'custom');
        fireEvent.change(screen.getByLabelText('Every'), { target: { value: '3' } });
        await user.selectOptions(screen.getByLabelText('Unit'), 'week');
        await user.click(screen.getByRole('button', { name: 'Tuesday' }));
        await user.click(screen.getByRole('button', { name: 'Thursday' }));
        await user.selectOptions(screen.getByLabelText('Repeat End'), 'count');
        fireEvent.change(screen.getByLabelText('Occurrences'), { target: { value: '8' } });
        await user.click(screen.getByRole('button', { name: /add event/i }));

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [advancedOps] = mocks.dbTransact.mock.calls[0];
        expect(advancedOps[0].data.rrule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=SU,TU,TH;COUNT=8');
    });

    it('builds EXDATE values from single-date and range exceptions', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title'), 'Recurrence with exceptions');
        await user.selectOptions(screen.getByLabelText('Repeat'), 'daily');
        await user.click(screen.getByRole('button', { name: /exceptions/i }));

        await user.selectOptions(screen.getByLabelText('Type'), 'date');
        fireEvent.change(screen.getByLabelText('Exception Date'), { target: { value: '2026-03-20' } });

        await user.click(screen.getByRole('button', { name: /add another exception/i }));
        await user.selectOptions(screen.getAllByLabelText('Type')[1], 'range');
        fireEvent.change(screen.getByLabelText('Range Start'), { target: { value: '2026-03-22' } });
        fireEvent.change(screen.getByLabelText('Range End'), { target: { value: '2026-03-24' } });

        await user.click(screen.getByRole('button', { name: /add event/i }));

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [advancedOps] = mocks.dbTransact.mock.calls[0];
        expect(advancedOps[0].data.exdates).toEqual(['2026-03-20', '2026-03-22', '2026-03-23', '2026-03-24']);
        expect(advancedOps[0].data.recurrenceLines).toEqual(
            expect.arrayContaining(['RRULE:FREQ=DAILY', 'EXDATE:2026-03-20,2026-03-22,2026-03-23,2026-03-24'])
        );
        expect(advancedOps[0].data.xProps?.recurrenceExceptionRows).toEqual([
            { mode: 'date', date: '2026-03-20', rangeStart: '2026-03-20', rangeEnd: '2026-03-20' },
            { mode: 'range', date: '2026-03-22', rangeStart: '2026-03-22', rangeEnd: '2026-03-24' },
        ]);
    });

    it('builds RDATE values from single-date and range one-off rows', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title'), 'Recurrence with one-offs');
        await user.selectOptions(screen.getByLabelText('Repeat'), 'daily');
        await user.click(screen.getByRole('button', { name: /one-off days/i }));

        await user.selectOptions(screen.getByLabelText('Type'), 'date');
        fireEvent.change(screen.getByLabelText('One-off Date'), { target: { value: '2026-03-19' } });

        await user.click(screen.getByRole('button', { name: /add another one-off day/i }));
        await user.selectOptions(screen.getAllByLabelText('Type')[1], 'range');
        fireEvent.change(screen.getByLabelText('Range Start'), { target: { value: '2026-03-25' } });
        fireEvent.change(screen.getByLabelText('Range End'), { target: { value: '2026-03-27' } });

        await user.click(screen.getByRole('button', { name: /add event/i }));

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [advancedOps] = mocks.dbTransact.mock.calls[0];
        expect(advancedOps[0].data.rdates).toEqual(['2026-03-19', '2026-03-25', '2026-03-26', '2026-03-27']);
        expect(advancedOps[0].data.recurrenceLines).toEqual(expect.arrayContaining(['RRULE:FREQ=DAILY', 'RDATE:2026-03-19,2026-03-25,2026-03-26,2026-03-27']));
        expect(advancedOps[0].data.xProps?.recurrenceRdateRows).toEqual([
            { mode: 'date', date: '2026-03-19', rangeStart: '2026-03-19', rangeEnd: '2026-03-19' },
            { mode: 'range', date: '2026-03-25', rangeStart: '2026-03-25', rangeEnd: '2026-03-27' },
        ]);
    });

    it('restores saved range exceptions as ranges instead of flattened dates', () => {
        renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-range',
                title: 'Trip',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=DAILY',
                exdates: ['2026-03-22', '2026-03-23', '2026-03-24'],
                xProps: {
                    recurrenceExceptionRows: [{ mode: 'range', date: '2026-03-22', rangeStart: '2026-03-22', rangeEnd: '2026-03-24' }],
                },
            } as any,
        });

        const typeSelects = screen.getAllByLabelText('Type') as HTMLSelectElement[];
        expect(typeSelects).toHaveLength(1);
        expect(typeSelects[0].value).toBe('range');
        expect((screen.getByLabelText('Range Start') as HTMLInputElement).value).toBe('2026-03-22');
        expect((screen.getByLabelText('Range End') as HTMLInputElement).value).toBe('2026-03-24');
        expect(screen.queryByLabelText('Exception Date')).not.toBeInTheDocument();
    });

    it('restores saved one-off range rows as ranges instead of flattened dates', () => {
        renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-rdate-range',
                title: 'Training',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=DAILY',
                rdates: ['2026-03-28', '2026-03-29', '2026-03-30'],
                xProps: {
                    recurrenceRdateRows: [{ mode: 'range', date: '2026-03-28', rangeStart: '2026-03-28', rangeEnd: '2026-03-30' }],
                },
            } as any,
        });

        const typeSelects = screen.getAllByLabelText('Type') as HTMLSelectElement[];
        expect(typeSelects).toHaveLength(1);
        expect(typeSelects[0].value).toBe('range');
        expect((screen.getByLabelText('Range Start') as HTMLInputElement).value).toBe('2026-03-28');
        expect((screen.getByLabelText('Range End') as HTMLInputElement).value).toBe('2026-03-30');
        expect(screen.queryByLabelText('One-off Date')).not.toBeInTheDocument();
    });

    it('turns exceptions off when removing the last exception row', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText('Repeat'), 'daily');
        const exceptionsToggle = screen.getByRole('button', { name: /exceptions/i });
        await user.click(exceptionsToggle);

        const removeButton = screen.getByRole('button', { name: 'Remove' });
        expect(removeButton).toBeEnabled();
        await user.click(removeButton);

        expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
        expect(within(exceptionsToggle).getByText('Off')).toBeInTheDocument();
    });

    it('sorts custom monthly day summaries in natural order', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText('Repeat'), 'custom');
        fireEvent.change(screen.getByLabelText('Every'), { target: { value: '2' } });
        await user.selectOptions(screen.getByLabelText('Unit'), 'month');
        await user.click(screen.getByRole('button', { name: '10' }));

        expect(screen.getAllByText('Every 2 months on the 10th and 15th').length).toBeGreaterThan(0);
        expect(screen.queryByText('Every 2 months on the 15th and 10th')).not.toBeInTheDocument();
    });

    it('sorts weekly day summaries and collapses weekday/weekend groups', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText('Repeat'), 'custom');
        await user.selectOptions(screen.getByLabelText('Unit'), 'week');
        await user.click(screen.getByRole('button', { name: 'Tuesday' }));
        await user.click(screen.getByRole('button', { name: 'Monday' }));
        await user.click(screen.getByRole('button', { name: 'Wednesday' }));

        expect(screen.getAllByText('Every week on Sunday, Monday, Tuesday, and Wednesday').length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Every'), { target: { value: '2' } });
        await user.click(screen.getByRole('button', { name: 'Sunday' }));
        await user.click(screen.getByRole('button', { name: 'Monday' }));
        await user.click(screen.getByRole('button', { name: 'Tuesday' }));
        await user.click(screen.getByRole('button', { name: 'Wednesday' }));
        await user.click(screen.getByRole('button', { name: 'Monday' }));
        await user.click(screen.getByRole('button', { name: 'Tuesday' }));
        await user.click(screen.getByRole('button', { name: 'Wednesday' }));
        await user.click(screen.getByRole('button', { name: 'Thursday' }));
        await user.click(screen.getByRole('button', { name: 'Friday' }));
        expect(screen.getAllByText('Every 2 weeks on weekdays').length).toBeGreaterThan(0);

        await user.click(screen.getByRole('button', { name: 'Monday' }));
        await user.click(screen.getByRole('button', { name: 'Tuesday' }));
        await user.click(screen.getByRole('button', { name: 'Wednesday' }));
        await user.click(screen.getByRole('button', { name: 'Thursday' }));
        await user.click(screen.getByRole('button', { name: 'Friday' }));
        await user.click(screen.getByRole('button', { name: 'Saturday' }));
        await user.click(screen.getByRole('button', { name: 'Sunday' }));
        expect(screen.getAllByText('Every 2 weeks on weekends').length).toBeGreaterThan(0);
    });

    it('defaults yearly custom month to the start month and only names non-default month selections', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.selectOptions(screen.getByLabelText('Repeat'), 'custom');
        fireEvent.change(screen.getByLabelText('Every'), { target: { value: '2' } });
        await user.selectOptions(screen.getByLabelText('Unit'), 'year');

        expect(screen.getAllByText('Every 2 years').length).toBeGreaterThan(0);

        await user.click(screen.getByRole('button', { name: 'Jul' }));
        expect(screen.getAllByText('Every 2 years in March and July').length).toBeGreaterThan(0);

        await user.click(screen.getByRole('button', { name: 'Mar' }));
        expect(screen.getAllByText('Every 2 years in July').length).toBeGreaterThan(0);
    });

    it('switches to timed mode and keeps event duration when the start time changes', async () => {
        renderForm();
        const user = userEvent.setup();

        await user.click(screen.getByLabelText('All-day event'));

        const startTime = screen.getByLabelText('Start Time') as HTMLInputElement;
        const endTime = screen.getByLabelText('End Time') as HTMLInputElement;
        expect(startTime.value).toBe('09:00');
        expect(endTime.value).toBe('10:00');

        fireEvent.change(startTime, { target: { value: '11:30' } });

        expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('11:30');
        expect((screen.getByLabelText('End Time') as HTMLInputElement).value).toBe('12:30');
    });

    it('populates fields for an existing timed event and updates that event on submit', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-123',
                title: 'Soccer Practice',
                description: 'Bring water',
                startDate: '2026-03-15T14:30:00',
                endDate: '2026-03-15T15:30:00',
                isAllDay: false,
                pertainsTo: [{ id: 'mem-1', name: 'Judah' }],
            } as any,
        });
        const user = userEvent.setup();

        expect(screen.getByLabelText('Title')).toHaveValue('Soccer Practice');
        expect(screen.getByLabelText('Description')).toHaveValue('Bring water');
        expect(screen.getByLabelText('Start Date')).toHaveValue('2026-03-15');
        expect(screen.getByLabelText('Start Time')).toHaveValue('14:30');
        expect(screen.getByLabelText('End Time')).toHaveValue('15:30');

        await user.clear(screen.getByLabelText('Title'));
        await user.type(screen.getByLabelText('Title'), 'Soccer Practice (Updated)');
        await user.click(screen.getByLabelText('Judah'));
        await user.click(screen.getByLabelText('Leah'));
        await user.click(screen.getByRole('button', { name: /update event/i }));

        const [op] = getOps();
        expect(op.id).toBe('evt-123');
        expect(op.data).toEqual(
            expect.objectContaining({
                title: 'Soccer Practice (Updated)',
                description: 'Bring water',
                isAllDay: false,
                year: 2026,
                month: 3,
                dayOfMonth: 15,
            })
        );
        expect(typeof op.data.startDate).toBe('string');
        expect(typeof op.data.endDate).toBe('string');
        expect(Date.parse(op.data.endDate) - Date.parse(op.data.startDate)).toBe(60 * 60 * 1000);
        expect(getOps()).toEqual([
            expect.objectContaining({
                entity: 'calendarItems',
                id: 'evt-123',
                action: 'update',
            }),
            {
                entity: 'calendarItems',
                id: 'evt-123',
                action: 'unlink',
                data: { pertainsTo: 'mem-1' },
            },
            {
                entity: 'calendarItems',
                id: 'evt-123',
                action: 'link',
                data: { pertainsTo: 'mem-2' },
            },
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('when editing one recurring occurrence and choosing "only this", creates a recurrence override with RECURRENCE-ID', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-24',
                endDate: '2026-03-25',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-17',
                    endDate: '2026-03-18',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                    exdates: [],
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                },
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /update event/i }));
        await user.click(screen.getByRole('button', { name: 'Only this event' }));

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    action: 'update',
                    data: expect.objectContaining({
                        exdates: expect.arrayContaining(['2026-03-24']),
                    }),
                }),
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-new',
                    action: 'update',
                    data: expect.objectContaining({
                        recurringEventId: 'evt-master',
                        recurrenceId: '2026-03-24',
                        rrule: '',
                    }),
                }),
            ])
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('when editing recurring occurrence and choosing "this and following", splits the series and carries forward later exceptions', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Split Me',
                description: '',
                startDate: '2026-03-20',
                endDate: '2026-03-21',
                isAllDay: true,
                rrule: 'RRULE:FREQ=DAILY',
                exdates: ['2026-03-18', '2026-03-19', '2026-03-20', '2026-03-21'],
                recurrenceLines: ['RRULE:FREQ=DAILY', 'EXDATE:2026-03-18,2026-03-19,2026-03-20,2026-03-21'],
                xProps: {
                    recurrenceExceptionRows: [{ mode: 'range', date: '2026-03-18', rangeStart: '2026-03-18', rangeEnd: '2026-03-21' }],
                },
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Split Me',
                    description: '',
                    startDate: '2026-03-15',
                    endDate: '2026-03-16',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=DAILY',
                    exdates: ['2026-03-18', '2026-03-19', '2026-03-20', '2026-03-21'],
                    recurrenceLines: ['RRULE:FREQ=DAILY', 'EXDATE:2026-03-18,2026-03-19,2026-03-20,2026-03-21'],
                    xProps: {
                        recurrenceExceptionRows: [{ mode: 'range', date: '2026-03-18', rangeStart: '2026-03-18', rangeEnd: '2026-03-21' }],
                    },
                },
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /update event/i }));
        await user.click(screen.getByRole('button', { name: 'This and following events' }));

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-master',
            action: 'update',
            data: expect.objectContaining({
                exdates: ['2026-03-18', '2026-03-19'],
            }),
        });
        expect(ops[1]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-new',
            action: 'update',
            data: expect.objectContaining({
                exdates: ['2026-03-20', '2026-03-21'],
            }),
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('when editing the original recurring event and choosing "all events", updates the master series without splitting', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=SU'],
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /update event/i }));
        await user.click(screen.getByRole('button', { name: 'All events' }));

        expect(mocks.dbTransact).toHaveBeenCalled();
        const allOps = mocks.dbTransact.mock.calls.flatMap((call) => call[0] || []);
        expect(allOps.some((entry: any) => entry.id === 'evt-new')).toBe(false);
        expect(allOps.some((entry: any) => entry.id === 'evt-master')).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deletes a non-recurring event after confirmation', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-delete',
                title: 'One-off',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual([expect.objectContaining({ entity: 'calendarItems', id: 'evt-delete', action: 'delete' })]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deletes an imported non-recurring event after confirmation', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-imported-delete',
                title: 'Imported one-off',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                sourceType: 'apple-caldav',
                sourceReadOnly: true,
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        expect(screen.getByTestId('alert-dialog')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual([expect.objectContaining({ entity: 'calendarItems', id: 'evt-imported-delete', action: 'delete' })]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deleting a recurring event with "Only this event" adds an EXDATE for the occurrence', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-24',
                endDate: '2026-03-25',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-17',
                    endDate: '2026-03-18',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                    exdates: [],
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                },
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        await user.click(screen.getByRole('button', { name: 'Only this event' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    action: 'update',
                    data: expect.objectContaining({
                        exdates: ['2026-03-24'],
                    }),
                }),
            ])
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deleting a recurring event with "This and all following events" caps the RRULE and deletes future overrides', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-24',
                endDate: '2026-03-25',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                exdates: ['2026-03-18', '2026-03-31'],
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE:2026-03-18,2026-03-31'],
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-17',
                    endDate: '2026-03-18',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                    exdates: ['2026-03-18', '2026-03-31'],
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE:2026-03-18,2026-03-31'],
                },
            } as any,
            allCalendarItems: [
                {
                    id: 'ov-before',
                    title: 'Weekly Class',
                    startDate: '2026-03-20',
                    endDate: '2026-03-21',
                    isAllDay: true,
                    recurringEventId: 'evt-master',
                    recurrenceId: '2026-03-20',
                },
                {
                    id: 'ov-at',
                    title: 'Weekly Class',
                    startDate: '2026-03-24',
                    endDate: '2026-03-25',
                    isAllDay: true,
                    recurringEventId: 'evt-master',
                    recurrenceId: '2026-03-24',
                },
                {
                    id: 'ov-after',
                    title: 'Weekly Class',
                    startDate: '2026-03-31',
                    endDate: '2026-04-01',
                    isAllDay: true,
                    recurringEventId: 'evt-master',
                    recurrenceId: '2026-03-31',
                },
            ] as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        await user.click(screen.getByRole('button', { name: 'This and all following events' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        const masterUpdate = ops.find((entry: any) => entry.id === 'evt-master' && entry.action === 'update');
        expect(masterUpdate).toBeTruthy();
        expect(masterUpdate.data.rrule).toMatch(/UNTIL=/);
        expect(masterUpdate.data.exdates).toEqual(['2026-03-18']);

        const deletedIds = ops
            .filter((entry: any) => entry.action === 'delete')
            .map((entry: any) => entry.id)
            .sort();
        expect(deletedIds).toEqual(['ov-after', 'ov-at']);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deleting the first occurrence with "This and all following events" deletes the master series row', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'evt-master',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-17',
                    endDate: '2026-03-18',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                },
            } as any,
            allCalendarItems: [
                {
                    id: 'ov-later',
                    title: 'Weekly Class',
                    startDate: '2026-03-31',
                    endDate: '2026-04-01',
                    isAllDay: true,
                    recurringEventId: 'evt-master',
                    recurrenceId: '2026-03-31',
                },
            ] as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        await user.click(screen.getByRole('button', { name: 'This and all following events' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entity: 'calendarItems', id: 'evt-master', action: 'delete' }),
                expect.objectContaining({ entity: 'calendarItems', id: 'ov-later', action: 'delete' }),
            ])
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows parent-series recurrence details when editing a dragged override occurrence', () => {
        renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'ov-1',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-05',
                endDate: '2026-03-06',
                isAllDay: true,
                rrule: '',
                recurrenceId: '2026-03-04',
                recurringEventId: 'evt-master',
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-04',
                    endDate: '2026-03-05',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=WE'],
                },
            } as any,
        });

        expect(screen.getByLabelText('Repeat')).toHaveValue('weekly');
        expect(screen.getByText('Every week on Wednesday')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('never')).not.toBeInTheDocument();
    });

    it('deleting a dragged override with "Only this event" removes the override row', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'ov-1',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-05',
                endDate: '2026-03-06',
                isAllDay: true,
                rrule: '',
                recurrenceId: '2026-03-04',
                recurringEventId: 'evt-master',
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-04',
                    endDate: '2026-03-05',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
                    exdates: ['2026-03-04'],
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=WE', 'EXDATE:2026-03-04'],
                },
            } as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        await user.click(screen.getByRole('button', { name: 'Only this event' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    action: 'update',
                    data: expect.objectContaining({
                        exdates: ['2026-03-04'],
                    }),
                }),
                expect.objectContaining({ entity: 'calendarItems', id: 'ov-1', action: 'delete' }),
            ])
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deleting a dragged first override with "This and all following events" deletes the override and the master series', async () => {
        const { onClose } = renderForm({
            selectedDate: null,
            selectedEvent: {
                id: 'ov-1',
                title: 'Weekly Class',
                description: '',
                startDate: '2026-03-05',
                endDate: '2026-03-06',
                isAllDay: true,
                rrule: '',
                recurrenceId: '2026-03-04',
                recurringEventId: 'evt-master',
                __masterEvent: {
                    id: 'evt-master',
                    title: 'Weekly Class',
                    description: '',
                    startDate: '2026-03-04',
                    endDate: '2026-03-05',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
                    exdates: ['2026-03-04'],
                    recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=WE', 'EXDATE:2026-03-04'],
                },
            } as any,
            allCalendarItems: [
                {
                    id: 'ov-1',
                    title: 'Weekly Class',
                    startDate: '2026-03-05',
                    endDate: '2026-03-06',
                    isAllDay: true,
                    recurrenceId: '2026-03-04',
                    recurringEventId: 'evt-master',
                },
                {
                    id: 'ov-later',
                    title: 'Weekly Class',
                    startDate: '2026-03-19',
                    endDate: '2026-03-20',
                    isAllDay: true,
                    recurrenceId: '2026-03-18',
                    recurringEventId: 'evt-master',
                },
            ] as any,
        });
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Delete Event' }));
        await user.click(screen.getByRole('button', { name: 'This and all following events' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entity: 'calendarItems', id: 'evt-master', action: 'delete' }),
                expect.objectContaining({ entity: 'calendarItems', id: 'ov-1', action: 'delete' }),
                expect.objectContaining({ entity: 'calendarItems', id: 'ov-later', action: 'delete' }),
            ])
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
