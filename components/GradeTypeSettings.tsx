'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { id as generateId, tx } from '@instantdb/react';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { GRADE_TYPE_KINDS, type GradeTypeKind, type LetterGradeStep } from '@/lib/task-response-types';
import { US_LETTER_GRADE_STEPS } from '@/lib/grade-utils';

type GradeTypeRecord = {
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
};

const KIND_LABELS: Record<GradeTypeKind, string> = {
    number: 'Number',
    letter: 'Letter',
    stars: 'Stars',
    freeform: 'Freeform',
};

const KIND_PRESETS: Record<GradeTypeKind, { highValue: number; lowValue: number; highLabel: string; lowLabel: string; name: string }> = {
    number: { highValue: 100, lowValue: 0, highLabel: '100', lowLabel: '0', name: 'Percentage' },
    letter: { highValue: 100, lowValue: 0, highLabel: 'A+', lowLabel: 'F', name: 'Letter Grade' },
    stars: { highValue: 5, lowValue: 0, highLabel: '5 Stars', lowLabel: '0 Stars', name: '5-Star Rating' },
    freeform: { highValue: 0, lowValue: 0, highLabel: '', lowLabel: '', name: 'Freeform Comment' },
};

function GradeTypeForm({
    initial,
    onSave,
    onCancel,
}: {
    initial?: GradeTypeRecord;
    onSave: (data: Omit<GradeTypeRecord, 'id' | 'order' | 'isDefault'>) => void;
    onCancel: () => void;
}) {
    const [kind, setKind] = useState<GradeTypeKind>((initial?.kind as GradeTypeKind) || 'number');
    const preset = KIND_PRESETS[kind];
    const [name, setName] = useState(initial?.name || preset.name);
    const [highValue, setHighValue] = useState(initial?.highValue ?? preset.highValue);
    const [lowValue, setLowValue] = useState(initial?.lowValue ?? preset.lowValue);
    const [highLabel, setHighLabel] = useState(initial?.highLabel || preset.highLabel);
    const [lowLabel, setLowLabel] = useState(initial?.lowLabel || preset.lowLabel);
    const [steps, setSteps] = useState<LetterGradeStep[]>(
        (initial?.steps as LetterGradeStep[]) || (kind === 'letter' ? US_LETTER_GRADE_STEPS : [])
    );

    const handleKindChange = (newKind: GradeTypeKind) => {
        setKind(newKind);
        if (!initial) {
            const p = KIND_PRESETS[newKind];
            setName(p.name);
            setHighValue(p.highValue);
            setLowValue(p.lowValue);
            setHighLabel(p.highLabel);
            setLowLabel(p.lowLabel);
            setSteps(newKind === 'letter' ? US_LETTER_GRADE_STEPS : []);
        }
    };

    return (
        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-600">Kind</label>
                    <select
                        className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                        value={kind}
                        onChange={(e) => handleKindChange(e.target.value as GradeTypeKind)}
                    >
                        {GRADE_TYPE_KINDS.map((k) => (
                            <option key={k} value={k}>{KIND_LABELS[k]}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-600">Name</label>
                    <input
                        type="text"
                        className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-600">High Value</label>
                    <input type="number" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={highValue} onChange={(e) => setHighValue(Number(e.target.value))} />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-600">Low Value</label>
                    <input type="number" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={lowValue} onChange={(e) => setLowValue(Number(e.target.value))} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-600">High Label</label>
                    <input type="text" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={highLabel} onChange={(e) => setHighLabel(e.target.value)} />
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-600">Low Label</label>
                    <input type="text" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" value={lowLabel} onChange={(e) => setLowLabel(e.target.value)} />
                </div>
            </div>

            {kind === 'letter' && (
                <div>
                    <label className="text-xs font-medium text-gray-600">Letter Steps</label>
                    <div className="mt-1 max-h-40 overflow-y-auto rounded border bg-white p-2 space-y-1">
                        {steps.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                                <input
                                    type="text"
                                    className="w-12 rounded border px-1 py-0.5 text-center"
                                    value={step.label}
                                    onChange={(e) => {
                                        const updated = [...steps];
                                        updated[idx] = { ...step, label: e.target.value };
                                        setSteps(updated);
                                    }}
                                />
                                <span className="text-gray-400">=</span>
                                <input
                                    type="number"
                                    className="w-16 rounded border px-1 py-0.5"
                                    value={step.value}
                                    onChange={(e) => {
                                        const updated = [...steps];
                                        updated[idx] = { ...step, value: Number(e.target.value) };
                                        setSteps(updated);
                                    }}
                                />
                                <button
                                    type="button"
                                    className="text-gray-300 hover:text-red-500"
                                    onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                            onClick={() => setSteps([...steps, { label: '', value: 0 }])}
                        >
                            + Add step
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                <Button
                    size="sm"
                    onClick={() =>
                        onSave({
                            name: name.trim() || preset.name,
                            kind,
                            highValue,
                            lowValue,
                            highLabel: highLabel.trim() || preset.highLabel,
                            lowLabel: lowLabel.trim() || preset.lowLabel,
                            steps: kind === 'letter' ? steps : null,
                        })
                    }
                >
                    {initial ? 'Save Changes' : 'Create Grade Type'}
                </Button>
            </div>
        </div>
    );
}

export default function GradeTypeSettings() {
    const { data, isLoading } = db.useQuery({ gradeTypes: { $: { order: { createdAt: 'asc' } } } });
    const gradeTypes = (data?.gradeTypes as GradeTypeRecord[] | undefined) || [];

    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleCreate = (formData: Omit<GradeTypeRecord, 'id' | 'order' | 'isDefault'>) => {
        const newId = generateId();
        const now = Date.now();
        const isFirst = gradeTypes.length === 0;

        db.transact([
            tx.gradeTypes[newId].update({
                ...formData,
                isDefault: isFirst,
                order: gradeTypes.length,
                createdAt: now,
                updatedAt: now,
            }),
        ]);
        setIsCreating(false);
    };

    const handleUpdate = (gradeTypeId: string, formData: Omit<GradeTypeRecord, 'id' | 'order' | 'isDefault'>) => {
        db.transact([
            tx.gradeTypes[gradeTypeId].update({
                ...formData,
                updatedAt: Date.now(),
            }),
        ]);
        setEditingId(null);
    };

    const handleSetDefault = (gradeTypeId: string) => {
        const txns = gradeTypes
            .filter((gt) => gt.isDefault && gt.id !== gradeTypeId)
            .map((gt) => tx.gradeTypes[gt.id].update({ isDefault: false, updatedAt: Date.now() }));

        txns.push(tx.gradeTypes[gradeTypeId].update({ isDefault: true, updatedAt: Date.now() }));
        db.transact(txns);
    };

    const handleDelete = (gradeTypeId: string) => {
        if (!confirm('Delete this grade type? Existing grades using it will keep their values.')) return;
        const gt = gradeTypes.find((g) => g.id === gradeTypeId);
        db.transact([tx.gradeTypes[gradeTypeId].delete()]);

        // If we deleted the default, promote the first remaining one
        if (gt?.isDefault) {
            const remaining = gradeTypes.filter((g) => g.id !== gradeTypeId);
            if (remaining.length > 0) {
                db.transact([tx.gradeTypes[remaining[0].id].update({ isDefault: true, updatedAt: Date.now() })]);
            }
        }
    };

    if (isLoading) {
        return (
            <Card>
                <CardHeader><CardTitle>Grade Types</CardTitle></CardHeader>
                <CardContent><p className="text-sm text-muted-foreground">Loading...</p></CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Grade Types</CardTitle>
                    {!isCreating && (
                        <Button variant="outline" size="sm" onClick={() => setIsCreating(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Grade Type
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {gradeTypes.length === 0 && !isCreating && (
                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                        No grade types yet. A default will be created automatically when you add your first response field to a task.
                    </p>
                )}

                {gradeTypes.map((gt) =>
                    editingId === gt.id ? (
                        <GradeTypeForm
                            key={gt.id}
                            initial={gt}
                            onSave={(data) => handleUpdate(gt.id, data)}
                            onCancel={() => setEditingId(null)}
                        />
                    ) : (
                        <div key={gt.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{gt.name}</span>
                                    <span className={cn(
                                        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                                        gt.kind === 'number' && 'bg-blue-100 text-blue-700',
                                        gt.kind === 'letter' && 'bg-green-100 text-green-700',
                                        gt.kind === 'stars' && 'bg-amber-100 text-amber-700',
                                    )}>
                                        {gt.kind === 'stars' && <Star className="h-2.5 w-2.5 mr-0.5 fill-current" />}
                                        {KIND_LABELS[gt.kind as GradeTypeKind] ?? gt.kind}
                                    </span>
                                    {gt.isDefault && (
                                        <span className="rounded bg-purple-100 text-purple-700 px-1.5 py-0.5 text-[10px] font-semibold">
                                            Default
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                    {gt.lowLabel} – {gt.highLabel}
                                    {gt.kind === 'letter' && gt.steps ? ` (${(gt.steps as LetterGradeStep[]).length} steps)` : ''}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {!gt.isDefault && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleSetDefault(gt.id)}>
                                        Set Default
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(gt.id)}>
                                    <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={() => handleDelete(gt.id)}>
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                    )
                )}

                {isCreating && (
                    <GradeTypeForm onSave={handleCreate} onCancel={() => setIsCreating(false)} />
                )}
            </CardContent>
        </Card>
    );
}
