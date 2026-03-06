import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { KNOCKOUT_PHASES } from "~/lib/tournament";

interface MatchData {
  _id: Id<"matches">;
  court: number;
  teamANames: Array<string>;
  teamBNames: Array<string>;
  scoreA?: number;
  scoreB?: number;
  winningSide?: "A" | "B";
  status: string;
  phase?: string;
}

export function SpielKarte({ match }: { match: MatchData }) {
  const submitScore = useMutation(api.matches.submitScore);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [winningSide, setWinningSide] = useState<"A" | "B" | undefined>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isCompleted = match.status === "completed";
  const isKnockout = match.phase && KNOCKOUT_PHASES.has(match.phase);
  
  const aVal = scoreA === "" ? NaN : Number(scoreA);
  const bVal = scoreB === "" ? NaN : Number(scoreB);
  const isValid = !isNaN(aVal) && !isNaN(bVal) && aVal + bVal === 32 && aVal >= 0 && bVal >= 0;
  const isTie = isValid && aVal === bVal;

  const handleSubmit = async () => {
    setError("");
    if (!isValid) {
      setError("Punkte müssen zusammen 32 ergeben");
      return;
    }
    if (isKnockout && isTie && !winningSide) {
      setError("Bei Unentschieden im K.O. muss ein Gewinner bestimmt werden");
      return;
    }
    setSubmitting(true);
    try {
      await submitScore({
        matchId: match._id,
        scoreA: aVal,
        scoreB: bVal,
        winningSide: isTie ? winningSide : undefined,
      });
    } catch (err: any) {
      setError(err.message ?? "Fehler");
    } finally {
      setSubmitting(false);
    }
  };

  const winnerSide =
    isCompleted &&
    (match.winningSide ??
      (match.scoreA !== undefined && match.scoreB !== undefined
        ? match.scoreA > match.scoreB
          ? "A"
          : match.scoreB > match.scoreA
            ? "B"
            : undefined
        : undefined));
  const winnerIsA = winnerSide === "A";
  const winnerIsB = winnerSide === "B";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 hover:border-brand-navy/30 transition-all duration-200 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
          PLATZ {match.court}
        </span>
        {isCompleted ? (
          <Badge variant="brandTeal" size="xs">
            Endergebnis
          </Badge>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-red animate-pulse" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest font-bold text-brand-red">
              Live-Eingabe
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* Team A */}
        <div className="flex flex-col items-end text-right min-w-0">
          <p className={cn(
            "text-sm font-semibold truncate w-full",
            winnerIsA ? "text-brand-navy" : "text-gray-600"
          )}>
            {match.teamANames.join(" & ")}
          </p>
          {isCompleted && winnerIsA && (
            <span className="text-[10px] font-bold text-brand-teal uppercase tracking-widest">Gewinner</span>
          )}
        </div>

        {/* Score Display / Inputs */}
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-md border border-gray-100">
              <span className={cn(
                "font-display text-3xl leading-none",
                winnerIsA ? "text-brand-navy" : "text-gray-400"
              )}>
                {match.scoreA}
              </span>
              <span className="text-gray-300 font-display text-xl leading-none">:</span>
              <span className={cn(
                "font-display text-3xl leading-none",
                winnerIsB ? "text-brand-navy" : "text-gray-400"
              )}>
                {match.scoreB}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Punkte Team A"
                className={cn(
                  "w-14 h-14 font-display text-2xl text-center rounded-lg border-2 transition-all focus-visible:ring-[3px] focus-visible:ring-brand-red/30 outline-hidden",
                  isValid ? "border-brand-teal bg-brand-teal/5 text-brand-teal" : "border-gray-200 focus-visible:border-brand-red"
                )}
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
              <span className="text-gray-300 font-display text-xl">:</span>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Punkte Team B"
                className={cn(
                  "w-14 h-14 font-display text-2xl text-center rounded-lg border-2 transition-all focus-visible:ring-[3px] focus-visible:ring-brand-red/30 outline-hidden",
                  isValid ? "border-brand-teal bg-brand-teal/5 text-brand-teal" : "border-gray-200 focus-visible:border-brand-red"
                )}
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
            </div>
          )}
        </div>

        {/* Team B */}
        <div className="flex flex-col items-start text-left min-w-0">
          <p className={cn(
            "text-sm font-semibold truncate w-full",
            winnerIsB ? "text-brand-navy" : "text-gray-600"
          )}>
            {match.teamBNames.join(" & ")}
          </p>
          {isCompleted && winnerIsB && (
            <span className="text-[10px] font-bold text-brand-teal uppercase tracking-widest">Gewinner</span>
          )}
        </div>
      </div>

      {!isCompleted && isKnockout && isTie && (
        <div className="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 space-y-2 animate-scale-in">
          <p className="text-[10px] uppercase tracking-widest font-bold text-center text-gray-400">
            K.O.-Unentschieden — Gewinner wählen
          </p>
          <div className="flex gap-2">
            <Button
              variant={winningSide === "A" ? "brand" : "outline"}
              size="touch"
              className="flex-1 truncate"
              onClick={() => setWinningSide("A")}
            >
              {match.teamANames.join(" & ")}
            </Button>
            <Button
              variant={winningSide === "B" ? "brand" : "outline"}
              size="touch"
              className="flex-1 truncate"
              onClick={() => setWinningSide("B")}
            >
              {match.teamBNames.join(" & ")}
            </Button>
          </div>
        </div>
      )}

      {!isCompleted && (
        <Button
          variant={isValid ? "brandNavy" : "brandSubtle"}
          size="touch"
          className="w-full"
          onClick={handleSubmit}
          disabled={submitting || !isValid}
        >
          {submitting ? "Speichere..." : "Ergebnis eintragen"}
        </Button>
      )}

      {error && (
        <div className="bg-red-50 border-l-2 border-red-500 p-2 animate-shake" role="alert">
          <p className="text-[10px] font-bold text-red-700 uppercase">{error}</p>
        </div>
      )}
    </div>
  );
}
