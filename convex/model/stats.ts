export interface PartnerOpponentEntry {
  playerId: string;
  displayName: string;
  count: number;
}

export interface PlayerStats {
  playerId: string;
  displayName: string;
  partners: Array<PartnerOpponentEntry>;
  opponents: Array<PartnerOpponentEntry>;
}

export function computePartnerOpponentStats(
  playerIds: Array<string>,
  displayNames: Record<string, string>,
  completedMatches: Array<{ teamA: Array<string>; teamB: Array<string> }>
): Array<PlayerStats> {
  // Build partner and opponent count maps
  const partnerCounts: Record<string, Record<string, number>> = {};
  const opponentCounts: Record<string, Record<string, number>> = {};

  for (const id of playerIds) {
    partnerCounts[id] = {};
    opponentCounts[id] = {};
  }

  for (const match of completedMatches) {
    // Partners: teamA[0] <-> teamA[1], teamB[0] <-> teamB[1]
    for (const team of [match.teamA, match.teamB]) {
      if (team.length === 2) {
        partnerCounts[team[0]][team[1]] =
          (partnerCounts[team[0]][team[1]] ?? 0) + 1;
        partnerCounts[team[1]][team[0]] =
          (partnerCounts[team[1]][team[0]] ?? 0) + 1;
      }
    }

    // Opponents: each teamA member vs each teamB member
    for (const a of match.teamA) {
      for (const b of match.teamB) {
        opponentCounts[a][b] = (opponentCounts[a][b] ?? 0) + 1;
        opponentCounts[b][a] = (opponentCounts[b][a] ?? 0) + 1;
      }
    }
  }

  return playerIds.map((id) => ({
    playerId: id,
    displayName: displayNames[id] ?? "?",
    partners: Object.entries(partnerCounts[id] ?? {})
      .map(([pid, count]) => ({
        playerId: pid,
        displayName: displayNames[pid] ?? "?",
        count,
      }))
      .sort((a, b) => b.count - a.count),
    opponents: Object.entries(opponentCounts[id] ?? {})
      .map(([pid, count]) => ({
        playerId: pid,
        displayName: displayNames[pid] ?? "?",
        count,
      }))
      .sort((a, b) => b.count - a.count),
  }));
}
