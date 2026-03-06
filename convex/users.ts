import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query
} from "./_generated/server";
import { requireSuperAdmin } from "./helpers";
import { collectHistoricalMemberIds } from "./model/history";
import type { MutationCtx, QueryCtx } from "./_generated/server";

function isSuperAdminClerkId(clerkId: string) {
  return (process.env.SUPERADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(clerkId);
}

export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

function resolveIdentityName(
  identity: {
    name?: string;
    givenName?: string;
    familyName?: string;
    nickname?: string;
    preferredUsername?: string;
    email?: string;
    subject: string;
  }
) {
  const fullName = identity.name?.trim();
  if (fullName) return fullName;

  const composedName = [identity.givenName, identity.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (composedName) return composedName;

  return (
    identity.nickname ??
    identity.preferredUsername ??
    identity.email ??
    identity.subject
  );
}

async function ensureUserFromIdentity(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  const isSuperAdmin = isSuperAdminClerkId(identity.subject);
  const identityData = {
    name: resolveIdentityName(identity),
    email: identity.email ?? existing?.email ?? "",
    avatarUrl: identity.pictureUrl ?? existing?.avatarUrl,
    isSuperAdmin,
  };

  if (existing) {
    await ctx.db.patch("users", existing._id, {
      ...identityData,
      canCreateGroup: existing.canCreateGroup,
    });
    return await ctx.db.get("users", existing._id);
  }

  const userId = await ctx.db.insert("users", {
    clerkId: identity.subject,
    ...identityData,
    canCreateGroup: false,
    hasCreatedGroup: false,
  });
  return await ctx.db.get("users", userId);
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    return getCurrentUser(ctx);
  },
});

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    return ensureUserFromIdentity(ctx);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user?.isSuperAdmin) return [];
    return ctx.db.query("users").collect();
  },
});

export const toggleCanCreateGroup = mutation({
  args: { userId: v.id("users"), canCreateGroup: v.boolean() },
  handler: async (ctx, { userId, canCreateGroup }) => {
    await requireSuperAdmin(ctx);
    const targetUser = await ctx.db.get("users", userId);
    if (!targetUser) {
      throw new ConvexError("Benutzer nicht gefunden");
    }
    await ctx.db.patch("users", userId, { canCreateGroup });
  },
});

export const upsertFromClerk = internalMutation({
  args: {
    data: v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      imageUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { data }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
      .unique();

    const isSuperAdmin = isSuperAdminClerkId(data.id);

    if (existing) {
      await ctx.db.patch("users", existing._id, {
        name: data.name,
        email: data.email,
        avatarUrl: data.imageUrl,
        isSuperAdmin,
        canCreateGroup: existing.canCreateGroup,
      });
    } else {
      await ctx.db.insert("users", {
        clerkId: data.id,
        name: data.name,
        email: data.email,
        avatarUrl: data.imageUrl,
        isSuperAdmin,
        canCreateGroup: false,
        hasCreatedGroup: false,
      });
    }
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkUserId))
      .unique();
    if (!user) return;

    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const affectedGroupIds = Array.from(new Set(memberships.map((m) => m.groupId)));

    // Track member ids that are referenced by tournament history and must be kept.
    const historicalMemberIds = new Set<string>();
    for (const groupId of affectedGroupIds) {
      const tournaments = await ctx.db
        .query("tournaments")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .collect();
      const tournamentHistory: Array<{
        playerIds: Array<string>;
        matches: Array<{ teamA: Array<string>; teamB: Array<string> }>;
      }> = [];
      for (const tournament of tournaments) {
        const matches = await ctx.db
          .query("matches")
          .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
          .collect();
        tournamentHistory.push({
          playerIds: tournament.playerIds as Array<string>,
          matches: matches.map((match) => ({
            teamA: match.teamA as Array<string>,
            teamB: match.teamB as Array<string>,
          })),
        });
      }
      for (const memberId of collectHistoricalMemberIds(tournamentHistory)) {
        historicalMemberIds.add(memberId);
      }
    }

    for (const membership of memberships) {
      if (membership.role !== "admin") continue;

      const groupMembers = await ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", membership.groupId))
        .collect();

      const hasOtherAdmin = (
        await Promise.all(
          groupMembers.map(async (member) => {
            if (member.userId === user._id || member.role !== "admin") return false;
            const memberUser = await ctx.db.get("users", member.userId);
            return !!memberUser;
          })
        )
      ).some(Boolean);
      if (hasOtherAdmin) continue;

      let replacement:
        | (typeof groupMembers)[number]
        | undefined;
      for (const member of groupMembers) {
        if (member.userId === user._id) continue;
        const memberUser = await ctx.db.get("users", member.userId);
        if (!memberUser) continue;
        replacement = member;
        break;
      }
      if (replacement) {
        await ctx.db.patch("groupMembers", replacement._id, { role: "admin" });
      }
    }

    for (const membership of memberships) {
      if (historicalMemberIds.has(membership._id)) {
        await ctx.db.patch("groupMembers", membership._id, { role: "member" });
      } else {
        await ctx.db.delete("groupMembers", membership._id);
      }
    }

    for (const groupId of affectedGroupIds) {
      const remainingMembers = await ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .collect();
      const hasActiveMember = (
        await Promise.all(
          remainingMembers.map(async (member) => {
            if (member.userId === user._id) return false;
            const memberUser = await ctx.db.get("users", member.userId);
            return !!memberUser;
          })
        )
      ).some(Boolean);
      if (hasActiveMember) continue;

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
      for (const member of remainingMembers) {
        await ctx.db.delete("groupMembers", member._id);
      }

      await ctx.db.delete("groups", groupId);
    }

    await ctx.db.delete("users", user._id);
  },
});
