import { describe, expect, it } from "bun:test";
import {
  canCreateAnotherGroup,
  canDemoteAdmin,
  canManageGroup,
  canRemoveGroupMember,
  getRemoveGroupMemberBlockReason,
} from "./groupPermissions";

describe("canManageGroup", () => {
  it("returns true for super admins", () => {
    expect(
      canManageGroup(
        { _id: "user-1", isSuperAdmin: true },
        [{ userId: "user-2", role: "member" }]
      )
    ).toBe(true);
  });

  it("returns true for group admins", () => {
    expect(
      canManageGroup(
        { _id: "user-1", isSuperAdmin: false },
        [{ userId: "user-1", role: "admin" }]
      )
    ).toBe(true);
  });

  it("returns false for non-admin members", () => {
    expect(
      canManageGroup(
        { _id: "user-1", isSuperAdmin: false },
        [{ userId: "user-1", role: "member" }]
      )
    ).toBe(false);
  });

  it("returns false without viewer", () => {
    expect(canManageGroup(null, [{ userId: "user-1", role: "admin" }])).toBe(
      false
    );
  });
});

describe("canCreateAnotherGroup", () => {
  it("allows super admins regardless of existing groups", () => {
    expect(
      canCreateAnotherGroup({
        _id: "dev-1",
        isSuperAdmin: true,
        canCreateGroup: false,
        hasCreatedGroup: true,
      })
    ).toBe(true);
  });

  it("allows regular users with permission who have not created a group yet", () => {
    expect(
      canCreateAnotherGroup({
        _id: "user-1",
        isSuperAdmin: false,
        canCreateGroup: true,
        hasCreatedGroup: false,
      })
    ).toBe(true);
  });

  it("blocks regular users after their first group", () => {
    expect(
      canCreateAnotherGroup({
        _id: "user-1",
        isSuperAdmin: false,
        canCreateGroup: true,
        hasCreatedGroup: true,
      })
    ).toBe(false);
  });
});

describe("canDemoteAdmin", () => {
  it("blocks demoting the last admin", () => {
    expect(
      canDemoteAdmin([{ userId: "user-1", role: "admin" }], {
        userId: "user-1",
        role: "admin",
      })
    ).toBe(false);
  });

  it("allows demoting an admin when another admin exists", () => {
    expect(
      canDemoteAdmin(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "admin" },
        ],
        { userId: "user-1", role: "admin" }
      )
    ).toBe(true);
  });

  it("does not block promoting a member", () => {
    expect(
      canDemoteAdmin([{ userId: "user-1", role: "admin" }], {
        userId: "user-2",
        role: "member",
      })
    ).toBe(true);
  });
});

describe("canRemoveGroupMember", () => {
  it("blocks removing the last member", () => {
    expect(
      canRemoveGroupMember([{ userId: "user-1", role: "admin" }], {
        userId: "user-1",
        role: "admin",
      })
    ).toBe(false);
  });

  it("blocks removing the last admin when other members remain", () => {
    expect(
      canRemoveGroupMember(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "member" },
        ],
        { userId: "user-1", role: "admin" }
      )
    ).toBe(false);
  });

  it("allows removing a member when others remain", () => {
    expect(
      canRemoveGroupMember(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "member" },
        ],
        { userId: "user-2", role: "member" }
      )
    ).toBe(true);
  });

  it("allows removing an admin when another admin exists", () => {
    expect(
      canRemoveGroupMember(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "admin" },
          { userId: "user-3", role: "member" },
        ],
        { userId: "user-1", role: "admin" }
      )
    ).toBe(true);
  });

  it("blocks removing members who are referenced by tournaments", () => {
    expect(
      canRemoveGroupMember(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "member", isReferenced: true },
        ],
        { userId: "user-2", role: "member", isReferenced: true }
      )
    ).toBe(false);
    expect(
      getRemoveGroupMemberBlockReason(
        [
          { userId: "user-1", role: "admin" },
          { userId: "user-2", role: "member", isReferenced: true },
        ],
        { userId: "user-2", role: "member", isReferenced: true }
      )
    ).toBe("referenced");
  });
});
