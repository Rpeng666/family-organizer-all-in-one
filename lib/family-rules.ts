import { id } from '@instantdb/react';

/**
 * Build transactions to create a new version of a family rule.
 * Creates an immutable version record, links it to the previous version,
 * and updates the rule's activeVersionId pointer.
 */
export function buildCreateVersionTransactions(
    ruleId: string,
    currentActiveVersionId: string | null,
    richTextContent: string,
    editNote: string | undefined,
    versionNumber: number,
    createdByFamilyMemberId: string | undefined,
    attachmentIds: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
): { versionId: string; transactions: any[] } {
    const versionId = id();
    const now = new Date().toISOString();
    const txs: any[] = [];

    // Create the new version and link to rule + previous version
    const links: Record<string, unknown> = { rule: ruleId };
    if (currentActiveVersionId) {
        links.previousVersion = currentActiveVersionId;
    }

    txs.push(
        tx.familyRuleVersions[versionId]
            .create({
                richTextContent,
                versionNumber,
                editNote: editNote ?? '',
                createdByFamilyMemberId: createdByFamilyMemberId ?? '',
                createdAt: now,
            })
            .link(links),
    );

    // Update the rule to point to the new version
    txs.push(
        tx.familyRules[ruleId].update({
            activeVersionId: versionId,
            updatedAt: now,
        }),
    );

    // Link attachments to the new version
    for (const attId of attachmentIds) {
        txs.push(
            tx.contentAttachments[attId].link({
                familyRuleVersion: versionId,
            }),
        );
    }

    return { versionId, transactions: txs };
}

/**
 * Get the next version number for a rule based on existing versions.
 */
export function getNextVersionNumber(versions: any[]): number {
    if (versions.length === 0) return 1;
    return (
        Math.max(...versions.map((v: any) => v.versionNumber ?? 0)) + 1
    );
}

/**
 * Get versions sorted by version number descending (newest first).
 */
export function getSortedVersions(versions: any[]): any[] {
    return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
}

/**
 * Get active (non-archived) rules sorted by sortOrder.
 */
export function getActiveRules(rules: any[]): any[] {
    return rules
        .filter((r) => !r.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get the next sort order for a new rule.
 */
export function getNextRuleSortOrder(rules: any[]): number {
    const maxOrder = rules.reduce(
        (max: number, rule: any) => Math.max(max, rule.sortOrder ?? 0),
        0,
    );
    return maxOrder + 1;
}
