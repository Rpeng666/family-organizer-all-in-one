// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const familyMemberMocks = vi.hoisted(() => ({
    toast: vi.fn(),
    hashPin: vi.fn(),
    deleteS3Objects: vi.fn(),
    currentUser: { id: 'parent-1', role: 'parent' } as any,
    monitorForElements: vi.fn(),
    monitorCleanup: vi.fn(),
    monitorConfig: null as any,
    extractClosestEdge: vi.fn((data: any) => data?.__edge ?? null),
    reorderWithEdge: vi.fn((args: any) => {
        const next = [...args.list];
        const [moved] = next.splice(args.startIndex, 1);
        const insertAt = args.closestEdgeOfTarget === 'bottom' ? args.indexOfTarget + (args.startIndex < args.indexOfTarget ? 0 : 1) : args.indexOfTarget;
        next.splice(insertAt, 0, moved);
        return next;
    }),
    id: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: familyMemberMocks.toast,
    }),
}));

vi.mock('@/app/actions', () => ({
    hashPin: familyMemberMocks.hashPin,
    deleteS3Objects: familyMemberMocks.deleteS3Objects,
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({
        currentUser: familyMemberMocks.currentUser,
    }),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
    monitorForElements: (config: any) => {
        familyMemberMocks.monitorConfig = config;
        familyMemberMocks.monitorForElements(config);
        return familyMemberMocks.monitorCleanup;
    },
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
    extractClosestEdge: familyMemberMocks.extractClosestEdge,
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge', () => ({
    reorderWithEdge: familyMemberMocks.reorderWithEdge,
}));

vi.mock('react-easy-crop', () => ({
    default: () => <div data-testid="cropper" />,
}));

vi.mock('@/components/allowance/CombinedBalanceDisplay', () => ({
    default: () => <div data-testid="combined-balance" />,
}));

vi.mock('@/components/SortableFamilyMemberItem', () => ({
    SortableFamilyMemberItem: ({ member, onMemberActivate, setSelectedMember }: any) => (
        <div data-testid={`member-row-${member.id}`}>
            <button type="button" onClick={() => setSelectedMember(member.id)}>
                Select {member.name}
            </button>
            <button type="button" onClick={() => onMemberActivate?.(member)}>
                Open edit {member.name}
            </button>
        </div>
    ),
}));

vi.mock('@/lib/chore-utils', async () => {
    const actual = await vi.importActual<typeof import('@/lib/chore-utils')>('@/lib/chore-utils');
    return {
        ...actual,
        calculateDailyXP: vi.fn(() => ({})),
    };
});

vi.mock('@/components/ui/button', async () => {
    const React = await import('react');
    const Button = React.forwardRef<HTMLButtonElement, any>(function MockButton({ children, asChild: _asChild, ...props }, ref) {
        return (
            <button ref={ref} type={props.type ?? 'button'} {...props}>
                {children}
            </button>
        );
    });
    return { Button };
});

vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/label', () => ({
    Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/input', () => ({
    Input: ({ ...props }: any) => <input {...props} />,
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({ checked, onCheckedChange, ...props }: any) => (
        <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...props}
        />
    ),
}));

vi.mock('@/components/ui/avatar', () => ({
    Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    AvatarImage: (props: any) => <img {...props} />,
    AvatarFallback: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ checked, onCheckedChange, ...props }: any) => (
        <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...props}
        />
    ),
}));

vi.mock('@/components/ui/dialog', async () => {
    const React = await import('react');
    const DialogContext = React.createContext(false);

    return {
        Dialog: ({ open, children }: any) => <DialogContext.Provider value={Boolean(open)}>{children}</DialogContext.Provider>,
        DialogTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
        DialogContent: ({ children, ...props }: any) => {
            const open = React.useContext(DialogContext);
            return open ? <div {...props}>{children}</div> : null;
        },
        DialogHeader: ({ children }: any) => <div>{children}</div>,
        DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    };
});

vi.mock('@/components/ui/radio-group', async () => {
    const React = await import('react');
    const RadioCtx = React.createContext<{ value?: string; onValueChange?: (value: string) => void } | null>(null);

    return {
        RadioGroup: ({ value, onValueChange, children, ...props }: any) => (
            <div role="radiogroup" {...props}>
                <RadioCtx.Provider value={{ value, onValueChange }}>{children}</RadioCtx.Provider>
            </div>
        ),
        RadioGroupItem: ({ value, id, ...props }: any) => {
            const ctx = React.useContext(RadioCtx);
            return (
                <input
                    type="radio"
                    id={id}
                    name="mock-radio-group"
                    checked={ctx?.value === value}
                    onChange={() => ctx?.onValueChange?.(value)}
                    {...props}
                />
            );
        },
    };
});

const instantMocks = vi.hoisted(() => ({
    tx: new Proxy(
        {},
        {
            get(_root, entity: string) {
                return new Proxy(
                    {},
                    {
                        get(_entityObj, id: string) {
                            return {
                                update(payload: unknown) {
                                    return { op: 'update', entity, id, payload };
                                },
                                link(payload: unknown) {
                                    return { op: 'link', entity, id, payload };
                                },
                                delete() {
                                    return { op: 'delete', entity, id };
                                },
                            };
                        },
                    }
                );
            },
        }
    ),
}));

vi.mock('@instantdb/react', () => ({
    tx: instantMocks.tx,
    id: familyMemberMocks.id,
}));

import FamilyMembersList from '@/components/FamilyMembersList';

function makeDb() {
    return {
        useQuery: vi.fn(() => ({ data: {} })),
        transact: vi.fn().mockResolvedValue(undefined),
    };
}

const baseMembers = [
    { id: 'member-1', name: 'Alex Kid', role: 'child', email: '' },
    { id: 'member-2', name: 'Parent Pat', role: 'parent', email: 'pat@example.com' },
];

function renderFamilyMembersList(overrides: Partial<React.ComponentProps<typeof FamilyMembersList>> = {}) {
    const db = makeDb();
    const setSelectedMember = vi.fn();
    const props: React.ComponentProps<typeof FamilyMembersList> = {
        familyMembers: baseMembers as any,
        selectedMember: 'All',
        setSelectedMember,
        db,
        showBalances: false,
        membersBalances: {},
        unitDefinitions: [],
        membersXP: {},
        ...overrides,
    };

    const utils = render(<FamilyMembersList {...props} />);
    return { ...utils, props, db, setSelectedMember };
}

describe('FamilyMembersList', () => {
    beforeEach(() => {
        familyMemberMocks.toast.mockReset();
        familyMemberMocks.hashPin.mockReset();
        familyMemberMocks.hashPin.mockResolvedValue('hashed-pin');
        familyMemberMocks.deleteS3Objects.mockReset();
        familyMemberMocks.deleteS3Objects.mockResolvedValue({ deleted: 0 });
        familyMemberMocks.currentUser = { id: 'parent-1', role: 'parent' };
        familyMemberMocks.monitorForElements.mockReset();
        familyMemberMocks.monitorCleanup.mockReset();
        familyMemberMocks.monitorConfig = null;
        familyMemberMocks.extractClosestEdge.mockClear();
        familyMemberMocks.reorderWithEdge.mockClear();
        familyMemberMocks.id.mockReset();
        familyMemberMocks.id.mockReturnValue('member-new');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('adds a family member with selected role and hashed PIN', async () => {
        familyMemberMocks.id.mockReset();
        familyMemberMocks.id.mockReturnValueOnce('member-new').mockReturnValueOnce('env-savings');
        const user = userEvent.setup();
        const { db } = renderFamilyMembersList({
            familyMembers: [{ id: 'member-1', name: 'Alex Kid', role: 'child', email: '' }] as any,
            alwaysEditMode: true,
        });

        await user.click(screen.getByRole('button', { name: /add family member/i }));

        await user.type(screen.getByLabelText(/^name$/i), 'Taylor');
        await user.click(screen.getByLabelText(/^parent$/i));
        await user.type(screen.getByLabelText(/pin \(numbers\)/i), '1234');
        expect((screen.getByLabelText(/custom calendar color/i) as HTMLInputElement).value).toMatch(/^#[0-9A-F]{6}$/i);
        await user.click(screen.getByRole('button', { name: /use pink for taylor's calendar color/i }));

        await user.click(screen.getByRole('button', { name: /^add member$/i }));

        await waitFor(() => {
            expect(familyMemberMocks.hashPin).toHaveBeenCalledWith('1234');
        });

        await waitFor(() => {
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toEqual([
            {
                op: 'update',
                entity: 'familyMembers',
                id: 'member-new',
                payload: expect.objectContaining({
                    name: 'Taylor',
                    color: '#EC4899',
                    email: '',
                    role: 'parent',
                    pinHash: 'hashed-pin',
                    order: 1,
                }),
            },
            {
                op: 'update',
                entity: 'allowanceEnvelopes',
                id: 'env-savings',
                payload: {
                    name: 'Savings',
                    balances: {},
                    isDefault: true,
                    goalAmount: null,
                    goalCurrency: null,
                    familyMember: 'member-new',
                },
            },
            {
                op: 'link',
                entity: 'familyMembers',
                id: 'member-new',
                payload: {
                    allowanceEnvelopes: 'env-savings',
                },
            },
        ]);
        expect(familyMemberMocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Success',
                description: expect.stringMatching(/added successfully/i),
            })
        );
    });

    it('shows a non-blocking warning when a chosen color is very close to another member', async () => {
        const user = userEvent.setup();
        renderFamilyMembersList({
            familyMembers: [
                { id: 'member-1', name: 'Alex Kid', role: 'child', email: '', color: '#3B82F6' },
                { id: 'member-2', name: 'Parent Pat', role: 'parent', email: 'pat@example.com', color: '#3B84F8' },
            ] as any,
            alwaysEditMode: true,
        });

        await user.click(screen.getByRole('button', { name: /open edit alex kid/i }));

        fireEvent.change(screen.getByLabelText(/alex kid custom calendar color/i), {
            target: { value: '#3B83F7' },
        });

        expect(
            screen.getByText(/very close to parent pat's and may be hard to distinguish on the calendar/i)
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save member/i })).toBeEnabled();
    });

    it('shows child self-edit UI (restricted fields hidden) and saves a new hashed PIN', async () => {
        familyMemberMocks.currentUser = { id: 'member-1', role: 'child' };
        const user = userEvent.setup();
        const { db } = renderFamilyMembersList({
            familyMembers: [{ id: 'member-1', name: 'Alex Kid', role: 'child', email: '' }] as any,
            alwaysEditMode: true,
        });

        await user.click(screen.getByRole('button', { name: /open edit alex kid/i }));

        expect(screen.getByRole('heading', { name: /update profile/i })).toBeInTheDocument();
        expect(screen.queryByLabelText(/email \(optional\)/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/^role$/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/new pin/i)).toBeInTheDocument();

        await user.type(screen.getByLabelText(/new pin/i), '7777');
        await user.click(screen.getByRole('button', { name: /save member/i }));

        await waitFor(() => {
            expect(familyMemberMocks.hashPin).toHaveBeenCalledWith('7777');
        });
        await waitFor(() => {
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs[0]).toEqual(
            expect.objectContaining({
                op: 'update',
                entity: 'familyMembers',
                id: 'member-1',
                payload: expect.objectContaining({
                    name: 'Alex Kid',
                    role: 'child',
                    pinHash: 'hashed-pin',
                }),
            })
        );
    });

    it('removes an existing photo in edit mode, deletes previous S3 keys, and clears photoUrls on save', async () => {
        const user = userEvent.setup();

        const memberWithPhoto = {
            id: 'member-1',
            name: 'Alex Kid',
            role: 'child',
            email: '',
            photoUrls: {
                '64': 'alex-64.png',
                '320': 'alex-320.png',
                '1200': 'alex-1200.png',
            },
        };

        const { db } = renderFamilyMembersList({
            familyMembers: [memberWithPhoto] as any,
            alwaysEditMode: true,
        });

        await user.click(screen.getByRole('button', { name: /open edit alex kid/i }));
        await user.click(screen.getByLabelText(/remove existing photo/i));
        await user.click(screen.getByRole('button', { name: /save member/i }));

        await waitFor(() => {
            expect(familyMemberMocks.deleteS3Objects).toHaveBeenCalledWith(['alex-64.png', 'alex-320.png', 'alex-1200.png']);
        });
        await waitFor(() => {
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs[0]).toEqual(
            expect.objectContaining({
                op: 'update',
                entity: 'familyMembers',
                id: 'member-1',
                payload: expect.objectContaining({
                    photoUrls: null,
                }),
            })
        );
    });

    it('persists reordered family member order when the PDnD monitor receives a drop', async () => {
        const db = makeDb();
        render(
            <FamilyMembersList
                familyMembers={baseMembers as any}
                selectedMember="All"
                setSelectedMember={vi.fn()}
                db={db}
                showBalances={false}
                membersBalances={{}}
                unitDefinitions={[]}
                membersXP={{}}
            />
        );

        expect(familyMemberMocks.monitorForElements).toHaveBeenCalledTimes(1);
        expect(familyMemberMocks.monitorConfig).toBeTruthy();

        await act(async () => {
            await familyMemberMocks.monitorConfig.onDrop({
                source: { data: { index: 0 } },
                location: {
                    current: {
                        dropTargets: [{ data: { index: 1, __edge: 'bottom' } }],
                    },
                },
            });
        });

        expect(familyMemberMocks.reorderWithEdge).toHaveBeenCalledWith(
            expect.objectContaining({
                startIndex: 0,
                indexOfTarget: 1,
                closestEdgeOfTarget: 'bottom',
                axis: 'vertical',
            })
        );
        expect(db.transact).toHaveBeenCalledTimes(1);
        expect(db.transact).toHaveBeenCalledWith([
            { op: 'update', entity: 'familyMembers', id: 'member-2', payload: { order: 0 } },
            { op: 'update', entity: 'familyMembers', id: 'member-1', payload: { order: 1 } },
        ]);
        expect(familyMemberMocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Order Saved',
            })
        );
    });
});
