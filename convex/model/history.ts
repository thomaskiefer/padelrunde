export type HistoricalMatchRef = {
  teamA: Array<string>;
  teamB: Array<string>;
};

export type HistoricalTournamentRef = {
  playerIds: Array<string>;
  matches: Array<HistoricalMatchRef>;
};

export function collectHistoricalMemberIds(
  tournaments: Array<HistoricalTournamentRef>
): Set<string> {
  const ids = new Set<string>();
  for (const tournament of tournaments) {
    for (const playerId of tournament.playerIds) {
      ids.add(playerId);
    }
    for (const match of tournament.matches) {
      for (const playerId of [...match.teamA, ...match.teamB]) {
        ids.add(playerId);
      }
    }
  }
  return ids;
}
