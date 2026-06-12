import type { FreeformWidgetMeta } from './types';
import { getFreeformWidgetMeta } from './freeform-widget-registry';

export interface WidgetPlacement {
    widgetType: string;
    x: number;
    y: number;
    w: number;
    h: number;
    z: number;
    config?: Record<string, unknown>;
}

const GAP = 12;

function clampToMin(value: number, meta: FreeformWidgetMeta | undefined, dim: 'w' | 'h'): number {
    if (!meta) return value;
    return Math.max(value, dim === 'w' ? meta.minWidth : meta.minHeight);
}

/**
 * Generate a default widget layout for a given breakpoint.
 */
export function generateDefaultLayout(
    breakpointKey: string,
    canvasWidth: number,
    familyMemberIds: string[]
): WidgetPlacement[] {
    const placements: WidgetPlacement[] = [];
    let z = 0;

    const pulseMeta = getFreeformWidgetMeta('pulse-stats-bar');
    const matrixMeta = getFreeformWidgetMeta('chore-matrix');
    const calendarMeta = getFreeformWidgetMeta('four-day-calendar');
    const personMeta = getFreeformWidgetMeta('person-card');
    const agendaMeta = getFreeformWidgetMeta('family-agenda');
    const chatMeta = getFreeformWidgetMeta('family-chat');

    if (breakpointKey === 'phone-portrait') {
        // Single column stacked layout
        const colWidth = canvasWidth - GAP * 2;
        let y = GAP;

        // Pulse bar
        placements.push({
            widgetType: 'pulse-stats-bar',
            x: GAP, y, w: colWidth, h: clampToMin(48, pulseMeta, 'h'), z: z++,
        });
        y += 48 + GAP;

        // Person cards: 2 per row
        const personW = Math.floor((colWidth - GAP) / 2);
        const personH = clampToMin(220, personMeta, 'h');
        for (let i = 0; i < familyMemberIds.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            placements.push({
                widgetType: 'person-card',
                x: GAP + col * (personW + GAP),
                y: y + row * (personH + GAP),
                w: personW,
                h: personH,
                z: z++,
                config: { memberId: familyMemberIds[i] },
            });
        }
        const personRows = Math.ceil(familyMemberIds.length / 2);
        y += personRows * (personH + GAP);

        // Chore matrix
        const matrixH = clampToMin(250, matrixMeta, 'h');
        placements.push({
            widgetType: 'chore-matrix',
            x: GAP, y, w: colWidth, h: matrixH, z: z++,
        });
        y += matrixH + GAP;

        // Agenda
        const agendaH = clampToMin(200, agendaMeta, 'h');
        placements.push({
            widgetType: 'family-agenda',
            x: GAP, y, w: colWidth, h: agendaH, z: z++,
        });
        y += agendaH + GAP;

        // Chat
        const chatH = clampToMin(200, chatMeta, 'h');
        placements.push({
            widgetType: 'family-chat',
            x: GAP, y, w: colWidth, h: chatH, z: z++,
        });

        return placements;
    }

    if (breakpointKey === 'tablet-portrait' || breakpointKey === 'tablet-landscape') {
        // Two-column layout
        const colWidth = Math.floor((canvasWidth - GAP * 3) / 2);
        let y = GAP;

        // Pulse bar (full width)
        placements.push({
            widgetType: 'pulse-stats-bar',
            x: GAP, y, w: canvasWidth - GAP * 2, h: 48, z: z++,
        });
        y += 48 + GAP;

        // Chore matrix (full width)
        const matrixH = 280;
        placements.push({
            widgetType: 'chore-matrix',
            x: GAP, y, w: canvasWidth - GAP * 2, h: matrixH, z: z++,
        });
        y += matrixH + GAP;

        // Person cards in a row
        const personW = Math.min(180, Math.floor((canvasWidth - GAP * (familyMemberIds.length + 1)) / familyMemberIds.length));
        const personH = clampToMin(220, personMeta, 'h');
        for (let i = 0; i < familyMemberIds.length; i++) {
            placements.push({
                widgetType: 'person-card',
                x: GAP + i * (personW + GAP),
                y,
                w: personW,
                h: personH,
                z: z++,
                config: { memberId: familyMemberIds[i] },
            });
        }
        y += personH + GAP;

        // Agenda (left) + Chat (right)
        const bottomH = 250;
        placements.push({
            widgetType: 'family-agenda',
            x: GAP, y, w: colWidth, h: bottomH, z: z++,
        });
        placements.push({
            widgetType: 'family-chat',
            x: GAP * 2 + colWidth, y, w: colWidth, h: bottomH, z: z++,
        });

        return placements;
    }

    // Desktop (small and large)
    const isLarge = breakpointKey === 'desktop-large';
    let y = GAP;

    // Row 0: Pulse stats bar (full width)
    placements.push({
        widgetType: 'pulse-stats-bar',
        x: GAP, y, w: canvasWidth - GAP * 2, h: 48, z: z++,
    });
    y += 48 + GAP;

    // Row 1: Chore matrix (60%) + 4-day calendar (40%)
    const matrixW = Math.floor((canvasWidth - GAP * 3) * 0.6);
    const calW = canvasWidth - GAP * 3 - matrixW;
    const row1H = isLarge ? 350 : 300;
    placements.push({
        widgetType: 'chore-matrix',
        x: GAP, y, w: matrixW, h: row1H, z: z++,
    });
    placements.push({
        widgetType: 'four-day-calendar',
        x: GAP * 2 + matrixW, y, w: calW, h: row1H, z: z++,
    });
    y += row1H + GAP;

    // Row 2: Person cards in a row
    const maxPersonW = 180;
    const personW = Math.min(maxPersonW, Math.floor((canvasWidth - GAP * (familyMemberIds.length + 1)) / familyMemberIds.length));
    const personH = clampToMin(220, personMeta, 'h');
    for (let i = 0; i < familyMemberIds.length; i++) {
        placements.push({
            widgetType: 'person-card',
            x: GAP + i * (personW + GAP),
            y,
            w: personW,
            h: personH,
            z: z++,
            config: { memberId: familyMemberIds[i] },
        });
    }
    y += personH + GAP;

    // Row 3: Agenda (left half) + Chat (right half)
    const halfW = Math.floor((canvasWidth - GAP * 3) / 2);
    const bottomH = isLarge ? 300 : 250;
    placements.push({
        widgetType: 'family-agenda',
        x: GAP, y, w: halfW, h: bottomH, z: z++,
    });
    placements.push({
        widgetType: 'family-chat',
        x: GAP * 2 + halfW, y, w: halfW, h: bottomH, z: z++,
    });

    return placements;
}
