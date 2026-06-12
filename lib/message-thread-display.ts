type FamilyMemberNamesById = Map<string, string>;

type ThreadLike = {
    title?: string | null;
    threadType?: string | null;
    latestMessagePreview?: string | null;
    members?: Array<any> | null;
    membership?: any;
};

type ThreadParticipant = {
    id: string | null;
    name: string;
};

function normalizeText(value?: string | null) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

export function getThreadParticipants(thread: ThreadLike, familyMemberNamesById: FamilyMemberNamesById) {
    const seen = new Set<string>();
    const participants: ThreadParticipant[] = [];

    for (const membership of thread.members || []) {
        const member = Array.isArray(membership?.familyMember) ? membership.familyMember[0] : membership?.familyMember;
        const id = typeof member?.id === 'string' ? member.id : typeof membership?.familyMemberId === 'string' ? membership.familyMemberId : null;
        const name = member?.name || (id ? familyMemberNamesById.get(id) : null) || 'Unknown';
        const key = id || `name:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        participants.push({ id, name });
    }

    return participants;
}

export function getDirectPeerNames(thread: ThreadLike, familyMemberNamesById: FamilyMemberNamesById, currentUserId?: string | null) {
    return getThreadParticipants(thread, familyMemberNamesById)
        .filter((participant) => participant.id !== currentUserId)
        .map((participant) => participant.name)
        .filter(Boolean);
}

export function getThreadDisplayName(thread: ThreadLike, familyMemberNamesById: FamilyMemberNamesById, currentUserId?: string | null) {
    if (thread.threadType === 'direct') {
        const peerNames = getDirectPeerNames(thread, familyMemberNamesById, currentUserId);
        if (peerNames.length > 0) return peerNames.join(', ');
        return thread.title || 'Direct message';
    }

    if (thread.title) return thread.title;
    if (thread.threadType === 'parents_only') return 'Parents';
    if (thread.threadType === 'family') return 'Family';
    return 'Untitled thread';
}

export function getThreadMembersSummary(thread: ThreadLike, familyMemberNamesById: FamilyMemberNamesById, currentUserId?: string | null) {
    if (thread.threadType === 'family') {
        return 'Everyone in the household';
    }
    if (thread.threadType === 'parents_only') {
        return 'Parents only';
    }
    if (thread.threadType === 'direct') {
        const peerNames = getDirectPeerNames(thread, familyMemberNamesById, currentUserId);
        if (peerNames.length > 0) return `Direct message with ${peerNames.join(', ')}`;
        return 'Direct message';
    }

    const participantNames = getThreadParticipants(thread, familyMemberNamesById)
        .map((participant) => participant.name)
        .filter(Boolean);

    if (participantNames.length === 0) return null;

    const summary = participantNames.join(', ');
    if (normalizeText(summary) === normalizeText(getThreadDisplayName(thread, familyMemberNamesById, currentUserId))) {
        return null;
    }
    return summary;
}

export function getThreadPreviewText(thread: ThreadLike) {
    if (thread.latestMessagePreview) return thread.latestMessagePreview;
    if (thread.threadType === 'parents_only') return 'Parents only';
    if (thread.threadType === 'direct') return 'Direct message';
    return 'No messages yet';
}

export function getThreadTypeLabel(thread: ThreadLike) {
    if (thread.threadType === 'family') return 'Family';
    if (thread.threadType === 'parents_only') return 'Parents only';
    if (thread.threadType === 'direct') return 'Direct message';
    if (thread.threadType === 'linked') return 'Linked thread';
    if (thread.threadType === 'group') return 'Group thread';
    return thread.threadType || 'Thread';
}

export function isParentOverseeingThread(thread: ThreadLike, currentUserRole?: string | null) {
    return currentUserRole === 'parent' && !thread.membership;
}
