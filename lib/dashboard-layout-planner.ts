import type { TaskWorkflowState } from '@/lib/task-progress';

// ─── Height constants ────────────────────────────────────────────────────────

export const SECTION_GAP_PX = 12;
export const SECTION_HEADER_HEIGHT = 28;
export const EMPTY_STATE_HEIGHT = 52;
export const CHORE_ROW_HEIGHT = 52;
export const COMPLETED_LABEL_HEIGHT = 24;
export const CHORE_OVERFLOW_HEIGHT = 24;
export const MESSAGE_ROW_HEIGHT = 76;
export const TASK_GROUP_HEADER_HEIGHT = 26;
export const TASK_ROW_HEIGHT = 96;
export const TASK_OVERFLOW_HEIGHT = 24;
export const EVENT_ROW_HEIGHT = 72;
export const DESKTOP_LEFT_COLUMN_MIN_WIDTH = 544;
export const DESKTOP_RIGHT_COLUMN_MIN_WIDTH = 780;

// ─── Shared display types ─────────────────────────────────────────────────────

export type ChoreRow = {
    id: string;
    title: string;
    weight: number;
    isUpForGrabs: boolean;
    isCompleted: boolean;
};

export type UnreadThread = {
    id: string;
    displayName: string;
    previewText: string;
    latestMessageAt: string;
};

export type TaskRow = {
    id: string;
    text: string;
    workflowState: TaskWorkflowState;
    notePreview: string | null;
    parentLabel: string | null;
    depth: number;
};

export type TaskGroup = {
    seriesId: string;
    seriesName: string;
    tasks: TaskRow[];
};

export type EventRow = {
    id: string;
    title: string;
    timeLabel: string;
    dayLabel: string;
    isFamilyWide: boolean;
    isAllDay: boolean;
    withinInitialWindow: boolean;
    startsAt: Date;
};

// ─── Plan types ───────────────────────────────────────────────────────────────

export type ChoreSectionPlan = {
    visibleIncompleteCount: number;
    visibleCompletedCount: number;
    hiddenCount: number;
    showCompletedLabel: boolean;
    usedHeight: number;
};

export type LinearSectionPlan = {
    visibleCount: number;
    usedHeight: number;
};

export type TaskSectionPlan = {
    visibleGroups: TaskGroup[];
    hiddenCount: number;
    usedHeight: number;
};

// ─── Planners ─────────────────────────────────────────────────────────────────

export function planChoreSection(incompleteCount: number, completedCount: number, maxHeight: number | null): ChoreSectionPlan {
    if (maxHeight == null) {
        return { visibleIncompleteCount: incompleteCount, visibleCompletedCount: completedCount, hiddenCount: 0, showCompletedLabel: completedCount > 0, usedHeight: 0 };
    }
    const totalCount = incompleteCount + completedCount;
    if (totalCount === 0) {
        return { visibleIncompleteCount: 0, visibleCompletedCount: 0, hiddenCount: 0, showCompletedLabel: false, usedHeight: SECTION_HEADER_HEIGHT + EMPTY_STATE_HEIGHT };
    }

    let visibleIncompleteCount = 0;
    let visibleCompletedCount = 0;
    let showCompletedLabel = false;
    let usedHeight = SECTION_HEADER_HEIGHT;
    let remaining = Math.max(0, maxHeight - SECTION_HEADER_HEIGHT);

    visibleIncompleteCount = Math.min(incompleteCount, Math.floor(remaining / CHORE_ROW_HEIGHT));
    usedHeight += visibleIncompleteCount * CHORE_ROW_HEIGHT;
    remaining -= visibleIncompleteCount * CHORE_ROW_HEIGHT;

    if (visibleIncompleteCount === incompleteCount && completedCount > 0 && remaining >= COMPLETED_LABEL_HEIGHT + CHORE_ROW_HEIGHT) {
        showCompletedLabel = true;
        usedHeight += COMPLETED_LABEL_HEIGHT;
        remaining -= COMPLETED_LABEL_HEIGHT;
        visibleCompletedCount = Math.min(completedCount, Math.floor(remaining / CHORE_ROW_HEIGHT));
        usedHeight += visibleCompletedCount * CHORE_ROW_HEIGHT;
        if (visibleCompletedCount === 0) { showCompletedLabel = false; usedHeight -= COMPLETED_LABEL_HEIGHT; }
    }

    let hiddenCount = totalCount - visibleIncompleteCount - visibleCompletedCount;
    if (hiddenCount > 0) {
        while (usedHeight + CHORE_OVERFLOW_HEIGHT > maxHeight && (visibleCompletedCount > 0 || visibleIncompleteCount > 0)) {
            if (visibleCompletedCount > 0) {
                visibleCompletedCount -= 1;
                usedHeight -= CHORE_ROW_HEIGHT;
                if (visibleCompletedCount === 0 && showCompletedLabel) { showCompletedLabel = false; usedHeight -= COMPLETED_LABEL_HEIGHT; }
            } else {
                visibleIncompleteCount -= 1;
                usedHeight -= CHORE_ROW_HEIGHT;
            }
            hiddenCount = totalCount - visibleIncompleteCount - visibleCompletedCount;
        }
        usedHeight = Math.min(maxHeight, usedHeight + CHORE_OVERFLOW_HEIGHT);
    }
    return { visibleIncompleteCount, visibleCompletedCount, hiddenCount, showCompletedLabel, usedHeight };
}

export function planLinearSection(totalCount: number, rowHeight: number, maxHeight: number | null): LinearSectionPlan {
    if (maxHeight == null) return { visibleCount: totalCount, usedHeight: 0 };
    if (totalCount === 0) return { visibleCount: 0, usedHeight: SECTION_HEADER_HEIGHT + EMPTY_STATE_HEIGHT };
    const visibleCount = Math.min(totalCount, Math.max(1, Math.floor((maxHeight - SECTION_HEADER_HEIGHT) / rowHeight)));
    return { visibleCount, usedHeight: SECTION_HEADER_HEIGHT + visibleCount * rowHeight };
}

export function planTaskSection(taskGroups: TaskGroup[], maxHeight: number | null): TaskSectionPlan {
    if (maxHeight == null) return { visibleGroups: taskGroups, hiddenCount: 0, usedHeight: 0 };
    const totalTaskCount = taskGroups.reduce((sum, g) => sum + g.tasks.length, 0);
    if (totalTaskCount === 0) return { visibleGroups: [], hiddenCount: 0, usedHeight: SECTION_HEADER_HEIGHT + EMPTY_STATE_HEIGHT };

    const visibleGroups: TaskGroup[] = [];
    let visibleTaskCount = 0;
    let usedHeight = SECTION_HEADER_HEIGHT;
    let remaining = Math.max(0, maxHeight - SECTION_HEADER_HEIGHT);

    for (const group of taskGroups) {
        if (remaining < TASK_GROUP_HEADER_HEIGHT + TASK_ROW_HEIGHT) break;
        usedHeight += TASK_GROUP_HEADER_HEIGHT;
        remaining -= TASK_GROUP_HEADER_HEIGHT;
        let visibleTaskRows = 0;
        for (const _task of group.tasks) {
            if (remaining < TASK_ROW_HEIGHT) break;
            visibleTaskRows += 1;
            visibleTaskCount += 1;
            usedHeight += TASK_ROW_HEIGHT;
            remaining -= TASK_ROW_HEIGHT;
        }
        if (visibleTaskRows > 0) visibleGroups.push({ ...group, tasks: group.tasks.slice(0, visibleTaskRows) });
        if (visibleTaskRows < group.tasks.length) break;
    }

    let hiddenCount = totalTaskCount - visibleTaskCount;
    if (hiddenCount > 0) {
        while (usedHeight + TASK_OVERFLOW_HEIGHT > maxHeight && visibleGroups.length > 0) {
            const last = visibleGroups[visibleGroups.length - 1];
            if (last.tasks.length > 0) { last.tasks = last.tasks.slice(0, -1); visibleTaskCount -= 1; usedHeight -= TASK_ROW_HEIGHT; }
            if (last.tasks.length === 0) { visibleGroups.pop(); usedHeight -= TASK_GROUP_HEADER_HEIGHT; }
            hiddenCount = totalTaskCount - visibleTaskCount;
        }
        usedHeight = Math.min(maxHeight, usedHeight + TASK_OVERFLOW_HEIGHT);
    }
    return { visibleGroups, hiddenCount, usedHeight };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatCountLabel(count: number, singular: string, plural: string, suffix = '') {
    return `${count} ${count === 1 ? singular : plural}${suffix}`;
}

export function formatUtcDateLabel(dateKey: string, options: Intl.DateTimeFormatOptions): string {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, { timeZone: 'UTC', ...options });
}
