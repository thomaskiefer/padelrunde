import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireGroupAdmin, requireGroupMember } from "./helpers";
import {
  determineWinningSide,
  validateKnockoutScore,
  validateScore,
} from "./model/validation";

const KNOCKOUT_PHASES = new Set(["semifinal", "bronze", "final"]);

export const getByRound = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get("rounds", roundId);
    if (!round) return [];

    const tournament = await ctx.db.get("tournaments", round.tournamentId);
    if (!tournament) return [];
    await requireGroupMember(ctx, tournament.groupId);

    const matches = await ctx.db
      .query("matches")
      .withIndex("by_round", (q) => q.eq("roundId", roundId))
      .collect();

    // Enrich with player display names and round phase
    return Promise.all(
      matches.map(async (m) => {
        const teamANames = await Promise.all(
          m.teamA.map(async (id) => {
            const member = await ctx.db.get("groupMembers", id);
            return member?.displayName ?? "?";
          })
        );
        const teamBNames = await Promise.all(
          m.teamB.map(async (id) => {
            const member = await ctx.db.get("groupMembers", id);
            return member?.displayName ?? "?";
          })
        );
        return { ...m, teamANames, teamBNames, phase: round.phase };
      })
    );
  },
});

export const getByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) return [];
    await requireGroupMember(ctx, tournament.groupId);

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
    winningSide: v.optional(v.union(v.literal("A"), v.literal("B"))),
  },
  handler: async (ctx, { matchId, scoreA, scoreB, winningSide }) => {
    const match = await ctx.db.get("matches", matchId);
    if (!match) throw new ConvexError("Spiel nicht gefunden");

    const tournament = await ctx.db.get("tournaments", match.tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");

    const { user } = await requireGroupMember(ctx, tournament.groupId);

    // Check round phase for knockout validation
    const round = await ctx.db.get("rounds", match.roundId);
    const isKnockout = round && KNOCKOUT_PHASES.has(round.phase);

    if (isKnockout) {
      const validation = validateKnockoutScore(scoreA, scoreB, winningSide);
      if (!validation.valid) {
        throw new ConvexError(validation.error);
      }
    } else {
      const validation = validateScore(scoreA, scoreB);
      if (!validation.valid) {
        throw new ConvexError(validation.error);
      }
    }

    if (match.status === "completed") {
      throw new ConvexError("Ergebnis wurde bereits eingetragen");
    }

    const resolvedWinningSide =
      determineWinningSide(scoreA, scoreB) ?? winningSide;

    await ctx.db.patch("matches", matchId, {
      scoreA,
      scoreB,
      status: "completed",
      reportedBy: user._id,
      winningSide: resolvedWinningSide,
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
    const match = await ctx.db.get("matches", matchId);
    if (!match) throw new ConvexError("Spiel nicht gefunden");

    const tournament = await ctx.db.get("tournaments", match.tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");

    const user = await requireGroupAdmin(ctx, tournament.groupId);

    // Check round phase for knockout validation
    const round = await ctx.db.get("rounds", match.roundId);
    const isKnockout = round && KNOCKOUT_PHASES.has(round.phase);

    if (isKnockout) {
      const validation = validateKnockoutScore(scoreA, scoreB, winningSide);
      if (!validation.valid) {
        throw new ConvexError(validation.error);
      }
    } else {
      const validation = validateScore(scoreA, scoreB);
      if (!validation.valid) {
        throw new ConvexError(validation.error);
      }
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
      determineWinningSide(scoreA, scoreB) ?? winningSide;

    await ctx.db.patch("matches", matchId, {
      scoreA,
      scoreB,
      status: "completed",
      reportedBy: user._id,
      winningSide: resolvedWinningSide,
      editHistory: history,
    });
  },
});

export const allMatchesCompletedForPhase = query({
  args: {
    tournamentId: v.id("tournaments"),
    phase: v.string(),
  },
  handler: async (ctx, { tournamentId, phase }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) return false;
    await requireGroupMember(ctx, tournament.groupId);

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const phaseRounds = rounds.filter((r) => r.phase === phase);
    if (phaseRounds.length === 0) return false;

    const roundIds = new Set(phaseRounds.map((r) => r._id));
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const phaseMatches = matches.filter((m) => roundIds.has(m.roundId));
    return (
      phaseMatches.length > 0 &&
      phaseMatches.every((m) => m.status === "completed")
    );
  },
});
