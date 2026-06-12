export function isMembershipUnread(membership) {
  if (!membership || membership.isArchived) return false;
  const latestActivity = membership.sortTimestamp || '';
  if (!latestActivity) return false;
  const lastReadAt = membership.lastReadAt || '';
  return latestActivity > lastReadAt;
}

export function countUnreadThreadMemberships(memberships) {
  return (memberships || []).filter(isMembershipUnread).length;
}

export function findUnreadMembershipsForMember(memberships, familyMemberId) {
  if (!familyMemberId) return [];
  return (memberships || []).filter(
    (membership) => membership?.familyMemberId === familyMemberId && isMembershipUnread(membership)
  );
}
