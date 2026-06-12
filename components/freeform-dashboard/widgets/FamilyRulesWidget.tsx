'use client';

import React, { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { db } from '@/lib/db';
import { registerFreeformWidget } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetProps } from '@/lib/freeform-dashboard/types';
import { useWidgetScale } from '@/lib/freeform-dashboard/widget-scale';
import { getActiveRules } from '@/lib/family-rules';

function FamilyRulesWidget({ width, height, todayUtc }: FreeformWidgetProps) {
    const { s, sv } = useWidgetScale();

    const { data } = db.useQuery({
        familyRules: {
            $: { order: { sortOrder: 'asc' } },
            versions: {},
        },
    });

    const allRules = useMemo(
        () => (data?.familyRules ?? []) as any[],
        [data?.familyRules],
    );
    const activeRules = useMemo(
        () => getActiveRules(allRules),
        [allRules],
    );

    if (activeRules.length === 0) {
        return (
            <div
                className="flex h-full items-center justify-center"
                style={{ fontSize: sv(13), padding: s(16), color: 'var(--fd-ink-faint)' }}
            >
                No family rules defined
            </div>
        );
    }

    return (
        <div
            className="flex h-full flex-col overflow-hidden"
            style={{ padding: s(16) }}
        >
            <div
                className="font-semibold uppercase tracking-wider flex items-center"
                style={{
                    fontSize: sv(11),
                    marginBottom: s(12),
                    gap: s(6),
                    color: 'var(--fd-ink-faint)',
                }}
            >
                <Scale
                    className="text-indigo-400"
                    style={{ width: sv(13), height: sv(13) }}
                />
                Family Rules
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
                <ol
                    className="list-none"
                    style={{
                        counterReset: 'rule',
                    }}
                >
                    {activeRules.map((rule) => {
                        const activeVersion = (rule.versions ?? []).find(
                            (v: any) => v.id === rule.activeVersionId,
                        );

                        return (
                            <li
                                key={rule.id}
                                className="flex"
                                style={{
                                    gap: s(10),
                                    paddingTop: s(8),
                                    paddingBottom: s(8),
                                    borderBottom: '1px solid var(--fd-line-subtle)',
                                }}
                            >
                                <span
                                    className="font-bold text-indigo-400 flex-shrink-0"
                                    style={{
                                        fontSize: sv(14),
                                        width: sv(20),
                                        textAlign: 'right',
                                    }}
                                >
                                    {rule.sortOrder}.
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div
                                        className="font-medium"
                                        style={{
                                            fontSize: sv(14),
                                            marginBottom: s(2),
                                            color: 'var(--fd-ink)',
                                        }}
                                    >
                                        {rule.title}
                                    </div>
                                    {activeVersion?.richTextContent && (
                                        <div
                                            className="prose prose-sm max-w-none"
                                            style={{ fontSize: sv(12), color: 'var(--fd-ink-muted)' }}
                                            dangerouslySetInnerHTML={{
                                                __html: activeVersion.richTextContent,
                                            }}
                                        />
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </div>
    );
}

registerFreeformWidget({
    meta: {
        type: 'family-rules',
        label: 'Family Rules',
        icon: Scale,
        description:
            'Displays the current family rules with their active versions',
        minWidth: 200,
        minHeight: 120,
        defaultWidth: 350,
        defaultHeight: 400,
        allowMultiple: false,
    },
    component: FamilyRulesWidget,
});

export default FamilyRulesWidget;
