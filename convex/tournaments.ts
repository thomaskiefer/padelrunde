import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireGroupAdmin } from "./helpers";

export const get = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return ctx.db.get(tournamentId);
  },
});

export const listByGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    return ctx.db
      .query("tournaments")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();
  },
});

export const create = mutation({
  args: {
    groupId: v.id("groups"),
    name: v.string(),
    mode: v.union(v.literal("amerikaner"), v.literal("cup")),
    courts: v.number(),
    playerIds: v.array(v.id("groupMembers")),
  },
  handler: async (ctx, { groupId, name, mode, courts, playerIds }) => {
    const user = await requireGroupAdmin(ctx, groupId);

    if (courts < 1 || courts > 2) {
      throw new ConvexError("1 oder 2 Plätze erlaubt");
    }
    if (mode === "cup" && playerIds.length !== 8) {
      throw new ConvexError("Cup-Modus erfordert genau 8 Spieler");
    }
    if (playerIds.length < 4 || playerIds.length > 8) {
      throw new ConvexError("4 bis 8 Spieler erforderlich");
    }
    if (playerIds.length % 4 !== 0) {
      throw new ConvexError("Spieleranzahl muss durch 4 teilbar sein");
    }

    return ctx.db.insert("tournaments", {
      groupId,
      name,
      mode,
      status: "setup",
      courts,
      playerIds,
      createdBy: user._id,
      createdAt: Date.now(),
    });
  },
});

export const updateStatus = mutation({
  args: {
    tournamentId: v.id("tournaments"),
    status: v.union(
      v.literal("setup"),
      v.literal("active"),
      v.literal("knockout"),
      v.literal("finished")
    ),
  },
  handler: async (ctx, { tournamentId, status }) => {
    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);
    await ctx.db.patch(tournamentId, { status });
  },
});
