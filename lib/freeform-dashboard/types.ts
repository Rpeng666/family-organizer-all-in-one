import type { LucideIcon } from 'lucide-react';

// ── Widget rect (position + size + stacking) ──────────────────────────
export interface WidgetRect {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
}

// ── Snap engine types ─────────────────────────────────────────────────
export type EdgeDirection = 'horizontal' | 'vertical';

export interface SnapGuide {
    direction: EdgeDirection;
    value: number; // px coordinate of the guide line
}

export interface SnapResult {
    x: number;
    y: number;
    guides: SnapGuide[];
}

export interface ResizeSnapResult {
    rect: { x: number; y: number; w: number; h: number };
    guides: SnapGuide[];
}

export interface AlignedEdge {
    widgetId: string;
    /** Which edge of this widget is aligned */
    edge: 'left' | 'right' | 'top' | 'bottom';
}

// ── Breakpoint ────────────────────────────────────────────────────────
export interface BreakpointDef {
    breakpointKey: string;
    label: string;
    minWidth: number;
    maxWidth: number;
    order: number;
    isDefault: boolean;
}

// ── Widget registry ───────────────────────────────────────────────────
export interface ConfigField {
    key: string;
    label: string;
    type: 'family-member' | 'family-members' | 'number' | 'string' | 'boolean' | 'range' | 'content-category' | 'select';
    required?: boolean;
    /** For number/range fields: minimum value */
    min?: number;
    /** For number/range fields: maximum value */
    max?: number;
    /** For range fields: step increment */
    step?: number;
    /** For range fields: format the display label (e.g. percentage) */
    formatValue?: (v: number) => string;
    /** For select fields: list of options */
    options?: { value: string; label: string }[];
}

export interface FreeformWidgetMeta {
    type: string;
    label: string;
    icon: LucideIcon;
    description: string;
    minWidth: number;
    minHeight: number;
    defaultWidth: number;
    defaultHeight: number;
    allowMultiple: boolean;
    configFields?: ConfigField[];
}

export interface FreeformWidgetProps {
    config: Record<string, unknown>;
    width: number;
    height: number;
    todayUtc: Date;
}

export interface FreeformWidgetRegistration {
    meta: FreeformWidgetMeta;
    component: React.ComponentType<FreeformWidgetProps>;
}

// ── Layout persistence (mirrors InstantDB record shapes) ──────────────
export interface DashboardLayoutRecord {
    id: string;
    breakpointKey: string;
    label: string;
    minWidth: number;
    maxWidth: number;
    isDefault: boolean;
    order: number;
    createdAt: string;
    updatedAt: string;
    widgets?: DashboardWidgetRecord[];
}

export interface DashboardWidgetRecord {
    id: string;
    widgetType: string;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
    config?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

// ── Edit mode ─────────────────────────────────────────────────────────
export type ResizeHandle =
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
