import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireGroupAdmin, requireGroupMember } from "./helpers";
import { generateAmericanoPairings } from "./model/pairings";
import { generateKnockoutSeeding, resolveKnockoutAdvancement  } from "./model/knockout";
import { computeStandings } from "./model/standings";

export const listByTournament = query({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) return [];
    await requireGroupMember(ctx, tournament.groupId);

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
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);

    if (tournament.status !== "setup") {
      throw new ConvexError("Turnier wurde bereits gestartet");
    }

    const playerIds = tournament.playerIds;
    const n = playerIds.length;
    const courts = tournament.courts;
    const playerValidity = await Promise.all(
      playerIds.map(async (memberId) => {
        const member = await ctx.db.get("groupMembers", memberId);
        if (!member || member.groupId !== tournament.groupId) return false;
        if (member.isGuest) return true;
        return member.userId
          ? Boolean(await ctx.db.get("users", member.userId))
          : false;
      })
    );
    if (playerValidity.some((isValid) => !isValid)) {
      throw new ConvexError(
        "Alle Spieler müssen aktive Mitglieder dieser Gruppe sein"
      );
    }

    // Generate pairings using round-robin partner rotation
    const pairings = generateAmericanoPairings(n);

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

    await ctx.db.patch("tournaments", tournamentId, { status: "active" });
  },
});

// Generate knockout rounds (semifinals) from preliminary standings
export const generateKnockoutRounds = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);

    if (tournament.mode !== "cup") {
      throw new ConvexError("K.O.-Phase nur im Cup-Modus");
    }
    if (tournament.status !== "active") {
      throw new ConvexError("Turnier muss aktiv sein");
    }

    // Verify all preliminary matches are completed
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const prelimRounds = rounds.filter((r) => r.phase === "preliminary");
    const prelimRoundIds = new Set(prelimRounds.map((r) => r._id));

    const allMatches = await ctx.db
      .query("matches")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const prelimMatches = allMatches.filter((m) => prelimRoundIds.has(m.roundId));

    if (prelimMatches.some((m) => m.status !== "completed")) {
      throw new ConvexError("Alle Vorrundenspiele müssen abgeschlossen sein");
    }

    // Compute standings from preliminary matches
    const completedMatches = prelimMatches
      .filter((m) => m.scoreA !== undefined && m.scoreB !== undefined)
      .map((m) => ({
        teamA: m.teamA as Array<string>,
        teamB: m.teamB as Array<string>,
        scoreA: m.scoreA!,
        scoreB: m.scoreB!,
      }));

    const displayNames: Record<string, string> = {};
    for (const playerId of tournament.playerIds) {
      const member = await ctx.db.get("groupMembers", playerId);
      displayNames[playerId] = member?.displayName ?? "?";
    }

    const standings = computeStandings(
      tournament.playerIds as Array<string>,
      displayNames,
      completedMatches
    );

    // Generate knockout seeding
    const bracket = generateKnockoutSeeding(standings);

    // Create semifinal round
    const sfRoundId = await ctx.db.insert("rounds", {
      tournamentId,
      roundNumber: prelimRounds.length + 1,
      phase: "semifinal",
    });

    // Insert SF1 and SF2
    for (let i = 0; i < bracket.semifinals.length; i++) {
      const sf = bracket.semifinals[i];
      await ctx.db.insert("matches", {
        roundId: sfRoundId,
        tournamentId,
        court: (i % tournament.courts) + 1,
        teamA: sf.teamA as any,
        teamB: sf.teamB as any,
        status: "scheduled",
      });
    }

    await ctx.db.patch("tournaments", tournamentId, { status: "knockout" });
  },
});

// After semifinals complete, create final + bronze matches
export const advanceToFinals = mutation({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, { tournamentId }) => {
    const tournament = await ctx.db.get("tournaments", tournamentId);
    if (!tournament) throw new ConvexError("Turnier nicht gefunden");
    await requireGroupAdmin(ctx, tournament.groupId);

    if (tournament.status !== "knockout") {
      throw new ConvexError("Turnier muss in K.O.-Phase sein");
    }

    // Find semifinal round and matches
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_tournament", (q) => q.eq("tournamentId", tournamentId))
      .collect();
    const sfRound = rounds.find((r) => r.phase === "semifinal");
    if (!sfRound) throw new ConvexError("Halbfinalrunde nicht gefunden");

    const sfMatches = await ctx.db
      .query("matches")
      .withIndex("by_round", (q) => q.eq("roundId", sfRound._id))
      .collect();

    if (sfMatches.length !== 2) {
      throw new ConvexError("Genau 2 Halbfinalspiele erwartet");
    }
    if (sfMatches.some((m) => m.status !== "completed" || !m.winningSide)) {
      throw new ConvexError("Beide Halbfinalspiele müssen abgeschlossen sein");
    }

    // Check if final/bronze already exist
    if (rounds.some((r) => r.phase === "final" || r.phase === "bronze")) {
      throw new ConvexError("Finale wurde bereits erstellt");
    }

    const advancement = resolveKnockoutAdvancement(
      {
        teamA: sfMatches[0].teamA as Array<string>,
        teamB: sfMatches[0].teamB as Array<string>,
        winningSide: sfMatches[0].winningSide!,
      },
      {
        teamA: sfMatches[1].teamA as Array<string>,
        teamB: sfMatches[1].teamB as Array<string>,
        winningSide: sfMatches[1].winningSide!,
      }
    );

    // Create final round
    const finalRoundId = await ctx.db.insert("rounds", {
      tournamentId,
      roundNumber: sfRound.roundNumber + 1,
      phase: "final",
    });
    await ctx.db.insert("matches", {
      roundId: finalRoundId,
      tournamentId,
      court: 1,
      teamA: advancement.finalTeamA as any,
      teamB: advancement.finalTeamB as any,
      status: "scheduled",
    });

    // Create bronze round
    const bronzeRoundId = await ctx.db.insert("rounds", {
      tournamentId,
      roundNumber: sfRound.roundNumber + 2,
      phase: "bronze",
    });
    const bronzeCourt = tournament.courts > 1 ? 2 : 1;
    await ctx.db.insert("matches", {
      roundId: bronzeRoundId,
      tournamentId,
      court: bronzeCourt,
      teamA: advancement.bronzeTeamA as any,
      teamB: advancement.bronzeTeamB as any,
      status: "scheduled",
    });
  },
});
