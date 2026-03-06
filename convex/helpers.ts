import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Nicht angemeldet");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw new ConvexError("Benutzer nicht gefunden");
  return user;
}

export async function hasActiveGroupMembers(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  const groupMembers = await ctx.db
    .query("groupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();

  const activeMembers = await Promise.all(
    groupMembers.map(async (member) => ctx.db.get("users", member.userId))
  );
  return activeMembers.some(Boolean);
}

export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (!user.isSuperAdmin) throw new ConvexError("Nur fürs Backoffice");
  return user;
}

export async function requireGroupMember(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  if (!(await hasActiveGroupMembers(ctx, groupId))) {
    throw new ConvexError("Gruppe nicht gefunden");
  }

  const user = await requireAuth(ctx);
  if (user.isSuperAdmin) return { user, membership: null };

  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_user", (q) =>
      q.eq("groupId", groupId).eq("userId", user._id)
    )
    .unique();
  if (!membership) throw new ConvexError("Kein Mitglied dieser Gruppe");
  return { user, membership };
}

export async function requireGroupAdmin(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  if (!(await hasActiveGroupMembers(ctx, groupId))) {
    throw new ConvexError("Gruppe nicht gefunden");
  }

  const user = await requireAuth(ctx);
  if (user.isSuperAdmin) return user;

  const membership = await ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_user", (q) =>
      q.eq("groupId", groupId).eq("userId", user._id)
    )
    .unique();
  if (!membership || membership.role !== "admin") {
    throw new ConvexError("Nur für Admins");
  }
  return user;
}
