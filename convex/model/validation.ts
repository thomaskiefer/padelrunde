export type ScoreValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export function validateScore(
  scoreA: number,
  scoreB: number
): ScoreValidationResult {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return { valid: false, error: "Nur ganze Punkte sind erlaubt" };
  }
  if (scoreA < 0 || scoreB < 0) {
    return { valid: false, error: "Punkte dürfen nicht negativ sein" };
  }
  if (scoreA + scoreB !== 32) {
    return { valid: false, error: "Punkte müssen zusammen 32 ergeben" };
  }
  return { valid: true };
}

export function determineWinningSide(
  scoreA: number,
  scoreB: number
): "A" | "B" | undefined {
  if (scoreA > scoreB) return "A";
  if (scoreB > scoreA) return "B";
  return undefined;
}

export function validateKnockoutScore(
  scoreA: number,
  scoreB: number,
  winningSide?: "A" | "B"
): ScoreValidationResult {
  const base = validateScore(scoreA, scoreB);
  if (!base.valid) return base;
  if (scoreA === scoreB && !winningSide) {
    return {
      valid: false,
      error: "Bei Unentschieden im K.O. muss ein Gewinner bestimmt werden",
    };
  }
  const expectedWinner = determineWinningSide(scoreA, scoreB);
  if (expectedWinner && winningSide && winningSide !== expectedWinner) {
    return {
      valid: false,
      error: "Gewinnerseite passt nicht zum eingetragenen Ergebnis",
    };
  }
  return { valid: true };
}

export type TournamentMode = "americano" | "cup";

export type ConfigValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// Highest number of courts that can be filled at once (4 players per court).
export function maxCourtsForPlayers(playerCount: number): number {
  return Math.max(1, Math.floor(playerCount / 4));
}

export function validateTournamentConfig(
  mode: TournamentMode,
  playerCount: number,
  courts: number
): ConfigValidationResult {
  if (courts < 1 || courts > 2) {
    return { valid: false, error: "1 oder 2 Plätze erlaubt" };
  }
  if (mode === "cup") {
    if (playerCount !== 8) {
      return { valid: false, error: "Cup-Modus erfordert genau 8 Spieler" };
    }
  } else if (playerCount < 4 || playerCount > 8) {
    return { valid: false, error: "4 bis 8 Spieler erforderlich" };
  }
  if (courts > maxCourtsForPlayers(playerCount)) {
    return {
      valid: false,
      error: "Für 2 Plätze werden mindestens 8 Spieler benötigt",
    };
  }
  return { valid: true };
}
