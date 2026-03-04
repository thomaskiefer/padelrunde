import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireGroupAdmin } from "./helpers";
export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    return ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
  },
});

// Generate all preliminary rounds for a tournament
export const generateRounds = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get(tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);

    if (tournament.status !== "setup") {
      throw new ConvexError("Turnier wurde bereits gestartet");
    }

    const playerIds = tournament.playerIds;
    const n = playerIds.length;
    const courts = tournament.courts;

    // Generate pairings using round-robin partner rotation
    const pairings = generateAmericanerPairings(n);

    // Determine how many rounds to play
    const maxRounds = tournament.mode === "cup" ? 5 : n - 1;
    const roundCount = Math.min(pairings.length, maxRounds);

    for (let r = 0; r < roundCount; r++) {
      const roundId = await ctx.db.insert("rounds", {
        tournamentId,
        roundNumber: r + 1,
        phase: "preliminary",
      });

      const roundMatches = pairings[r];
      for (let m = 0; m < roundMatches.length; m++) {
        const match = roundMatches[m];
        await ctx.db.insert("matches", {
          roundId,
          tournamentId,
          court: (m % courts) + 1,
          teamA: [playerIds[match.teamA[0]], playerIds[match.teamA[1]]],
          teamB: [playerIds[match.teamB[0]], playerIds[match.teamB[1]]],
          status: "scheduled",
        });
      }
    }

    await ctx.db.patch(tournamentId, { status: "active" });
  },
});

// Pure algorithm: generates round-robin partner pairings for N players
// Returns array of rounds, each containing matches with player indices
function generateAmericanerPairings(
  n: number
): Array<Array<{ teamA: [number, number]; teamB: [number, number] }>> {
  // Track partner history (who has been partners with whom)
  const partnered: boolean[][] = Array.from({ length: n }, () =>
    Array(n).fill(false)
  );
  // Track opponent count
  const opponentCount: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(0)
  );

  const rounds: Array<
    Array<{ teamA: [number, number]; teamB: [number, number] }>
  > = [];

  const totalRounds = n - 1;

  for (let r = 0; r < totalRounds; r++) {
    const available = Array.from({ length: n }, (_, i) => i);
    const roundMatches: Array<{
      teamA: [number, number];
      teamB: [number, number];
    }> = [];

    while (available.length >= 4) {
      // Find best team A (prefer players who haven't partnered)
      let bestTeamA: [number, number] | null = null;
      let bestTeamAScore = Infinity;

      for (let i = 0; i < available.length; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const a = available[i];
          const b = available[j];
          const score = partnered[a][b] ? 1 : 0;
          if (score < bestTeamAScore) {
            bestTeamAScore = score;
            bestTeamA = [a, b];
            if (score === 0) break;
          }
        }
        if (bestTeamAScore === 0) break;
      }

      if (!bestTeamA) break;

      const remainingAfterA = available.filter(
        (x) => x !== bestTeamA![0] && x !== bestTeamA![1]
      );

      // Find best team B (prefer new partners, minimize opponent repeats)
      let bestTeamB: [number, number] | null = null;
      let bestTeamBScore = Infinity;

      for (let i = 0; i < remainingAfterA.length; i++) {
        for (let j = i + 1; j < remainingAfterA.length; j++) {
          const c = remainingAfterA[i];
          const d = remainingAfterA[j];
          const partnerScore = partnered[c][d] ? 10 : 0;
          const oppScore =
            opponentCount[bestTeamA[0]][c] +
            opponentCount[bestTeamA[0]][d] +
            opponentCount[bestTeamA[1]][c] +
            opponentCount[bestTeamA[1]][d];
          const score = partnerScore + oppScore;
          if (score < bestTeamBScore) {
            bestTeamBScore = score;
            bestTeamB = [c, d];
          }
        }
      }

      if (!bestTeamB) break;

      // Update tracking
      partnered[bestTeamA[0]][bestTeamA[1]] = true;
      partnered[bestTeamA[1]][bestTeamA[0]] = true;
      partnered[bestTeamB[0]][bestTeamB[1]] = true;
      partnered[bestTeamB[1]][bestTeamB[0]] = true;

      for (const a of bestTeamA) {
        for (const b of bestTeamB) {
          opponentCount[a][b]++;
          opponentCount[b][a]++;
        }
      }

      roundMatches.push({ teamA: bestTeamA, teamB: bestTeamB });

      // Remove used players from available
      const used = new Set([...bestTeamA, ...bestTeamB]);
      available.splice(0, available.length, ...available.filter((x) => !used.has(x)));
    }

    rounds.push(roundMatches);
  }

  return rounds;
}
