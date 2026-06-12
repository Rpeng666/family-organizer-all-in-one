// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CALENDAR_COMMAND_EVENT, CALENDAR_STATE_EVENT } from '@/lib/calendar-controls';
import { formatCommonBsMonthCompactLabel, formatCommonBsMonthLabel, toDevanagariDigits } from '@/lib/calendar-display';

const mocks = vi.hoisted(() => ({
    dbUseQuery: vi.fn(),
    dbTransact: vi.fn(),
    monitorForElements: vi.fn(),
    monitorCleanup: vi.fn(),
    monitorConfig: null as any,
    dropTargetForElements: vi.fn(),
    dropCleanup: vi.fn(),
}));

vi.mock('next/font/local', () => ({
    __esModule: true,
    default: () => ({ className: 'mock-local-font' }),
}));

vi.mock('nepali-date-converter', () => ({
    __esModule: true,
    default: class FakeNepaliDate {
        private d: Date;
        constructor(yearOrDate: Date | number, month?: number, day?: number) {
            if (yearOrDate instanceof Date || month == null) {
                this.d = yearOrDate instanceof Date ? new Date(yearOrDate) : new Date(yearOrDate);
                return;
            }

            this.d = new Date(Number(yearOrDate) - 57, Number(month), Number(day ?? 1));
        }
        getYear() {
            return this.d.getFullYear() + 57;
        }
        getMonth() {
            return this.d.getMonth();
        }
        getDate() {
            return this.d.getDate();
        }
        setMonth(value: number) {
            this.d.setMonth(value);
        }
        setDate(value: number) {
            this.d.setDate(value);
        }
        toJsDate() {
            return new Date(this.d);
        }
        format(token: string) {
            if (token === 'YYYY') return String(this.getYear());
            if (token === 'D') return String(this.getDate());
            return '';
        }
    },
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
    monitorForElements: (config: any) => {
        mocks.monitorConfig = config;
        mocks.monitorForElements(config);
        return mocks.monitorCleanup;
    },
    dropTargetForElements: (config: any) => {
        mocks.dropTargetForElements(config);
        return mocks.dropCleanup;
    },
}));

vi.mock('@/components/DroppableDayCell', () => ({
    DroppableDayCell: ({ day, dateStr, onClick, onDoubleClick, children, className, style }: any) => (
        <td
            data-testid={`day-cell-${dateStr}`}
            data-calendar-cell-date={dateStr}
            className={className}
            style={style}
            onClick={() => onClick?.(day)}
            onDoubleClick={() => onDoubleClick?.(day)}
        >
            {children}
        </td>
    ),
}));

vi.mock('@/components/DraggableCalendarEvent', () => ({
    DraggableCalendarEvent: ({ item, onClick, onDoubleClick, memberIndicatorStyle, layout, selected }: any) => {
        const usesChipChrome = (item.calendarItemKind || 'event') === 'event' && (item.isAllDay || layout === 'span');

        return (
            <button
                type="button"
                data-testid={`calendar-event-${item.id}`}
                data-calendar-item-kind={item.calendarItemKind || 'event'}
                data-calendar-chip-surface={usesChipChrome ? 'chip' : 'plain'}
                data-calendar-selected={selected ? 'true' : 'false'}
                data-calendar-search-state={item.__liveSearchState || 'normal'}
                data-member-colors={(item.pertainsTo || []).map((member: any) => member?.color || '').join(',')}
                data-member-indicator-style={memberIndicatorStyle || 'badge'}
                data-display-date={item.__displayDate || ''}
                data-calendar-meta-label={item.__calendarMetaLabel || ''}
                onClick={(e) => onClick?.(e)}
                onDoubleClick={(e) => onDoubleClick?.(e)}
            >
                {item.title}
            </button>
        );
    },
}));

vi.mock('@/components/AddEvent', () => ({
    __esModule: true,
    default: ({ selectedDate, selectedEvent, initialDraft }: any) => (
        <div
            data-testid="add-event-form"
            data-selected-date={
                selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
                    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
                    : ''
            }
            data-selected-event-id={selectedEvent?.id ?? ''}
            data-draft-start={initialDraft?.start instanceof Date ? initialDraft.start.toISOString() : ''}
            data-draft-end={initialDraft?.end instanceof Date ? initialDraft.end.toISOString() : ''}
            data-draft-all-day={initialDraft?.isAllDay ? 'true' : 'false'}
        />
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

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
    AlertDialog: ({ open, children }: any) => (open ? <div data-testid="delete-confirm-dialog">{children}</div> : null),
    AlertDialogContent: ({ children }: any) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogCancel: ({ children }: any) => <button type="button">{children}</button>,
    AlertDialogAction: ({ children, onClick }: any) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
}));

vi.mock('@instantdb/react', () => ({
    id: () => 'evt-generated',
    tx: {
        calendarItems: new Proxy(
            {},
            {
                get(_target, key: string) {
                    return {
                        update(payload: any) {
                            return { entity: 'calendarItems', id: String(key), op: 'update', payload };
                        },
                        delete() {
                            return { entity: 'calendarItems', id: String(key), op: 'delete' };
                        },
                    };
                },
            }
        ),
    },
}));

vi.mock('@/lib/db', () => ({
    db: {
        useQuery: mocks.dbUseQuery,
        transact: mocks.dbTransact,
    },
}));

import Calendar from '@/components/Calendar';

function renderCalendarWithData(
    { calendarItems = [], chores = [], familyMembers = [] }: { calendarItems?: any[]; chores?: any[]; familyMembers?: any[] },
    props?: Partial<React.ComponentProps<typeof Calendar>>
) {
    mocks.dbUseQuery.mockReturnValue({
        isLoading: false,
        error: null,
        data: { calendarItems, chores, familyMembers },
    });
    render(<Calendar currentDate={new Date(2026, 2, 15)} numWeeks={1} displayBS={false} {...props} />);
}

function renderCalendarWithItems(items: any[], props?: Partial<React.ComponentProps<typeof Calendar>>) {
    renderCalendarWithData({ calendarItems: items }, props);
}

function getRenderedEventOnDay(itemId: string, dateKey: string) {
    return (
        screen
            .getAllByTestId(`calendar-event-${itemId}`)
            .find((element) => element.getAttribute('data-display-date') === dateKey) ?? null
    );
}

describe('Calendar', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.dbUseQuery.mockReset();
        mocks.dbTransact.mockReset();
        mocks.monitorForElements.mockReset();
        mocks.monitorCleanup.mockReset();
        mocks.monitorConfig = null;
        mocks.dropTargetForElements.mockReset();
        mocks.dropCleanup.mockReset();
        window.localStorage.clear();
        // jsdom doesn't implement scrollIntoView
        if (!Element.prototype.scrollIntoView) {
            Element.prototype.scrollIntoView = vi.fn();
        }
    });

    it('opens the add-event modal in create mode when a day cell is double-clicked', () => {
        renderCalendarWithItems([]);

        const firstDayCell = screen.getByTestId('day-cell-2026-03-15');
        fireEvent.doubleClick(firstDayCell);

        const form = screen.getByTestId('add-event-form');
        expect(form).toHaveAttribute('data-selected-date', '2026-03-15');
        expect(form).toHaveAttribute('data-selected-event-id', '');
    });

    it('selects an event on single click and opens detail view on double click', () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Family Lunch',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
        ]);

        fireEvent.click(screen.getByTestId('calendar-event-evt-1'));

        expect(screen.queryByTestId('add-event-form')).toBeNull();
        expect(screen.getByTestId('calendar-event-evt-1')).toHaveAttribute('data-calendar-selected', 'true');

        fireEvent.doubleClick(screen.getByTestId('calendar-event-evt-1'));

        // Detail view opens first (not the edit form)
        expect(screen.getByRole('button', { name: 'Edit Event' })).toBeTruthy();

        // Clicking Edit Event opens the edit form
        fireEvent.click(screen.getByRole('button', { name: 'Edit Event' }));

        const form = screen.getByTestId('add-event-form');
        expect(form).toHaveAttribute('data-selected-date', '2026-03-15');
        expect(form).toHaveAttribute('data-selected-event-id', 'evt-1');
    });

    it('hides Apple-imported items after sync marks them cancelled or deleted', () => {
        renderCalendarWithItems([
            {
                id: 'evt-active',
                title: 'Visible imported event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                sourceType: 'apple-caldav',
                sourceSyncStatus: 'active',
            },
            {
                id: 'evt-deleted',
                title: 'Deleted imported event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                sourceType: 'apple-caldav',
                sourceSyncStatus: 'deleted-remote',
            },
            {
                id: 'evt-cancelled',
                title: 'Cancelled imported event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                sourceType: 'apple-caldav',
                sourceSyncStatus: 'cancelled',
                status: 'cancelled',
            },
        ]);

        expect(screen.getByTestId('calendar-event-evt-active')).toBeInTheDocument();
        expect(screen.queryByTestId('calendar-event-evt-deleted')).toBeNull();
        expect(screen.queryByTestId('calendar-event-evt-cancelled')).toBeNull();
    });

    it('clears selection when a day cell is single-clicked', () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Family Lunch',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
        ]);

        fireEvent.click(screen.getByTestId('calendar-event-evt-1'));
        expect(screen.getByTestId('calendar-event-evt-1')).toHaveAttribute('data-calendar-selected', 'true');

        fireEvent.click(screen.getByTestId('day-cell-2026-03-16'));
        expect(screen.getByTestId('calendar-event-evt-1')).toHaveAttribute('data-calendar-selected', 'false');
    });

    it('resolves member colors for regular events and chores before rendering event chips', () => {
        renderCalendarWithData(
            {
                familyMembers: [
                    { id: 'member-1', name: 'Judah', color: '#3B82F6' },
                    { id: 'member-2', name: 'Ava', color: '#EF4444' },
                ],
                calendarItems: [
                    {
                        id: 'evt-1',
                        title: 'Piano',
                        description: '',
                        startDate: '2026-03-15',
                        endDate: '2026-03-16',
                        isAllDay: true,
                        pertainsTo: [{ id: 'member-1', name: 'Judah' }],
                    },
                ],
                chores: [
                    {
                        id: 'chore-1',
                        title: 'Kitchen reset',
                        description: '',
                        startDate: '2026-03-15',
                        rotationType: 'none',
                        assignees: [{ id: 'member-2', name: 'Ava' }],
                        assignments: [],
                        isJoint: false,
                        isUpForGrabs: false,
                    },
                ],
            },
            { showChores: true }
        );

        expect(screen.getByTestId('calendar-event-evt-1')).toHaveAttribute('data-member-colors', '#3B82F6');
        expect(screen.getByTestId('calendar-event-evt-1')).toHaveAttribute('data-member-indicator-style', 'badge');
        expect(screen.getByTestId('calendar-event-chore-chore-1-2026-03-15')).toHaveAttribute('data-member-colors', '#EF4444');
        expect(screen.getByTestId('calendar-event-chore-chore-1-2026-03-15')).toHaveAttribute('data-calendar-chip-surface', 'plain');
    });

    it('opens a delete confirmation for a selected non-recurring event and deletes it with the keyboard', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Family Lunch',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
        ]);

        fireEvent.click(screen.getByTestId('calendar-event-evt-1'));
        fireEvent.keyDown(window, { key: 'Delete' });

        expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Delete'));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledWith([{ entity: 'calendarItems', id: 'evt-1', op: 'delete' }]);
        });
    });

    it('uses the recurrence scope flow when deleting a selected recurring event with the keyboard', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-recurring',
                title: 'Lesson',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY',
            },
        ]);

        fireEvent.click(screen.getAllByTestId('calendar-event-evt-recurring')[0]);
        fireEvent.keyDown(window, { key: 'Delete' });

        expect(screen.getByTestId('recurrence-scope-dialog')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Only this event'));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });

        const txOps = mocks.dbTransact.mock.calls[0][0];
        expect(txOps[0]).toMatchObject({ entity: 'calendarItems', id: 'evt-recurring', op: 'update' });
        expect(txOps[0].payload.exdates).toContain('2026-03-15');
    });

    it('deletes imported recurring overrides when deleting an Apple series from the first occurrence', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-master',
                title: 'Bible study',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;COUNT=4',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;COUNT=4'],
                sourceExternalId: 'apple:acct_1:cal_1:bible-study:master',
                sourceType: 'apple-caldav',
            },
            {
                id: 'evt-override',
                title: 'Bible study',
                description: 'Changed on Apple',
                startDate: '2026-03-22',
                endDate: '2026-03-23',
                isAllDay: true,
                recurrenceId: '2026-03-22',
                recurringEventId: 'apple:acct_1:cal_1:bible-study:master',
                sourceExternalId: 'apple:acct_1:cal_1:bible-study:2026-03-22',
                sourceType: 'apple-caldav',
            },
        ]);

        fireEvent.click(within(screen.getByTestId('day-cell-2026-03-15')).getByRole('button', { name: 'Bible study' }));
        fireEvent.keyDown(window, { key: 'Delete' });

        expect(screen.getByTestId('recurrence-scope-dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByText('This and all following events'));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });

        const txOps = mocks.dbTransact.mock.calls[0][0];
        expect(txOps).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ entity: 'calendarItems', id: 'evt-master', op: 'delete' }),
                expect.objectContaining({ entity: 'calendarItems', id: 'evt-override', op: 'delete' }),
            ])
        );
    });

    it('positions today on the top visible row when the calendar first renders', async () => {
        const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
        const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
        const scrollToMock = vi.fn(function scrollTo(this: HTMLElement, options: ScrollToOptions) {
            this.scrollTop = Number(options?.top || 0);
        });

        Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
            configurable: true,
            value: scrollToMock,
        });
        Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
            configurable: true,
            get() {
                return this.getAttribute?.('data-calendar-cell-date') === '2026-03-15' ? 420 : 0;
            },
        });

        try {
            renderCalendarWithItems([], { currentDate: new Date(2026, 2, 15) });

            await waitFor(() => {
                expect(scrollToMock).toHaveBeenCalledWith({ top: 412, behavior: 'auto' });
            });

            expect(screen.getByTestId('calendar-scroll-container')).toHaveProperty('scrollTop', 412);
        } finally {
            if (originalScrollTo) {
                Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
            } else {
                delete (HTMLElement.prototype as any).scrollTo;
            }

            if (originalOffsetTop) {
                Object.defineProperty(HTMLElement.prototype, 'offsetTop', originalOffsetTop);
            } else {
                delete (HTMLElement.prototype as any).offsetTop;
            }
        }
    });

    it('renders vertical month labels only on the first day of the respective month', () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 0, 18),
            displayBS: true,
        });

        const leadingCell = screen.getByTestId('day-cell-2025-12-07');
        expect(within(leadingCell).queryByText('December')).toBeNull();
        expect(within(leadingCell).queryByText('चैत (Chait)')).toBeNull();

        const firstOfMonthCell = screen.getByTestId('day-cell-2026-01-01');
        expect(within(firstOfMonthCell).getByText('January')).toBeInTheDocument();
        expect(within(firstOfMonthCell).getByText('वैशाख (Baisakh)')).toBeInTheDocument();
    });

    it('falls back to Gregorian labels when both calendar label toggles are off in month view', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        const bsMonthLabel = formatCommonBsMonthLabel(2);
        expect(screen.queryAllByText('March').length).toBeGreaterThan(0);
        expect(screen.queryAllByText(bsMonthLabel).length).toBeGreaterThan(0);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowGregorianCalendar', showGregorianCalendar: false },
                })
            );
        });

        await waitFor(() => {
            expect(screen.queryAllByText('March')).toHaveLength(0);
            expect(screen.queryAllByText(bsMonthLabel).length).toBeGreaterThan(0);
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowBsCalendar', showBsCalendar: false },
                })
            );
        });

        await waitFor(() => {
            expect(screen.queryAllByText('March').length).toBeGreaterThan(0);
            expect(screen.queryAllByText(bsMonthLabel)).toHaveLength(0);
        });
    });

    it('keeps inline BS month split markers in monthly view even when the year-view toggle is off', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        const inlineBsLabel = formatCommonBsMonthLabel(2);
        const firstOfMonthCell = screen.getByTestId('day-cell-2026-03-01');
        expect(within(firstOfMonthCell).getByText(inlineBsLabel)).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowInlineNonBasisMonthBreaks', showInlineNonBasisMonthBreaks: false },
                })
            );
        });

        await waitFor(() => {
            expect(within(firstOfMonthCell).getByText(inlineBsLabel)).toBeInTheDocument();
            expect(document.querySelector('[class*="stickyMonthNepali"]')).toBeNull();
        });
    });

    it('switches into the full year view and renders discrete month cards', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-03')).toBeInTheDocument();
            expect(screen.getByTestId('year-month-gregorian-2027-02')).toBeInTheDocument();
        });
    });

    it('moves the non-basis month label into the year-view header when inline breaks are off', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        const marchCard = await screen.findByTestId('year-month-gregorian-2026-03');
        const compactBsLabel = formatCommonBsMonthCompactLabel(2);

        expect(within(marchCard).getByText('March')).toBeInTheDocument();
        expect(screen.getByTestId('day-cell-2026-03-01').className).toContain('firstDayOfNepaliMonth');

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowInlineNonBasisMonthBreaks', showInlineNonBasisMonthBreaks: false },
                })
            );
        });

        await waitFor(() => {
            expect(within(marchCard).getByText('March')).toBeInTheDocument();
            expect(within(marchCard).queryAllByText(compactBsLabel).length).toBeGreaterThan(0);
            expect(screen.getByTestId('day-cell-2026-03-01').className).not.toContain('firstDayOfNepaliMonth');
        });
    });

    it('auto-switches the year-view basis and removes split markers when only one calendar is visible', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await screen.findByTestId('year-month-gregorian-2026-03');

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowGregorianCalendar', showGregorianCalendar: false },
                })
            );
        });

        const bsCard = await screen.findByTestId('year-month-bs-2083-03');
        expect(screen.queryByTestId('year-month-gregorian-2026-03')).toBeNull();
        expect(within(bsCard).getByText(formatCommonBsMonthCompactLabel(2))).toBeInTheDocument();
        expect(screen.getByTestId('day-cell-2026-03-01').className).not.toContain('firstDayOfMonth');
        expect(screen.getByTestId('day-cell-2026-03-01').className).not.toContain('firstDayOfNepaliMonth');

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowGregorianCalendar', showGregorianCalendar: true },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowBsCalendar', showBsCalendar: false },
                })
            );
        });

        const gregorianCard = await screen.findByTestId('year-month-gregorian-2026-03');
        expect(screen.queryByTestId('year-month-bs-2083-03')).toBeNull();
        expect(within(gregorianCard).getByText('March')).toBeInTheDocument();
        expect(screen.getByTestId('day-cell-2026-03-01').className).not.toContain('firstDayOfMonth');
        expect(screen.getByTestId('day-cell-2026-03-01').className).not.toContain('firstDayOfNepaliMonth');
    });

    it('shifts the year view by one month when the shift command is dispatched', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2025-03')).toBeInTheDocument();
            expect(screen.getByTestId('year-month-gregorian-2028-02')).toBeInTheDocument();
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'shiftYearView', direction: 'left' },
                })
            );
        });

        expect(screen.getByTestId('year-month-gregorian-2025-03')).toBeInTheDocument();
        expect(screen.queryByTestId('year-month-gregorian-2028-03')).not.toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByTestId('year-month-gregorian-2025-03')).not.toBeInTheDocument();
            expect(screen.getByTestId('year-month-gregorian-2025-04')).toBeInTheDocument();
            expect(screen.getByTestId('year-month-gregorian-2028-03')).toBeInTheDocument();
        });
    });

    it('allows consecutive year-view shifts in both directions', async () => {
        renderCalendarWithItems([], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-03')).toBeInTheDocument();
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'shiftYearView', direction: 'right' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-02')).toBeInTheDocument();
            expect(screen.queryByTestId('year-month-gregorian-2028-02')).not.toBeInTheDocument();
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'shiftYearView', direction: 'left' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-03')).toBeInTheDocument();
            expect(screen.getByTestId('year-month-gregorian-2027-02')).toBeInTheDocument();
        });
    });

    it('keeps multi-day events as shared span bars in the year view', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-span',
                title: 'Spring Break',
                description: '',
                startDate: '2026-03-18',
                endDate: '2026-03-21',
                isAllDay: true,
            },
        ], {
            currentDate: new Date(2026, 2, 15),
            displayBS: true,
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-03')).toBeInTheDocument();
        });

        expect(screen.getAllByTestId('calendar-event-evt-span')).toHaveLength(1);
    });

    it('uses compact member indicators in the year view', async () => {
        renderCalendarWithData(
            {
                familyMembers: [{ id: 'member-1', name: 'Judah', color: '#3B82F6' }],
                calendarItems: [
                    {
                        id: 'evt-dot',
                        title: 'Piano',
                        description: '',
                        startDate: '2026-03-15',
                        endDate: '2026-03-16',
                        isAllDay: true,
                        pertainsTo: [{ id: 'member-1', name: 'Judah' }],
                    },
                ],
            },
            {
                currentDate: new Date(2026, 2, 15),
                displayBS: true,
            }
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('calendar-event-evt-dot')).toHaveAttribute('data-member-indicator-style', 'dot');
        });
    });

    it('lets single-day year-view events rise when no multi-day span occupies that day', async () => {
        renderCalendarWithItems(
            [
                {
                    id: 'evt-span',
                    title: 'School Trip',
                    description: '',
                    startDate: '2026-03-11',
                    endDate: '2026-03-14',
                    isAllDay: true,
                },
                {
                    id: 'evt-single',
                    title: 'Something',
                    description: '',
                    startDate: '2026-03-14',
                    endDate: '2026-03-15',
                    isAllDay: true,
                },
            ],
            {
                currentDate: new Date(2026, 2, 15),
                displayBS: true,
            }
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('year-month-gregorian-2026-03')).toBeInTheDocument();
        });

        const spanEndDay = screen.getByTestId('day-cell-2026-03-13');
        const adjacentSingleDay = screen.getByTestId('day-cell-2026-03-14');
        const spanSpacer = spanEndDay.querySelector<HTMLElement>('[aria-hidden="true"]');
        const adjacentSpacer = adjacentSingleDay.querySelector<HTMLElement>('[aria-hidden="true"]');

        expect(within(adjacentSingleDay).getByTestId('calendar-event-evt-single')).toBeInTheDocument();
        expect(spanSpacer).not.toBeNull();
        expect(adjacentSpacer).toBeNull();
    });

    it('reschedules an event via drag-drop monitor and persists the moved date', () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Soccer',
                description: '',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
        ]);

        expect(mocks.monitorForElements.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(mocks.monitorConfig).toBeTruthy();

        act(() => {
            mocks.monitorConfig.onDrop({
                source: {
                    data: {
                        type: 'calendar-event',
                        event: {
                            id: 'evt-1',
                            title: 'Soccer',
                            startDate: '2026-03-15',
                            endDate: '2026-03-16',
                            isAllDay: true,
                        },
                    },
                },
                location: {
                    current: {
                        dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-17' } }],
                    },
                },
            });
        });

        expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toHaveLength(1);
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-1',
            op: 'update',
            payload: {
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                year: 2026,
                month: 3,
                dayOfMonth: 17,
                sequence: 1,
            },
        });
        expect(typeof ops[0].payload.updatedAt).toBe('string');
        expect(typeof ops[0].payload.lastModified).toBe('string');
        expect(typeof ops[0].payload.dtStamp).toBe('string');
    });

    it('switches to the day view and opens a timed draft from an empty slot', async () => {
        renderCalendarWithItems([]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('day-view-header-2026-03-15')).toBeInTheDocument();
        });

        fireEvent.doubleClick(screen.getByTestId('day-view-timed-column-2026-03-15'), { clientY: 520 });

        const form = screen.getByTestId('add-event-form');
        expect(form).toHaveAttribute('data-selected-date', '2026-03-15');
        expect(form).toHaveAttribute('data-draft-all-day', 'false');
        // The draft start/end are ISO strings (UTC), so in eastern timezones the
        // date portion may roll back to the previous day.  Verify the dates round-trip
        // back to local March 15 instead of checking the raw UTC string.
        const draftStart = new Date(form.getAttribute('data-draft-start')!);
        const draftEnd = new Date(form.getAttribute('data-draft-end')!);
        expect(draftStart.getFullYear()).toBe(2026);
        expect(draftStart.getMonth()).toBe(2); // March
        expect(draftStart.getDate()).toBe(15);
        expect(draftEnd.getFullYear()).toBe(2026);
        expect(draftEnd.getMonth()).toBe(2);
        expect(draftEnd.getDate()).toBe(15);
    });

    it('renders two stacked day rows without crashing when the second row option is enabled', async () => {
        const receivedStates: any[] = [];
        const handleState = (event: Event) => {
            receivedStates.push((event as CustomEvent).detail);
        };
        window.addEventListener(CALENDAR_STATE_EVENT, handleState);

        renderCalendarWithItems([]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });
        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 3 },
                })
            );
        });
        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayRowCount', dayRowCount: 2 },
                })
            );
        });

        await waitFor(() => {
            expect(receivedStates.at(-1)?.currentPeriodLabel?.title).toBe('March 2026');
        });
        expect(screen.getAllByTestId('day-view-header-2026-03-15').length).toBeGreaterThan(0);
        expect(screen.getAllByTestId('day-view-header-2026-03-18').length).toBeGreaterThan(0);
        expect(screen.getByTestId('day-view-vertical-scroller-0')).toBeInTheDocument();
        expect(screen.getByTestId('day-view-vertical-scroller-1')).toBeInTheDocument();

        window.removeEventListener(CALENDAR_STATE_EVENT, handleState);
    });

    it('publishes a year-range header label through calendar state in year view', async () => {
        const receivedStates: any[] = [];
        const handleState = (event: Event) => {
            receivedStates.push((event as CustomEvent).detail);
        };
        window.addEventListener(CALENDAR_STATE_EVENT, handleState);

        renderCalendarWithItems([]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'year' },
                })
            );
        });

        await waitFor(() => {
            expect(receivedStates.at(-1)?.viewMode).toBe('year');
            expect(receivedStates.at(-1)?.currentPeriodLabel?.title).toBe('2025 - 2028');
        });

        window.removeEventListener(CALENDAR_STATE_EVENT, handleState);
    });

    it('publishes an agenda-range header label through calendar state in agenda view', async () => {
        const receivedStates: any[] = [];
        const handleState = (event: Event) => {
            receivedStates.push((event as CustomEvent).detail);
        };
        window.addEventListener(CALENDAR_STATE_EVENT, handleState);

        renderCalendarWithItems([]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'agenda' },
                })
            );
        });

        await waitFor(() => {
            expect(receivedStates.at(-1)?.viewMode).toBe('agenda');
            expect(receivedStates.at(-1)?.currentPeriodLabel?.title).toBe('March - July 2026');
        });

        window.removeEventListener(CALENDAR_STATE_EVENT, handleState);
    });

    it('renders a multi-day all-day event as one chip per visible row segment instead of one chip per day', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-multi-day',
                title: '10 day event',
                startDate: '2026-03-12',
                endDate: '2026-03-22',
                isAllDay: true,
            },
        ]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });
        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 3 },
                })
            );
        });
        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayRowCount', dayRowCount: 2 },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getAllByTestId('calendar-event-evt-multi-day')).toHaveLength(2);
        });
    });

    it('keeps the day-view hour gutter perfectly aligned with vertical scrolling', async () => {
        renderCalendarWithItems([]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });

        const scroller = await screen.findByTestId('day-view-vertical-scroller-0');
        const gutterInner = await screen.findByTestId('day-view-time-gutter-inner-0');

        act(() => {
            scroller.scrollTop = 420;
            fireEvent.scroll(scroller);
        });

        expect((gutterInner as HTMLElement).style.transform).toBe('translate3d(0, -420px, 0)');
    });

    it('shows contextual Gregorian subtitles for multi-day timed events in day view', async () => {
        renderCalendarWithItems(
            [
                {
                    id: 'evt-multi-day-timed',
                    title: 'Spring trip',
                    startDate: '2026-04-09T08:00:00',
                    endDate: '2026-04-13T17:00:00',
                    isAllDay: false,
                },
            ],
            {
                currentDate: new Date(2026, 3, 9),
            }
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 5 },
                })
            );
        });

        await waitFor(() => {
            expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-09')).not.toBeNull();
            expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-11')).not.toBeNull();
            expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-13')).not.toBeNull();
        });

        expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-09')).toHaveAttribute(
            'data-calendar-meta-label',
            '8 am - April 13 at 5 pm'
        );
        expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-11')).toHaveAttribute(
            'data-calendar-meta-label',
            'April 9 at 8 am - April 13 at 5 pm'
        );
        expect(getRenderedEventOnDay('evt-multi-day-timed', '2026-04-13')).toHaveAttribute(
            'data-calendar-meta-label',
            'April 9 at 8 am - 5 pm today'
        );
    });

    it('shows combined and BS-only subtitles for multi-day timed events when BS labels are enabled', async () => {
        const bsMonthLabel = formatCommonBsMonthCompactLabel(3);

        renderCalendarWithItems(
            [
                {
                    id: 'evt-multi-day-bs',
                    title: 'Spring trip',
                    startDate: '2026-04-09T08:00:00',
                    endDate: '2026-04-13T17:00:00',
                    isAllDay: false,
                },
            ],
            {
                currentDate: new Date(2026, 3, 9),
                displayBS: true,
            }
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 5 },
                })
            );
        });

        await waitFor(() => {
            expect(getRenderedEventOnDay('evt-multi-day-bs', '2026-04-11')).not.toBeNull();
        });

        expect(getRenderedEventOnDay('evt-multi-day-bs', '2026-04-11')).toHaveAttribute(
            'data-calendar-meta-label',
            `April 9 ${bsMonthLabel} ${toDevanagariDigits(9)} at 8 am - April 13 ${bsMonthLabel} ${toDevanagariDigits(13)} at 5 pm`
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowGregorianCalendar', showGregorianCalendar: false },
                })
            );
        });

        await waitFor(() => {
            expect(getRenderedEventOnDay('evt-multi-day-bs', '2026-04-11')).toHaveAttribute(
                'data-calendar-meta-label',
                `${bsMonthLabel} ${toDevanagariDigits(9)} at 8 am - ${bsMonthLabel} ${toDevanagariDigits(13)} at 5 pm`
            );
        });
    });

    it('includes the year in day-view subtitles when a timed event crosses a Gregorian year boundary', async () => {
        renderCalendarWithItems(
            [
                {
                    id: 'evt-year-break',
                    title: 'New Year camp',
                    startDate: '2026-12-31T23:00:00',
                    endDate: '2027-01-02T01:00:00',
                    isAllDay: false,
                },
            ],
            {
                currentDate: new Date(2026, 11, 31),
            }
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 3 },
                })
            );
        });

        await waitFor(() => {
            expect(getRenderedEventOnDay('evt-year-break', '2027-01-01')).not.toBeNull();
        });

        expect(getRenderedEventOnDay('evt-year-break', '2027-01-01')).toHaveAttribute(
            'data-calendar-meta-label',
            'December 31, 2026 at 11 pm - January 2, 2027 at 1 am'
        );
    });

    it('reschedules a timed event to a specific day/time in the day view', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-timed',
                title: 'Math tutoring',
                startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });

        const event = {
            id: 'evt-timed',
            title: 'Math tutoring',
            startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
            isAllDay: false,
        };

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event } },
                location: {
                    current: {
                        input: { altKey: false, shiftKey: false },
                        dropTargets: [{ data: { type: 'calendar-time-slot', dateStr: '2026-03-16', minuteOfDay: 600 } }],
                    },
                },
            });
        });

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalled();
        });

        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-timed',
            op: 'update',
            payload: {
                startDate: new Date(2026, 2, 16, 10, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 16, 11, 0, 0, 0).toISOString(),
                year: 2026,
                month: 3,
                dayOfMonth: 16,
            },
        });
    });

    it('uses the dragged event footprint instead of the cursor for final timed day placement', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-footprint',
                title: 'Math tutoring',
                startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 3 },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('day-view-timed-column-2026-03-16')).toBeInTheDocument();
            expect(screen.getByTestId('day-view-timed-column-2026-03-17')).toBeInTheDocument();
        });

        const day15Column = screen.getByTestId('day-view-timed-column-2026-03-15');
        const day16Column = screen.getByTestId('day-view-timed-column-2026-03-16');
        const day17Column = screen.getByTestId('day-view-timed-column-2026-03-17');

        Object.defineProperty(day15Column, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 100, bottom: 388, width: 100, height: 288 }),
        });
        Object.defineProperty(day16Column, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 100, right: 200, top: 100, bottom: 388, width: 100, height: 288 }),
        });
        Object.defineProperty(day17Column, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 200, right: 300, top: 100, bottom: 388, width: 100, height: 288 }),
        });

        const sourceElement = document.createElement('div');
        Object.defineProperty(sourceElement, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 100, right: 280, top: 100, bottom: 140, width: 180, height: 40 }),
        });

        const event = {
            id: 'evt-footprint',
            title: 'Math tutoring',
            startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
            isAllDay: false,
        };

        act(() => {
            mocks.monitorConfig.onDragStart({
                source: { data: { type: 'calendar-event', event }, element: sourceElement },
                location: { current: { input: { clientX: 170, clientY: 120 } } },
            });
        });

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event } },
                location: {
                    current: {
                        input: { altKey: false, shiftKey: false, clientX: 185, clientY: 240 },
                        dropTargets: [{ data: { type: 'calendar-time-slot', dateStr: '2026-03-16', minuteOfDay: 600 } }],
                    },
                },
            });
        });

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalled();
        });

        const [ops] = mocks.dbTransact.mock.calls.at(-1)!;
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-footprint',
            op: 'update',
            payload: expect.objectContaining({
                dayOfMonth: 17,
            }),
        });
    });

    it('keeps timed drag previews and drops on the correct date in the second day-view row', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-second-row',
                title: 'Math tutoring',
                startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayVisibleDays', dayVisibleDays: 3 },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setDayRowCount', dayRowCount: 2 },
                })
            );
        });

        const day15Columns = await screen.findAllByTestId('day-view-timed-column-2026-03-15');
        const day18Columns = await screen.findAllByTestId('day-view-timed-column-2026-03-18');
        const timedHorizontalViewports = Array.from(
            document.querySelectorAll<HTMLElement>('[data-calendar-day-horizontal-viewport="timed"]')
        );
        const row0Scroller = await screen.findByTestId('day-view-vertical-scroller-0');
        const row1Scroller = await screen.findByTestId('day-view-vertical-scroller-1');
        expect(day15Columns.length).toBeGreaterThan(1);
        expect(day18Columns.length).toBeGreaterThan(1);
        expect(timedHorizontalViewports).toHaveLength(2);

        Object.defineProperty(timedHorizontalViewports[0], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 100, bottom: 388, width: 100, height: 288 }),
        });
        Object.defineProperty(timedHorizontalViewports[1], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 500, bottom: 788, width: 100, height: 288 }),
        });
        Object.defineProperty(row0Scroller, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 100, bottom: 388, width: 100, height: 288 }),
        });
        Object.defineProperty(row1Scroller, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 500, bottom: 788, width: 100, height: 288 }),
        });

        Object.defineProperty(day15Columns[0], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: -152, bottom: 712, width: 100, height: 864 }),
        });
        Object.defineProperty(day15Columns[1], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 300, right: 400, top: 248, bottom: 1112, width: 100, height: 864 }),
        });
        Object.defineProperty(day18Columns[0], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 300, right: 400, top: -152, bottom: 712, width: 100, height: 864 }),
        });
        Object.defineProperty(day18Columns[1], 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 100, top: 248, bottom: 1112, width: 100, height: 864 }),
        });

        const sourceElement = document.createElement('div');
        Object.defineProperty(sourceElement, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 0, right: 90, top: 100, bottom: 140, width: 90, height: 40 }),
        });

        const event = {
            id: 'evt-second-row',
            title: 'Math tutoring',
            startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
            endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
            isAllDay: false,
        };

        act(() => {
            mocks.monitorConfig.onDragStart({
                source: { data: { type: 'calendar-event', event }, element: sourceElement },
                location: { current: { input: { clientX: 45, clientY: 120 } } },
            });
        });

        act(() => {
            mocks.monitorConfig.onDrag({
                source: { data: { type: 'calendar-event', event } },
                location: {
                    current: {
                        input: { clientX: 45, clientY: 628 },
                        dropTargets: [{ data: { type: 'calendar-time-slot', dateStr: '2026-03-18', minuteOfDay: 600 } }],
                    },
                },
            });
        });

        expect(screen.getAllByText('10-11 am').length).toBeGreaterThan(0);
        expect(screen.queryByText('9-10 pm')).toBeNull();

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event } },
                location: {
                    current: {
                        input: { altKey: false, shiftKey: false, clientX: 45, clientY: 628 },
                        dropTargets: [{ data: { type: 'calendar-time-slot', dateStr: '2026-03-18', minuteOfDay: 600 } }],
                    },
                },
            });
        });

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalled();
        });

        const [ops] = mocks.dbTransact.mock.calls.at(-1)!;
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-second-row',
            op: 'update',
            payload: {
                startDate: new Date(2026, 2, 18, 10, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 18, 11, 0, 0, 0).toISOString(),
                year: 2026,
                month: 3,
                dayOfMonth: 18,
            },
        });
    });

    it('resizes a timed event in the day view', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-resize',
                title: 'Reading block',
                startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
                endDate: new Date(2026, 2, 15, 10, 0, 0, 0).toISOString(),
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setViewMode', viewMode: 'day' },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByLabelText('Resize Reading block later')).toBeInTheDocument();
        });

        fireEvent.pointerDown(screen.getByLabelText('Resize Reading block later'), { clientY: 100 });
        fireEvent.pointerMove(window, { clientY: 144 });
        fireEvent.pointerUp(window, { clientY: 144 });

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalled();
        });

        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops[0]).toMatchObject({
            entity: 'calendarItems',
            id: 'evt-resize',
            op: 'update',
            payload: {
                startDate: new Date(2026, 2, 15, 9, 0, 0, 0).toISOString(),
                year: 2026,
                month: 3,
                dayOfMonth: 15,
            },
        });
        expect(new Date(ops[0].payload.endDate).getTime()).toBeGreaterThan(new Date(2026, 2, 15, 10, 0, 0, 0).getTime());
    });

    it('ignores drops onto the same day or non-calendar targets', () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Soccer',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
        ]);

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event: { id: 'evt-1', startDate: '2026-03-15', endDate: '2026-03-16', isAllDay: true } } },
                location: { current: { dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-15' } }] } },
            });
        });
        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'not-calendar' } },
                location: { current: { dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-17' } }] } },
            });
        });

        expect(mocks.dbTransact).not.toHaveBeenCalled();
    });

    it('lists same-day events in ascending start-time order', () => {
        renderCalendarWithItems([
            {
                id: 'evt-2',
                title: 'Later event',
                startDate: '2026-03-15T14:00:00.000Z',
                endDate: '2026-03-15T15:00:00.000Z',
                isAllDay: false,
            },
            {
                id: 'evt-1',
                title: 'Earlier event',
                startDate: '2026-03-15T09:00:00.000Z',
                endDate: '2026-03-15T10:00:00.000Z',
                isAllDay: false,
            },
        ]);

        const dayCell = screen.getByTestId('day-cell-2026-03-15');
        const eventButtons = within(dayCell).getAllByRole('button');
        expect(eventButtons.map((button) => button.textContent)).toEqual(['Earlier event', 'Later event']);
    });

    it('expands RRULE events onto matching recurrence days', () => {
        renderCalendarWithItems([
            {
                id: 'evt-recurring',
                title: 'Family Lunch',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
            },
        ]);

        expect(within(screen.getByTestId('day-cell-2026-03-15')).getByRole('button', { name: 'Family Lunch' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-22')).getByRole('button', { name: 'Family Lunch' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-29')).getByRole('button', { name: 'Family Lunch' })).toBeInTheDocument();
    });

    it('skips EXDATE occurrences when expanding RRULE events', () => {
        renderCalendarWithItems([
            {
                id: 'evt-recurring',
                title: 'Family Lunch',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
                exdates: ['2026-03-22'],
            },
        ]);

        expect(within(screen.getByTestId('day-cell-2026-03-15')).getByRole('button', { name: 'Family Lunch' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-29')).getByRole('button', { name: 'Family Lunch' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-22')).queryByRole('button', { name: 'Family Lunch' })).toBeNull();
    });

    it('keeps the original start-day event visible even when RRULE BYDAY differs', () => {
        renderCalendarWithItems([
            {
                id: 'evt-recurring',
                title: 'Weekly Class',
                startDate: '2026-03-23',
                endDate: '2026-03-24',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
            },
        ]);

        expect(within(screen.getByTestId('day-cell-2026-03-23')).getByRole('button', { name: 'Weekly Class' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-24')).getByRole('button', { name: 'Weekly Class' })).toBeInTheDocument();
    });

    it('keeps chores hidden by default and shows them once the chore overlay is enabled', async () => {
        renderCalendarWithData({
            chores: [
                {
                    id: 'chore-alex',
                    title: 'Take out trash',
                    description: 'Bins to the curb',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    assignees: [{ id: 'member-alex', name: 'Alex' }],
                },
            ],
        });

        expect(within(screen.getByTestId('day-cell-2026-03-15')).queryByRole('button', { name: 'Take out trash' })).toBeNull();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowChores', showChores: true },
                })
            );
        });

        await waitFor(() => {
            const choreButton = within(screen.getByTestId('day-cell-2026-03-15')).getByRole('button', { name: 'Take out trash' });
            expect(choreButton).toHaveAttribute('data-calendar-item-kind', 'chore');
        });
    });

    it('applies the member filter to chores and shows joint or up-for-grabs chores when any selected assignee matches', async () => {
        renderCalendarWithData({
            chores: [
                {
                    id: 'chore-alex-only',
                    title: 'Alex solo chore',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    assignees: [{ id: 'member-alex', name: 'Alex' }],
                },
                {
                    id: 'chore-sam-only',
                    title: 'Sam solo chore',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    assignees: [{ id: 'member-sam', name: 'Sam' }],
                },
                {
                    id: 'chore-joint',
                    title: 'Joint kitchen reset',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    isJoint: true,
                    assignees: [
                        { id: 'member-alex', name: 'Alex' },
                        { id: 'member-sam', name: 'Sam' },
                    ],
                },
                {
                    id: 'chore-up-for-grabs',
                    title: 'Feed the dog',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    isUpForGrabs: true,
                    assignees: [
                        { id: 'member-alex', name: 'Alex' },
                        { id: 'member-sam', name: 'Sam' },
                    ],
                },
            ],
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowChores', showChores: true },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setMemberFilter',
                        everyoneSelected: false,
                        selectedMemberIds: ['member-sam'],
                    },
                })
            );
        });

        await waitFor(() => {
            const dayCell = screen.getByTestId('day-cell-2026-03-15');
            expect(within(dayCell).queryByRole('button', { name: 'Alex solo chore' })).toBeNull();
            expect(within(dayCell).getByRole('button', { name: 'Sam solo chore' })).toBeInTheDocument();
            expect(within(dayCell).getByRole('button', { name: 'Joint kitchen reset' })).toBeInTheDocument();
            expect(within(dayCell).getByRole('button', { name: 'Feed the dog' })).toBeInTheDocument();
        });
    });

    it('applies the specific chores filter when chores are shown on the calendar', async () => {
        renderCalendarWithData({
            chores: [
                {
                    id: 'chore-trash',
                    title: 'Take out trash',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    assignees: [{ id: 'member-alex', name: 'Alex' }],
                },
                {
                    id: 'chore-dishes',
                    title: 'Wash dishes',
                    startDate: '2026-03-15',
                    rotationType: 'none',
                    assignees: [{ id: 'member-alex', name: 'Alex' }],
                },
            ],
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setShowChores', showChores: true },
                })
            );
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setChoreFilter', selectedChoreIds: ['chore-dishes'] },
                })
            );
        });

        await waitFor(() => {
            const dayCell = screen.getByTestId('day-cell-2026-03-15');
            expect(within(dayCell).queryByRole('button', { name: 'Take out trash' })).toBeNull();
            expect(within(dayCell).getByRole('button', { name: 'Wash dishes' })).toBeInTheDocument();
        });
    });

    it('after dragging the original recurring event and choosing "all events", moves the whole series', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-1',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
            },
        ]);

        act(() => {
            mocks.monitorConfig.onDrop({
                source: {
                    data: {
                        type: 'calendar-event',
                        event: {
                            id: 'evt-1',
                            title: 'Soccer',
                            startDate: '2026-03-17',
                            endDate: '2026-03-18',
                            isAllDay: true,
                            rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                        },
                    },
                },
                location: {
                    current: {
                        dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-19' } }],
                    },
                },
            });
        });
        fireEvent.click(screen.getByRole('button', { name: 'All events' }));

        await waitFor(() => {
            expect(within(screen.getByTestId('day-cell-2026-03-19')).getByRole('button', { name: 'Soccer' })).toBeInTheDocument();
            expect(within(screen.getByTestId('day-cell-2026-03-26')).getByRole('button', { name: 'Soccer' })).toBeInTheDocument();
        });
        expect(within(screen.getByTestId('day-cell-2026-03-24')).queryByRole('button', { name: 'Soccer' })).toBeNull();

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalled();
        });
        const allOps = mocks.dbTransact.mock.calls.flatMap((call) => call[0] || []);
        expect(allOps).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-1',
                    op: 'update',
                    payload: expect.objectContaining({
                        startDate: '2026-03-19',
                        endDate: '2026-03-20',
                        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
                    }),
                }),
            ])
        );
    });

    it('uses the Alt drag hotkey to move only this recurring occurrence and shows a cursor indicator', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-master',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            },
        ]);

        const recurringOccurrence = {
            id: 'evt-master',
            title: 'Soccer',
            startDate: '2026-03-24',
            endDate: '2026-03-25',
            isAllDay: true,
            rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
            recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            __isRecurrenceInstance: true,
            __masterEvent: {
                id: 'evt-master',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            },
        };

        act(() => {
            mocks.monitorConfig.onDrag({
                source: { data: { type: 'calendar-event', event: recurringOccurrence } },
                location: { current: { input: { altKey: true, clientX: 180, clientY: 220 } } },
            });
        });

        expect(screen.getByTestId('drag-recurrence-indicator')).toBeInTheDocument();
        expect(screen.getByText('Only this event')).toBeInTheDocument();
        expect(screen.getByText('Alt')).toBeInTheDocument();

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event: recurringOccurrence } },
                location: {
                    current: {
                        input: { altKey: true, clientX: 180, clientY: 220 },
                        dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-26' } }],
                    },
                },
            });
        });

        expect(screen.queryByTestId('recurrence-scope-dialog')).toBeNull();
        expect(screen.queryByTestId('drag-recurrence-indicator')).toBeNull();

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    op: 'update',
                    payload: expect.objectContaining({
                        exdates: expect.arrayContaining(['2026-03-24']),
                    }),
                }),
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-generated',
                    op: 'update',
                    payload: expect.objectContaining({
                        recurringEventId: 'evt-master',
                        recurrenceId: '2026-03-24',
                        startDate: '2026-03-26',
                    }),
                }),
            ])
        );
    });

    it('suppresses the generated recurrence when an imported Apple override points to a master by sourceExternalId', () => {
        renderCalendarWithItems([
            {
                id: 'evt-master',
                title: 'Bible study',
                startDate: '2026-03-10',
                endDate: '2026-03-11',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;COUNT=3',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
                sourceExternalId: 'apple:acct_1:cal_1:weekly-study:master',
                sourceType: 'apple-caldav',
            },
            {
                id: 'evt-override',
                title: 'Bible study moved',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                recurrenceId: '20260317T120000Z',
                recurringEventId: 'apple:acct_1:cal_1:weekly-study:master',
                sourceExternalId: 'apple:acct_1:cal_1:weekly-study:20260317T120000Z',
                sourceType: 'apple-caldav',
            },
        ]);

        expect(within(screen.getByTestId('day-cell-2026-03-17')).queryByRole('button', { name: 'Bible study' })).toBeNull();
        expect(within(screen.getByTestId('day-cell-2026-03-17')).getByRole('button', { name: 'Bible study moved' })).toBeInTheDocument();
        expect(within(screen.getByTestId('day-cell-2026-03-24')).getByRole('button', { name: 'Bible study' })).toBeInTheDocument();
    });

    it('uses the Shift drag hotkey to move this and following recurring events without opening the scope dialog', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-master',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            },
        ]);

        const recurringOccurrence = {
            id: 'evt-master',
            title: 'Soccer',
            startDate: '2026-03-24',
            endDate: '2026-03-25',
            isAllDay: true,
            rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
            recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            __isRecurrenceInstance: true,
            __masterEvent: {
                id: 'evt-master',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            },
        };

        act(() => {
            mocks.monitorConfig.onDrag({
                source: { data: { type: 'calendar-event', event: recurringOccurrence } },
                location: { current: { input: { shiftKey: true, clientX: 210, clientY: 240 } } },
            });
        });

        expect(screen.getByTestId('drag-recurrence-indicator')).toBeInTheDocument();
        expect(screen.getByText('This and following events')).toBeInTheDocument();
        expect(screen.getByText('Shift')).toBeInTheDocument();

        act(() => {
            mocks.monitorConfig.onDrop({
                source: { data: { type: 'calendar-event', event: recurringOccurrence } },
                location: {
                    current: {
                        input: { shiftKey: true, clientX: 210, clientY: 240 },
                        dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-26' } }],
                    },
                },
            });
        });

        expect(screen.queryByTestId('recurrence-scope-dialog')).toBeNull();
        expect(screen.queryByTestId('drag-recurrence-indicator')).toBeNull();

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    op: 'update',
                    payload: expect.objectContaining({
                        rrule: expect.stringContaining('UNTIL='),
                    }),
                }),
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-generated',
                    op: 'update',
                    payload: expect.objectContaining({
                        startDate: '2026-03-26',
                        endDate: '2026-03-27',
                        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TH',
                    }),
                }),
            ])
        );
    });

    it('can drag one recurring occurrence as a single override when choosing single scope', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-master',
                title: 'Soccer',
                startDate: '2026-03-17',
                endDate: '2026-03-18',
                isAllDay: true,
                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
            },
        ]);

        act(() => {
            mocks.monitorConfig.onDrop({
                source: {
                    data: {
                        type: 'calendar-event',
                        event: {
                            id: 'evt-master',
                            title: 'Soccer',
                            startDate: '2026-03-24',
                            endDate: '2026-03-25',
                            isAllDay: true,
                            rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                            recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                            __isRecurrenceInstance: true,
                            __masterEvent: {
                                id: 'evt-master',
                                title: 'Soccer',
                                startDate: '2026-03-17',
                                endDate: '2026-03-18',
                                isAllDay: true,
                                rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                                recurrenceLines: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
                            },
                        },
                    },
                },
                location: {
                    current: {
                        dropTargets: [{ data: { type: 'calendar-day', dateStr: '2026-03-26' } }],
                    },
                },
            });
        });
        fireEvent.click(screen.getByRole('button', { name: 'Only this event' }));

        await waitFor(() => {
            expect(mocks.dbTransact).toHaveBeenCalledTimes(1);
        });
        const [ops] = mocks.dbTransact.mock.calls[0];
        expect(ops).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-master',
                    op: 'update',
                    payload: expect.objectContaining({
                        exdates: expect.arrayContaining(['2026-03-24']),
                    }),
                }),
                expect.objectContaining({
                    entity: 'calendarItems',
                    id: 'evt-generated',
                    op: 'update',
                    payload: expect.objectContaining({
                        recurringEventId: 'evt-master',
                        recurrenceId: '2026-03-24',
                        startDate: '2026-03-26',
                    }),
                }),
            ])
        );
    });

    it('filters calendar events by selected family members when Everyone is off', () => {
        renderCalendarWithItems([
            {
                id: 'evt-everyone',
                title: 'All Hands',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
            },
            {
                id: 'evt-alex',
                title: 'Alex Event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                pertainsTo: [{ id: 'member-alex', name: 'Alex' }],
            },
            {
                id: 'evt-sam',
                title: 'Sam Event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                pertainsTo: [{ id: 'member-sam', name: 'Sam' }],
            },
        ]);

        const dayCell = screen.getByTestId('day-cell-2026-03-15');
        expect(within(dayCell).getByRole('button', { name: 'All Hands' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'Alex Event' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'Sam Event' })).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setMemberFilter',
                        everyoneSelected: false,
                        selectedMemberIds: ['member-sam'],
                    },
                })
            );
        });

        expect(within(dayCell).queryByRole('button', { name: 'All Hands' })).toBeNull();
        expect(within(dayCell).queryByRole('button', { name: 'Alex Event' })).toBeNull();
        expect(within(dayCell).getByRole('button', { name: 'Sam Event' })).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setMemberFilter',
                        everyoneSelected: false,
                        selectedMemberIds: [],
                    },
                })
            );
        });

        expect(within(dayCell).queryByRole('button', { name: 'All Hands' })).toBeNull();
        expect(within(dayCell).queryByRole('button', { name: 'Alex Event' })).toBeNull();
        expect(within(dayCell).queryByRole('button', { name: 'Sam Event' })).toBeNull();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setMemberFilter',
                        everyoneSelected: true,
                        selectedMemberIds: [],
                    },
                })
            );
        });

        expect(within(dayCell).getByRole('button', { name: 'All Hands' })).toBeInTheDocument();
        expect(within(dayCell).queryByRole('button', { name: 'Alex Event' })).toBeNull();
        expect(within(dayCell).queryByRole('button', { name: 'Sam Event' })).toBeNull();
    });

    it('filters calendar events by any selected tag and hides untagged events while the tag filter is active', () => {
        renderCalendarWithItems([
            {
                id: 'evt-untagged',
                title: 'Untagged Event',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                tags: [],
            },
            {
                id: 'evt-school',
                title: 'School Assembly',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                tags: [{ id: 'tag-school', name: 'School' }],
            },
            {
                id: 'evt-travel-school',
                title: 'Travel Day',
                startDate: '2026-03-15',
                endDate: '2026-03-16',
                isAllDay: true,
                tags: [
                    { id: 'tag-travel', name: 'Travel' },
                    { id: 'tag-school', name: 'School' },
                ],
            },
        ]);

        const dayCell = screen.getByTestId('day-cell-2026-03-15');
        expect(within(dayCell).getByRole('button', { name: 'Untagged Event' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'School Assembly' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'Travel Day' })).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setTagFilter',
                        selectedTagIds: ['tag-travel'],
                    },
                })
            );
        });

        expect(within(dayCell).queryByRole('button', { name: 'Untagged Event' })).toBeNull();
        expect(within(dayCell).queryByRole('button', { name: 'School Assembly' })).toBeNull();
        expect(within(dayCell).getByRole('button', { name: 'Travel Day' })).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setTagFilter',
                        selectedTagIds: ['tag-travel', 'tag-school'],
                    },
                })
            );
        });

        expect(within(dayCell).queryByRole('button', { name: 'Untagged Event' })).toBeNull();
        expect(within(dayCell).getByRole('button', { name: 'School Assembly' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'Travel Day' })).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: {
                        type: 'setTagFilter',
                        selectedTagIds: [],
                    },
                })
            );
        });

        expect(within(dayCell).getByRole('button', { name: 'Untagged Event' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'School Assembly' })).toBeInTheDocument();
        expect(within(dayCell).getByRole('button', { name: 'Travel Day' })).toBeInTheDocument();
    });

    it('renders the agenda view grouped by date and respects persistent text filters', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-school',
                title: 'School pickup',
                startDate: '2026-03-15T14:00:00.000Z',
                endDate: '2026-03-15T14:30:00.000Z',
                isAllDay: false,
            },
            {
                id: 'evt-dentist',
                title: 'Dentist checkup',
                startDate: '2026-03-17T09:00:00.000Z',
                endDate: '2026-03-17T09:30:00.000Z',
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setViewMode', viewMode: 'agenda' } }));
        });

        const agenda = await screen.findByTestId('calendar-agenda-main');
        expect(within(agenda).getByText('Sunday, March 15, 2026')).toBeInTheDocument();
        expect(within(agenda).getByText('Tuesday, March 17, 2026')).toBeInTheDocument();

        act(() => {
            window.dispatchEvent(
                new CustomEvent(CALENDAR_COMMAND_EVENT, {
                    detail: { type: 'setPersistentTextFilter', textQuery: 'Dentist' },
                })
            );
        });

        await waitFor(() => {
            expect(within(agenda).queryByText('School pickup')).toBeNull();
            expect(within(agenda).getByText('Dentist checkup')).toBeInTheDocument();
        });
    });

    it('shows live search results in the rail and decorates visible items as match or dim', async () => {
        renderCalendarWithItems([
            {
                id: 'evt-school',
                title: 'School pickup',
                startDate: '2026-03-15T14:00:00.000Z',
                endDate: '2026-03-15T14:30:00.000Z',
                isAllDay: false,
            },
            {
                id: 'evt-travel',
                title: 'Travel day',
                startDate: '2026-03-15T16:00:00.000Z',
                endDate: '2026-03-15T18:00:00.000Z',
                isAllDay: false,
            },
        ]);

        act(() => {
            window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setSearchOpen', isOpen: true } }));
            window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setSearchQuery', query: 'travel' } }));
        });

        const results = await screen.findByTestId('calendar-search-results');
        const dayCell = screen.getByTestId('day-cell-2026-03-15');

        await waitFor(() => {
            expect(within(dayCell).getByTestId('calendar-event-evt-travel')).toHaveAttribute('data-calendar-search-state', 'match');
            expect(within(dayCell).getByTestId('calendar-event-evt-school')).toHaveAttribute('data-calendar-search-state', 'dim');
            expect(within(results).getByText('Travel day')).toBeInTheDocument();
            expect(within(results).queryByText('School pickup')).toBeNull();
        });
    });

    it('jumps to the closest hit in day view and opens details on shift-click from search results', async () => {
        const originalScrollTo = HTMLElement.prototype.scrollTo;
        HTMLElement.prototype.scrollTo = function scrollToMock(options?: any) {
            if (options && typeof options === 'object') {
                if (typeof options.top === 'number') {
                    this.scrollTop = options.top;
                }
                if (typeof options.left === 'number') {
                    this.scrollLeft = options.left;
                }
            }
        };

        try {
            renderCalendarWithItems([
                {
                    id: 'evt-dentist',
                    title: 'Dentist checkup',
                    startDate: '2026-03-15T18:30:00',
                    endDate: '2026-03-15T19:15:00',
                    isAllDay: false,
                },
            ]);

            act(() => {
                window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setViewMode', viewMode: 'day' } }));
                window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setSearchOpen', isOpen: true } }));
                window.dispatchEvent(new CustomEvent(CALENDAR_COMMAND_EVENT, { detail: { type: 'setSearchQuery', query: 'dentist' } }));
            });

            const scroller = await screen.findByTestId('day-view-vertical-scroller-0');
            const initialTop = scroller.scrollTop;
            const resultButton = within(screen.getByTestId('calendar-search-results')).getByRole('button', {
                name: /dentist checkup/i,
            });

            fireEvent.click(resultButton);

            await waitFor(() => {
                expect(scroller.scrollTop).toBeGreaterThan(initialTop);
            });

            fireEvent.click(resultButton, { shiftKey: true });

            await waitFor(() => {
                // Shift-click now opens the event detail view, not the edit form directly
                expect(screen.getByRole('button', { name: 'Edit Event' })).toBeTruthy();
            });
        } finally {
            HTMLElement.prototype.scrollTo = originalScrollTo;
        }
    });

    it('includes recurring masters in the Instant query filter', () => {
        renderCalendarWithItems([]);

        expect(mocks.dbUseQuery).toHaveBeenCalled();
        const calendarCall = mocks.dbUseQuery.mock.calls.find((c: any[]) => c[0]?.calendarItems);
        const queryArg = calendarCall?.[0];
        const orConditions = queryArg?.calendarItems?.$?.where?.or;

        expect(Array.isArray(orConditions)).toBe(true);
        expect(orConditions).toEqual(expect.arrayContaining([expect.objectContaining({ rrule: { $isNull: false } })]));
    });
});
