import { describe, expect, it } from 'vitest';
import { isEffectiveParentMode, isParentPrincipal } from '@/lib/parent-mode';

describe('parent mode helpers', () => {
    it('requires both a selected parent user and the parent DB principal', () => {
        expect(isParentPrincipal('parent')).toBe(true);
        expect(isParentPrincipal('kid')).toBe(false);

        expect(isEffectiveParentMode('parent', 'parent')).toBe(true);
        expect(isEffectiveParentMode('parent', 'kid')).toBe(false);
        expect(isEffectiveParentMode('child', 'parent')).toBe(false);
        expect(isEffectiveParentMode(undefined, 'parent')).toBe(false);
    });
});
