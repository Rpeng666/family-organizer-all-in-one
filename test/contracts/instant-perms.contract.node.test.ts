import fs from 'fs/promises';
import path from 'path';
import { describe, expect, it } from 'vitest';
import rules from '@/instant.perms';

function parseSchemaEntityNames(source: string) {
    return Array.from(source.matchAll(/^\s+([A-Za-z0-9_$]+):\s*i\.entity\(/gm)).map((match) => match[1]).sort();
}

describe('instant.perms contract', () => {
    it('explicitly covers all schema entities plus core permission sections', async () => {
        const schemaSource = await fs.readFile(path.join(process.cwd(), 'instant.schema.ts'), 'utf8');
        const entityNames = parseSchemaEntityNames(schemaSource);
        const topLevelRuleKeys = Object.keys(rules as any);

        expect(topLevelRuleKeys).toEqual(expect.arrayContaining(['$default', '$users', '$files', 'attrs']));
        for (const entityName of entityNames) {
            expect(topLevelRuleKeys, `missing rule for entity ${entityName}`).toContain(entityName);
        }
    });

    it('keeps the deny-by-default + attrs lock-down safety net in place', () => {
        const perms = rules as any;
        expect(perms.$default.allow.view).toContain("auth.ref('$user.type')");
        expect(perms.$default.allow.create).toBe('false');
        expect(perms.$default.allow.update).toBe('false');
        expect(perms.$default.allow.delete).toBe('false');
        expect(perms.attrs.allow.create).toBe('false');
    });

    it('requires trusted createdBy audit stamping for allowance transaction creation', () => {
        const perms = rules as any;
        expect(perms.allowanceTransactions.bind.auditMatchesPrincipal).toBe('data.createdBy == auth.id');
        expect(perms.allowanceTransactions.allow.create).toContain('auditMatchesPrincipal');
        expect(perms.allowanceTransactions.allow.update).toBe('false');
    });

    it('protects family member PIN hashes from the kid principal for parent rows', () => {
        const perms = rules as any;
        expect(perms.familyMembers.fields.pinHash).toContain("data.role != 'parent'");
    });

    it('lets family principals link chore completions without opening broader chore writes', () => {
        const perms = rules as any;
        expect(perms.chores.allow.create).toBe('isParent');
        expect(perms.chores.allow.update).toBe('isParent');
        expect(perms.chores.allow.delete).toBe('isParent');
        expect(perms.chores.allow.link.completions).toBe('isFamilyPrincipal');
        expect(perms.chores.allow.link.$default).toBe('isParent');
        expect(perms.chores.allow.unlink.$default).toBe('isParent');
    });
});
