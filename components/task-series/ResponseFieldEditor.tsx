'use client';

import React, { useState } from 'react';
import { id as generateId, tx } from '@instantdb/react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { RESPONSE_FIELD_TYPES, RESPONSE_FIELD_TYPE_LABELS, type TaskResponseFieldType } from '@/lib/task-response-types';

interface ResponseField {
    id: string;
    type: string;
    label: string;
    description?: string | null;
    weight: number;
    required: boolean;
    order: number;
}

interface ResponseFieldEditorProps {
    taskId: string;
    responseFields: ResponseField[];
}

function AddResponseFieldForm({ taskId, nextOrder, onDone }: { taskId: string; nextOrder: number; onDone: () => void }) {
    const [fieldType, setFieldType] = useState<TaskResponseFieldType>('rich_text');
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [weight, setWeight] = useState(0);
    const [required, setRequired] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const handleAdd = () => {
        const trimmedLabel = label.trim() || RESPONSE_FIELD_TYPE_LABELS[fieldType];
        const fieldId = generateId();
        const now = Date.now();

        db.transact([
            tx.taskResponseFields[fieldId].update({
                type: fieldType,
                label: trimmedLabel,
                description: description.trim() || null,
                weight,
                required,
                order: nextOrder,
                createdAt: now,
                updatedAt: now,
            }),
            tx.taskResponseFields[fieldId].link({ task: taskId }),
        ]);

        onDone();
    };

    return (
        <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 space-y-3">
            <div className="space-y-2">
                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Type</label>
                    <select
                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={fieldType}
                        onChange={(e) => {
                            const newType = e.target.value as TaskResponseFieldType;
                            setFieldType(newType);
                            if (!label.trim()) setLabel('');
                        }}
                    >
                        {RESPONSE_FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {RESPONSE_FIELD_TYPE_LABELS[t]}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Label</label>
                    <input
                        type="text"
                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        placeholder={RESPONSE_FIELD_TYPE_LABELS[fieldType]}
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                </div>

                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Description (optional)</label>
                    <textarea
                        className="mt-0.5 w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 resize-y min-h-[60px]"
                        placeholder="Instructions shown to the child..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-sm">
                        <input
                            type="checkbox"
                            checked={required}
                            onChange={(e) => setRequired(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <span className="text-xs text-gray-600">Required</span>
                    </label>
                </div>

                <button
                    type="button"
                    className="text-[10px] text-purple-600 hover:text-purple-700 font-medium"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                </button>

                {showAdvanced && (
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Weight (for individual grading)</label>
                        <input
                            type="number"
                            min={0}
                            className="mt-0.5 w-20 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                            value={weight}
                            onChange={(e) => setWeight(Math.max(0, Number(e.target.value) || 0))}
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5">If 0, the entire task response is graded together.</p>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="button" size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={handleAdd}>
                    Add Field
                </Button>
            </div>
        </div>
    );
}

function ResponseFieldRow({ field, onDelete }: { field: ResponseField; onDelete: () => void }) {
    return (
        <div className="group flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs">
            <GripVertical className="h-3 w-3 text-gray-300 flex-shrink-0" />
            <span className={cn(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
                'bg-purple-100 text-purple-700'
            )}>
                {RESPONSE_FIELD_TYPE_LABELS[field.type as TaskResponseFieldType] ?? field.type}
            </span>
            <span className="flex-1 min-w-0 truncate text-gray-700 font-medium">{field.label}</span>
            {field.required && (
                <span className="text-[10px] text-red-500 font-medium">req</span>
            )}
            {field.weight > 0 && (
                <span className="text-[10px] text-gray-400">w:{field.weight}</span>
            )}
            <button
                type="button"
                onClick={onDelete}
                className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            >
                <Trash2 className="h-3 w-3" />
            </button>
        </div>
    );
}

export function ResponseFieldEditor({ taskId, responseFields }: ResponseFieldEditorProps) {
    const [isAdding, setIsAdding] = useState(false);

    const sortedFields = [...responseFields].sort((a, b) => a.order - b.order);

    const handleDelete = (fieldId: string) => {
        if (!confirm('Remove this response field?')) return;
        db.transact(tx.taskResponseFields[fieldId].delete());
    };

    const nextOrder = sortedFields.length > 0 ? Math.max(...sortedFields.map((f) => f.order)) + 1 : 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700">Response Fields</label>
                {!isAdding && (
                    <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-700 bg-purple-50 px-2 py-1 rounded transition-colors"
                    >
                        <Plus className="h-3 w-3" />
                        <span>Add Field</span>
                    </button>
                )}
            </div>

            {sortedFields.length === 0 && !isAdding && (
                <div className="text-xs text-gray-400 italic py-2 text-center border border-dashed rounded">
                    No response fields — child completes this task normally
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                {sortedFields.map((field) => (
                    <ResponseFieldRow key={field.id} field={field} onDelete={() => handleDelete(field.id)} />
                ))}
            </div>

            {isAdding && (
                <AddResponseFieldForm taskId={taskId} nextOrder={nextOrder} onDone={() => setIsAdding(false)} />
            )}
        </div>
    );
}
