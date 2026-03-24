type Viewer = {
  _id: string;
  isSuperAdmin: boolean;
  canCreateGroup?: boolean;
  hasCreatedGroup?: boolean;
} | null | undefined;

type GroupMember = {
  _id?: string;
  userId: string;
  role: "admin" | "member";
  isReferenced?: boolean;
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

export function canRemoveGroupMember(
  members: Array<GroupMember>,
  member: GroupMember
): boolean {
  return getRemoveGroupMemberBlockReason(members, member) === null;
}

export function getRemoveGroupMemberBlockReason(
  members: Array<GroupMember>,
  member: GroupMember
): "referenced" | "last-member" | "last-admin" | null {
  if (member.isReferenced) return "referenced";
  if (members.length <= 1) return "last-member";
  if (member.role !== "admin") return null;
  return members.filter((candidate) => candidate.role === "admin").length > 1
    ? null
    : "last-admin";
}
