'use client';

import React, { useMemo, useState } from 'react';
import { id } from '@instantdb/react';
import {
    Plus,
    Pencil,
    Trash2,
    History,
    GripVertical,
    Scale,
} from 'lucide-react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/responses/RichTextEditor';
import { FamilyRuleEditor } from '@/components/content/FamilyRuleEditor';
import { FamilyRuleHistoryDialog } from '@/components/content/FamilyRuleHistoryDialog';
import {
    getActiveRules,
    getNextRuleSortOrder,
    buildCreateVersionTransactions,
} from '@/lib/family-rules';

export function FamilyRulesManager() {
    const { data } = db.useQuery({
        familyRules: {
            $: { order: { sortOrder: 'asc' } },
            versions: {
                attachments: {},
            },
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

    const [newRuleOpen, setNewRuleOpen] = useState(false);
    const [newRuleTitle, setNewRuleTitle] = useState('');
    const [newRuleContent, setNewRuleContent] = useState('');
    const [editRule, setEditRule] = useState<any>(null);
    const [historyRule, setHistoryRule] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    function openNewRule() {
        setNewRuleTitle('');
        setNewRuleContent('');
        setNewRuleOpen(true);
    }

    function handleCreateRule() {
        if (!newRuleTitle.trim() || !newRuleContent.trim()) return;
        setSaving(true);

        const ruleId = id();
        const now = new Date().toISOString();
        const sortOrder = getNextRuleSortOrder(allRules);

        const { versionId, transactions } = buildCreateVersionTransactions(
            ruleId,
            null,
            newRuleContent,
            'Initial version',
            1,
            undefined,
            [],
            db.tx as any,
        );

        // Create the rule first, then the version
        db.transact([
            db.tx.familyRules[ruleId].create({
                title: newRuleTitle.trim(),
                sortOrder,
                activeVersionId: versionId,
                isArchived: false,
                createdAt: now,
                updatedAt: now,
            }),
            ...transactions,
        ]);

        setSaving(false);
        setNewRuleOpen(false);
    }

    function archiveRule(ruleId: string) {
        db.transact(
            db.tx.familyRules[ruleId].update({
                isArchived: true,
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    function updateRuleTitle(ruleId: string, title: string) {
        db.transact(
            db.tx.familyRules[ruleId].update({
                title,
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Family Rules</h2>
                <Button onClick={openNewRule} size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    New Rule
                </Button>
            </div>

            {activeRules.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No family rules defined yet. Create rules to display on the
                    dashboard.
                </div>
            )}

            <div className="space-y-2">
                {activeRules.map((rule, idx) => {
                    const activeVersion = (rule.versions ?? []).find(
                        (v: any) => v.id === rule.activeVersionId,
                    );

                    return (
                        <div
                            key={rule.id}
                            className="rounded-lg border border-slate-200 bg-white p-4"
                        >
                            <div className="flex items-start gap-3">
                                <GripVertical className="h-4 w-4 text-slate-300 mt-1 flex-shrink-0" />
                                <Scale className="h-4 w-4 text-indigo-500 mt-1 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="font-medium text-slate-900">
                                            {idx + 1}. {rule.title}
                                        </h3>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    setHistoryRule(rule)
                                                }
                                                title="Version history"
                                            >
                                                <History className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    setEditRule(rule)
                                                }
                                                title="Edit rule"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-700"
                                                onClick={() =>
                                                    archiveRule(rule.id)
                                                }
                                                title="Archive rule"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                    {activeVersion?.richTextContent && (
                                        <div
                                            className="prose prose-sm max-w-none text-slate-600"
                                            dangerouslySetInnerHTML={{
                                                __html: activeVersion.richTextContent,
                                            }}
                                        />
                                    )}
                                    {activeVersion && (
                                        <p className="text-xs text-slate-400 mt-1">
                                            v{activeVersion.versionNumber}{' '}
                                            &middot;{' '}
                                            {new Date(
                                                activeVersion.createdAt,
                                            ).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* New rule dialog */}
            <Dialog open={newRuleOpen} onOpenChange={setNewRuleOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>New Family Rule</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-title">Rule Title</Label>
                            <Input
                                id="rule-title"
                                value={newRuleTitle}
                                onChange={(e) =>
                                    setNewRuleTitle(e.target.value)
                                }
                                placeholder="e.g., Screen Time Policy"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Rule Content</Label>
                            <RichTextEditor
                                content={newRuleContent}
                                onContentChange={setNewRuleContent}
                                placeholder="Define the family rule..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setNewRuleOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateRule}
                            disabled={
                                !newRuleTitle.trim() ||
                                !newRuleContent.trim() ||
                                saving
                            }
                        >
                            {saving ? 'Creating...' : 'Create Rule'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit rule dialog */}
            {editRule && (
                <FamilyRuleEditor
                    open={!!editRule}
                    onOpenChange={(open) => !open && setEditRule(null)}
                    rule={editRule}
                />
            )}

            {/* History dialog */}
            {historyRule && (
                <FamilyRuleHistoryDialog
                    open={!!historyRule}
                    onOpenChange={(open) => !open && setHistoryRule(null)}
                    rule={historyRule}
                />
            )}
        </div>
    );
}
