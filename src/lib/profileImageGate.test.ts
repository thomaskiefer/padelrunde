import { describe, expect, it } from "bun:test";
import { shouldShowProfileImageGate } from "./profileImageGate";

describe("shouldShowProfileImageGate", () => {
  it("does not gate signed-out users", () => {
    expect(
      shouldShowProfileImageGate({
        isSignedIn: false,
        isClerkLoaded: true,
        hasImage: false,
      })
    ).toBe(false);
  });

  it("does not gate while Clerk is still loading", () => {
    expect(
      shouldShowProfileImageGate({
        isSignedIn: true,
        isClerkLoaded: false,
        hasImage: false,
      })
    ).toBe(false);
  });

  it("gates signed-in users without a profile image", () => {
    expect(
      shouldShowProfileImageGate({
        isSignedIn: true,
        isClerkLoaded: true,
        hasImage: false,
      })
    ).toBe(true);
  });

  it("does not gate signed-in users with a profile image", () => {
    expect(
      shouldShowProfileImageGate({
        isSignedIn: true,
        isClerkLoaded: true,
        hasImage: true,
      })
    ).toBe(false);
  });
});
