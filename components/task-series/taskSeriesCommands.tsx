'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Editor, Range } from '@tiptap/core';
import { Calendar, Paperclip, type LucideIcon } from 'lucide-react';
import { id as generateId } from '@instantdb/react';

export const TASK_SERIES_OPEN_DETAILS_EVENT = 'task-series:open-details';
export const TASK_SERIES_CLOSE_DETAILS_EVENT = 'task-series:close-details';

export type TaskSeriesCommandId = 'taskDetails' | 'dayBreak';
export type TaskSeriesNavigationDirection = 'previous' | 'next';
export type TaskSeriesSelectionSnapshot = {
    anchor: number;
    head: number;
};
export type TaskSeriesOpenDetailsPayload = {
    taskId: string | null;
    taskPos: number;
    selection: TaskSeriesSelectionSnapshot;
};
export type TaskSeriesCloseDetailsPayload = {
    restoreSelection?: boolean;
};

let activeTaskDetails: TaskSeriesOpenDetailsPayload | null = null;

type TaskSeriesCommandContext = {
    editor: Editor;
    range?: Range;
};

type TaskSeriesCommandDefinition = {
    id: TaskSeriesCommandId;
    title: string;
    icon: LucideIcon;
    keywords: string[];
    shortcut?: string;
    execute: (context: TaskSeriesCommandContext) => boolean;
};

export type TaskSeriesSlashCommandItem = {
    id: TaskSeriesCommandId;
    title: string;
    icon: LucideIcon;
    shortcut?: string;
    shortcutLabel?: string;
    command: (context: TaskSeriesCommandContext) => boolean;
};

const isMacPlatform = () => {
    if (typeof navigator === 'undefined') return false;
    return /Mac|iPhone|iPad/.test(navigator.platform);
};

const formatShortcutToken = (token: string, mac: boolean) => {
    switch (token) {
        case 'Mod':
            return mac ? '⌘' : 'Ctrl';
        case 'Alt':
            return mac ? '⌥' : 'Alt';
        case 'Shift':
            return mac ? '⇧' : 'Shift';
        case 'Enter':
            return mac ? '↵' : 'Enter';
        case 'ArrowUp':
            return mac ? '↑' : 'Up';
        case 'ArrowDown':
            return mac ? '↓' : 'Down';
        default:
            return token.length === 1 ? token.toUpperCase() : token;
    }
};

export const formatTaskSeriesShortcutLabel = (shortcut?: string) => {
    if (!shortcut) return '';

    const mac = isMacPlatform();
    const tokens = shortcut.split('-').filter(Boolean).map((token) => formatShortcutToken(token, mac));
    return mac ? tokens.join('') : tokens.join('+');
};

const focusAndDeleteRange = (editor: Editor, range?: Range) => {
    if (!range) return;
    editor.chain().focus().deleteRange(range).run();
};

const getCurrentTaskSelection = (editor: Editor) => {
    const { $from } = editor.state.selection;
    const currentNode = $from.node();

    if (currentNode.type.name !== 'taskItem') {
        return null;
    }

    return {
        currentNode,
        currentPos: $from.before(1),
        offset: $from.parentOffset,
        fullText: currentNode.textContent,
    };
};

const ensureTaskIdAtPosition = (editor: Editor, taskPos: number, taskNode: any) => {
    if (taskNode.attrs.id) {
        return { taskId: taskNode.attrs.id as string, generated: false };
    }

    const taskId = generateId();
    const tr = editor.state.tr.setNodeMarkup(
        taskPos,
        undefined,
        {
            ...taskNode.attrs,
            id: taskId,
        },
        taskNode.marks
    );

    editor.view.dispatch(tr);

    return { taskId, generated: true };
};

const dispatchOpenTaskDetails = ({ taskId, taskPos, selection }: TaskSeriesOpenDetailsPayload) => {
    activeTaskDetails = { taskId, taskPos, selection };

    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent<TaskSeriesOpenDetailsPayload>(TASK_SERIES_OPEN_DETAILS_EVENT, {
            detail: { taskId, taskPos, selection },
        })
    );
};

export const dispatchCloseTaskDetails = (detail: TaskSeriesCloseDetailsPayload = {}) => {
    activeTaskDetails = null;

    if (typeof window === 'undefined') return;

    window.dispatchEvent(
        new CustomEvent<TaskSeriesCloseDetailsPayload>(TASK_SERIES_CLOSE_DETAILS_EVENT, {
            detail,
        })
    );
};

export const getActiveTaskDetails = () => activeTaskDetails;

const findTaskAtPosition = (editor: Editor, taskPos: number) => {
    const node = editor.state.doc.nodeAt(taskPos);

    if (!node || node.type.name !== 'taskItem' || node.attrs.isDayBreak) {
        return null;
    }

    return node;
};

export const openTaskDetailsAtPosition = (editor: Editor, taskPos: number, selection?: TaskSeriesSelectionSnapshot) => {
    const taskNode = findTaskAtPosition(editor, taskPos);
    if (!taskNode) return false;

    const { taskId, generated } = ensureTaskIdAtPosition(editor, taskPos, taskNode);
    const openDetails = () =>
        dispatchOpenTaskDetails({
            taskId,
            taskPos,
            selection: selection ?? { anchor: taskPos + 1, head: taskPos + 1 },
        });

    if (generated && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(openDetails);
    } else {
        openDetails();
    }

    return true;
};

export const openTaskDetailsForCurrentTask = ({ editor, range }: TaskSeriesCommandContext) => {
    focusAndDeleteRange(editor, range);

    const currentTask = getCurrentTaskSelection(editor);
    if (!currentTask || currentTask.currentNode.attrs.isDayBreak) {
        return false;
    }

    const { taskId, generated } = ensureTaskIdAtPosition(editor, currentTask.currentPos, currentTask.currentNode);
    const { anchor, head } = editor.state.selection;
    const openDetails = () =>
        dispatchOpenTaskDetails({
            taskId,
            taskPos: currentTask.currentPos,
            selection: { anchor, head },
        });

    if (generated && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(openDetails);
    } else {
        openDetails();
    }

    return true;
};

export const findAdjacentTaskDetailsTarget = (editor: Editor, currentTaskPos: number, direction: TaskSeriesNavigationDirection): TaskSeriesOpenDetailsPayload | null => {
    const currentNode = findTaskAtPosition(editor, currentTaskPos);
    if (!currentNode) return null;

    const resolved = editor.state.doc.resolve(currentTaskPos);
    const index = resolved.index(0);
    const parent = resolved.parent;

    if (direction === 'next') {
        let scanPos = currentTaskPos + currentNode.nodeSize;

        for (let i = index + 1; i < parent.childCount; i++) {
            const node = parent.child(i);
            const isTarget = node.type.name === 'taskItem' && !node.attrs.isDayBreak;

            if (isTarget) {
                return {
                    taskId: (node.attrs.id as string | null) ?? null,
                    taskPos: scanPos,
                    selection: {
                        anchor: scanPos + 1,
                        head: scanPos + 1,
                    },
                };
            }

            scanPos += node.nodeSize;
        }

        return null;
    }

    let scanPos = currentTaskPos;

    for (let i = index - 1; i >= 0; i--) {
        const node = parent.child(i);
        scanPos -= node.nodeSize;

        const isTarget = node.type.name === 'taskItem' && !node.attrs.isDayBreak;
        if (isTarget) {
            return {
                taskId: (node.attrs.id as string | null) ?? null,
                taskPos: scanPos,
                selection: {
                    anchor: scanPos + 1,
                    head: scanPos + 1,
                },
            };
        }
    }

    return null;
};

export const openAdjacentTaskDetails = (editor: Editor, currentTaskPos: number, direction: TaskSeriesNavigationDirection) => {
    const target = findAdjacentTaskDetailsTarget(editor, currentTaskPos, direction);
    if (!target) return false;

    return openTaskDetailsAtPosition(editor, target.taskPos, target.selection);
};

const SHORTCUT_KEY_CODES: Record<string, string[]> = {
    ',': ['Comma', 'NumpadComma'],
    '.': ['Period', 'NumpadDecimal'],
};

export const matchesTaskSeriesShortcut = (event: KeyboardEvent | ReactKeyboardEvent, shortcut?: string) => {
    if (!shortcut) return false;

    const tokens = shortcut.split('-').filter(Boolean);
    const keyToken = tokens[tokens.length - 1];
    const modifiers = new Set(tokens.slice(0, -1));

    if (modifiers.has('Mod') && !(event.metaKey || event.ctrlKey)) return false;
    if (modifiers.has('Ctrl') !== event.ctrlKey) return false;
    if (modifiers.has('Meta') !== event.metaKey) return false;
    if (modifiers.has('Alt') !== event.altKey) return false;
    if (modifiers.has('Shift') !== event.shiftKey) return false;

    const normalizedEventKey = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    const normalizedShortcutKey = keyToken.length === 1 ? keyToken.toUpperCase() : keyToken;

    if (normalizedEventKey === normalizedShortcutKey) {
        return true;
    }

    const matchingCodes = SHORTCUT_KEY_CODES[keyToken];
    if (matchingCodes && 'code' in event && typeof event.code === 'string') {
        return matchingCodes.includes(event.code);
    }

    return false;
};

export const insertDayBreakAtSelection = ({ editor, range }: TaskSeriesCommandContext) => {
    focusAndDeleteRange(editor, range);

    const currentTask = getCurrentTaskSelection(editor);
    if (!currentTask) {
        return false;
    }

    const { currentNode, offset, fullText } = currentTask;
    const currentIndent = currentNode.attrs.indentationLevel || 0;

    const textBefore = fullText.slice(0, offset);
    const textAfter = fullText.slice(offset);

    const scanForNextTask = (startPos: number) => {
        let scanPos = startPos;
        let foundRealTask = false;

        const safePos = Math.min(scanPos, editor.state.doc.content.size);
        const resolved = editor.state.doc.resolve(safePos);
        const startIndex = resolved.index(0);
        const parent = resolved.parent;

        for (let i = startIndex; i < parent.childCount; i++) {
            const node = parent.child(i);

            if (node.type.name === 'taskItem' && !node.attrs.isDayBreak) {
                editor.commands.setTextSelection(scanPos + 1);
                foundRealTask = true;
                break;
            }

            scanPos += node.nodeSize;
        }

        if (!foundRealTask) {
            editor.commands.setTextSelection(scanPos);
            editor.commands.createParagraphNear();
            editor.commands.splitBlock();
            editor.commands.updateAttributes('taskItem', {
                id: generateId(),
                isDayBreak: false,
                indentationLevel: 0,
            });
        }
    };

    if (!textBefore) {
        const breakId = generateId();
        editor.commands.updateAttributes('taskItem', {
            id: breakId,
            isDayBreak: true,
            text: '',
            indentationLevel: currentIndent,
        });

        if (textAfter) {
            const newId = generateId();
            const posAfterBreak = editor.state.selection.$from.after();

            editor
                .chain()
                .insertContentAt(posAfterBreak, {
                    type: 'taskItem',
                    attrs: {
                        id: newId,
                        isDayBreak: false,
                        indentationLevel: currentIndent,
                    },
                    content: [{ type: 'text', text: textAfter }],
                })
                .setTextSelection(posAfterBreak + 1)
                .run();
        } else {
            scanForNextTask(editor.state.selection.$from.after());
        }

        return true;
    }

    if (textAfter) {
        const { $from } = editor.state.selection;
        editor.commands.deleteRange({ from: $from.pos, to: $from.end() });
    }

    const posAfterTruncated = editor.state.selection.$from.after();
    const nodesToInsert: any[] = [
        {
            type: 'taskItem',
            attrs: {
                id: generateId(),
                isDayBreak: true,
                text: '',
                indentationLevel: currentIndent,
            },
        },
    ];

    if (textAfter) {
        nodesToInsert.push({
            type: 'taskItem',
            attrs: {
                id: generateId(),
                isDayBreak: false,
                indentationLevel: currentIndent,
            },
            content: [{ type: 'text', text: textAfter }],
        });
    }

    editor.chain().insertContentAt(posAfterTruncated, nodesToInsert).run();

    if (textAfter) {
        editor.commands.setTextSelection(posAfterTruncated + 3);
    } else {
        scanForNextTask(posAfterTruncated + 2);
    }

    return true;
};

const taskSeriesCommands: TaskSeriesCommandDefinition[] = [
    {
        id: 'taskDetails',
        title: 'Task Details',
        icon: Paperclip,
        keywords: ['details', 'notes', 'attachments', 'metadata', 'info'],
        shortcut: 'Mod-Alt-Enter',
        execute: openTaskDetailsForCurrentTask,
    },
    {
        id: 'dayBreak',
        title: 'Day Break',
        icon: Calendar,
        keywords: ['day', 'break', 'divider', 'split'],
        shortcut: 'Mod-Alt-B',
        execute: insertDayBreakAtSelection,
    },
];

export const getTaskSeriesCommandDefinitions = () => taskSeriesCommands;

export const executeTaskSeriesCommand = (commandId: TaskSeriesCommandId, context: TaskSeriesCommandContext) => {
    const command = taskSeriesCommands.find((item) => item.id === commandId);
    if (!command) return false;
    return command.execute(context);
};

export const getTaskSeriesShortcutHandlers = (editor: Editor) => {
    const handlers: Record<string, () => boolean> = {};

    for (const command of taskSeriesCommands) {
        if (!command.shortcut) continue;

        handlers[command.shortcut] = () => command.execute({ editor });
    }

    return handlers;
};

export const getTaskSeriesSlashCommandItems = ({ query }: { query: string }): TaskSeriesSlashCommandItem[] => {
    const normalizedQuery = query.trim().toLowerCase();

    return taskSeriesCommands
        .filter((command) => {
            if (!normalizedQuery) return true;

            const haystack = [command.title, ...command.keywords].join(' ').toLowerCase();
            return haystack.includes(normalizedQuery);
        })
        .map((command) => ({
            id: command.id,
            title: command.title,
            icon: command.icon,
            shortcut: command.shortcut,
            shortcutLabel: formatTaskSeriesShortcutLabel(command.shortcut),
            command: (context: TaskSeriesCommandContext) => command.execute(context),
        }));
};
