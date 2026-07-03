import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireGroupAdmin, requireGroupMember } from "./helpers";
import {
  determineWinningSide,
  validateKnockoutScore,
  validateScore,
} from "./model/validation";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const KNOCKOUT_PHASES = new Set(["semifinal", "bronze", "final"]);

// Blocks score edits whose result has already been consumed by a downstream
// round or by finalization, which would otherwise leave the bracket / champion
// pointing at stale teams. A completed preliminary result is locked once the
// knockout phase has been seeded from it; a semifinal result is locked once the
// final/bronze matches have been generated from it; nothing is editable once
// the tournament is finished.
async function assertMatchResultEditable(
  ctx: QueryCtx | MutationCtx,
  tournament: Doc<"tournaments">,
  round: Doc<"rounds"> | null
) {
  if (tournament.status === "finished") {
    throw new ConvexError(
      "Turnier ist abgeschlossen – Ergebnisse können nicht mehr geändert werden"
    );
  }
  if (!round) return;
  if (round.phase !== "preliminary" && round.phase !== "semifinal") return;

  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_tournament", (q) => q.eq("tournamentId", tournament._id))
    .collect();

  if (
    round.phase === "preliminary" &&
    rounds.some((r) => KNOCKOUT_PHASES.has(r.phase))
  ) {
    throw new ConvexError(
      "Vorrundenergebnisse können nach Start der K.O.-Phase nicht mehr geändert werden"
    );
  }
  if (
    round.phase === "semifinal" &&
    rounds.some((r) => r.phase === "final" || r.phase === "bronze")
  ) {
    throw new ConvexError(
      "Halbfinalergebnisse können nach Erstellung des Finales nicht mehr geändert werden"
    );
  }
}

async function isMatchParticipant(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  memberIds: Array<string>
) {
  const members = await Promise.all(
    memberIds.map((memberId) => ctx.db.get("groupMembers", memberId as any))
  );
  return members.some((member) => member?.userId === userId);
}

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

    const participantIds = [...match.teamA, ...match.teamB] as Array<string>;
    const isParticipant = await isMatchParticipant(ctx, user._id, participantIds);
    if (!isParticipant) {
      throw new ConvexError(
        "Nur beteiligte Teams können Ergebnisse eintragen"
      );
    }

    // Check round phase for knockout validation
    const round = await ctx.db.get("rounds", match.roundId);
    const isKnockout = round && KNOCKOUT_PHASES.has(round.phase);

    await assertMatchResultEditable(ctx, tournament, round);

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

    // A non-knockout draw has no winner: never persist a client-supplied
    // winningSide for it. Knockout draws require an explicitly chosen winner.
    const resolvedWinningSide = isKnockout
      ? (determineWinningSide(scoreA, scoreB) ?? winningSide)
      : determineWinningSide(scoreA, scoreB);

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

    await assertMatchResultEditable(ctx, tournament, round);

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
        // Preserve the prior winner so a knockout winner-flip on an unchanged
        // 16:16 tie is not audited as a meaningless no-op edit.
        previousWinningSide: match.winningSide,
      });
    }

    // A non-knockout draw has no winner: never persist a client-supplied
    // winningSide for it. Knockout draws require an explicitly chosen winner.
    const resolvedWinningSide = isKnockout
      ? (determineWinningSide(scoreA, scoreB) ?? winningSide)
      : determineWinningSide(scoreA, scoreB);

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
