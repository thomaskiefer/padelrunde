import { describe, expect, it } from "bun:test";
import {
  resolveSettingsAccess,
  resolveTournamentAdminAccess,
  resolveTournamentCreateAccess,
} from "./access";
import type { GroupAdminAccessState } from "./access";

const adminMember = [{ userId: "u1", role: "admin" as const }];
const plainMember = [{ userId: "u1", role: "member" as const }];
const viewer = { _id: "u1", isSuperAdmin: false };
const superAdminViewer = { _id: "super", isSuperAdmin: true };

function assertAllPages(
  expected: GroupAdminAccessState,
  args: {
    viewer: typeof viewer | typeof superAdminViewer | null;
    members: Array<{ userId: string; role: "admin" | "member" }>;
    membersLoading: boolean;
  }
) {
  expect(
    resolveSettingsAccess(args.viewer, args.members, args.membersLoading)
  ).toBe(expected);
  expect(
    resolveTournamentAdminAccess(args.viewer, args.members, args.membersLoading)
  ).toBe(expected);
  expect(
    resolveTournamentCreateAccess(args.viewer, args.members, args.membersLoading)
  ).toBe(expected);
}

describe("group route access guards", () => {
  it("allows super admins even while member data is still loading", () => {
    assertAllPages("allowed", {
      viewer: superAdminViewer,
      members: [],
      membersLoading: true,
    });
  });

  it("returns loading for non-super-admins while member data is loading", () => {
    assertAllPages("loading", {
      viewer,
      members: [],
      membersLoading: true,
    });
  });

  it("allows group admins once member data is loaded", () => {
    assertAllPages("allowed", {
      viewer,
      members: adminMember,
      membersLoading: false,
    });
  });

  it("denies non-admin members once member data is loaded", () => {
    assertAllPages("denied", {
      viewer,
      members: plainMember,
      membersLoading: false,
    });
  });

  it("denies unauthenticated users once member data is loaded", () => {
    assertAllPages("denied", {
      viewer: null,
      members: adminMember,
      membersLoading: false,
    });
  });
});
