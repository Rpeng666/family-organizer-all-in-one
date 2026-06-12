// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
    notesByTaskId: {
        'task-1': 'First task notes',
        'task-2': 'Second task notes',
    } as Record<string, string>,
    dbTransact: vi.fn((transaction: any) => {
        if (transaction?.op === 'update' && transaction.entity === 'tasks' && typeof transaction.payload?.notes === 'string') {
            testState.notesByTaskId[transaction.id] = transaction.payload.notes;
        }
        return Promise.resolve();
    }),
    chainObj: {
        focus: vi.fn(),
        setTextSelection: vi.fn(),
        run: vi.fn(),
    } as any,
}));

vi.mock('@floating-ui/react-dom', () => ({
    autoUpdate: vi.fn(),
    flip: vi.fn(() => ({})),
    offset: vi.fn(() => ({})),
    shift: vi.fn(() => ({})),
    useFloating: () => ({
        refs: {
            setReference: vi.fn(),
            setFloating: vi.fn(),
        },
        floatingStyles: {
            position: 'fixed',
            left: 0,
            top: 0,
        },
    }),
}));

vi.mock('@/components/ui/button', async () => {
    const React = await import('react');
    const Button = React.forwardRef<HTMLButtonElement, any>(function MockButton({ children, ...props }, ref) {
        return (
            <button ref={ref} type={props.type ?? 'button'} {...props}>
                {children}
            </button>
        );
    });
    return { Button };
});

vi.mock('@/lib/db', () => ({
    db: {
        useQuery: vi.fn((query: any) => {
            const taskId = query.tasks.$.where.id;
            return {
                isLoading: false,
                data: {
                    tasks: [
                        {
                            id: taskId,
                            notes: testState.notesByTaskId[taskId] ?? '',
                            attachments: [],
                        },
                    ],
                },
            };
        }),
        transact: (...args: any[]) => (testState.dbTransact as any)(...args),
    },
}));

vi.mock('@instantdb/react', () => ({
    id: vi.fn(() => 'generated-id'),
    tx: new Proxy(
        {},
        {
            get(_root, entity: string) {
                return new Proxy(
                    {},
                    {
                        get(_entityObj, entityId: string) {
                            return {
                                update(payload: unknown) {
                                    return { op: 'update', entity, id: entityId, payload };
                                },
                                link(payload: unknown) {
                                    return { op: 'link', entity, id: entityId, payload };
                                },
                                delete() {
                                    return { op: 'delete', entity, id: entityId };
                                },
                            };
                        },
                    }
                );
            },
        }
    ),
}));

vi.mock('use-debounce', async () => {
    const React = await import('react');

    return {
        useDebouncedCallback: (fn: any) => {
            const fnRef = React.useRef(fn);
            const lastArgsRef = React.useRef<any[] | null>(null);
            const wrappedRef = React.useRef<any>(null);

            fnRef.current = fn;

            if (!wrappedRef.current) {
                const wrapped: any = (...args: any[]) => {
                    lastArgsRef.current = args;
                };

                wrapped.flush = vi.fn(async () => {
                    if (lastArgsRef.current) {
                        return await fnRef.current(...lastArgsRef.current);
                    }
                });

                wrappedRef.current = wrapped;
            }

            return wrappedRef.current;
        },
    };
});

vi.mock('@/app/actions', () => ({
    getPresignedUploadUrl: vi.fn(),
    refreshFiles: vi.fn(),
}));

import { TaskDetailsPopover } from '@/components/task-series/TaskDetailsPopover';
import {
    TASK_SERIES_CLOSE_DETAILS_EVENT,
    TASK_SERIES_OPEN_DETAILS_EVENT,
} from '@/components/task-series/taskSeriesCommands';

function makeTrigger(taskPos: number) {
    const wrapper = document.createElement('div');
    wrapper.dataset.taskPos = String(taskPos);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.dataset.taskDetailsTrigger = 'true';

    wrapper.appendChild(trigger);
    document.body.appendChild(wrapper);
    return wrapper;
}

describe('TaskDetailsPopover', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        testState.notesByTaskId['task-1'] = 'First task notes';
        testState.notesByTaskId['task-2'] = 'Second task notes';
        testState.dbTransact.mockClear();
        testState.chainObj.focus = vi.fn(() => testState.chainObj);
        testState.chainObj.setTextSelection = vi.fn(() => testState.chainObj);
        testState.chainObj.run = vi.fn(() => true);
    });

    it('keeps one dialog mounted while switching tasks and restores selection on close', async () => {
        const taskOneNode = makeTrigger(1);
        const taskTwoNode = makeTrigger(7);
        const taskOne = {
            type: { name: 'taskItem' },
            attrs: { id: 'task-1', isDayBreak: false, indentationLevel: 0 },
            nodeSize: 4,
        };
        const taskTwo = {
            type: { name: 'taskItem' },
            attrs: { id: 'task-2', isDayBreak: false, indentationLevel: 0 },
            nodeSize: 4,
        };
        const positions = [1, 7];
        const nodes = [taskOne, taskTwo];
        const nodeByPos = new Map(positions.map((pos, index) => [pos, nodes[index]]));

        const editor = {
            isDestroyed: false,
            chain: vi.fn(() => testState.chainObj),
            state: {
                doc: {
                    nodeAt: (taskPos: number) => nodeByPos.get(taskPos) ?? null,
                    resolve: (taskPos: number) => ({
                        index: () => positions.indexOf(taskPos),
                        parent: {
                            childCount: nodes.length,
                            child: (index: number) => nodes[index],
                        },
                    }),
                },
            },
            view: {
                dom: document.body,
                nodeDOM: (taskPos: number) => {
                    if (taskPos === 1) return taskOneNode;
                    if (taskPos === 7) return taskTwoNode;
                    return null;
                },
            },
        } as any;

        render(
            <TaskDetailsPopover
                editor={editor}
                taskDateMap={{
                    'task-1': { label: 'Mon, 3/1', date: new Date('2026-03-01T00:00:00.000Z') },
                    'task-2': { label: 'Tue, 3/2', date: new Date('2026-03-02T00:00:00.000Z') },
                }}
            />
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_SERIES_OPEN_DETAILS_EVENT, {
                    detail: {
                        taskId: 'task-1',
                        taskPos: 1,
                        selection: { anchor: 2, head: 2 },
                    },
                })
            );
        });

        const dialog = await screen.findByRole('dialog', { name: 'Task Details' });
        const firstNotes = screen.getByDisplayValue('First task notes');
        expect(firstNotes).toBeTruthy();
        await waitFor(() => {
            expect(document.activeElement).toBe(firstNotes);
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_SERIES_OPEN_DETAILS_EVENT, {
                    detail: {
                        taskId: 'task-2',
                        taskPos: 7,
                        selection: { anchor: 8, head: 8 },
                    },
                })
            );
        });

        expect(screen.getByRole('dialog', { name: 'Task Details' })).toBe(dialog);
        const secondNotes = screen.getByDisplayValue('Second task notes');
        expect(secondNotes).toBeTruthy();
        await waitFor(() => {
            expect(document.activeElement).toBe(secondNotes);
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_SERIES_CLOSE_DETAILS_EVENT, {
                    detail: { restoreSelection: true },
                })
            );
        });

        expect(screen.queryByRole('dialog', { name: 'Task Details' })).toBeNull();
        expect(testState.chainObj.focus).toHaveBeenCalled();
        expect(testState.chainObj.setTextSelection).toHaveBeenCalledWith(8);
        expect(testState.chainObj.run).toHaveBeenCalled();
    });

    it('flushes pending note edits before escape closes the panel', async () => {
        const taskOneNode = makeTrigger(1);
        const taskOne = {
            type: { name: 'taskItem' },
            attrs: { id: 'task-1', isDayBreak: false, indentationLevel: 0 },
            nodeSize: 4,
        };

        const editor = {
            isDestroyed: false,
            chain: vi.fn(() => testState.chainObj),
            state: {
                doc: {
                    nodeAt: (taskPos: number) => (taskPos === 1 ? taskOne : null),
                    resolve: () => ({
                        index: () => 0,
                        parent: {
                            childCount: 1,
                            child: () => taskOne,
                        },
                    }),
                },
            },
            view: {
                dom: document.body,
                nodeDOM: (taskPos: number) => (taskPos === 1 ? taskOneNode : null),
            },
        } as any;

        render(
            <TaskDetailsPopover
                editor={editor}
                taskDateMap={{
                    'task-1': { label: 'Mon, 3/1', date: new Date('2026-03-01T00:00:00.000Z') },
                }}
            />
        );

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_SERIES_OPEN_DETAILS_EVENT, {
                    detail: {
                        taskId: 'task-1',
                        taskPos: 1,
                        selection: { anchor: 2, head: 2 },
                    },
                })
            );
        });

        const notesField = await screen.findByDisplayValue('First task notes');
        fireEvent.change(notesField, { target: { value: 'Edited quickly' } });

        expect(testState.dbTransact).not.toHaveBeenCalled();

        fireEvent.keyDown(notesField, { key: 'Escape' });

        await waitFor(() => {
            expect(testState.dbTransact).toHaveBeenCalledWith({
                op: 'update',
                entity: 'tasks',
                id: 'task-1',
                payload: { notes: 'Edited quickly' },
            });
        });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Task Details' })).toBeNull();
        });

        act(() => {
            window.dispatchEvent(
                new CustomEvent(TASK_SERIES_OPEN_DETAILS_EVENT, {
                    detail: {
                        taskId: 'task-1',
                        taskPos: 1,
                        selection: { anchor: 2, head: 2 },
                    },
                })
            );
        });

        expect(await screen.findByDisplayValue('Edited quickly')).toBeTruthy();
    });
});
