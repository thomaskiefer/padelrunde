import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireGroupMember } from "./helpers";
import { computePartnerOpponentStats } from "./model/stats";

export const getStats = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) return [];
    await requireGroupMember(ctx, tournament.groupId);

    // Only count preliminary matches for stats
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const prelimRoundIds = new Set(
      rounds.filter((r) => r.phase === "preliminary").map((r) => r._id)
    );

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    const completedMatches = matches
      .filter(
        (m) =>
          prelimRoundIds.has(m.roundId) &&
          m.status === "completed" &&
          m.scoreA !== undefined &&
          m.scoreB !== undefined
      )
      .map((m) => ({
        teamA: m.teamA as Array<string>,
        teamB: m.teamB as Array<string>,
      }));

    // Build display name map
    const displayNames: Record<string, string> = {};
    for (const playerId of tournament.playerIds) {
      const member = await ctx.db.get("groupMembers", playerId);
      displayNames[playerId] = member?.displayName ?? "?";
    }

    return computePartnerOpponentStats(
      tournament.playerIds as Array<string>,
      displayNames,
      completedMatches
    );
  },
});
