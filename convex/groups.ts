import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireAuth,
  requireGroupAdmin,
  requireGroupMember,
  requireSuperAdmin,
} from "./helpers";
import {
  validateAddMemberState,
  validateRoleChangeState,
} from "./model/groupMembership";
import { isValidSlugLength, normalizeSlug } from "./model/slug";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DEFAULT_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createInviteTokenValue() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return hex(new Uint8Array(digest));
}

function getInviteStatus(
  inviteToken: {
    expiresAt: number;
    revokedAt?: number;
  },
  now = Date.now()
) {
  if (inviteToken.revokedAt) return "revoked" as const;
  if (inviteToken.expiresAt <= now) return "expired" as const;
  return "active" as const;
}

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

async function findMembership(
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  userId: Id<"users">
) {
  return ctx.db
    .query("groupMembers")
    .withIndex("by_group_and_user", (q) =>
      q.eq("groupId", groupId).eq("userId", userId)
    )
    .unique();
}

async function resolveInviteTokenRecord(
  ctx: QueryCtx | MutationCtx,
  token: string
) {
  const tokenHash = await hashInviteToken(token);
  return ctx.db
    .query("groupInviteTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
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

  const inviteTokens = await ctx.db
    .query("groupInviteTokens")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .collect();
  for (const inviteToken of inviteTokens) {
    await ctx.db.delete("groupInviteTokens", inviteToken._id);
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
    await requireSuperAdmin(ctx);

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

export const listInviteTokens = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    await requireGroupAdmin(ctx, groupId);

    const invites = await ctx.db
      .query("groupInviteTokens")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    return invites
      .map((invite) => ({
        ...invite,
        status: getInviteStatus(invite),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createInviteToken = mutation({
  args: {
    groupId: v.id("groups"),
    label: v.optional(v.string()),
    expiresInDays: v.optional(v.number()),
  },
  handler: async (ctx, { groupId, label, expiresInDays }) => {
    const user = await requireGroupAdmin(ctx, groupId);
    const group = await ctx.db.get("groups", groupId);
    if (!group || !(await hasActiveMembers(ctx, groupId))) {
      throw new ConvexError("Gruppe nicht gefunden");
    }

    const trimmedLabel = label?.trim() || undefined;
    const inviteDurationMs =
      expiresInDays && Number.isFinite(expiresInDays) && expiresInDays > 0
        ? expiresInDays * 24 * 60 * 60 * 1000
        : DEFAULT_INVITE_EXPIRY_MS;
    const token = createInviteTokenValue();
    const tokenHash = await hashInviteToken(token);
    const createdAt = Date.now();
    const expiresAt = createdAt + inviteDurationMs;

    const inviteTokenId = await ctx.db.insert("groupInviteTokens", {
      groupId,
      token,
      tokenHash,
      label: trimmedLabel,
      createdBy: user._id,
      createdAt,
      expiresAt,
    });

    return {
      inviteTokenId,
      token,
      groupSlug: group.slug,
      label: trimmedLabel,
      createdAt,
      expiresAt,
      status: "active" as const,
    };
  },
});

export const revokeInviteToken = mutation({
  args: { inviteTokenId: v.id("groupInviteTokens") },
  handler: async (ctx, { inviteTokenId }) => {
    const inviteToken = await ctx.db.get("groupInviteTokens", inviteTokenId);
    if (!inviteToken) throw new ConvexError("Einladung nicht gefunden");

    const user = await requireGroupAdmin(ctx, inviteToken.groupId);
    if (inviteToken.revokedAt) return;

    await ctx.db.patch("groupInviteTokens", inviteTokenId, {
      revokedAt: Date.now(),
      revokedBy: user._id,
    });
  },
});

export const deleteInviteToken = mutation({
  args: { inviteTokenId: v.id("groupInviteTokens") },
  handler: async (ctx, { inviteTokenId }) => {
    const inviteToken = await ctx.db.get("groupInviteTokens", inviteTokenId);
    if (!inviteToken) throw new ConvexError("Einladung nicht gefunden");

    await requireGroupAdmin(ctx, inviteToken.groupId);

    if (getInviteStatus(inviteToken) === "active") {
      throw new ConvexError("Aktive Einladungen müssen zuerst widerrufen werden");
    }

    await ctx.db.delete("groupInviteTokens", inviteTokenId);
  },
});

export const getJoinInvite = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token.trim()) {
      return { status: "not_found" as const };
    }

    const inviteToken = await resolveInviteTokenRecord(ctx, token.trim());
    if (!inviteToken) {
      return { status: "not_found" as const };
    }

    const group = await ctx.db.get("groups", inviteToken.groupId);
    if (!group || !(await hasActiveMembers(ctx, group._id))) {
      return { status: "not_found" as const };
    }

    const status = getInviteStatus(inviteToken);
    const identity = await ctx.auth.getUserIdentity();
    let alreadyMember = false;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (user) {
        alreadyMember = Boolean(await findMembership(ctx, group._id, user._id));
      }
    }

    return {
      status,
      group: {
        _id: group._id,
        slug: group.slug,
        name: group.name,
      },
      invite: {
        _id: inviteToken._id,
        label: inviteToken.label,
        createdAt: inviteToken.createdAt,
        expiresAt: inviteToken.expiresAt,
        revokedAt: inviteToken.revokedAt,
      },
      alreadyMember,
    };
  },
});

export const joinWithInvite = mutation({
  args: {
    token: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, { token, displayName }) => {
    const user = await requireAuth(ctx);
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      throw new ConvexError("Bitte gib einen Anzeigenamen an.");
    }

    const inviteToken = await resolveInviteTokenRecord(ctx, token.trim());
    if (!inviteToken) {
      throw new ConvexError("Einladung nicht gefunden");
    }
    const group = await ctx.db.get("groups", inviteToken.groupId);
    if (!group || !(await hasActiveMembers(ctx, inviteToken.groupId))) {
      throw new ConvexError("Gruppe nicht gefunden");
    }

    const status = getInviteStatus(inviteToken);
    if (status === "revoked") {
      throw new ConvexError("Einladung wurde widerrufen");
    }
    if (status === "expired") {
      throw new ConvexError("Einladung ist abgelaufen");
    }

    const existingMembership = await findMembership(ctx, inviteToken.groupId, user._id);
    if (existingMembership) {
      throw new ConvexError("Du bist bereits Mitglied dieser Gruppe");
    }

    const memberId = await ctx.db.insert("groupMembers", {
      groupId: inviteToken.groupId,
      userId: user._id,
      role: "member",
      displayName: trimmedDisplayName,
    });

    return {
      memberId,
      groupId: group._id,
      groupSlug: group.slug,
      groupName: group.name,
    };
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
