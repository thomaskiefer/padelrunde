export interface MatchResult {
  teamA: Array<string>;
  teamB: Array<string>;
  scoreA: number;
  scoreB: number;
}

export interface PlayerStanding {
  playerId: string;
  displayName: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  diff: number;
  rank: number;
  tier: "top" | "high" | "mid" | "low";
  form: Array<"W" | "L" | "D">;
}

export function computeStandings(
  playerIds: Array<string>,
  displayNames: Record<string, string>,
  completedMatches: Array<MatchResult>
): Array<PlayerStanding> {
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
      form: Array<"W" | "L" | "D">;
    }
  > = {};

  // Initialize all players
  for (const playerId of playerIds) {
    stats[playerId] = {
      playerId,
      displayName: displayNames[playerId] ?? "?",
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      diff: 0,
      form: [],
    };
  }

  // Accumulate stats from completed matches
  for (const match of completedMatches) {
    for (const playerId of match.teamA) {
      const s = stats[playerId];
      s.matches++;
      s.points += match.scoreA;
      s.diff += match.scoreA - match.scoreB;
      const result = match.scoreA > match.scoreB ? "W" : match.scoreA < match.scoreB ? "L" : "D";
      if (result === "W") s.wins++;
      else if (result === "L") s.losses++;
      else s.draws++;
      s.form.push(result);
    }

    for (const playerId of match.teamB) {
      const s = stats[playerId];
      s.matches++;
      s.points += match.scoreB;
      s.diff += match.scoreB - match.scoreA;
      const result = match.scoreB > match.scoreA ? "W" : match.scoreB < match.scoreA ? "L" : "D";
      if (result === "W") s.wins++;
      else if (result === "L") s.losses++;
      else s.draws++;
      s.form.push(result);
    }
  }

  // Sort: by points desc, then by wins desc, then by diff desc
  const sorted = Object.values(stats).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.diff - a.diff;
  });

  // Assign rank and color tier
  return sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    tier: (i < 2 ? "top" : i < 4 ? "high" : i < 6 ? "mid" : "low"),
    form: s.form.slice(-5), // Last 5 matches
  }));
}
