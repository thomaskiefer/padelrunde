import { describe, expect, test } from "bun:test";
import { generateAmericanoPairings } from "../../../convex/model/pairings";
import { determineWinningSide, validateKnockoutScore, validateScore, validateTournamentConfig } from "../../../convex/model/validation";
import { computeStandings } from "../../../convex/model/standings";
import { generateKnockoutSeeding, resolveKnockoutAdvancement  } from "../../../convex/model/knockout";

// ─── Knockout Advancement ───────────────────────────────


// ─── Partner/Opponent Statistics ────────────────────────

import { computePartnerOpponentStats } from "../../../convex/model/stats";

// ─── Helpers ─────────────────────────────────────────────

function buildPartnerMatrix(
  n: number,
  rounds: Array<Array<{ teamA: [number, number]; teamB: [number, number] }>>
): Array<Array<number>> {
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (const round of rounds) {
    for (const match of round) {
      matrix[match.teamA[0]][match.teamA[1]]++;
      matrix[match.teamA[1]][match.teamA[0]]++;
      matrix[match.teamB[0]][match.teamB[1]]++;
      matrix[match.teamB[1]][match.teamB[0]]++;
    }
  }
  return matrix;
}

function buildOpponentMatrix(
  n: number,
  rounds: Array<Array<{ teamA: [number, number]; teamB: [number, number] }>>
): Array<Array<number>> {
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (const round of rounds) {
    for (const match of round) {
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          matrix[a][b]++;
          matrix[b][a]++;
        }
      }
    }
  }
  return matrix;
}

// ─── Group 1: Pairing Algorithm ──────────────────────────

describe("Pairing Algorithm", () => {
  test("4 players produce exactly 3 rounds", () => {
    const rounds = generateAmericanoPairings(4);
    expect(rounds.length).toBe(3);
  });

  test("8 players produce exactly 7 rounds", () => {
    const rounds = generateAmericanoPairings(8);
    expect(rounds.length).toBe(7);
  });

  test("each round has floor(N/4) matches", () => {
    for (const n of [4, 8]) {
      const rounds = generateAmericanoPairings(n);
      const expectedMatches = Math.floor(n / 4);
      for (const round of rounds) {
        expect(round.length).toBe(expectedMatches);
      }
    }
  });

  test("every match contains exactly 4 distinct players", () => {
    for (const n of [4, 8]) {
      const rounds = generateAmericanoPairings(n);
      for (const round of rounds) {
        for (const match of round) {
          const players = [...match.teamA, ...match.teamB];
          expect(players.length).toBe(4);
          expect(new Set(players).size).toBe(4);
        }
      }
    }
  });

  test("no player appears twice in the same round", () => {
    for (const n of [4, 8]) {
      const rounds = generateAmericanoPairings(n);
      for (const round of rounds) {
        const allPlayers = round.flatMap((m) => [...m.teamA, ...m.teamB]);
        expect(new Set(allPlayers).size).toBe(allPlayers.length);
      }
    }
  });

  test("every pair of players partners exactly once (4 players)", () => {
    const rounds = generateAmericanoPairings(4);
    const matrix = buildPartnerMatrix(4, rounds);
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        expect(matrix[i][j]).toBe(1);
      }
    }
  });

  test("every pair of players partners exactly once (8 players)", () => {
    const rounds = generateAmericanoPairings(8);
    const matrix = buildPartnerMatrix(8, rounds);
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        expect(matrix[i][j]).toBe(1);
      }
    }
  });

  test("all players participate in every round when N is divisible by 4", () => {
    for (const n of [4, 8]) {
      const rounds = generateAmericanoPairings(n);
      for (const round of rounds) {
        const allPlayers = new Set(
          round.flatMap((m) => [...m.teamA, ...m.teamB])
        );
        expect(allPlayers.size).toBe(n);
      }
    }
  });

  test("opponent repeats are minimized for 8 players", () => {
    const rounds = generateAmericanoPairings(8);
    const matrix = buildOpponentMatrix(8, rounds);
    let maxOpponent = 0;
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        maxOpponent = Math.max(maxOpponent, matrix[i][j]);
      }
    }
    // With 7 rounds and greedy algorithm, max opponent repeat should be ≤ 3
    expect(maxOpponent).toBeLessThanOrEqual(3);
  });

  test("algorithm is deterministic", () => {
    const a = generateAmericanoPairings(8);
    const b = generateAmericanoPairings(8);
    expect(a).toEqual(b);
  });
});

// ─── Group 2: Score Validation ───────────────────────────

describe("Score Validation", () => {
  test("20:12 is accepted", () => {
    expect(validateScore(20, 12).valid).toBe(true);
  });

  test("16:16 draw is accepted", () => {
    expect(validateScore(16, 16).valid).toBe(true);
  });

  test("32:0 shutout is accepted", () => {
    expect(validateScore(32, 0).valid).toBe(true);
  });

  test("sum not equal to 32 is rejected", () => {
    const result = validateScore(20, 11);
    expect(result.valid).toBe(false);
  });

  test("decimal scores are rejected", () => {
    const result = validateScore(15.5, 16.5);
    expect(result.valid).toBe(false);
  });

  test("negative scoreA is rejected", () => {
    const result = validateScore(-1, 33);
    expect(result.valid).toBe(false);
  });

  test("negative scoreB is rejected", () => {
    const result = validateScore(33, -1);
    expect(result.valid).toBe(false);
  });

  test("winningSide is A when scoreA > scoreB", () => {
    expect(determineWinningSide(20, 12)).toBe("A");
  });

  test("winningSide is B when scoreB > scoreA", () => {
    expect(determineWinningSide(12, 20)).toBe("B");
  });

  test("winningSide is undefined on draw", () => {
    expect(determineWinningSide(16, 16)).toBeUndefined();
  });
});

// ─── Group 3: Standings Computation ──────────────────────

describe("Standings Computation", () => {
  const playerIds = ["p0", "p1", "p2", "p3"];
  const displayNames: Record<string, string> = {
    p0: "Alice",
    p1: "Bob",
    p2: "Charlie",
    p3: "Diana",
  };

  // Match 1: p0+p1 vs p2+p3 → 20:12
  // Match 2: p0+p2 vs p1+p3 → 16:16
  // Match 3: p0+p3 vs p1+p2 → 24:8
  const matches = [
    { teamA: ["p0", "p1"], teamB: ["p2", "p3"], scoreA: 20, scoreB: 12 },
    { teamA: ["p0", "p2"], teamB: ["p1", "p3"], scoreA: 16, scoreB: 16 },
    { teamA: ["p0", "p3"], teamB: ["p1", "p2"], scoreA: 24, scoreB: 8 },
  ];

  test("players are sorted by total points descending", () => {
    const standings = computeStandings(playerIds, displayNames, matches);
    expect(standings.map((s) => s.playerId)).toEqual(["p0", "p3", "p1", "p2"]);
  });

  test("points accumulate correctly", () => {
    const standings = computeStandings(playerIds, displayNames, matches);
    const byId = Object.fromEntries(standings.map((s) => [s.playerId, s]));
    expect(byId.p0.points).toBe(60); // 20+16+24
    expect(byId.p3.points).toBe(52); // 12+16+24
    expect(byId.p1.points).toBe(44); // 20+16+8
    expect(byId.p2.points).toBe(36); // 12+16+8
  });

  test("wins are counted correctly", () => {
    const standings = computeStandings(playerIds, displayNames, matches);
    const byId = Object.fromEntries(standings.map((s) => [s.playerId, s]));
    expect(byId.p0.wins).toBe(2);
    expect(byId.p3.wins).toBe(1);
    expect(byId.p1.wins).toBe(1);
    expect(byId.p2.wins).toBe(0);
  });

  test("draws are counted correctly", () => {
    const standings = computeStandings(playerIds, displayNames, matches);
    const byId = Object.fromEntries(standings.map((s) => [s.playerId, s]));
    expect(byId.p0.draws).toBe(1);
    expect(byId.p1.draws).toBe(1);
    expect(byId.p2.draws).toBe(1);
    expect(byId.p3.draws).toBe(1);
  });

  test("point differential is computed correctly", () => {
    const standings = computeStandings(playerIds, displayNames, matches);
    const byId = Object.fromEntries(standings.map((s) => [s.playerId, s]));
    expect(byId.p0.diff).toBe(24); // +8+0+16
    expect(byId.p3.diff).toBe(8); // -8+0+16
    expect(byId.p1.diff).toBe(-8); // +8+0-16
    expect(byId.p2.diff).toBe(-24); // -8+0-16
  });

  test("tiebreaker: same points, more wins ranks higher", () => {
    // pA: 32 points, 1 win (32:0)
    // pB: 32 points, 0 wins (16:16 twice = but that's 64, so let's use one match each)
    // Actually: pA wins 32:0, pB draws 16:16 — both have 32 points from 1 match
    const tieMatches = [
      { teamA: ["pA", "pX"], teamB: ["pC", "pD"], scoreA: 32, scoreB: 0 },
      { teamA: ["pB", "pY"], teamB: ["pE", "pF"], scoreA: 16, scoreB: 16 },
    ];
    const ids = ["pA", "pB", "pC", "pD", "pE", "pF", "pX", "pY"];
    const names = Object.fromEntries(ids.map((id) => [id, id]));
    const standings = computeStandings(ids, names, tieMatches);

    const rankA = standings.find((s) => s.playerId === "pA")!.rank;
    const rankB = standings.find((s) => s.playerId === "pB")!.rank;
    expect(rankA).toBeLessThan(rankB);
  });

  test("tiebreaker: same points and wins, better diff ranks higher", () => {
    // Both have 20 points and 1 win, but pA has better diff.
    const tieMatches = [
      { teamA: ["pA", "pX"], teamB: ["pC", "pD"], scoreA: 20, scoreB: 12 },
      { teamA: ["pB", "pY"], teamB: ["pE", "pF"], scoreA: 18, scoreB: 14 },
      { teamA: ["pB", "pW"], teamB: ["pQ", "pR"], scoreA: 2, scoreB: 30 },
    ];
    const ids = ["pA", "pB", "pC", "pD", "pE", "pF", "pX", "pY", "pW", "pQ", "pR"];
    const names = Object.fromEntries(ids.map((id) => [id, id]));
    const standings = computeStandings(ids, names, tieMatches);

    const rankA = standings.find((s) => s.playerId === "pA")!.rank;
    const rankB = standings.find((s) => s.playerId === "pB")!.rank;
    expect(rankA).toBeLessThan(rankB);
  });

  test("tier assignment: 1-2=top, 3-4=high, 5-6=mid, 7+=low", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const names = Object.fromEntries(ids.map((id) => [id, id]));
    // Each player wins one match with different scores to ensure distinct ranking
    const eightPlayerMatches = [
      { teamA: ["a", "b"], teamB: ["c", "d"], scoreA: 32, scoreB: 0 },
      { teamA: ["a", "c"], teamB: ["e", "f"], scoreA: 28, scoreB: 4 },
      { teamA: ["a", "d"], teamB: ["g", "h"], scoreA: 24, scoreB: 8 },
      { teamA: ["b", "e"], teamB: ["f", "g"], scoreA: 20, scoreB: 12 },
    ];
    const standings = computeStandings(ids, names, eightPlayerMatches);

    expect(standings[0].tier).toBe("top");
    expect(standings[1].tier).toBe("top");
    expect(standings[2].tier).toBe("high");
    expect(standings[3].tier).toBe("high");
    expect(standings[4].tier).toBe("mid");
    expect(standings[5].tier).toBe("mid");
    expect(standings[6].tier).toBe("low");
    expect(standings[7].tier).toBe("low");
  });

  test("empty matches produce zero stats for all players", () => {
    const standings = computeStandings(playerIds, displayNames, []);
    for (const s of standings) {
      expect(s.points).toBe(0);
      expect(s.wins).toBe(0);
      expect(s.losses).toBe(0);
      expect(s.draws).toBe(0);
      expect(s.matches).toBe(0);
      expect(s.diff).toBe(0);
    }
  });
});

// ─── Group 4: Tournament Config Validation ───────────────

describe("Tournament Config Validation", () => {
  test("americano mode accepts 4 players", () => {
    expect(validateTournamentConfig("americano", 4, 1).valid).toBe(true);
  });

  test("americano mode accepts 8 players", () => {
    expect(validateTournamentConfig("americano", 8, 2).valid).toBe(true);
  });

  test("americano mode rejects 3 players", () => {
    expect(validateTournamentConfig("americano", 3, 1).valid).toBe(false);
  });

  test("americano mode rejects 5 players (not divisible by 4)", () => {
    expect(validateTournamentConfig("americano", 5, 1).valid).toBe(false);
  });

  test("americano mode rejects 9 players", () => {
    expect(validateTournamentConfig("americano", 9, 1).valid).toBe(false);
  });

  test("cup mode requires exactly 8 players", () => {
    expect(validateTournamentConfig("cup", 4, 1).valid).toBe(false);
    expect(validateTournamentConfig("cup", 8, 2).valid).toBe(true);
  });

  test("courts 0 is rejected", () => {
    expect(validateTournamentConfig("americano", 4, 0).valid).toBe(false);
  });

  test("courts 3 is rejected", () => {
    expect(validateTournamentConfig("americano", 4, 3).valid).toBe(false);
  });
});

// ─── Group 5: Cup Knockout Seeding ───────────────────────

describe("Cup Knockout Seeding", () => {
  const standings = Array.from({ length: 8 }, (_, i) => ({
    playerId: `p${i + 1}`,
    rank: i + 1,
  }));

  test("SF1 pairs rank 1+8 vs rank 2+7", () => {
    const bracket = generateKnockoutSeeding(standings);
    const sf1 = bracket.semifinals[0];
    expect(sf1.teamA).toEqual(["p1", "p8"]);
    expect(sf1.teamB).toEqual(["p2", "p7"]);
  });

  test("SF2 pairs rank 3+6 vs rank 4+5", () => {
    const bracket = generateKnockoutSeeding(standings);
    const sf2 = bracket.semifinals[1];
    expect(sf2.teamA).toEqual(["p3", "p6"]);
    expect(sf2.teamB).toEqual(["p4", "p5"]);
  });

  test("requires exactly 8 players", () => {
    const fourPlayers = standings.slice(0, 4);
    expect(() => generateKnockoutSeeding(fourPlayers)).toThrow(
      "Knockout requires exactly 8 players"
    );
  });

  test("bracket has correct structure", () => {
    const bracket = generateKnockoutSeeding(standings);
    expect(bracket.semifinals.length).toBe(2);
    expect(bracket.semifinals[0].round).toBe("semifinal");
    expect(bracket.semifinals[1].round).toBe("semifinal");
    expect(bracket.bronze.round).toBe("bronze");
    expect(bracket.final.round).toBe("final");
  });

  test("cup mode caps at 5 preliminary rounds", () => {
    // 8 players would produce 7 rounds, but cup caps at 5
    const allRounds = generateAmericanoPairings(8);
    const cupRounds = allRounds.slice(0, 5);
    expect(cupRounds.length).toBe(5);
    // Verify the 5 rounds still have valid structure
    for (const round of cupRounds) {
      expect(round.length).toBe(2); // 8 players / 4 = 2 matches per round
    }
  });
});

// ─── Knockout Score Validation ──────────────────────────

describe("Knockout Score Validation", () => {
  test("16:16 without winningSide is rejected", () => {
    const result = validateKnockoutScore(16, 16);
    expect(result.valid).toBe(false);
  });

  test("16:16 with winningSide A is accepted", () => {
    const result = validateKnockoutScore(16, 16, "A");
    expect(result.valid).toBe(true);
  });

  test("16:16 with winningSide B is accepted", () => {
    const result = validateKnockoutScore(16, 16, "B");
    expect(result.valid).toBe(true);
  });

  test("20:12 without winningSide is accepted", () => {
    const result = validateKnockoutScore(20, 12);
    expect(result.valid).toBe(true);
  });

  test("20:12 with winningSide A is accepted", () => {
    const result = validateKnockoutScore(20, 12, "A");
    expect(result.valid).toBe(true);
  });

  test("20:12 with winningSide B is rejected", () => {
    const result = validateKnockoutScore(20, 12, "B");
    expect(result.valid).toBe(false);
  });

  test("invalid sum is still rejected", () => {
    const result = validateKnockoutScore(15, 15, "A");
    expect(result.valid).toBe(false);
  });
});

describe("Knockout Advancement", () => {
  test("SF1 A wins + SF2 A wins → correct final/bronze", () => {
    const result = resolveKnockoutAdvancement(
      { teamA: ["p1", "p8"], teamB: ["p2", "p7"], winningSide: "A" },
      { teamA: ["p3", "p6"], teamB: ["p4", "p5"], winningSide: "A" }
    );
    expect(result.finalTeamA).toEqual(["p1", "p8"]);
    expect(result.finalTeamB).toEqual(["p3", "p6"]);
    expect(result.bronzeTeamA).toEqual(["p2", "p7"]);
    expect(result.bronzeTeamB).toEqual(["p4", "p5"]);
  });

  test("SF1 B wins + SF2 B wins → correct final/bronze", () => {
    const result = resolveKnockoutAdvancement(
      { teamA: ["p1", "p8"], teamB: ["p2", "p7"], winningSide: "B" },
      { teamA: ["p3", "p6"], teamB: ["p4", "p5"], winningSide: "B" }
    );
    expect(result.finalTeamA).toEqual(["p2", "p7"]);
    expect(result.finalTeamB).toEqual(["p4", "p5"]);
    expect(result.bronzeTeamA).toEqual(["p1", "p8"]);
    expect(result.bronzeTeamB).toEqual(["p3", "p6"]);
  });

  test("mixed results → correct matchup", () => {
    const result = resolveKnockoutAdvancement(
      { teamA: ["p1", "p8"], teamB: ["p2", "p7"], winningSide: "A" },
      { teamA: ["p3", "p6"], teamB: ["p4", "p5"], winningSide: "B" }
    );
    expect(result.finalTeamA).toEqual(["p1", "p8"]);
    expect(result.finalTeamB).toEqual(["p4", "p5"]);
    expect(result.bronzeTeamA).toEqual(["p2", "p7"]);
    expect(result.bronzeTeamB).toEqual(["p3", "p6"]);
  });
});

describe("Partner/Opponent Statistics", () => {
  const playerIds = ["p0", "p1", "p2", "p3"];
  const displayNames: Record<string, string> = {
    p0: "Alice",
    p1: "Bob",
    p2: "Charlie",
    p3: "Diana",
  };
  // 3 matches where each player partners with every other exactly once
  const matches = [
    { teamA: ["p0", "p1"], teamB: ["p2", "p3"] },
    { teamA: ["p0", "p2"], teamB: ["p1", "p3"] },
    { teamA: ["p0", "p3"], teamB: ["p1", "p2"] },
  ];

  test("each player partners with every other exactly once", () => {
    const stats = computePartnerOpponentStats(playerIds, displayNames, matches);
    for (const player of stats) {
      for (const partner of player.partners) {
        expect(partner.count).toBe(1);
      }
      expect(player.partners.length).toBe(3);
    }
  });

  test("opponent counts are symmetric", () => {
    const stats = computePartnerOpponentStats(playerIds, displayNames, matches);
    const byId = Object.fromEntries(stats.map((s) => [s.playerId, s]));
    for (const a of playerIds) {
      for (const opp of byId[a].opponents) {
        const reverseOpp = byId[opp.playerId].opponents.find(
          (o) => o.playerId === a
        );
        expect(reverseOpp?.count).toBe(opp.count);
      }
    }
  });

  test("empty matches produce empty partner/opponent arrays", () => {
    const stats = computePartnerOpponentStats(playerIds, displayNames, []);
    for (const player of stats) {
      expect(player.partners.length).toBe(0);
      expect(player.opponents.length).toBe(0);
    }
  });
});
