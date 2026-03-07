import { describe, expect, it } from "bun:test";
import { validateAddMemberState, validateRoleChangeState } from "../../../convex/model/groupMembership";

describe("validateAddMemberState", () => {
  it("rejects missing user", () => {
    expect(
      validateAddMemberState({ userExists: false, alreadyMember: false })
    ).toEqual({
      valid: false,
      error: "Benutzer nicht gefunden",
    });
  });

  it("rejects duplicate membership", () => {
    expect(
      validateAddMemberState({ userExists: true, alreadyMember: true })
    ).toEqual({
      valid: false,
      error: "Bereits Mitglied",
    });
  });

  it("accepts valid state", () => {
    expect(
      validateAddMemberState({ userExists: true, alreadyMember: false })
    ).toEqual({ valid: true });
  });
});

describe("validateRoleChangeState", () => {
  it("rejects demotion of the sole active admin", () => {
    expect(
      validateRoleChangeState({
        currentRole: "admin",
        nextRole: "member",
        targetMemberId: "m1",
        activeAdminMemberIds: ["m1"],
      })
    ).toEqual({
      valid: false,
      error: "Mindestens ein Admin muss in der Gruppe bleiben",
    });
  });

  it("allows demotion when another active admin exists", () => {
    expect(
      validateRoleChangeState({
        currentRole: "admin",
        nextRole: "member",
        targetMemberId: "m1",
        activeAdminMemberIds: ["m1", "m2"],
      })
    ).toEqual({ valid: true });
  });

  it("allows demotion of non-active admin membership", () => {
    expect(
      validateRoleChangeState({
        currentRole: "admin",
        nextRole: "member",
        targetMemberId: "ghost",
        activeAdminMemberIds: ["m1"],
      })
    ).toEqual({ valid: true });
  });

  it("allows unrelated role changes", () => {
    expect(
      validateRoleChangeState({
        currentRole: "member",
        nextRole: "admin",
        targetMemberId: "m1",
        activeAdminMemberIds: ["m2"],
      })
    ).toEqual({ valid: true });
  });
});
