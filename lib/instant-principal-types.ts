export type InstantPrincipalType = 'kid' | 'parent' | 'unknown';

export type ElevateParentParams = {
    familyMemberId: string;
    pin: string;
    sharedDevice?: boolean;
};
