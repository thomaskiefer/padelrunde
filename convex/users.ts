import { v } from "convex/values";
import {
  internalMutation,
  query,
  mutation,
  type QueryCtx,
} from "./_generated/server";

// Developer Clerk IDs - set these as environment variables
const DEVELOPER_CLERK_IDS = (
  process.env.DEVELOPER_CLERK_IDS ?? ""
).split(",");

export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export const me = query({
  args: {},
  handler: async (ctx) => {
    return getCurrentUser(ctx);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user?.isDeveloper) return [];
    return ctx.db.query("users").collect();
  },
});

export const toggleCanCreateGroup = mutation({
  args: { userId: v.id("users"), canCreateGroup: v.boolean() },
  handler: async (ctx, { userId, canCreateGroup }) => {
    const me = await getCurrentUser(ctx);
    if (!me?.isDeveloper) throw new Error("Not authorized");
    await ctx.db.patch(userId, { canCreateGroup });
  },
});

export const upsertFromClerk = internalMutation({
  args: {
    data: v.object({
      id: v.string(),
      first_name: v.string(),
      last_name: v.string(),
      email_addresses: v.array(
        v.object({
          email_address: v.string(),
          id: v.optional(v.string()),
          verification: v.optional(v.any()),
          linked_to: v.optional(v.any()),
          object: v.optional(v.string()),
          created_at: v.optional(v.any()),
          updated_at: v.optional(v.any()),
        })
      ),
      image_url: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { data }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", data.id))
      .unique();

    const name = [data.first_name, data.last_name].filter(Boolean).join(" ");
    const email = data.email_addresses[0]?.email_address ?? "";
    const isDeveloper = DEVELOPER_CLERK_IDS.includes(data.id);

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        email,
        avatarUrl: data.image_url,
        isDeveloper,
      });
    } else {
      await ctx.db.insert("users", {
        clerkId: data.id,
        name,
        email,
        avatarUrl: data.image_url,
        isDeveloper,
        canCreateGroup: isDeveloper,
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
    if (user) {
      await ctx.db.delete(user._id);
    }
  },
});
