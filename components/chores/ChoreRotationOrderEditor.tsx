import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ChoreRotationOrderEditorProps {
    assignees: string[];
    isUpForGrabs: boolean;
    useRotation: boolean;
    setUseRotation: (v: boolean) => void;
    rotationType: 'none' | 'daily' | 'weekly' | 'monthly';
    setRotationType: (v: 'daily' | 'weekly' | 'monthly') => void;
    rotationOrder: string[];
    onMoveUp: (index: number) => void;
    onMoveDown: (index: number) => void;
    familyMembers: { id: string; name?: string | null }[];
}

export function ChoreRotationOrderEditor({
    assignees,
    isUpForGrabs,
    useRotation,
    setUseRotation,
    rotationType,
    setRotationType,
    rotationOrder,
    onMoveUp,
    onMoveDown,
    familyMembers,
}: ChoreRotationOrderEditorProps) {
    if (assignees.length <= 1 || isUpForGrabs) return null;

    return (
        <div className="space-y-3 border-t pt-3">
            <div className="flex items-center space-x-2">
                <Switch id="useRotation" checked={useRotation} onCheckedChange={setUseRotation} />
                <Label htmlFor="useRotation">Rotate between selected assignees</Label>
            </div>

            {useRotation && (
                <div className="space-y-4 pl-4">
                    <div className="space-y-2">
                        <Label className="font-semibold">Rotation Frequency:</Label>
                        <RadioGroup
                            value={rotationType === 'none' ? 'daily' : rotationType}
                            onValueChange={(v) => setRotationType(v as 'daily' | 'weekly' | 'monthly')}
                        >
                            {[
                                { value: 'daily', label: 'Rotate Each Scheduled Day' },
                                { value: 'weekly', label: 'Rotate Weekly' },
                                { value: 'monthly', label: 'Rotate Monthly' },
                            ].map(({ value, label }) => (
                                <div key={value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={value} id={`rotate-${value}`} />
                                    <Label htmlFor={`rotate-${value}`}>{label}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    {rotationOrder.length > 0 && (
                        <div className="space-y-2">
                            <Label className="mb-1 block font-semibold">Rotation Order:</Label>
                            <div className="max-h-40 space-y-1 overflow-y-auto rounded border bg-background p-2">
                                {rotationOrder.map((memberId, index) => {
                                    const member = familyMembers.find((m) => m.id === memberId);
                                    return (
                                        <div key={memberId} className="flex items-center justify-between rounded p-1 hover:bg-muted">
                                            <span className="text-sm">
                                                {index + 1}. {member?.name || 'Unknown Member'}
                                            </span>
                                            <div className="flex space-x-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => onMoveUp(index)}
                                                    disabled={index === 0}
                                                    aria-label={`Move ${member?.name} up`}
                                                >
                                                    <ChevronUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5"
                                                    onClick={() => onMoveDown(index)}
                                                    disabled={index === rotationOrder.length - 1}
                                                    aria-label={`Move ${member?.name} down`}
                                                >
                                                    <ChevronDown className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
