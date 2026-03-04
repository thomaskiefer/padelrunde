import { v } from "convex/values";
import { query } from "./_generated/server";

export const getStandings = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) return [];

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();

    const completedMatches = matches.filter((m) => m.status === "completed");

    // Build stats per player (groupMember ID)
    const stats: Record<
      string,
      {
        playerId: string;
        displayName: string;
        points: number;
        wins: number;
        losses: number;
        draws: number;
        matches: number;
        diff: number;
      }
    > = {};

    // Initialize all players
    for (const playerId of tournament.playerIds) {
      const member = await ctx.db.get(playerId);
      stats[playerId] = {
        playerId,
        displayName: member?.displayName ?? "?",
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        matches: 0,
        diff: 0,
      };
    }

    // Accumulate stats from completed matches
    for (const match of completedMatches) {
      if (match.scoreA === undefined || match.scoreB === undefined) continue;

      for (const playerId of match.teamA) {
        const s = stats[playerId];
        if (!s) continue;
        s.matches++;
        s.points += match.scoreA;
        s.diff += match.scoreA - match.scoreB;
        if (match.scoreA > match.scoreB) s.wins++;
        else if (match.scoreA < match.scoreB) s.losses++;
        else s.draws++;
      }

      for (const playerId of match.teamB) {
        const s = stats[playerId];
        if (!s) continue;
        s.matches++;
        s.points += match.scoreB;
        s.diff += match.scoreB - match.scoreA;
        if (match.scoreB > match.scoreA) s.wins++;
        else if (match.scoreB < match.scoreA) s.losses++;
        else s.draws++;
      }
    }

    // Sort: by points desc, then by wins desc (tiebreaker)
    const sorted = Object.values(stats).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.diff - a.diff;
    });

    // Assign rank and color tier
    return sorted.map((s, i) => ({
      ...s,
      rank: i + 1,
      tier:
        i < 2 ? "top" : i < 4 ? "high" : i < 6 ? "mid" : "low",
    }));
  },
});
