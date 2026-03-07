import { canManageGroup } from "~/lib/groupPermissions";

type Viewer = {
  _id: string;
  isSuperAdmin: boolean;
} | null | undefined;

type GroupMember = {
  userId: string;
  role: "admin" | "member";
};

export type GroupAdminAccessState = "loading" | "allowed" | "denied";

function resolveGroupAdminAccess(
  viewer: Viewer,
  members: Array<GroupMember>,
  membersLoading: boolean
): GroupAdminAccessState {
  if (viewer?.isSuperAdmin) return "allowed";
  if (membersLoading) return "loading";
  return canManageGroup(viewer ?? null, members) ? "allowed" : "denied";
}

export function resolveSettingsAccess(
  viewer: Viewer,
  members: Array<GroupMember>,
  membersLoading: boolean
): GroupAdminAccessState {
  return resolveGroupAdminAccess(viewer, members, membersLoading);
}

export function resolveTournamentAdminAccess(
  viewer: Viewer,
  members: Array<GroupMember>,
  membersLoading: boolean
): GroupAdminAccessState {
  return resolveGroupAdminAccess(viewer, members, membersLoading);
}

export function resolveTournamentCreateAccess(
  viewer: Viewer,
  members: Array<GroupMember>,
  membersLoading: boolean
): GroupAdminAccessState {
  return resolveGroupAdminAccess(viewer, members, membersLoading);
}
