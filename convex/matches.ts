import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireGroupAdmin } from "./helpers";

export const getByRound = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();

    // Enrich with player display names
    return Promise.all(
      matches.map(async (m) => {
        const teamANames = await Promise.all(
          m.teamA.map(async (id) => {
            const member = await ctx.db.get(id);
            return member?.displayName ?? "?";
          })
        );
        const teamBNames = await Promise.all(
          m.teamB.map(async (id) => {
            const member = await ctx.db.get(id);
            return member?.displayName ?? "?";
          })
        );
        return { ...m, teamANames, teamBNames };
      })
    );
  },
});

export const getByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
  },
});

export const submitScore = mutation({
  args: {
    matchId: v.id("matches"),
    scoreA: v.number(),
    scoreB: v.number(),
  },
  handler: async (ctx, { matchId, scoreA, scoreB }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new ConvexError("Spiel nicht gefunden");

    const tournament = await ctx.db.get(match.tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");

    const user = await requireAuth(ctx);

    // Validate score sum
    if (scoreA + scoreB !== 32) {
      throw new ConvexError("Punkte müssen zusammen 32 ergeben");
    }
    if (scoreA < 0 || scoreB < 0) {
      throw new ConvexError("Punkte dürfen nicht negativ sein");
    }

    // Check if already completed
    if (match.status === "completed") {
      throw new ConvexError("Ergebnis wurde bereits eingetragen");
    }

    // Determine winner side for knockout matches
    let winningSide: "A" | "B" | undefined;
    if (scoreA !== scoreB) {
      winningSide = scoreA > scoreB ? "A" : "B";
    }

    await ctx.db.patch(matchId, {
      scoreA,
      scoreB,
      status: "completed",
      reportedBy: user._id,
      winningSide,
    });
  },
});

export const adminEditScore = mutation({
  args: {
    matchId: v.id("matches"),
    scoreA: v.number(),
    scoreB: v.number(),
    winningSide: v.optional(v.union(v.literal("A"), v.literal("B"))),
  },
  handler: async (ctx, { matchId, scoreA, scoreB, winningSide }) => {
    const match = await ctx.db.get(matchId);
    if (!match) throw new ConvexError("Spiel nicht gefunden");

    const tournament = await ctx.db.get(match.tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");

    const user = await requireGroupAdmin(ctx, tournament.groupId);

    if (scoreA + scoreB !== 32) {
      throw new ConvexError("Punkte müssen zusammen 32 ergeben");
    }
    if (scoreA < 0 || scoreB < 0) {
      throw new ConvexError("Punkte dürfen nicht negativ sein");
    }

    const history = match.editHistory ?? [];
    if (match.scoreA !== undefined && match.scoreB !== undefined) {
      history.push({
        editedBy: user._id,
        editedAt: Date.now(),
        previousScoreA: match.scoreA,
        previousScoreB: match.scoreB,
      });
    }

    const resolvedWinningSide =
      winningSide ?? (scoreA !== scoreB ? (scoreA > scoreB ? "A" : "B") : undefined);

    await ctx.db.patch(matchId, {
      scoreA,
      scoreB,
      status: "completed",
      reportedBy: user._id,
      winningSide: resolvedWinningSide,
      editHistory: history,
    });
  },
});
