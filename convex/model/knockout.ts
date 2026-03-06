export interface KnockoutMatch {
  teamA: [string, string];
  teamB: [string, string];
  round: "semifinal" | "bronze" | "final";
}

export interface KnockoutBracket {
  semifinals: [KnockoutMatch, KnockoutMatch];
  bronze: KnockoutMatch;
  final: KnockoutMatch;
}

// Generates knockout seeding from sorted standings (rank 1-8)
// SF1: Rank 1+8 vs Rank 2+7
// SF2: Rank 3+6 vs Rank 4+5
export function generateKnockoutSeeding(
  standings: Array<{ playerId: string; rank: number }>
): KnockoutBracket {
  if (standings.length !== 8) {
    throw new Error("Knockout requires exactly 8 players");
  }

  const byRank = [...standings].sort((a, b) => a.rank - b.rank);
  const p = byRank.map((s) => s.playerId);

  // p[0]=rank1, p[1]=rank2, ..., p[7]=rank8
  const sf1: KnockoutMatch = {
    teamA: [p[0], p[7]], // Rank 1 + 8
    teamB: [p[1], p[6]], // Rank 2 + 7
    round: "semifinal",
  };

  const sf2: KnockoutMatch = {
    teamA: [p[2], p[5]], // Rank 3 + 6
    teamB: [p[3], p[4]], // Rank 4 + 5
    round: "semifinal",
  };

  // Bronze and final are placeholders — filled after SF results
  const bronze: KnockoutMatch = {
    teamA: ["TBD", "TBD"],
    teamB: ["TBD", "TBD"],
    round: "bronze",
  };

  const final: KnockoutMatch = {
    teamA: ["TBD", "TBD"],
    teamB: ["TBD", "TBD"],
    round: "final",
  };

  return {
    semifinals: [sf1, sf2],
    bronze,
    final,
  };
}

export interface SemifinalResult {
  teamA: Array<string>;
  teamB: Array<string>;
  winningSide: "A" | "B";
}

export function resolveKnockoutAdvancement(
  sf1: SemifinalResult,
  sf2: SemifinalResult
): {
  finalTeamA: Array<string>;
  finalTeamB: Array<string>;
  bronzeTeamA: Array<string>;
  bronzeTeamB: Array<string>;
} {
  const sf1Winner = sf1.winningSide === "A" ? sf1.teamA : sf1.teamB;
  const sf1Loser = sf1.winningSide === "A" ? sf1.teamB : sf1.teamA;
  const sf2Winner = sf2.winningSide === "A" ? sf2.teamA : sf2.teamB;
  const sf2Loser = sf2.winningSide === "A" ? sf2.teamB : sf2.teamA;

  return {
    finalTeamA: sf1Winner,
    finalTeamB: sf2Winner,
    bronzeTeamA: sf1Loser,
    bronzeTeamB: sf2Loser,
  };
}
