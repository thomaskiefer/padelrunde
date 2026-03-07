import { describe, expect, it } from "bun:test";
import { shouldEnsureCurrentUser } from "./currentUserSync";

describe("shouldEnsureCurrentUser", () => {
  it("returns false before Clerk is loaded", () => {
    expect(
      shouldEnsureCurrentUser({
        isClerkLoaded: false,
        isSignedIn: true,
        userId: "user_1",
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isMeLoading: false,
        ensuredUserId: null,
      })
    ).toBe(false);
  });

  it("returns false while Convex auth is still loading", () => {
    expect(
      shouldEnsureCurrentUser({
        isClerkLoaded: true,
        isSignedIn: true,
        userId: "user_1",
        isConvexAuthLoading: true,
        isConvexAuthenticated: true,
        isMeLoading: false,
        ensuredUserId: null,
      })
    ).toBe(false);
  });

  it("ensures an authenticated user even when a user row already exists", () => {
    expect(
      shouldEnsureCurrentUser({
        isClerkLoaded: true,
        isSignedIn: true,
        userId: "user_1",
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isMeLoading: false,
        ensuredUserId: null,
      })
    ).toBe(true);
  });

  it("does not re-ensure the same user twice in one session", () => {
    expect(
      shouldEnsureCurrentUser({
        isClerkLoaded: true,
        isSignedIn: true,
        userId: "user_1",
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isMeLoading: false,
        ensuredUserId: "user_1",
      })
    ).toBe(false);
  });

  it("ensures again after the signed-in user changes", () => {
    expect(
      shouldEnsureCurrentUser({
        isClerkLoaded: true,
        isSignedIn: true,
        userId: "user_2",
        isConvexAuthLoading: false,
        isConvexAuthenticated: true,
        isMeLoading: false,
        ensuredUserId: "user_1",
      })
    ).toBe(true);
  });
});
