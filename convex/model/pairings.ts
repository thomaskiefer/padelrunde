// Pure algorithm: generates round-robin partner pairings for N players.
// Returns array of rounds, each containing matches with player indices.
//
// When N is divisible by 4 everyone plays every round. When it is not, a fixed
// number of players (N mod 4) rest each round. Who rests is rotated fairly:
// rest counts stay balanced (they differ by at most one across the whole
// schedule) and nobody rests in two consecutive rounds when that is avoidable.
export function generateAmericanoPairings(
  n: number
): Array<Array<{ teamA: [number, number]; teamB: [number, number] }>> {
  // Track partner history (who has been partners with whom)
  const partnered: Array<Array<boolean>> = Array.from({ length: n }, () =>
    Array(n).fill(false)
  );
  // Track opponent count
  const opponentCount: Array<Array<number>> = Array.from({ length: n }, () =>
    Array(n).fill(0)
  );

  const rounds: Array<
    Array<{ teamA: [number, number]; teamB: [number, number] }>
  > = [];

  const totalRounds = n - 1;
  const restPerRound = ((n % 4) + 4) % 4; // players sitting out each round
  const restCount: Array<number> = Array(n).fill(0);
  let restedLastRound: Array<number> = [];

  for (let r = 0; r < totalRounds; r++) {
    // Choose who sits out this round, then play with everyone else. Keeping the
    // playing set in ascending index order means the schedule is identical to
    // the classic round-robin when nobody rests (N divisible by 4).
    const resting = selectRestingPlayers(
      n,
      restPerRound,
      restCount,
      restedLastRound
    );
    const restingSet = new Set(resting);
    for (const player of resting) restCount[player]++;
    restedLastRound = resting;

    const available = Array.from({ length: n }, (_, i) => i).filter(
      (i) => !restingSet.has(i)
    );
    const roundMatches: Array<{
      teamA: [number, number];
      teamB: [number, number];
    }> = [];

    // When players rest, every round is a single match among the four who
    // play. Evaluating all three ways to split those four avoids the forced
    // partner repeats a purely incremental greedy would create.
    if (restPerRound > 0) {
      const match = chooseBestSplit(available, partnered, opponentCount);
      partnered[match.teamA[0]][match.teamA[1]] = true;
      partnered[match.teamA[1]][match.teamA[0]] = true;
      partnered[match.teamB[0]][match.teamB[1]] = true;
      partnered[match.teamB[1]][match.teamB[0]] = true;
      for (const a of match.teamA) {
        for (const b of match.teamB) {
          opponentCount[a][b]++;
          opponentCount[b][a]++;
        }
      }
      roundMatches.push(match);
      rounds.push(roundMatches);
      continue;
    }

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
        (x) => x !== bestTeamA[0] && x !== bestTeamA[1]
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
      available.splice(
        0,
        available.length,
        ...available.filter((x) => !used.has(x))
      );
    }

    rounds.push(roundMatches);
  }

  return rounds;
}

// Splits four players into two teams, choosing the pairing that best avoids
// repeating partnerships (weighted heavily) and then repeating opponents.
function chooseBestSplit(
  four: Array<number>,
  partnered: Array<Array<boolean>>,
  opponentCount: Array<Array<number>>
): { teamA: [number, number]; teamB: [number, number] } {
  const [a, b, c, d] = four;
  const splits: Array<{ teamA: [number, number]; teamB: [number, number] }> = [
    { teamA: [a, b], teamB: [c, d] },
    { teamA: [a, c], teamB: [b, d] },
    { teamA: [a, d], teamB: [b, c] },
  ];

  let best = splits[0];
  let bestScore = Infinity;
  for (const split of splits) {
    const [pa1, pa2] = split.teamA;
    const [pb1, pb2] = split.teamB;
    const partnerCost =
      (partnered[pa1][pa2] ? 1 : 0) + (partnered[pb1][pb2] ? 1 : 0);
    const opponentCost =
      opponentCount[pa1][pb1] +
      opponentCount[pa1][pb2] +
      opponentCount[pa2][pb1] +
      opponentCount[pa2][pb2];
    const score = partnerCost * 100 + opponentCost;
    if (score < bestScore) {
      bestScore = score;
      best = split;
    }
  }
  return best;
}

// Picks the players who sit out a round. Preference order: fewest rests so far,
// then players who did not rest in the previous round (avoid back-to-back
// pauses), then lowest index for a deterministic result.
export function selectRestingPlayers(
  n: number,
  restPerRound: number,
  restCount: Array<number>,
  restedLastRound: Array<number>
): Array<number> {
  if (restPerRound <= 0) return [];

  const restedLastSet = new Set(restedLastRound);
  const ranked = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    if (restCount[a] !== restCount[b]) return restCount[a] - restCount[b];
    const aRestedLast = restedLastSet.has(a) ? 1 : 0;
    const bRestedLast = restedLastSet.has(b) ? 1 : 0;
    if (aRestedLast !== bRestedLast) return aRestedLast - bRestedLast;
    return a - b;
  });

  return ranked.slice(0, restPerRound).sort((a, b) => a - b);
}
