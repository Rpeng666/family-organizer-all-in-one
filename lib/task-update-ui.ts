import { getTaskStatusLabel, type TaskWorkflowState } from '@/lib/task-progress';

export const TASK_UPDATE_ALL_STATES: TaskWorkflowState[] = [
    'not_started',
    'in_progress',
    'blocked',
    'skipped',
    'needs_review',
    'done',
];

export function getTaskUpdateVisibleStates(
    currentState: TaskWorkflowState,
    options?: { isReviewMode?: boolean }
): TaskWorkflowState[] {
    const states = new Set<TaskWorkflowState>();
    const isReviewMode = options?.isReviewMode === true;

    states.add(currentState);

    if (isReviewMode) {
        if (currentState === 'not_started') {
            states.add('in_progress');
            states.add('needs_review');
            states.add('done');
        } else if (currentState === 'in_progress') {
            states.add('done');
            states.add('needs_review');
            states.add('blocked');
        } else if (currentState === 'blocked' || currentState === 'skipped') {
            states.add('in_progress');
            states.add('needs_review');
            states.add('done');
        } else if (currentState === 'needs_review') {
            states.add('done');
            states.add('in_progress');
        } else if (currentState === 'done') {
            states.add('needs_review');
            states.add('in_progress');
        }
        return Array.from(states);
    }

    if (currentState === 'not_started') {
        states.add('in_progress');
        states.add('done');
    } else if (currentState === 'in_progress') {
        states.add('done');
        states.add('needs_review');
        states.add('blocked');
    } else if (currentState === 'blocked') {
        states.add('in_progress');
    } else if (currentState === 'needs_review') {
        states.add('done');
        states.add('in_progress');
    } else if (currentState === 'done') {
        states.add('in_progress');
        states.add('not_started');
    } else if (currentState === 'skipped') {
        states.add('not_started');
        states.add('in_progress');
    }

    return Array.from(states);
}

export function getTaskUpdateStateLabel(
    currentState: TaskWorkflowState,
    targetState: TaskWorkflowState,
    options?: { isReviewMode?: boolean }
) {
    if (options?.isReviewMode && currentState === 'needs_review') {
        if (targetState === 'done') return 'Approve';
        if (targetState === 'in_progress') return 'Request Changes';
    }

    return getTaskStatusLabel(targetState);
}
