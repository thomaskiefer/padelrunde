export function shouldShowProfileImageGate({
  isSignedIn,
  isClerkLoaded,
  hasImage,
}: {
  isSignedIn: boolean;
  isClerkLoaded: boolean;
  hasImage: boolean;
}) {
  if (!isSignedIn || !isClerkLoaded) {
    return false;
  }

  return !hasImage;
}
