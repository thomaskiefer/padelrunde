import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  hasActiveGroupMembers,
  requireGroupAdmin,
  requireGroupMember,
} from "./helpers";
import { validateTournamentConfig } from "./model/validation";

export const get = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) return null;
    if (!(await hasActiveGroupMembers(ctx, tournament.groupId))) return null;

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
          q.eq("groupId", tournament.groupId).eq("userId", user._id)
        )
        .unique();
      if (!membership) return null;
    }

    return tournament;
  },
});

export const listByGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    await requireGroupMember(ctx, groupId);

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
    mode: v.union(v.literal("americano"), v.literal("cup")),
    courts: v.number(),
    playerIds: v.array(v.id("groupMembers")),
  },
  handler: async (ctx, { groupId, name, mode, courts, playerIds }) => {
    const user = await requireGroupAdmin(ctx, groupId);
    const trimmedName = name.trim();

    if (!trimmedName) {
      throw new ConvexError("Turniername darf nicht leer sein");
    }

    const configValidation = validateTournamentConfig(mode, playerIds.length, courts);
    if (!configValidation.valid) {
      throw new ConvexError(configValidation.error);
    }

    if (new Set(playerIds).size !== playerIds.length) {
      throw new ConvexError("Spieler dürfen nicht doppelt ausgewählt werden");
    }

    const memberValidity = await Promise.all(
      playerIds.map(async (memberId) => {
        const member = await ctx.db.get("groupMembers", memberId);
        if (!member || member.groupId !== groupId) return false;
        const memberUser = await ctx.db.get("users", member.userId);
        return Boolean(memberUser);
      })
    );
    const hasInvalidMember = memberValidity.some((isValid) => !isValid);
    if (hasInvalidMember) {
      throw new ConvexError(
        "Alle Spieler müssen aktive Mitglieder dieser Gruppe sein"
      );
    }

    return ctx.db.insert("tournaments", {
      groupId,
      name: trimmedName,
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
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);

    if (status !== "finished") {
      throw new ConvexError("Statuswechsel nur zum Abschluss erlaubt");
    }

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    if (tournament.mode === "americano") {
      const preliminaryRoundIds = new Set(
        rounds.filter((round) => round.phase === "preliminary").map((round) => round._id)
      );
      const preliminaryMatches = matches.filter((match) =>
        preliminaryRoundIds.has(match.roundId)
      );
      if (
        preliminaryMatches.length === 0 ||
        preliminaryMatches.some((match) => match.status !== "completed")
      ) {
        throw new ConvexError(
          "Americano kann erst nach allen Vorrundenspielen beendet werden"
        );
      }
    } else {
      const finalRoundIds = new Set(
        rounds.filter((round) => round.phase === "final").map((round) => round._id)
      );
      const bronzeRoundIds = new Set(
        rounds.filter((round) => round.phase === "bronze").map((round) => round._id)
      );
      const finalMatches = matches.filter((match) => finalRoundIds.has(match.roundId));
      const bronzeMatches = matches.filter((match) =>
        bronzeRoundIds.has(match.roundId)
      );

      if (
        finalMatches.length === 0 ||
        bronzeMatches.length === 0 ||
        finalMatches.some((match) => match.status !== "completed") ||
        bronzeMatches.some((match) => match.status !== "completed")
      ) {
        throw new ConvexError(
          "Cup kann erst nach Finale und Spiel um Platz 3 beendet werden"
        );
      }
    }

    await ctx.db.patch("tournaments", tournamentId, { status });
  },
});
