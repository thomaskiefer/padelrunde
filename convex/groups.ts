import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireGroupAdmin } from "./helpers";

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

    if (user.isDeveloper) {
      return ctx.db.query("groups").collect();
    }

    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const groups = await Promise.all(
      memberships.map((m) => ctx.db.get(m.groupId))
    );
    return groups.filter(Boolean);
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

export const getMembers = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    return Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { ...m, avatarUrl: user?.avatarUrl };
      })
    );
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, { name, slug }) => {
    const user = await requireAuth(ctx);

    if (!user.canCreateGroup && !user.isDeveloper) {
      throw new ConvexError("Keine Berechtigung zum Erstellen einer Gruppe");
    }
    if (user.hasCreatedGroup && !user.isDeveloper) {
      throw new ConvexError("Du hast bereits eine Gruppe erstellt");
    }

    const existing = await ctx.db
      .query("groups")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new ConvexError("Dieser Gruppenname ist bereits vergeben");

    const groupId = await ctx.db.insert("groups", {
      name,
      slug,
      createdBy: user._id,
      isPaid: false,
    });

    await ctx.db.insert("groupMembers", {
      groupId,
      userId: user._id,
      role: "admin",
      displayName: user.name,
    });

    if (!user.isDeveloper) {
      await ctx.db.patch(user._id, { hasCreatedGroup: true });
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

    const existing = await ctx.db
      .query("groupMembers")
      .withIndex("by_group_and_user", (q) =>
        q.eq("groupId", groupId).eq("userId", userId)
      )
      .unique();
    if (existing) throw new ConvexError("Bereits Mitglied");

    return ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: role ?? "member",
      displayName,
    });
  },
});

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("groupMembers"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { memberId, role }) => {
    const member = await ctx.db.get(memberId);
    if (!member) throw new ConvexError("Mitglied nicht gefunden");
    await requireGroupAdmin(ctx, member.groupId);
    await ctx.db.patch(memberId, { role });
  },
});
