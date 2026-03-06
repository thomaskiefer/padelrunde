export type GroupRole = "admin" | "member";

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateAddMemberState({
  userExists,
  alreadyMember,
}: {
  userExists: boolean;
  alreadyMember: boolean;
}): ValidationResult {
  if (!userExists) {
    return { valid: false, error: "Benutzer nicht gefunden" };
  }
  if (alreadyMember) {
    return { valid: false, error: "Bereits Mitglied" };
  }
  return { valid: true };
}

export function validateRoleChangeState({
  currentRole,
  nextRole,
  targetMemberId,
  activeAdminMemberIds,
}: {
  currentRole: GroupRole;
  nextRole: GroupRole;
  targetMemberId: string;
  activeAdminMemberIds: Array<string>;
}): ValidationResult {
  if (currentRole === "admin" && nextRole === "member") {
    const isTargetActiveAdmin = activeAdminMemberIds.includes(targetMemberId);
    if (isTargetActiveAdmin && activeAdminMemberIds.length <= 1) {
      return {
        valid: false,
        error: "Mindestens ein Admin muss in der Gruppe bleiben",
      };
    }
  }
  return { valid: true };
}
