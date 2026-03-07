export function shouldEnsureCurrentUser(params: {
  isClerkLoaded: boolean;
  isSignedIn: boolean | undefined;
  userId: string | null | undefined;
  isConvexAuthLoading: boolean;
  isConvexAuthenticated: boolean;
  isMeLoading: boolean;
  ensuredUserId: string | null;
}) {
  const {
    isClerkLoaded,
    isSignedIn,
    userId,
    isConvexAuthLoading,
    isConvexAuthenticated,
    isMeLoading,
    ensuredUserId,
  } = params;

  if (!isClerkLoaded || !isSignedIn || !userId) return false;
  if (isConvexAuthLoading || !isConvexAuthenticated || isMeLoading) return false;
  return ensuredUserId !== userId;
}
