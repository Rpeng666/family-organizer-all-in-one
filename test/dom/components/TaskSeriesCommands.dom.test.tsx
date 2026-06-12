// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const commandMocks = vi.hoisted(() => ({
    nextIds: [] as string[],
}));

vi.mock('@instantdb/react', () => ({
    id: vi.fn(() => commandMocks.nextIds.shift() ?? 'generated-id'),
}));

import {
    dispatchCloseTaskDetails,
    findAdjacentTaskDetailsTarget,
    getActiveTaskDetails,
    matchesTaskSeriesShortcut,
    openAdjacentTaskDetails,
    TASK_SERIES_OPEN_DETAILS_EVENT,
    executeTaskSeriesCommand,
    getTaskSeriesShortcutHandlers,
    getTaskSeriesSlashCommandItems,
} from '@/components/task-series/taskSeriesCommands';

function makeEditor(overrides: Record<string, any> = {}) {
    const chainObj: any = {
        focus: vi.fn(() => chainObj),
        deleteRange: vi.fn(() => chainObj),
        run: vi.fn(() => true),
        insertContentAt: vi.fn(() => chainObj),
        setTextSelection: vi.fn(() => chainObj),
    };

    const updateAttributes = vi.fn();
    const createParagraphNear = vi.fn();
    const splitBlock = vi.fn();
    const setTextSelection = vi.fn();
    const deleteRange = vi.fn();
    const dispatch = vi.fn();

    const editor: any = {
        chain: vi.fn(() => chainObj),
        commands: {
            updateAttributes,
            createParagraphNear,
            splitBlock,
            setTextSelection,
            deleteRange,
        },
        state: {
            selection: {
                anchor: 12,
                head: 12,
                $from: {
                    node: () => ({
                        type: { name: 'taskItem' },
                        attrs: {
                            id: 'task-1',
                            isDayBreak: false,
                            indentationLevel: 0,
                        },
                        textContent: 'Current task',
                        marks: [],
                    }),
                    before: () => 11,
                    after: () => 13,
                    parentOffset: 0,
                    pos: 12,
                    end: () => 22,
                },
            },
            doc: {
                content: { size: 0 },
                resolve: () => ({ index: () => 0, parent: { childCount: 0, child: () => null } }),
            },
            tr: {
                setNodeMarkup: vi.fn(function setNodeMarkup() {
                    return this;
                }),
            },
        },
        view: {
            dispatch,
        },
        ...overrides,
    };

    return {
        editor,
        chainObj,
        updateAttributes,
        createParagraphNear,
        splitBlock,
        setTextSelection,
        deleteRange,
        dispatch,
    };
}

function makeNavigationEditor() {
    const taskOne = {
        type: { name: 'taskItem' },
        attrs: { id: 'task-1', isDayBreak: false, indentationLevel: 0 },
        nodeSize: 4,
    };
    const dayBreak = {
        type: { name: 'taskItem' },
        attrs: { id: 'break-1', isDayBreak: true, indentationLevel: 0 },
        nodeSize: 2,
    };
    const taskTwo = {
        type: { name: 'taskItem' },
        attrs: { id: 'task-2', isDayBreak: false, indentationLevel: 0 },
        nodeSize: 5,
    };
    const taskThree = {
        type: { name: 'taskItem' },
        attrs: { id: 'task-3', isDayBreak: false, indentationLevel: 1 },
        nodeSize: 4,
    };

    const positions = [1, 5, 7, 12];
    const nodes = [taskOne, dayBreak, taskTwo, taskThree];
    const nodeByPos = new Map(positions.map((pos, index) => [pos, nodes[index]]));

    return {
        state: {
            doc: {
                nodeAt: (pos: number) => nodeByPos.get(pos) ?? null,
                resolve: (pos: number) => ({
                    index: () => positions.indexOf(pos),
                    parent: {
                        childCount: nodes.length,
                        child: (index: number) => nodes[index],
                    },
                }),
            },
        },
    } as any;
}

describe('taskSeriesCommands', () => {
    beforeEach(() => {
        commandMocks.nextIds = [];
        dispatchCloseTaskDetails();
    });

    it('returns slash command items with visible keyboard shortcuts', () => {
        const items = getTaskSeriesSlashCommandItems({ query: '' });

        expect(items.map((item) => item.title)).toEqual(['Task Details', 'Day Break']);
        expect(items.every((item) => item.shortcut)).toBe(true);
        expect(items.every((item) => item.shortcutLabel && item.shortcutLabel.length > 0)).toBe(true);
    });

    it('matches slash command queries against command keywords', () => {
        const detailItems = getTaskSeriesSlashCommandItems({ query: 'attach' });
        const breakItems = getTaskSeriesSlashCommandItems({ query: 'divider' });

        expect(detailItems.map((item) => item.title)).toEqual(['Task Details']);
        expect(breakItems.map((item) => item.title)).toEqual(['Day Break']);
    });

    it('opens task details for the current task and backfills a missing id first', () => {
        commandMocks.nextIds = ['generated-task-id'];
        const { editor, dispatch } = makeEditor({
            state: {
                selection: {
                    anchor: 22,
                    head: 22,
                    $from: {
                        node: () => ({
                            type: { name: 'taskItem' },
                            attrs: {
                                id: null,
                                isDayBreak: false,
                                indentationLevel: 1,
                            },
                            textContent: 'Current task',
                            marks: [],
                        }),
                        before: () => 21,
                        after: () => 23,
                        parentOffset: 0,
                        pos: 22,
                        end: () => 30,
                    },
                },
                doc: {
                    content: { size: 0 },
                    resolve: () => ({ index: () => 0, parent: { childCount: 0, child: () => null } }),
                },
                tr: {
                    setNodeMarkup: vi.fn(function setNodeMarkup() {
                        return this;
                    }),
                },
            },
        });

        const events: Array<{ taskId: string | null; taskPos: number; selection: { anchor: number; head: number } }> = [];
        const originalRaf = window.requestAnimationFrame;
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        }) as typeof window.requestAnimationFrame;

        window.addEventListener(
            TASK_SERIES_OPEN_DETAILS_EVENT,
            ((event: CustomEvent<{ taskId: string | null; taskPos: number; selection: { anchor: number; head: number } }>) => {
                events.push(event.detail);
            }) as EventListener,
            { once: true }
        );

        expect(executeTaskSeriesCommand('taskDetails', { editor })).toBe(true);
        expect(dispatch).toHaveBeenCalled();
        expect(events).toEqual([{ taskId: 'generated-task-id', taskPos: 21, selection: { anchor: 22, head: 22 } }]);

        window.requestAnimationFrame = originalRaf;
    });

    it('uses the shared day break logic from the keyboard shortcut handler', () => {
        const { editor, chainObj, updateAttributes } = makeEditor({
            state: {
                selection: {
                    anchor: 12,
                    head: 12,
                    $from: {
                        node: () => ({
                            type: { name: 'taskItem' },
                            attrs: {
                                id: 'task-1',
                                isDayBreak: false,
                                indentationLevel: 2,
                            },
                            textContent: 'After text',
                            marks: [],
                        }),
                        before: () => 11,
                        after: () => 17,
                        parentOffset: 0,
                        pos: 12,
                        end: () => 20,
                    },
                },
                doc: {
                    content: { size: 0 },
                    resolve: () => ({ index: () => 0, parent: { childCount: 0, child: () => null } }),
                },
                tr: {
                    setNodeMarkup: vi.fn(function setNodeMarkup() {
                        return this;
                    }),
                },
            },
        });

        const shortcuts = getTaskSeriesShortcutHandlers(editor);

        expect(shortcuts['Mod-Alt-B']()).toBe(true);
        expect(updateAttributes).toHaveBeenCalledWith(
            'taskItem',
            expect.objectContaining({
                isDayBreak: true,
                indentationLevel: 2,
            })
        );
        expect(chainObj.insertContentAt).toHaveBeenCalled();
    });

    it('finds adjacent task detail targets and skips day breaks', () => {
        const editor = makeNavigationEditor();

        expect(findAdjacentTaskDetailsTarget(editor, 1, 'next')).toEqual({
            taskId: 'task-2',
            taskPos: 7,
            selection: { anchor: 8, head: 8 },
        });
        expect(findAdjacentTaskDetailsTarget(editor, 7, 'previous')).toEqual({
            taskId: 'task-1',
            taskPos: 1,
            selection: { anchor: 2, head: 2 },
        });
        expect(findAdjacentTaskDetailsTarget(editor, 12, 'next')).toBeNull();
    });

    it('dispatches an open-details event for adjacent task navigation', () => {
        const editor = makeNavigationEditor();
        const events: Array<{ taskId: string | null; taskPos: number; selection: { anchor: number; head: number } }> = [];

        window.addEventListener(
            TASK_SERIES_OPEN_DETAILS_EVENT,
            ((event: CustomEvent<{ taskId: string | null; taskPos: number; selection: { anchor: number; head: number } }>) => {
                events.push(event.detail);
            }) as EventListener,
            { once: true }
        );

        expect(openAdjacentTaskDetails(editor, 7, 'next')).toBe(true);
        expect(events).toEqual([{ taskId: 'task-3', taskPos: 12, selection: { anchor: 13, head: 13 } }]);
    });

    it('tracks the currently open task details target across adjacent navigation', () => {
        const editor = makeNavigationEditor();

        expect(getActiveTaskDetails()).toBeNull();

        expect(openAdjacentTaskDetails(editor, 1, 'next')).toBe(true);
        expect(getActiveTaskDetails()).toEqual({
            taskId: 'task-2',
            taskPos: 7,
            selection: { anchor: 8, head: 8 },
        });

        expect(openAdjacentTaskDetails(editor, getActiveTaskDetails()!.taskPos, 'next')).toBe(true);
        expect(getActiveTaskDetails()).toEqual({
            taskId: 'task-3',
            taskPos: 12,
            selection: { anchor: 13, head: 13 },
        });

        dispatchCloseTaskDetails();
        expect(getActiveTaskDetails()).toBeNull();
    });

    it('matches literal ctrl+alt punctuation shortcuts for task detail navigation', () => {
        expect(
            matchesTaskSeriesShortcut(
                {
                    key: ',',
                    ctrlKey: true,
                    altKey: true,
                    metaKey: false,
                    shiftKey: false,
                } as KeyboardEvent,
                'Ctrl-Alt-,'
            )
        ).toBe(true);

        expect(
            matchesTaskSeriesShortcut(
                {
                    key: '.',
                    ctrlKey: true,
                    altKey: true,
                    metaKey: false,
                    shiftKey: false,
                } as KeyboardEvent,
                'Ctrl-Alt-.'
            )
        ).toBe(true);
    });

    it('matches ctrl+alt punctuation shortcuts by physical key when option changes the typed character', () => {
        expect(
            matchesTaskSeriesShortcut(
                {
                    key: '≤',
                    code: 'Comma',
                    ctrlKey: true,
                    altKey: true,
                    metaKey: false,
                    shiftKey: false,
                } as KeyboardEvent,
                'Ctrl-Alt-,'
            )
        ).toBe(true);

        expect(
            matchesTaskSeriesShortcut(
                {
                    key: '≥',
                    code: 'Period',
                    ctrlKey: true,
                    altKey: true,
                    metaKey: false,
                    shiftKey: false,
                } as KeyboardEvent,
                'Ctrl-Alt-.'
            )
        ).toBe(true);
    });
});
