import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

interface MatchData {
  _id: Id<"matches">;
  court: number;
  teamANames: string[];
  teamBNames: string[];
  scoreA?: number;
  scoreB?: number;
  status: string;
}

export function SpielKarte({ match }: { match: MatchData }) {
  const submitScore = useMutation(api.matches.submitScore);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isCompleted = match.status === "completed";

  const handleSubmit = async () => {
    setError("");
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (isNaN(a) || isNaN(b) || a + b !== 32 || a < 0 || b < 0) {
      setError("Punkte müssen zusammen 32 ergeben");
      return;
    }
    setSubmitting(true);
    try {
      await submitScore({ matchId: match._id, scoreA: a, scoreB: b });
    } catch (err: any) {
      setError(err.message ?? "Fehler");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Platz {match.court}</span>
          {isCompleted && <Badge variant="secondary">Fertig</Badge>}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 text-right">
            <p className="font-medium text-sm">
              {match.teamANames.join(" & ")}
            </p>
          </div>

          {isCompleted ? (
            <div className="flex items-center gap-1 text-lg font-bold">
              <span>{match.scoreA}</span>
              <span className="text-gray-400">:</span>
              <span>{match.scoreB}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Input
                className="w-14 text-center"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
                placeholder="0"
              />
              <span className="text-gray-400">:</span>
              <Input
                className="w-14 text-center"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
                placeholder="0"
              />
            </div>
          )}

          <div className="flex-1">
            <p className="font-medium text-sm">
              {match.teamBNames.join(" & ")}
            </p>
          </div>
        </div>

        {!isCompleted && (
          <Button
            size="sm"
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "..." : "Ergebnis eintragen"}
          </Button>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
