import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __setDiagnosticsStoreFactoryForTests,
    clearDiagnosticsTimeline,
    getDiagnosticsTimeline,
    recordDiagnostic,
    subscribeDiagnosticsTimeline,
} from '../../../mobile/src/lib/diagnostics.js';

describe('mobile diagnostics timeline', () => {
    beforeEach(() => {
        const backing = new Map<string, string>();
        __setDiagnosticsStoreFactoryForTests(() => ({
            getString(key: string) {
                return backing.has(key) ? backing.get(key)! : null;
            },
            set(key: string, value: string) {
                backing.set(key, value);
            },
            delete(key: string) {
                backing.delete(key);
            },
        }));
        clearDiagnosticsTimeline();
    });

    it('records and clears structured events', () => {
        recordDiagnostic('bootstrap_config', 'start', { hasCachedConfig: true });
        recordDiagnostic('principal_restore', 'success', { source: 'cached_member' });

        const events = getDiagnosticsTimeline();
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe('bootstrap_config');
        expect(events[1].details).toEqual({ source: 'cached_member' });

        clearDiagnosticsTimeline();
        expect(getDiagnosticsTimeline()).toEqual([]);
    });

    it('notifies subscribers when the timeline changes', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeDiagnosticsTimeline(listener);

        recordDiagnostic('family_roster', 'hydrated', { count: 4 });
        expect(listener).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'family_roster',
                    phase: 'hydrated',
                }),
            ]),
        );

        unsubscribe();
    });
});
