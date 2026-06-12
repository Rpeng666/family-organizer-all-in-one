// lib/task-response-types.ts
// Type definitions and constants for the task response and grading system.

export const RESPONSE_FIELD_TYPES = ['rich_text', 'photo', 'video', 'audio', 'file'] as const;
export type TaskResponseFieldType = (typeof RESPONSE_FIELD_TYPES)[number];

export const GRADE_TYPE_KINDS = ['number', 'letter', 'stars', 'freeform'] as const;
export type GradeTypeKind = (typeof GRADE_TYPE_KINDS)[number];

export function isResponseFieldType(value: unknown): value is TaskResponseFieldType {
    return typeof value === 'string' && (RESPONSE_FIELD_TYPES as readonly string[]).includes(value);
}

export function isGradeTypeKind(value: unknown): value is GradeTypeKind {
    return typeof value === 'string' && (GRADE_TYPE_KINDS as readonly string[]).includes(value);
}

/** A letter grade step definition (stored in gradeTypes.steps JSON). */
export interface LetterGradeStep {
    label: string;
    value: number;
}

export interface GradeTypeLike {
    id: string;
    name: string;
    kind: string;
    highValue: number;
    lowValue: number;
    highLabel: string;
    lowLabel: string;
    steps?: LetterGradeStep[] | null;
    isDefault: boolean;
    order: number;
}

export interface TaskResponseFieldLike {
    id: string;
    type: string;
    label: string;
    description?: string | null;
    weight: number;
    required: boolean;
    order: number;
}

export interface TaskResponseFieldValueLike {
    id: string;
    richTextContent?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSizeBytes?: number | null;
    thumbnailUrl?: string | null;
}

export const RESPONSE_FIELD_TYPE_LABELS: Record<TaskResponseFieldType, string> = {
    rich_text: 'Rich Text',
    photo: 'Photo',
    video: 'Video',
    audio: 'Audio',
    file: 'File',
};
