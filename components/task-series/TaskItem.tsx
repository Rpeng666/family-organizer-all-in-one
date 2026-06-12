// components/task-series/TaskItem.tsx
'use client';

import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ClipboardList, GripVertical, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { id as generateId } from '@instantdb/react'; // Import the InstantDB ID generator
import { TextSelection, Plugin } from 'prosemirror-state';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { db } from '@/lib/db';
import {
    dispatchCloseTaskDetails,
    getActiveTaskDetails,
    getTaskSeriesShortcutHandlers,
    openTaskDetailsAtPosition,
    openAdjacentTaskDetails,
    TASK_SERIES_CLOSE_DETAILS_EVENT,
    TASK_SERIES_OPEN_DETAILS_EVENT,
    type TaskSeriesOpenDetailsPayload,
} from './taskSeriesCommands';

// --- Context ---
// Now stores both the visual label and the underlying date object
export const TaskDateContext = React.createContext<Record<string, { label: string; date: Date } | undefined>>({});

// --- The React Component (UI) ---
const TaskItemComponent = (props: any) => {
    const { node, updateAttributes } = props;
    const { indentationLevel, isDayBreak, id } = node.attrs;
    const [isDragging, setIsDragging] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // Ensure every taskItem has a stable ID, even after paste.
    useEffect(() => {
        if (!id) {
            const newId = generateId();
            updateAttributes({ id: newId });
        }
    }, [id, updateAttributes]);

    // --- Data Fetching for Metadata Indicator ---
    // We fetch just enough to know if we should highlight the paperclip
    const { data: metaData } = db.useQuery({
        tasks: {
            $: { where: { id: id } },
            attachments: {},
            responseFields: {},
        },
    });
    const taskRecord = metaData?.tasks?.[0] as
        | {
              id: string;
              notes?: string | null;
              attachments?: Array<{ id: string }>;
              responseFields?: Array<{ id: string }>;
          }
        | undefined;
    const hasNotes = taskRecord?.notes && taskRecord.notes.trim().length > 0;
    const hasAttachments = taskRecord?.attachments && taskRecord.attachments.length > 0;
    const hasResponseFields = taskRecord?.responseFields && taskRecord.responseFields.length > 0;
    const hasMetadata = hasNotes || hasAttachments || hasResponseFields;

    const dateMap = useContext(TaskDateContext);

    // Safety check: If ID is missing, we can't find the date.
    const taskData = id ? dateMap[id] : undefined;
    const dateLabel = taskData?.label;

    const dragHandleRef = useRef<HTMLButtonElement>(null);
    const itemRef = useRef<HTMLDivElement>(null);
    const currentTaskPos = (() => {
        if (typeof props.getPos !== 'function') return null;

        try {
            return props.getPos();
        } catch {
            return null;
        }
    })();

    useEffect(() => {
        const handleOpenTaskDetails = (event: Event) => {
            const detail = (event as CustomEvent<TaskSeriesOpenDetailsPayload>).detail;
            const getPos = typeof props.getPos === 'function' ? props.getPos : null;

            if (!detail || !getPos) return;

            try {
                const taskPos = getPos();
                setIsDetailsOpen(detail.taskPos === taskPos);
            } catch {
                // Ignore stale node views during rapid editor updates.
            }
        };

        const handleCloseTaskDetails = () => {
            setIsDetailsOpen(false);
        };

        window.addEventListener(TASK_SERIES_OPEN_DETAILS_EVENT, handleOpenTaskDetails as EventListener);
        window.addEventListener(TASK_SERIES_CLOSE_DETAILS_EVENT, handleCloseTaskDetails);
        return () => {
            window.removeEventListener(TASK_SERIES_OPEN_DETAILS_EVENT, handleOpenTaskDetails as EventListener);
            window.removeEventListener(TASK_SERIES_CLOSE_DETAILS_EVENT, handleCloseTaskDetails);
        };
    }, [props.getPos]);

    const handleToggleTaskDetails = () => {
        if (isDetailsOpen) {
            dispatchCloseTaskDetails({ restoreSelection: false });
            return;
        }

        if (currentTaskPos == null) return;
        openTaskDetailsAtPosition(props.editor, currentTaskPos);
    };

    // --- DRAGGABLE SETUP ---
    useEffect(() => {
        const element = dragHandleRef.current;
        const container = itemRef.current;
        if (!element || !container) return;

        return draggable({
            element,
            getInitialData: () => ({
                type: 'task-item',
                id: id,
                indentationLevel: indentationLevel,
            }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });
    }, [id, indentationLevel]);

    // CASE 1: DAY BREAK
    if (isDayBreak) {
        return (
            <NodeViewWrapper
                className="group relative my-4 select-none"
                contentEditable={false}
                // Expose attributes for the Drop Monitor
                data-task-id={id}
                data-indent-level={indentationLevel}
                data-is-day-break="true"
            >
                <div className="flex items-center justify-center" contentEditable={false}>
                    <div className="h-0.5 w-full bg-border" />
                </div>

                {/* Hidden content to satisfy Tiptap structure, but invisible to user */}
                <div className="hidden">
                    <NodeViewContent />
                </div>

                {/* Delete Handle (Optional: Show a small X on hover to delete the break?) */}
                {/* For now, user can delete it by backspacing into it */}
            </NodeViewWrapper>
        );
    }

    // CASE 2: STANDARD TASK
    return (
        <NodeViewWrapper
            ref={itemRef}
            className={cn('flex items-start group relative my-0.5', isDragging && 'opacity-40')}
            // Expose attributes for the Drop Monitor
            data-task-id={id}
            data-indent-level={indentationLevel}
            data-is-day-break="false"
        >
            {/* Date Margin */}
            <div
                className={cn(
                    'w-20 flex-shrink-0 text-right pr-3 pt-1 text-xs font-medium select-none',
                    dateLabel ? 'text-muted-foreground' : 'text-transparent'
                )}
                contentEditable={false} // Make sure cursor doesn't go here
            >
                {dateLabel || '-'}
            </div>

            {/* Content Wrapper 
            FIX: Changed marginLeft to paddingLeft. 
            The node now physically occupies the indentation space, so the cursor "hits" it 
            instead of skipping it.
        */}
            <div
                className="flex-grow flex items-start relative transition-[padding] duration-200 ease-in-out"
                style={{ paddingLeft: `${indentationLevel * 2}rem` }}
            >
                {/* Drag Handle - Now moves with the indent */}
                <button
                    ref={dragHandleRef}
                    className="mt-1 mr-1 text-gray-400 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
                    contentEditable={false}
                    data-drag-handle
                >
                    <GripVertical size={16} />
                </button>

                {/* Editor Content 
                Keep min-h-[1.5em] to ensure empty tasks have a targetable height 
            */}
                <div className="flex-grow min-w-0 rounded-sm px-2 py-0.5 bg-transparent min-h-[1.5em]">
                    <NodeViewContent
                        className="outline-none min-h-[1.5em]"
                        // REMOVED: style={{ paddingLeft: ... }}
                    />
                </div>

                {/* Response Fields Indicator */}
                {hasResponseFields && (
                    <div className="ml-1 flex items-center" contentEditable={false}>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded text-purple-600 bg-purple-50/60">
                            <ClipboardList className="h-3 w-3" />
                        </span>
                    </div>
                )}

                {/* Metadata Trigger */}
                <div
                    className={cn('transition-opacity ml-1', hasMetadata || isDetailsOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
                    contentEditable={false}
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={isDetailsOpen ? 'Close task details' : 'Open task details'}
                        aria-expanded={isDetailsOpen}
                        data-task-details-trigger="true"
                        onClick={handleToggleTaskDetails}
                        className={cn(
                            'h-6 w-6 transition-colors',
                            (hasMetadata || isDetailsOpen) && 'text-blue-600 hover:text-blue-700 bg-blue-50/50'
                        )}
                    >
                        <Paperclip className={cn('h-3 w-3', (hasMetadata || isDetailsOpen) && 'fill-current')} />
                    </Button>
                </div>
            </div>
        </NodeViewWrapper>
    );
};

// --- The TipTap Extension (Logic) ---
export const TaskItemExtension = Node.create({
    name: 'taskItem',
    group: 'block',
    content: 'text*', // Can only contain inline text (no nested blocks)

    // Define attributes that map to your DB
    addAttributes() {
        return {
            id: {
                default: null,
                // Ensure the ID is persisted to the DOM so it survives copy/paste/re-renders
                parseHTML: (element) => element.getAttribute('data-id'),
                renderHTML: (attributes) => ({ 'data-id': attributes.id }),
            },
            indentationLevel: {
                default: 0,
                keepOnSplit: true,
                parseHTML: (element) => parseInt(element.getAttribute('data-indentation-level') || '0', 10),
                renderHTML: (attributes) => ({ 'data-indentation-level': attributes.indentationLevel }),
            },
            isDayBreak: {
                default: false,
                keepOnSplit: false,
                parseHTML: (element) => element.getAttribute('data-is-day-break') === 'true',
                renderHTML: (attributes) => ({ 'data-is-day-break': attributes.isDayBreak }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-type="task-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'task-item' }), 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(TaskItemComponent);
    },

    addKeyboardShortcuts() {
        return {
            ...getTaskSeriesShortcutHandlers(this.editor),
            'Ctrl-Alt-,': () => {
                const { $from } = this.editor.state.selection;
                const currentTaskPos = getActiveTaskDetails()?.taskPos ?? $from.before(1);
                return openAdjacentTaskDetails(this.editor, currentTaskPos, 'previous');
            },
            'Ctrl-Alt-.': () => {
                const { $from } = this.editor.state.selection;
                const currentTaskPos = getActiveTaskDetails()?.taskPos ?? $from.before(1);
                return openAdjacentTaskDetails(this.editor, currentTaskPos, 'next');
            },
            Enter: () => {
                const { $from } = this.editor.state.selection;
                const currentNode = $from.node();

                if (currentNode.type.name !== 'taskItem') return false;
                if (currentNode.attrs.isDayBreak) return true;

                const cursorAtStart = $from.parentOffset === 0;
                const hasContent = currentNode.content.size > 0;

                if (cursorAtStart && hasContent && currentNode.attrs.id) {
                    // When cursor is at the start, splitBlock would create an
                    // empty first half that inherits the original ID while the
                    // text-bearing second half gets the new ID.  This detaches
                    // metadata (attachments, response fields) from the task text.
                    //
                    // Fix: insert a new empty node *above* so the original node
                    // (and its ID / linked metadata) stays intact.
                    return this.editor.commands.command(({ state, dispatch }) => {
                        if (!dispatch) return true;

                        const nodePos = $from.before(1);
                        const newNode = currentNode.type.create(
                            {
                                ...currentNode.attrs,
                                id: generateId(),
                                isDayBreak: false,
                            },
                            null, // empty content
                        );
                        const tr = state.tr.insert(nodePos, newNode);
                        // Place cursor inside the new empty node
                        tr.setSelection(TextSelection.create(tr.doc, nodePos + 1));
                        dispatch(tr);
                        return true;
                    });
                }

                // Default: split at cursor and give the new (second-half) node a fresh ID
                return this.editor.chain().splitBlock().updateAttributes('taskItem', { id: generateId(), isDayBreak: false }).run();
            },

            // --- INDENT (Tab) ---
            Tab: () => {
                return this.editor.commands.command(({ state, dispatch }) => {
                    const { selection, doc } = state;
                    const { $from } = selection;
                    const currentNode = $from.node();

                    if (currentNode.type.name !== 'taskItem') return false;
                    if (currentNode.attrs.isDayBreak) return true; // Do nothing, but handle event

                    // 1. Calculate Max Indent (Validation)
                    const currentPos = $from.before(1);
                    const resolved = doc.resolve(currentPos);
                    const parent = resolved.parent;
                    const index = resolved.index();

                    // Default: if no previous task, you can't nest (max 0)
                    let maxIndent = 0;
                    // Look backwards for the "parent" of the current node to determine max indentation
                    for (let i = index - 1; i >= 0; i--) {
                        const sibling = parent.child(i);
                        if (sibling.type.name === 'taskItem' && !sibling.attrs.isDayBreak) {
                            maxIndent = sibling.attrs.indentationLevel + 1;
                            break;
                        }
                    }

                    const currentLevel = currentNode.attrs.indentationLevel;
                    if (currentLevel + 1 > maxIndent) return true; // Cannot indent further

                    if (dispatch) {
                        const tr = state.tr;

                        // 2. Update Current Node
                        tr.setNodeMarkup(currentPos, undefined, {
                            ...currentNode.attrs,
                            indentationLevel: currentLevel + 1,
                        });

                        // 3. Update Children (Subtree)
                        // Scan forward. Any node with indentation > currentLevel is a child.
                        // Stop at first node with indentation <= currentLevel.
                        let pos = currentPos + currentNode.nodeSize;

                        while (pos < doc.content.size) {
                            const node = doc.nodeAt(pos);
                            if (!node || node.type.name !== 'taskItem') break;

                            // If we hit a DayBreak or a sibling/parent, the subtree ends.
                            if (node.attrs.isDayBreak || node.attrs.indentationLevel <= currentLevel) {
                                break;
                            }

                            // It is a child -> Indent it
                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                indentationLevel: node.attrs.indentationLevel + 1,
                            });

                            pos += node.nodeSize;
                        }

                        dispatch(tr);
                    }
                    return true;
                });
            },

            // --- OUTDENT (Shift-Tab) ---
            'Shift-Tab': () => {
                return this.editor.commands.command(({ state, dispatch }) => {
                    const { selection, doc } = state;
                    const { $from } = selection;
                    const currentNode = $from.node();

                    if (currentNode.type.name !== 'taskItem') return false;

                    const currentLevel = currentNode.attrs.indentationLevel;
                    if (currentLevel === 0) return true; // Cannot outdent further

                    if (dispatch) {
                        const currentPos = $from.before(1);
                        const tr = state.tr;

                        // 1. Update Current Node
                        tr.setNodeMarkup(currentPos, undefined, {
                            ...currentNode.attrs,
                            indentationLevel: currentLevel - 1,
                        });

                        // 2. Update Children (Subtree)
                        // Scan forward. Logic is identical to indent, but we decrement.
                        let pos = currentPos + currentNode.nodeSize;

                        while (pos < doc.content.size) {
                            const node = doc.nodeAt(pos);
                            if (!node || node.type.name !== 'taskItem') break;

                            // Stop if we hit a node that wasn't part of the subtree
                            if (node.attrs.isDayBreak || node.attrs.indentationLevel <= currentLevel) {
                                break;
                            }

                            tr.setNodeMarkup(pos, undefined, {
                                ...node.attrs,
                                indentationLevel: node.attrs.indentationLevel - 1,
                            });

                            pos += node.nodeSize;
                        }

                        dispatch(tr);
                    }
                    return true;
                });
            },

            // --- 1. DELETE KEYS (Day Break Management) ---
            Delete: () => {
                return this.editor.commands.command(({ state, dispatch, chain }) => {
                    const { selection, doc } = state;
                    const { $from, empty } = selection;

                    // 1. Check if cursor is at the END of the node
                    if (!empty || $from.parentOffset !== $from.parent.content.size) return false;

                    const currentPos = $from.before(1);
                    const resolved = doc.resolve(currentPos);
                    const index = resolved.index();
                    const currentNode = resolved.parent.child(index);

                    // Ensure we are actually in a taskItem
                    if (currentNode.type.name !== 'taskItem') return false;

                    // 2. Check if there is a Next Node to merge with
                    if (index + 1 >= resolved.parent.childCount) return false;
                    const nextNode = resolved.parent.child(index + 1);

                    // --- SCENARIO A: Next Node is a Day Break ---
                    // (Existing logic: just delete the break line)
                    if (nextNode.type.name === 'taskItem' && nextNode.attrs.isDayBreak) {
                        if (dispatch) {
                            const nextNodePos = currentPos + currentNode.nodeSize;
                            dispatch(state.tr.delete(nextNodePos, nextNodePos + nextNode.nodeSize));
                        }
                        return true;
                    }

                    // --- SCENARIO B: Next Node is a Standard Task (The Merge Logic) ---
                    if (nextNode.type.name === 'taskItem' && !nextNode.attrs.isDayBreak) {
                        // Calculate the "Pull": How much should the children move left?
                        // e.g. Current (0) - Next (1) = -1. We shift children by -1.
                        const indentDiff = currentNode.attrs.indentationLevel - nextNode.attrs.indentationLevel;

                        // Only perform complex logic if there is an indentation difference
                        // and we are specifically pulling deeper content up to a shallower level
                        if (indentDiff !== 0 && dispatch) {
                            const tr = state.tr;

                            // The position of the "Next Node"
                            const nextNodePos = currentPos + currentNode.nodeSize;

                            // Start scanning for children immediately AFTER the next node
                            let pos = nextNodePos + nextNode.nodeSize;
                            const nextNodeBaseIndent = nextNode.attrs.indentationLevel;

                            while (pos < doc.content.size) {
                                const node = doc.nodeAt(pos);
                                if (!node || node.type.name !== 'taskItem') break;

                                // STOP if we hit a node that is NOT a child of the 'nextNode'
                                // (i.e., it has the same or less indentation than the node being merged)
                                if (node.attrs.isDayBreak || node.attrs.indentationLevel <= nextNodeBaseIndent) {
                                    break;
                                }

                                // ADJUST: Apply the calculated difference
                                // Ensure we don't go below 0
                                const newLevel = Math.max(0, node.attrs.indentationLevel + indentDiff);

                                tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    indentationLevel: newLevel,
                                });

                                pos += node.nodeSize;
                            }

                            // Apply the indentation changes first
                            dispatch(tr);
                        }

                        // Finally, perform the standard text merge (joinForward)
                        // We use the chain so it operates on the updated document state
                        return chain().joinForward().run();
                    }

                    return false;
                });
            },
            Backspace: () => {
                return this.editor.commands.command(({ state, chain, dispatch }) => {
                    const { selection, doc } = state;
                    const { $from, empty } = selection;
                    if (!empty || $from.parentOffset !== 0) return false;
                    const currentNode = $from.node();
                    if (currentNode.type.name !== 'taskItem') return false;

                    // Unindent (using the Shift-Tab logic to keep children attached)
                    if (currentNode.attrs.indentationLevel > 0) {
                        // We delegate to the Shift-Tab command logic we just wrote
                        // But for simplicity, we can just run the raw chain if we don't care about children here,
                        // OR manually trigger the outdent logic.
                        // Users usually expect Backspace at start of line to Outdent AND bring children.

                        // Manually triggering outdent logic:
                        if (dispatch) {
                            const currentPos = $from.before(1);
                            const tr = state.tr;
                            const currentLevel = currentNode.attrs.indentationLevel;

                            tr.setNodeMarkup(currentPos, undefined, { ...currentNode.attrs, indentationLevel: currentLevel - 1 });

                            // Move children
                            let pos = currentPos + currentNode.nodeSize;
                            while (pos < doc.content.size) {
                                const node = doc.nodeAt(pos);
                                if (!node || node.type.name !== 'taskItem' || node.attrs.isDayBreak || node.attrs.indentationLevel <= currentLevel) break;
                                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indentationLevel: node.attrs.indentationLevel - 1 });
                                pos += node.nodeSize;
                            }
                            dispatch(tr);
                        }
                        return true;
                    }

                    // Delete Day Break (Always)
                    const currentPos = $from.before(1);
                    const resolvedPos = doc.resolve(currentPos);
                    const index = resolvedPos.index();
                    if (index > 0) {
                        const prevNode = resolvedPos.parent.child(index - 1);
                        if (prevNode.type.name === 'taskItem' && prevNode.attrs.isDayBreak) {
                            if (dispatch) {
                                const prevNodeStart = currentPos - prevNode.nodeSize;
                                dispatch(state.tr.delete(prevNodeStart, currentPos));
                            }
                            return true;
                        }
                    }
                    return chain().joinBackward().run();
                });
            },

            // --- 2. SMART NAVIGATION (Arrow Keys) ---
            // Handles: Stuck cursors in empty tasks AND Skipping over indented tasks
            ArrowUp: () => {
                return this.editor.commands.command(({ editor, state, view, dispatch }) => {
                    const { selection, doc } = state;
                    const { $from, empty } = selection;
                    if (!empty) return false;

                    // 1. RETRIEVE GOAL COLUMN (The Phantom Cursor)
                    // If we are in a sequence of Up/Down presses, 'goal' holds the original X.
                    // Otherwise, we grab the current visual X.
                    const currentGoal = (selection as any).goal;
                    const currentCoords = view.coordsAtPos($from.pos);
                    const targetX = currentGoal !== undefined ? currentGoal : currentCoords.left;

                    const isAtTop = view.endOfTextblock('up');

                    // --- FIX: Handle Internal Navigation manually to preserve Goal ---
                    if (!isAtTop) {
                        // Move visually up within the same node
                        const targetY = currentCoords.top - 5; // Look slightly above current line
                        const posResult = view.posAtCoords({ left: targetX, top: targetY });

                        // Ensure we actually move backwards
                        if (posResult && posResult.pos < $from.pos) {
                            if (dispatch) {
                                const tr = state.tr;
                                const newSelection = TextSelection.near(doc.resolve(posResult.pos));
                                (newSelection as any).goal = targetX; // <--- Persist goal
                                tr.setSelection(newSelection);
                                tr.scrollIntoView();
                                dispatch(tr);
                                view.focus();
                            }
                            return true;
                        }
                        // If manual calc fails, fallback to default (risk losing goal, but better than sticking)
                        return false;
                    }

                    // --- Existing Logic for Crossing Nodes ---
                    const currentPos = $from.before(1);
                    const resolved = doc.resolve(currentPos);
                    const index = resolved.index();
                    const parent = resolved.parent;

                    // 2. Scan Backwards
                    let prevNode = null;
                    let prevPos = currentPos;

                    for (let i = index - 1; i >= 0; i--) {
                        const node = parent.child(i);
                        prevPos -= node.nodeSize;
                        if (node.type.name === 'taskItem' && !node.attrs.isDayBreak) {
                            prevNode = node;
                            break;
                        }
                    }

                    if (!prevNode) return false;

                    // 3. Project Cursor
                    let targetPos = prevPos + prevNode.nodeSize - 1; // Default fallback

                    try {
                        const nodeDOM = view.nodeDOM(prevPos) as HTMLElement;
                        if (nodeDOM) {
                            const rect = nodeDOM.getBoundingClientRect();
                            const targetY = rect.bottom - 10;
                            const posResult = view.posAtCoords({ left: targetX, top: targetY });

                            if (posResult && posResult.pos >= prevPos && posResult.pos < prevPos + prevNode.nodeSize) {
                                targetPos = posResult.pos;
                            }
                        }
                    } catch (e) {}

                    // 4. DISPATCH WITH GOAL
                    if (dispatch) {
                        const tr = state.tr;
                        // Create the new selection
                        const newSelection = TextSelection.near(doc.resolve(targetPos));
                        // PERSIST THE GOAL: Attach the original X to the new selection
                        (newSelection as any).goal = targetX;

                        tr.setSelection(newSelection);
                        tr.scrollIntoView();
                        dispatch(tr);
                        view.focus();
                    }
                    return true;
                });
            },

            ArrowDown: () => {
                return this.editor.commands.command(({ editor, state, view, dispatch }) => {
                    const { selection, doc } = state;
                    const { $from, empty } = selection;
                    if (!empty) return false;

                    // 1. Goal Column Logic
                    const currentGoal = (selection as any).goal;
                    const currentCoords = view.coordsAtPos($from.pos);
                    const targetX = currentGoal !== undefined ? currentGoal : currentCoords.left;

                    const isAtBottom = view.endOfTextblock('down');

                    // --- FIX: Handle Internal Navigation manually to preserve Goal ---
                    if (!isAtBottom) {
                        // Move visually down within the same node
                        const targetY = currentCoords.bottom + 5; // Look slightly below current line
                        const posResult = view.posAtCoords({ left: targetX, top: targetY });

                        // Ensure we actually move forwards
                        if (posResult && posResult.pos > $from.pos) {
                            if (dispatch) {
                                const tr = state.tr;
                                const newSelection = TextSelection.near(doc.resolve(posResult.pos));
                                (newSelection as any).goal = targetX; // <--- Persist goal
                                tr.setSelection(newSelection);
                                tr.scrollIntoView();
                                dispatch(tr);
                                view.focus();
                            }
                            return true;
                        }
                        return false;
                    }

                    // --- Existing Logic for Crossing Nodes ---
                    const currentPos = $from.before(1);
                    const currentNode = $from.node();
                    const resolved = doc.resolve(currentPos);
                    const index = resolved.index();
                    const parent = resolved.parent;

                    let nextNode = null;
                    let nextPos = currentPos + currentNode.nodeSize;

                    for (let i = index + 1; i < parent.childCount; i++) {
                        const node = parent.child(i);
                        if (node.type.name === 'taskItem' && !node.attrs.isDayBreak) {
                            nextNode = node;
                            break;
                        }
                        nextPos += node.nodeSize;
                    }

                    if (!nextNode) {
                        return false;
                    }

                    let targetPos = nextPos + 1;

                    try {
                        const nodeDOM = view.nodeDOM(nextPos) as HTMLElement;
                        if (nodeDOM) {
                            const rect = nodeDOM.getBoundingClientRect();
                            const targetY = rect.top + 10;
                            const posResult = view.posAtCoords({ left: targetX, top: targetY });

                            if (posResult && posResult.pos >= nextPos && posResult.pos < nextPos + nextNode.nodeSize) {
                                targetPos = posResult.pos;
                            }
                        }
                    } catch (e) {}

                    if (dispatch) {
                        const tr = state.tr;
                        const newSelection = TextSelection.near(doc.resolve(targetPos));
                        (newSelection as any).goal = targetX;
                        tr.setSelection(newSelection);
                        tr.scrollIntoView();
                        dispatch(tr);
                        view.focus();
                    }
                    return true;
                });
            },
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                appendTransaction(transactions, oldState, newState) {
                    // Only act on paste transactions
                    const didPaste = transactions.some((tr) => tr.getMeta('uiEvent') === 'paste');
                    if (!didPaste) return null;

                    const oldDoc = oldState.doc;
                    const newDoc = newState.doc;

                    // Collect IDs of all taskItems that existed *before* the paste
                    const oldIds = new Set<string>();
                    oldDoc.descendants((node) => {
                        if (node.type.name === 'taskItem' && node.attrs?.id) {
                            oldIds.add(node.attrs.id as string);
                        }
                        return false;
                    });

                    // Baseline indentation = indentation of the task where paste happened
                    let baselineIndentation = 0;
                    const { $from } = oldState.selection;
                    const pasteNode = $from.node();
                    if (pasteNode.type.name === 'taskItem') {
                        baselineIndentation = pasteNode.attrs.indentationLevel || 0;
                    }

                    let tr = newState.tr;
                    let changed = false;

                    // Go through all taskItems in the NEW doc
                    newDoc.descendants((node, pos) => {
                        if (node.type.name !== 'taskItem') return false;

                        const nodeId = node.attrs?.id as string | undefined;
                        const isDayBreak = !!node.attrs?.isDayBreak;

                        // Skip day breaks entirely
                        if (isDayBreak) return false;

                        // If this node existed before paste, don't touch it
                        if (nodeId && oldIds.has(nodeId)) return false;

                        // This is a *new* taskItem (created by paste or still missing id).
                        // Always assign a fresh ID so clipboard HTML never carries stale
                        // IDs from deleted tasks into the editor.
                        tr = tr.setNodeMarkup(
                            pos,
                            undefined,
                            {
                                ...node.attrs,
                                id: generateId(),
                                indentationLevel: baselineIndentation,
                            },
                            node.marks
                        );
                        changed = true;

                        return false;
                    });

                    return changed ? tr : null;
                },
            }),
        ];
    },
});

export default TaskItemExtension;
