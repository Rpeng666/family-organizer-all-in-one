export function shouldBootstrapMessageRepair({
  isOnline,
  isLoadingThreads,
  threads,
  currentUserRole,
  hasAttemptedBootstrap,
}) {
  if (!isOnline || isLoadingThreads || hasAttemptedBootstrap) return false;

  const rows = Array.isArray(threads) ? threads : [];
  const hasFamilyThread = rows.some((thread) => thread?.threadType === 'family' || thread?.threadKey === 'family');
  if (!hasFamilyThread) return true;

  if (currentUserRole === 'parent') {
    const hasParentsThread = rows.some(
      (thread) => thread?.threadType === 'parents_only' || thread?.threadKey === 'parents_only'
    );
    return !hasParentsThread;
  }

  return false;
}
