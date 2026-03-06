type Viewer = {
  _id: string;
  isSuperAdmin: boolean;
  canCreateGroup?: boolean;
  hasCreatedGroup?: boolean;
} | null | undefined;

type GroupMember = {
  userId: string;
  role: "admin" | "member";
};

export function canManageGroup(viewer: Viewer, members: Array<GroupMember>): boolean {
  if (viewer?.isSuperAdmin) return true;
  if (!viewer) return false;
  return members.some(
    (member) => member.userId === viewer._id && member.role === "admin"
  );
}

export function canCreateAnotherGroup(viewer: Viewer): boolean {
  if (!viewer) return false;
  if (viewer.isSuperAdmin) return true;
  return Boolean(viewer.canCreateGroup && !viewer.hasCreatedGroup);
}

export function canDemoteAdmin(
  members: Array<GroupMember>,
  member: GroupMember
): boolean {
  if (member.role !== "admin") return true;
  return members.filter((candidate) => candidate.role === "admin").length > 1;
}
