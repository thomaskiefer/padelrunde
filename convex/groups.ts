import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireGroupAdmin, requireGroupMember } from "./helpers";
import {
  validateAddMemberState,
  validateRoleChangeState,
} from "./model/groupMembership";
import { isValidSlugLength, normalizeSlug } from "./model/slug";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

async function getMembershipsWithUsers(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  const members = await ctx.db
    .query("groupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();

  return await Promise.all(
    members.map(async (member) => ({
      member,
      user: await ctx.db.get("users", member.userId),
    }))
  );
}

async function listActiveMembers(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  const memberships = await getMembershipsWithUsers(ctx, groupId);
  return memberships
    .filter((entry) => entry.user)
    .map(({ member, user }) => ({
      ...member,
      avatarUrl: user!.avatarUrl,
    }));
}

async function hasActiveMembers(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) {
  const memberships = await getMembershipsWithUsers(ctx, groupId);
  return memberships.some((entry) => entry.user);
}

async function deleteGroupTree(
  ctx: MutationCtx,
  groupId: Id<"groups">
) {
  const tournaments = await ctx.db
    .query("tournaments")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  for (const tournament of tournaments) {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    for (const match of matches) {
      await ctx.db.delete("matches", match._id);
    }

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
      .collect();
    for (const round of rounds) {
      await ctx.db.delete("rounds", round._id);
    }

    await ctx.db.delete("tournaments", tournament._id);
  }

  const groupMembers = await ctx.db
    .query("groupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  for (const member of groupMembers) {
    await ctx.db.delete("groupMembers", member._id);
  }

  await ctx.db.delete("groups", groupId);
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    if (user.isSuperAdmin) {
      const groups = await ctx.db.query("groups").collect();
      return (
        await Promise.all(
          groups.map(async (group) =>
            (await hasActiveMembers(ctx, group._id)) ? group : null
          )
        )
      ).filter((group) => group !== null);
    }

    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const groups = await Promise.all(
      memberships.map((m) => ctx.db.get("groups", m.groupId))
    );
    return (
      await Promise.all(
        groups.filter(Boolean).map(async (group) =>
          (group && (await hasActiveMembers(ctx, group._id))) ? group : null
        )
      )
    ).filter((group) => group !== null);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) return null;

    const group = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .unique();
    if (!group) return null;
    if (!(await hasActiveMembers(ctx, group._id))) return null;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    if (!user.isSuperAdmin) {
      const membership = await ctx.db
        .query("groupMembers")
        .withIndex("by_group_and_user", (q) =>
          q.eq("groupId", group._id).eq("userId", user._id)
        )
        .unique();
      if (!membership) return null;
    }

    return group;
  },
});

export const getMembers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    await requireGroupMember(ctx, groupId);
    return listActiveMembers(ctx, groupId);
  },
});

export const listAddableUsers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    await requireGroupAdmin(ctx, groupId);

    const existingMembers = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
    const existingUserIds = new Set(existingMembers.map((member) => member.userId));
    const users = await ctx.db.query("users").collect();

    return users
      .filter((user) => !existingUserIds.has(user._id))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  },
});

export const listOrphanedForBackoffice = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    if (!user.isSuperAdmin) {
      throw new ConvexError("Nur fürs Backoffice");
    }

    const groups = await ctx.db.query("groups").collect();
    const orphanedGroups = await Promise.all(
      groups.map(async (group) => {
        const memberships = await getMembershipsWithUsers(ctx, group._id);
        const activeMembers = memberships.filter((entry) => entry.user);
        if (activeMembers.length > 0) return null;

        const tournaments = await ctx.db
          .query("tournaments")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();

        return {
          ...group,
          historicalMembers: memberships.map(({ member, user: memberUser }) => ({
            ...member,
            hasUser: Boolean(memberUser),
          })),
          tournamentCount: tournaments.length,
        };
      })
    );

    return orphanedGroups.filter((group) => group !== null);
  },
});

export const deleteOrphanedGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const user = await requireAuth(ctx);
    if (!user.isSuperAdmin) {
      throw new ConvexError("Nur fürs Backoffice");
    }

    const group = await ctx.db.get("groups", groupId);
    if (!group) throw new ConvexError("Gruppe nicht gefunden");

    if (await hasActiveMembers(ctx, groupId)) {
      throw new ConvexError("Nur verwaiste Gruppen können gelöscht werden");
    }

    await deleteGroupTree(ctx, groupId);
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, { name, slug }) => {
    const user = await requireAuth(ctx);
    const trimmedName = name.trim();
    const normalizedSlug = normalizeSlug(slug);

    if (!user.canCreateGroup && !user.isSuperAdmin) {
      throw new ConvexError("Keine Berechtigung zum Erstellen einer Gruppe");
    }
    if (user.hasCreatedGroup && !user.isSuperAdmin) {
      throw new ConvexError("Du hast bereits eine Gruppe erstellt");
    }
    if (!normalizedSlug || !isValidSlugLength(normalizedSlug)) {
      throw new ConvexError("URL-Kürzel muss 3 bis 48 Zeichen lang sein");
    }
    if (!trimmedName) {
      throw new ConvexError("Gruppenname darf nicht leer sein");
    }

    const existing = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .unique();
    if (existing) throw new ConvexError("Dieser Gruppenname ist bereits vergeben");

    const groupId = await ctx.db.insert("groups", {
      name: trimmedName,
      slug: normalizedSlug,
      createdBy: user._id,
      isPaid: false,
    });

    await ctx.db.insert("groupMembers", {
      groupId,
      userId: user._id,
      role: "admin",
      displayName: user.name,
    });

    if (!user.isSuperAdmin) {
      await ctx.db.patch("users", user._id, { hasCreatedGroup: true });
    }

    return groupId;
  },
});

export const addMember = mutation({
  args: {
    groupId: v.id("groups"),
    userId: v.id("users"),
    displayName: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
  },
  handler: async (ctx, { groupId, userId, displayName, role }) => {
    await requireGroupAdmin(ctx, groupId);
    const trimmedDisplayName = displayName.trim();

    const user = await ctx.db.get("users", userId);
    const existing = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_user", (q) =>
        q.eq("groupId", groupId).eq("userId", userId)
      )
      .unique();
    const addMemberValidation = validateAddMemberState({
      userExists: Boolean(user),
      alreadyMember: Boolean(existing),
    });
    if (!addMemberValidation.valid) {
      throw new ConvexError(addMemberValidation.error);
    }
    if (!trimmedDisplayName) {
      throw new ConvexError("Bitte gib einen Anzeigenamen an.");
    }

    return ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: role ?? "member",
      displayName: trimmedDisplayName,
    });
  },
});

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("groupMembers"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { memberId, role }) => {
    const member = await ctx.db.get("groupMembers", memberId);
    if (!member) throw new ConvexError("Mitglied nicht gefunden");
    await requireGroupAdmin(ctx, member.groupId);

    if (member.role === "admin" && role === "member") {
      const admins = await ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", member.groupId))
        .collect();

      const adminMemberships = admins.filter((m) => m.role === "admin");
      const activeAdminMemberships = (
        await Promise.all(
          adminMemberships.map(async (adminMembership) => {
            const adminUser = await ctx.db.get("users", adminMembership.userId);
            return adminUser ? adminMembership : null;
          })
        )
      ).filter((m) => m !== null);

      const roleChangeValidation = validateRoleChangeState({
        currentRole: member.role,
        nextRole: role,
        targetMemberId: member._id,
        activeAdminMemberIds: activeAdminMemberships.map(
          (activeAdmin) => activeAdmin._id
        ),
      });
      if (!roleChangeValidation.valid) {
        throw new ConvexError(roleChangeValidation.error);
      }
    }

    await ctx.db.patch("groupMembers", memberId, { role });
  },
});
