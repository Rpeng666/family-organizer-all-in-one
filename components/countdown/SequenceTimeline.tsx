'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { buildMemberColorMap, hexToRgbaString } from '@/lib/family-member-colors';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { GripVertical } from 'lucide-react';
import type {
    CountdownEngineOutput,
    CountdownSlot,
    CountdownSlotState,
    PersonCountdownTimeline,
} from '@family-organizer/shared-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PersonInfo {
    personId: string;
    name: string;
    timeline: PersonCountdownTimeline;
}

interface FamilyMemberLike {
    id: string;
    name: string;
    color?: string | null;
}

interface ChoreRaw {
    id: string;
    timingMode?: string;
    sortOrder?: number | null;
    timingConfig?: {
        anchor?: {
            relation?: 'before' | 'after';
            sourceChoreId?: string | null;
        };
    } | null;
}

interface SequenceTimelineProps {
    output: CountdownEngineOutput;
    people: PersonInfo[];
    familyMembers: FamilyMemberLike[];
    choresRaw: ChoreRaw[];
    nowMs: number;
    onMarkDone?: (choreId: string, personId: string) => void;
    /** Called when user reorders chores within a same-deadline group. Map of choreId → new sortOrder. */
    onReorder?: (updates: Record<string, number>) => void;
    className?: string;
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

/** A single visual node in the sequence layout. */
interface LayoutNode {
    id: string; // unique: `${choreId}:${personId}` or `${choreId}:joint`
    choreId: string;
    choreTitle: string;
    personIds: string[]; // one for regular, many for joint
    isJoint: boolean;
    durationSecs: number;
    countdownStartMs: number;
    countdownEndMs: number;
    state: CountdownSlotState;
    slot: CountdownSlot; // reference to first/primary slot
    /** Grouping key for drag reorder: nodes with same key can be reordered. */
    reorderGroupKey: string;
    sortOrder: number | null;
    /** Layout computed values */
    row: number;
    col: number; // track/column index in the layout
    colSpan: number; // 1 for regular nodes
}

/** A visual connection line between two nodes. */
interface LayoutEdge {
    fromNodeId: string;
    toNodeId: string;
    personId: string; // whose colored line this is
    type: 'sequence' | 'dependency'; // sequence = same-person chain, dependency = cross-person
}

/** A gap marker between nodes in a person's sequence. */
interface GapMarker {
    afterNodeId: string;
    beforeNodeId: string;
    row: number;
    col: number;
    gapMinutes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLiveState(slot: CountdownSlot, nowMs: number): CountdownSlotState {
    if (slot.state === 'completed') return 'completed';
    if (slot.state === 'waiting_decision') return 'waiting_decision';
    if (nowMs >= slot.countdownEndMs) return 'overdue_active';
    if (nowMs >= slot.countdownStartMs) return 'active';
    return 'upcoming';
}

function formatTime(ms: number): string {
    return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(secs: number): string {
    if (secs >= 3600) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    if (secs >= 60) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    return `${secs}s`;
}

/** Height in px for a chore node based on duration. */
function nodeHeight(durationSecs: number): number {
    // min 52px (5 min or less), max 120px (60+ min), linear between
    const mins = durationSecs / 60;
    return Math.round(Math.max(52, Math.min(120, 52 + (mins - 5) * (68 / 55))));
}

const GAP_THRESHOLD_SECS = 30 * 60; // 30 minutes

const STATE_ICON: Record<CountdownSlotState, string> = {
    upcoming: '○',
    active: '●',
    overdue_active: '⚠',
    buffer: '·',
    completed: '✓',
    waiting_decision: '⏸',
};

// ---------------------------------------------------------------------------
// Dependency extraction
// ---------------------------------------------------------------------------

/** Build a map of choreId → sourceChoreId (the chore it depends on). */
function buildDependencyMap(choresRaw: ChoreRaw[]): Map<string, string> {
    const deps = new Map<string, string>();
    for (const c of choresRaw) {
        const mode = c.timingMode;
        if (mode === 'before_chore' || mode === 'after_chore' || mode === 'chore_anchor') {
            const sourceId = c.timingConfig?.anchor?.sourceChoreId;
            if (sourceId) {
                deps.set(c.id, sourceId);
            }
        }
    }
    return deps;
}

// ---------------------------------------------------------------------------
// Layout algorithm
// ---------------------------------------------------------------------------

interface LayoutResult {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    gaps: GapMarker[];
    trackPersonIds: string[][]; // for each track column, which personIds are using it at any point
    totalRows: number;
    trackCount: number;
}

function computeLayout(
    people: PersonInfo[],
    choreDeps: Map<string, string>,
    visiblePersonIds: Set<string>,
    nowMs: number,
    choreSortOrders: Map<string, number | null>,
): LayoutResult {
    const nodes: LayoutNode[] = [];
    const edges: LayoutEdge[] = [];
    const gaps: GapMarker[] = [];

    // Filter to visible people
    const visiblePeople = people.filter(p => visiblePersonIds.has(p.personId));
    if (visiblePeople.length === 0) {
        return { nodes: [], edges: [], gaps: [], trackPersonIds: [], totalRows: 0, trackCount: 0 };
    }

    // Step 1: Build nodes from slots, merging joint chores
    // Joint chores: multiple people share the same choreId with isJoint=true
    // We group them into a single node.
    const jointChoreSlots = new Map<string, CountdownSlot[]>(); // choreId → slots
    const regularSlots: CountdownSlot[] = [];

    for (const person of visiblePeople) {
        for (const slot of person.timeline.slots) {
            if (slot.state === 'buffer') continue;
            if (slot.isJoint) {
                const list = jointChoreSlots.get(slot.choreId) || [];
                list.push(slot);
                jointChoreSlots.set(slot.choreId, list);
            } else {
                regularSlots.push(slot);
            }
        }
    }

    // Build a map from choreId to all visible person IDs it's assigned to (for joint)
    const jointNodeMap = new Map<string, LayoutNode>();
    for (const [choreId, slots] of Array.from(jointChoreSlots.entries())) {
        const visibleSlots = slots.filter(s => visiblePersonIds.has(s.personId));
        if (visibleSlots.length === 0) continue;
        const primary = visibleSlots[0];
        const personIds = visibleSlots.map(s => s.personId);
        const groupKey = `joint:${primary.scheduleType}:${primary.deadlineOffset ?? 'none'}`;
        jointNodeMap.set(choreId, {
            id: `${choreId}:joint`,
            choreId,
            choreTitle: primary.choreTitle,
            personIds,
            isJoint: true,
            durationSecs: primary.durationSecs,
            countdownStartMs: primary.countdownStartMs,
            countdownEndMs: primary.countdownEndMs,
            state: primary.state,
            slot: primary,
            reorderGroupKey: groupKey,
            sortOrder: choreSortOrders.get(choreId) ?? null,
            row: -1,
            col: -1,
            colSpan: 1,
        });
    }

    // Build regular (non-joint) nodes
    const regularNodeMap = new Map<string, LayoutNode>(); // `choreId:personId` → node
    for (const slot of regularSlots) {
        if (!visiblePersonIds.has(slot.personId)) continue;
        const nodeId = `${slot.choreId}:${slot.personId}`;
        const groupKey = `${slot.personId}:${slot.scheduleType}:${slot.deadlineOffset ?? 'none'}`;
        regularNodeMap.set(nodeId, {
            id: nodeId,
            choreId: slot.choreId,
            choreTitle: slot.choreTitle,
            personIds: [slot.personId],
            isJoint: false,
            durationSecs: slot.durationSecs,
            countdownStartMs: slot.countdownStartMs,
            countdownEndMs: slot.countdownEndMs,
            state: slot.state,
            slot,
            reorderGroupKey: groupKey,
            sortOrder: choreSortOrders.get(slot.choreId) ?? null,
            row: -1,
            col: -1,
            colSpan: 1,
        });
    }

    // Step 2: Build per-person chains (ordered by time)
    // Each person has a sequence of nodes (regular or joint) sorted by start time.
    const personChains = new Map<string, LayoutNode[]>();
    for (const person of visiblePeople) {
        const chain: LayoutNode[] = [];
        const seenChoreIds = new Set<string>();
        const sortedSlots = [...person.timeline.slots]
            .filter(s => s.state !== 'buffer')
            .sort((a, b) => a.countdownStartMs - b.countdownStartMs);

        for (const slot of sortedSlots) {
            if (!visiblePersonIds.has(slot.personId)) continue;
            if (slot.isJoint) {
                if (seenChoreIds.has(slot.choreId)) continue;
                seenChoreIds.add(slot.choreId);
                const jointNode = jointNodeMap.get(slot.choreId);
                if (jointNode) chain.push(jointNode);
            } else {
                const nodeId = `${slot.choreId}:${slot.personId}`;
                const node = regularNodeMap.get(nodeId);
                if (node) chain.push(node);
            }
        }
        personChains.set(person.personId, chain);
    }

    // Step 3: Identify sequence edges (consecutive in a person's chain) and
    // whether there are time-dependency connections between them.
    // Two consecutive nodes are "in sequence" if:
    //   - The gap is < GAP_THRESHOLD_SECS, OR
    //   - There's an explicit chore dependency between them
    const choreNodeLookup = new Map<string, LayoutNode[]>(); // choreId → nodes referencing it
    for (const node of Array.from(regularNodeMap.values()).concat(Array.from(jointNodeMap.values()))) {
        const list = choreNodeLookup.get(node.choreId) || [];
        list.push(node);
        choreNodeLookup.set(node.choreId, list);
    }

    // Build cross-person dependency edges
    const crossPersonDeps: Array<{ fromNode: LayoutNode; toNode: LayoutNode; personId: string }> = [];
    for (const [choreId, sourceChoreId] of Array.from(choreDeps.entries())) {
        // Find nodes for the dependent chore and its source
        const depNodes = choreNodeLookup.get(choreId) || [];
        const sourceNodes = choreNodeLookup.get(sourceChoreId) || [];
        for (const depNode of depNodes) {
            for (const sourceNode of sourceNodes) {
                // Cross-person dependency: different people
                const depPersonId = depNode.personIds[0];
                const srcPersonId = sourceNode.personIds[0];
                if (depPersonId && srcPersonId && depPersonId !== srcPersonId) {
                    crossPersonDeps.push({
                        fromNode: sourceNode,
                        toNode: depNode,
                        personId: depPersonId,
                    });
                }
            }
        }
    }

    // Step 4: Assign tracks (columns) to people
    // Start with one track per person, then adjust for joint chores
    const personTrack = new Map<string, number>();
    visiblePeople.forEach((p, i) => personTrack.set(p.personId, i));
    const trackCount = visiblePeople.length;
    const trackPersonIds: string[][] = visiblePeople.map(p => [p.personId]);

    // Step 5: Assign rows using topological ordering
    // We process all nodes in time order, but joint chores must wait for
    // all participating people to be ready (like a merge commit in git).
    const personRowCursor = new Map<string, number>(); // personId → next available row
    visiblePeople.forEach(p => personRowCursor.set(p.personId, 0));

    // Build a global ordering: process chains interleaved by time
    interface QueueEntry {
        node: LayoutNode;
        personId: string;
        indexInChain: number;
    }
    const allEntries: QueueEntry[] = [];
    for (const [personId, chain] of Array.from(personChains.entries())) {
        chain.forEach((node, idx) => {
            allEntries.push({ node, personId, indexInChain: idx });
        });
    }
    // Sort by start time, breaking ties by person order
    allEntries.sort((a, b) => {
        const timeDiff = a.node.countdownStartMs - b.node.countdownStartMs;
        if (timeDiff !== 0) return timeDiff;
        return (personTrack.get(a.personId) ?? 0) - (personTrack.get(b.personId) ?? 0);
    });

    const placedNodes = new Set<string>(); // node IDs already placed
    const nodeRowMap = new Map<string, number>(); // nodeId → row

    // Track per-person chain for edge building
    const personPrevNode = new Map<string, LayoutNode>();

    for (const entry of allEntries) {
        const { node, personId } = entry;
        if (placedNodes.has(node.id)) {
            // Joint node already placed by another person — just record the edge
            const prevNode = personPrevNode.get(personId);
            if (prevNode && prevNode.id !== node.id) {
                const gap = (node.countdownStartMs - prevNode.countdownEndMs) / 1000;
                if (gap < GAP_THRESHOLD_SECS || choreDeps.has(node.choreId)) {
                    edges.push({
                        fromNodeId: prevNode.id,
                        toNodeId: node.id,
                        personId,
                        type: 'sequence',
                    });
                } else {
                    // Gap marker
                    const gapMins = Math.round(gap / 60);
                    if (gapMins > 0) {
                        const row = nodeRowMap.get(node.id) ?? 0;
                        gaps.push({
                            afterNodeId: prevNode.id,
                            beforeNodeId: node.id,
                            row: row, // will be between prev and this
                            col: personTrack.get(personId) ?? 0,
                            gapMinutes: gapMins,
                        });
                    }
                }
            }
            // Advance this person's cursor to after the joint node
            const jointRow = nodeRowMap.get(node.id) ?? 0;
            personRowCursor.set(personId, jointRow + 1);
            personPrevNode.set(personId, node);
            continue;
        }

        // Determine row for this node
        let row: number;
        if (node.isJoint) {
            // Joint node: must be at the max of all participants' cursors
            row = 0;
            for (const pid of node.personIds) {
                row = Math.max(row, personRowCursor.get(pid) ?? 0);
            }
            // Also must be after any cross-person dependency source
            for (const dep of crossPersonDeps) {
                if (dep.toNode.id === node.id && placedNodes.has(dep.fromNode.id)) {
                    const srcRow = nodeRowMap.get(dep.fromNode.id) ?? 0;
                    row = Math.max(row, srcRow + 1);
                }
            }
        } else {
            row = personRowCursor.get(personId) ?? 0;
            // Check cross-person dependencies
            for (const dep of crossPersonDeps) {
                if (dep.toNode.id === node.id && placedNodes.has(dep.fromNode.id)) {
                    const srcRow = nodeRowMap.get(dep.fromNode.id) ?? 0;
                    row = Math.max(row, srcRow + 1);
                }
            }
        }

        node.row = row;
        node.col = personTrack.get(personId) ?? 0;
        nodeRowMap.set(node.id, row);
        placedNodes.add(node.id);
        nodes.push(node);

        // Update cursors
        if (node.isJoint) {
            for (const pid of node.personIds) {
                personRowCursor.set(pid, row + 1);
            }
        } else {
            personRowCursor.set(personId, row + 1);
        }

        // Build edges from previous node in this person's chain
        const prevNode = personPrevNode.get(personId);
        if (prevNode) {
            const gap = (node.countdownStartMs - prevNode.countdownEndMs) / 1000;
            if (gap < GAP_THRESHOLD_SECS || choreDeps.has(node.choreId)) {
                edges.push({
                    fromNodeId: prevNode.id,
                    toNodeId: node.id,
                    personId,
                    type: 'sequence',
                });
            } else {
                // Gap marker
                const gapMins = Math.round(gap / 60);
                if (gapMins > 0) {
                    gaps.push({
                        afterNodeId: prevNode.id,
                        beforeNodeId: node.id,
                        row,
                        col: personTrack.get(personId) ?? 0,
                        gapMinutes: gapMins,
                    });
                }
            }
        }

        // For joint nodes, set previous for all participants
        if (node.isJoint) {
            for (const pid of node.personIds) {
                const pidPrevNode = personPrevNode.get(pid);
                if (pidPrevNode && pidPrevNode.id !== prevNode?.id) {
                    const gap = (node.countdownStartMs - pidPrevNode.countdownEndMs) / 1000;
                    if (gap < GAP_THRESHOLD_SECS || choreDeps.has(node.choreId)) {
                        edges.push({
                            fromNodeId: pidPrevNode.id,
                            toNodeId: node.id,
                            personId: pid,
                            type: 'sequence',
                        });
                    }
                }
                personPrevNode.set(pid, node);
            }
        } else {
            personPrevNode.set(personId, node);
        }
    }

    // Add cross-person dependency edges
    for (const dep of crossPersonDeps) {
        if (placedNodes.has(dep.fromNode.id) && placedNodes.has(dep.toNode.id)) {
            edges.push({
                fromNodeId: dep.fromNode.id,
                toNodeId: dep.toNode.id,
                personId: dep.personId,
                type: 'dependency',
            });
        }
    }

    const totalRows = Math.max(0, ...Array.from(personRowCursor.values()));

    return { nodes, edges, gaps, trackPersonIds, totalRows, trackCount };
}

// ---------------------------------------------------------------------------
// Rendering constants
// ---------------------------------------------------------------------------

const MIN_COLUMN_WIDTH = 140;
const MAX_COLUMN_WIDTH = 260;
const NODE_HORIZONTAL_PADDING = 12;
const ROW_GAP = 16; // vertical space between rows
const HEADER_HEIGHT = 56;
const GAP_MARKER_HEIGHT = 32;

function getNodeY(row: number, gapsBefore: number): number {
    return HEADER_HEIGHT + row * (80 + ROW_GAP) + gapsBefore * GAP_MARKER_HEIGHT;
}

// ---------------------------------------------------------------------------
// SVG line path helpers
// ---------------------------------------------------------------------------

function buildSequencePath(
    fromX: number, fromY: number, fromH: number,
    toX: number, toY: number,
): string {
    const startY = fromY + fromH;
    const endY = toY;
    if (Math.abs(fromX - toX) < 2) {
        // Straight vertical line
        return `M ${fromX} ${startY} L ${toX} ${endY}`;
    }
    // Curve from one column to another
    const midY = (startY + endY) / 2;
    return `M ${fromX} ${startY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${endY}`;
}

function buildDependencyPath(
    fromX: number, fromY: number, fromH: number,
    toX: number, toY: number,
): string {
    const startY = fromY + fromH / 2;
    const endY = toY + 4; // a bit into the target node
    // S-curve from source to target
    const midY = (startY + endY) / 2;
    return `M ${fromX} ${startY} C ${fromX + (toX - fromX) * 0.3} ${startY}, ${toX - (toX - fromX) * 0.3} ${endY}, ${toX} ${endY}`;
}

// ---------------------------------------------------------------------------
// State-based styling
// ---------------------------------------------------------------------------

function getStateBg(state: CountdownSlotState): string {
    switch (state) {
        case 'active': return 'bg-amber-50 border-amber-300';
        case 'overdue_active': return 'bg-red-50 border-red-300';
        case 'completed': return 'bg-emerald-50 border-emerald-200';
        case 'waiting_decision': return 'bg-violet-50 border-violet-200';
        default: return 'bg-white border-slate-200';
    }
}

function getStateRing(state: CountdownSlotState): string {
    switch (state) {
        case 'active': return 'ring-2 ring-amber-400/30';
        case 'overdue_active': return 'ring-2 ring-red-400/30';
        default: return '';
    }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ChoreNode({
    node,
    nowMs,
    colorMap,
    x,
    y,
    width,
    canDrag,
    onMarkDone,
}: {
    node: LayoutNode;
    nowMs: number;
    colorMap: Record<string, string>;
    x: number;
    y: number;
    width: number;
    canDrag: boolean;
    onMarkDone?: (choreId: string, personId: string) => void;
}) {
    const state = getLiveState(node.slot, nowMs);
    const height = nodeHeight(node.durationSecs);
    const primaryColor = colorMap[node.personIds[0]] || '#94A3B8';

    const itemRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dropEdge, setDropEdge] = useState<Edge | null>(null);

    useEffect(() => {
        if (!canDrag || !itemRef.current) return;

        const element = itemRef.current;

        const cleanupDraggable = draggable({
            element,
            dragHandle: handleRef.current ?? element,
            getInitialData: () => ({
                nodeId: node.id,
                choreId: node.choreId,
                reorderGroupKey: node.reorderGroupKey,
                row: node.row,
            }),
            onDragStart: () => setIsDragging(true),
            onDrop: () => setIsDragging(false),
        });

        const cleanupDropTarget = dropTargetForElements({
            element,
            getIsSticky: () => true,
            getData: ({ input, element: el }) => {
                const data = {
                    nodeId: node.id,
                    choreId: node.choreId,
                    reorderGroupKey: node.reorderGroupKey,
                    row: node.row,
                };
                return attachClosestEdge(data, {
                    input,
                    element: el,
                    allowedEdges: ['top', 'bottom'],
                });
            },
            canDrop: ({ source }) => {
                // Only accept drops from same reorder group
                return source.data.reorderGroupKey === node.reorderGroupKey
                    && source.data.nodeId !== node.id;
            },
            onDrag({ self }) {
                setDropEdge(extractClosestEdge(self.data));
            },
            onDragLeave() {
                setDropEdge(null);
            },
            onDrop() {
                setDropEdge(null);
            },
        });

        return () => {
            cleanupDraggable();
            cleanupDropTarget();
        };
    }, [canDrag, node.id, node.choreId, node.reorderGroupKey, node.row]);

    return (
        <div
            ref={itemRef}
            className={cn(
                'absolute group rounded-xl border px-3 py-2 transition-all duration-300 overflow-hidden',
                getStateBg(state),
                getStateRing(state),
                isDragging && 'opacity-40',
            )}
            style={{
                left: x,
                top: y,
                width,
                height,
                borderLeftWidth: 3,
                borderLeftColor: primaryColor,
                zIndex: isDragging ? 50 : undefined,
            }}
        >
            {/* Drop indicators */}
            {dropEdge === 'top' && (
                <div className="absolute -top-[2px] left-0 right-0 h-[3px] bg-blue-500 rounded-full z-20" />
            )}
            {dropEdge === 'bottom' && (
                <div className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-blue-500 rounded-full z-20" />
            )}

            <div className="flex flex-col justify-between h-full min-h-0">
                <div className="flex items-start gap-1">
                    {/* Drag handle */}
                    {canDrag && (
                        <div
                            ref={handleRef}
                            className="flex-shrink-0 cursor-grab opacity-0 group-hover:opacity-40 hover:!opacity-70 transition-opacity mt-0.5"
                        >
                            <GripVertical className="h-3 w-3 text-slate-400" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] opacity-60">{STATE_ICON[state]}</span>
                            <span className="text-xs font-medium truncate leading-tight">{node.choreTitle}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
                            {formatTime(node.countdownStartMs)} → {formatTime(node.countdownEndMs)}
                            <span className="ml-1 opacity-70">({formatDuration(node.durationSecs)})</span>
                        </div>
                    </div>
                </div>
                {node.isJoint && (
                    <div className="flex items-center gap-1 mt-1">
                        {node.personIds.map(pid => (
                            <div
                                key={pid}
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: colorMap[pid] || '#94A3B8' }}
                                title={pid}
                            />
                        ))}
                        <span className="text-[8px] text-slate-400 ml-0.5">Joint</span>
                    </div>
                )}
            </div>
            {/* Mark done on hover */}
            {state !== 'completed' && onMarkDone && (
                <button
                    type="button"
                    onClick={() => onMarkDone(node.choreId, node.personIds[0])}
                    className="absolute inset-y-0 right-0 w-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-white/80 to-transparent"
                    title="Mark done"
                >
                    <span className="text-emerald-600 text-xs font-bold">✓</span>
                </button>
            )}
        </div>
    );
}

function GapMarkerNode({
    gapMinutes,
    x,
    y,
    width,
}: {
    gapMinutes: number;
    x: number;
    y: number;
    width: number;
}) {
    const label = gapMinutes >= 60
        ? `${Math.floor(gapMinutes / 60)}h ${gapMinutes % 60 > 0 ? `${gapMinutes % 60}m` : ''} gap`
        : `${gapMinutes}m gap`;

    return (
        <div
            className="absolute flex items-center justify-center"
            style={{ left: x, top: y, width, height: GAP_MARKER_HEIGHT }}
        >
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <div className="h-px w-6 bg-slate-200" />
                <span>{label.trim()}</span>
                <div className="h-px w-6 bg-slate-200" />
            </div>
        </div>
    );
}

function ColumnHeader({
    personId,
    name,
    color,
    completedCount,
    totalCount,
    x,
    width,
    isActive,
    onToggle,
}: {
    personId: string;
    name: string;
    color: string;
    completedCount: number;
    totalCount: number;
    x: number;
    width: number;
    isActive: boolean;
    onToggle: () => void;
}) {
    return (
        <div
            className={cn(
                'absolute top-0 flex flex-col items-center justify-center cursor-pointer transition-opacity',
                !isActive && 'opacity-40',
            )}
            style={{ left: x, width, height: HEADER_HEIGHT }}
            onClick={onToggle}
        >
            <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold mb-1"
                style={{ backgroundColor: color }}
            >
                {name.charAt(0).toUpperCase()}
            </div>
            <div className="text-[10px] font-medium text-slate-700 truncate max-w-[90%]">{name}</div>
            <div className="text-[9px] text-slate-400">{completedCount}/{totalCount}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SequenceTimeline({
    output,
    people,
    familyMembers,
    choresRaw,
    nowMs,
    onMarkDone,
    onReorder,
    className,
}: SequenceTimelineProps) {
    // Measure container width for responsive columns
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        obs.observe(el);
        setContainerWidth(el.clientWidth);
        return () => obs.disconnect();
    }, []);

    // Member color map
    const colorMap = useMemo(
        () => buildMemberColorMap(familyMembers),
        [familyMembers],
    );

    // Member filter — track user's explicit selections
    const [visibleIds, setVisibleIds] = useState<Set<string>>(() =>
        new Set(people.map(p => p.personId)),
    );
    // Track whether the user has manually toggled anyone (don't auto-reset after that)
    const userHasToggledRef = useRef(false);

    // Stable list of person IDs for sync comparison
    const personIdList = useMemo(() => people.map(p => p.personId).sort().join(','), [people]);

    // Only sync when the actual set of people changes (new member added/removed),
    // not on every re-render. And never override user's manual selections.
    useEffect(() => {
        const allIds = new Set(personIdList.split(',').filter(Boolean));
        setVisibleIds(prev => {
            // Remove people that no longer exist
            let changed = false;
            const next = new Set<string>();
            Array.from(prev).forEach(id => {
                if (allIds.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            });
            // Add brand new people (only if user hasn't manually toggled)
            if (!userHasToggledRef.current) {
                Array.from(allIds).forEach(id => {
                    if (!next.has(id)) {
                        next.add(id);
                        changed = true;
                    }
                });
            }
            return changed ? next : prev;
        });
    }, [personIdList]);

    const togglePerson = useCallback((personId: string) => {
        userHasToggledRef.current = true;
        setVisibleIds(prev => {
            const next = new Set(prev);
            if (next.has(personId)) {
                if (next.size > 1) next.delete(personId); // keep at least one
            } else {
                next.add(personId);
            }
            return next;
        });
    }, []);

    // Build dependency map from raw chores
    const choreDeps = useMemo(() => buildDependencyMap(choresRaw), [choresRaw]);

    // Visible people for headers (needed for colWidth calc)
    const visiblePeople = useMemo(
        () => people.filter(p => visibleIds.has(p.personId)),
        [people, visibleIds],
    );

    // Dynamic column width: fill the container, clamped between min and max
    const colWidth = useMemo(() => {
        if (containerWidth <= 0 || visiblePeople.length === 0) return MIN_COLUMN_WIDTH;
        const natural = Math.floor(containerWidth / visiblePeople.length);
        return Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, natural));
    }, [containerWidth, visiblePeople.length]);

    // Build chore sort order map
    const choreSortOrders = useMemo(() => {
        const map = new Map<string, number | null>();
        for (const c of choresRaw) {
            map.set(c.id, c.sortOrder ?? null);
        }
        return map;
    }, [choresRaw]);

    // Compute layout
    const layout = useMemo(
        () => computeLayout(people, choreDeps, visibleIds, nowMs, choreSortOrders),
        // Only recompute when data changes, not every tick
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [people, choreDeps, visibleIds, choreSortOrders, Math.floor(nowMs / 30000)],
    );

    // Build node position lookup
    const nodePositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number; w: number; h: number; centerX: number }>();
        // Count gaps before each row
        const rowGapCounts = new Map<number, number>();
        // Sort gaps by the row they appear before
        for (const gap of layout.gaps) {
            const nodeRow = layout.nodes.find(n => n.id === gap.beforeNodeId)?.row ?? gap.row;
            rowGapCounts.set(nodeRow, (rowGapCounts.get(nodeRow) ?? 0) + 1);
        }
        // Cumulative gap count before each row
        const cumulativeGaps = new Map<number, number>();
        let cumGaps = 0;
        for (let r = 0; r <= layout.totalRows; r++) {
            cumulativeGaps.set(r, cumGaps);
            cumGaps += rowGapCounts.get(r) ?? 0;
        }

        for (const node of layout.nodes) {
            const gapsBefore = cumulativeGaps.get(node.row) ?? 0;
            const y = getNodeY(node.row, gapsBefore);
            const h = nodeHeight(node.durationSecs);
            const x = node.col * colWidth + NODE_HORIZONTAL_PADDING;
            const w = (node.isJoint ? node.personIds.length * colWidth : colWidth) - NODE_HORIZONTAL_PADDING * 2;
            const centerX = node.col * colWidth + colWidth / 2;
            positions.set(node.id, { x, y, w, h, centerX });
        }
        return positions;
    }, [layout, colWidth]);

    // Compute total canvas height
    const totalHeight = useMemo(() => {
        let maxY = HEADER_HEIGHT;
        for (const pos of Array.from(nodePositions.values())) {
            maxY = Math.max(maxY, pos.y + pos.h + ROW_GAP);
        }
        return maxY + 40; // bottom padding
    }, [nodePositions]);

    // Reorder group sizes: nodes can only be dragged if their group has >1 member
    const reorderGroupSizes = useMemo(() => {
        const sizes = new Map<string, number>();
        for (const node of layout.nodes) {
            sizes.set(node.reorderGroupKey, (sizes.get(node.reorderGroupKey) ?? 0) + 1);
        }
        return sizes;
    }, [layout.nodes]);

    // Drag-and-drop monitor for reordering within same-deadline groups
    useEffect(() => {
        if (!onReorder) return;
        const cleanup = monitorForElements({
            onDrop: ({ source, location }) => {
                if (!location.current.dropTargets.length) return;
                const target = location.current.dropTargets[0];
                const sourceGroupKey = source.data.reorderGroupKey as string;
                const targetGroupKey = target.data.reorderGroupKey as string;
                if (sourceGroupKey !== targetGroupKey) return;

                const sourceNodeId = source.data.nodeId as string;
                const targetNodeId = target.data.nodeId as string;
                if (sourceNodeId === targetNodeId) return;

                const closestEdge = extractClosestEdge(target.data);

                // Get all nodes in this group, sorted by current row
                const groupNodes = layout.nodes
                    .filter(n => n.reorderGroupKey === sourceGroupKey)
                    .sort((a, b) => a.row - b.row);

                const sourceIdx = groupNodes.findIndex(n => n.id === sourceNodeId);
                const targetIdx = groupNodes.findIndex(n => n.id === targetNodeId);
                if (sourceIdx < 0 || targetIdx < 0) return;

                // Compute new order
                const reordered = [...groupNodes];
                const [moved] = reordered.splice(sourceIdx, 1);
                let insertIdx = targetIdx;
                if (sourceIdx < targetIdx) insertIdx--; // adjust for removal
                if (closestEdge === 'bottom') insertIdx++;
                reordered.splice(Math.max(0, insertIdx), 0, moved);

                // Assign new sortOrder values (0, 1, 2, ...)
                const updates: Record<string, number> = {};
                reordered.forEach((node, idx) => {
                    updates[node.choreId] = idx;
                });

                onReorder(updates);
            },
        });
        return cleanup;
    }, [layout.nodes, onReorder]);

    if (people.length === 0) {
        return (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                No timeline data to display
            </div>
        );
    }

    const canvasWidth = Math.max(layout.trackCount * colWidth, 400);

    return (
        <div ref={containerRef} className={cn('rounded-2xl border border-slate-200 bg-white overflow-hidden', className)}>
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mr-1">Members</span>
                {people.map(p => {
                    const color = colorMap[p.personId] || '#94A3B8';
                    const isVisible = visibleIds.has(p.personId);
                    return (
                        <button
                            key={p.personId}
                            type="button"
                            onClick={() => togglePerson(p.personId)}
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border',
                                isVisible
                                    ? 'border-current shadow-sm'
                                    : 'border-slate-200 bg-white text-slate-400 opacity-50',
                            )}
                            style={isVisible ? { color, borderColor: color, backgroundColor: hexToRgbaString(color, 0.08) } : undefined}
                        >
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: isVisible ? color : '#CBD5E1' }}
                            />
                            {p.name}
                        </button>
                    );
                })}
            </div>

            {/* Canvas */}
            <div className="overflow-auto">
                <div className="relative mx-auto" style={{ width: canvasWidth, height: totalHeight, minHeight: 200 }}>
                    {/* Column headers */}
                    {visiblePeople.map((p, i) => {
                        const color = colorMap[p.personId] || '#94A3B8';
                        const total = p.timeline.slots.filter(s => s.state !== 'buffer').length;
                        const completed = p.timeline.slots.filter(s => s.state === 'completed').length;
                        return (
                            <ColumnHeader
                                key={p.personId}
                                personId={p.personId}
                                name={p.name}
                                color={color}
                                completedCount={completed}
                                totalCount={total}
                                x={i * colWidth}
                                width={colWidth}
                                isActive={true}
                                onToggle={() => togglePerson(p.personId)}
                            />
                        );
                    })}

                    {/* Vertical guide lines (faint, behind everything) */}
                    {visiblePeople.map((p, i) => {
                        const color = colorMap[p.personId] || '#94A3B8';
                        return (
                            <div
                                key={`guide-${p.personId}`}
                                className="absolute"
                                style={{
                                    left: i * colWidth + colWidth / 2,
                                    top: HEADER_HEIGHT,
                                    bottom: 0,
                                    width: 1,
                                    backgroundColor: hexToRgbaString(color, 0.08),
                                }}
                            />
                        );
                    })}

                    {/* SVG overlay for lines */}
                    <svg
                        className="absolute inset-0 pointer-events-none"
                        style={{ width: canvasWidth, height: totalHeight }}
                    >
                        {/* Sequence edges */}
                        {layout.edges.map((edge, i) => {
                            const from = nodePositions.get(edge.fromNodeId);
                            const to = nodePositions.get(edge.toNodeId);
                            if (!from || !to) return null;

                            const color = colorMap[edge.personId] || '#94A3B8';
                            const fromCenterX = from.x + from.w / 2;
                            const toCenterX = to.x + to.w / 2;

                            if (edge.type === 'dependency') {
                                // Dashed dependency arrow
                                const path = buildDependencyPath(
                                    fromCenterX, from.y, from.h,
                                    toCenterX, to.y,
                                );
                                return (
                                    <g key={`dep-${i}`}>
                                        <path
                                            d={path}
                                            fill="none"
                                            stroke={color}
                                            strokeWidth={1.5}
                                            strokeDasharray="6 3"
                                            opacity={0.6}
                                        />
                                        {/* Arrow head */}
                                        <circle
                                            cx={toCenterX}
                                            cy={to.y}
                                            r={3}
                                            fill={color}
                                            opacity={0.6}
                                        />
                                    </g>
                                );
                            }

                            // Solid sequence line
                            const personIdx = visiblePeople.findIndex(p => p.personId === edge.personId);
                            const trackX = personIdx >= 0 ? personIdx * colWidth + colWidth / 2 : fromCenterX;

                            // From bottom of source node to top of target node, through the track center
                            const fromBottomY = from.y + from.h;
                            const toTopY = to.y;

                            // If both nodes are in the same track, simple vertical line
                            if (Math.abs(fromCenterX - toCenterX) < 5) {
                                return (
                                    <line
                                        key={`seq-${i}`}
                                        x1={trackX}
                                        y1={fromBottomY}
                                        x2={trackX}
                                        y2={toTopY}
                                        stroke={color}
                                        strokeWidth={2}
                                        opacity={0.5}
                                    />
                                );
                            }

                            // Curved line between different columns
                            const path = buildSequencePath(
                                fromCenterX, from.y, from.h,
                                toCenterX, to.y,
                            );
                            return (
                                <path
                                    key={`seq-${i}`}
                                    d={path}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    opacity={0.5}
                                />
                            );
                        })}
                    </svg>

                    {/* Gap markers */}
                    {layout.gaps.map((gap, i) => {
                        const beforePos = nodePositions.get(gap.beforeNodeId);
                        const afterPos = nodePositions.get(gap.afterNodeId);
                        if (!beforePos || !afterPos) return null;
                        // Position between the two nodes
                        const y = afterPos.y + afterPos.h + 4;
                        const x = gap.col * colWidth + NODE_HORIZONTAL_PADDING;
                        return (
                            <GapMarkerNode
                                key={`gap-${i}`}
                                gapMinutes={gap.gapMinutes}
                                x={x}
                                y={y}
                                width={colWidth - NODE_HORIZONTAL_PADDING * 2}
                            />
                        );
                    })}

                    {/* Chore nodes */}
                    {layout.nodes.map(node => {
                        const pos = nodePositions.get(node.id);
                        if (!pos) return null;

                        // For joint nodes, compute x and width spanning participant columns
                        let x = pos.x;
                        let w = pos.w;
                        if (node.isJoint && node.personIds.length > 1) {
                            const colIndices = node.personIds
                                .map(pid => visiblePeople.findIndex(p => p.personId === pid))
                                .filter(idx => idx >= 0)
                                .sort((a, b) => a - b);
                            if (colIndices.length > 1) {
                                const minCol = colIndices[0];
                                const maxCol = colIndices[colIndices.length - 1];
                                x = minCol * colWidth + NODE_HORIZONTAL_PADDING;
                                w = (maxCol - minCol + 1) * colWidth - NODE_HORIZONTAL_PADDING * 2;
                            }
                        }

                        const groupSize = reorderGroupSizes.get(node.reorderGroupKey) ?? 0;
                        const canDrag = !!onReorder && groupSize > 1;

                        return (
                            <ChoreNode
                                key={node.id}
                                node={node}
                                nowMs={nowMs}
                                colorMap={colorMap}
                                x={x}
                                y={pos.y}
                                width={w}
                                canDrag={canDrag}
                                onMarkDone={onMarkDone}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
