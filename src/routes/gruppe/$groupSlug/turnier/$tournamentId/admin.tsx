import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useState } from "react";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export const Route = createFileRoute(
  "/gruppe/$groupSlug/turnier/$tournamentId/admin"
)({
  component: TournamentAdmin,
});

function TournamentAdmin() {
  const { groupSlug, tournamentId } = Route.useParams();
  const { data: tournament } = useSuspenseQuery(
    convexQuery(api.tournaments.get, {
      tournamentId: tournamentId as Id<"tournaments">,
    })
  );
  const { data: rounds } = useSuspenseQuery(
    convexQuery(api.rounds.listByTournament, {
      tournamentId: tournamentId as Id<"tournaments">,
    })
  );
  const updateStatus = useMutation(api.tournaments.updateStatus);

  if (!tournament) {
    return <div className="p-8 text-center">Turnier nicht gefunden</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <div>
        <Link
          to="/gruppe/$groupSlug/turnier/$tournamentId"
          params={{ groupSlug, tournamentId }}
          className="text-sm text-gray-500 hover:underline"
        >
          Zurück zum Turnier
        </Link>
        <h2 className="text-2xl font-bold">Verwaltung: {tournament.name}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Turnier-Status</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {tournament.status !== "finished" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                updateStatus({
                  tournamentId: tournamentId as Id<"tournaments">,
                  status: "finished",
                })
              }
            >
              Turnier beenden
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {rounds
          .sort((a, b) => a.roundNumber - b.roundNumber)
          .map((round) => (
            <AdminRoundSection
              key={round._id}
              roundId={round._id}
              roundNumber={round.roundNumber}
              phase={round.phase}
            />
          ))}
      </div>
    </div>
  );
}

function AdminRoundSection({
  roundId,
  roundNumber,
  phase,
}: {
  roundId: Id<"rounds">;
  roundNumber: number;
  phase: string;
}) {
  const { data: matches } = useSuspenseQuery(
    convexQuery(api.matches.getByRound, { roundId })
  );

  const phaseLabels: Record<string, string> = {
    preliminary: "Vorrunde",
    semifinal: "Halbfinale",
    bronze: "Spiel um Platz 3",
    final: "Finale",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {phaseLabels[phase] ?? phase} {roundNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {matches.map((match) => (
          <AdminMatchRow key={match._id} match={match} />
        ))}
      </CardContent>
    </Card>
  );
}

function AdminMatchRow({
  match,
}: {
  match: {
    _id: Id<"matches">;
    teamANames: string[];
    teamBNames: string[];
    scoreA?: number;
    scoreB?: number;
    status: string;
  };
}) {
  const adminEditScore = useMutation(api.matches.adminEditScore);
  const [scoreA, setScoreA] = useState(String(match.scoreA ?? ""));
  const [scoreB, setScoreB] = useState(String(match.scoreB ?? ""));
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (isNaN(a) || isNaN(b) || a + b !== 32 || a < 0 || b < 0) {
      setError("Punkte müssen zusammen 32 ergeben");
      return;
    }
    try {
      await adminEditScore({ matchId: match._id, scoreA: a, scoreB: b });
    } catch (err: any) {
      setError(err.message ?? "Fehler");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border p-3">
      <span className="font-medium">
        {match.teamANames.join(" & ")}
      </span>
      <span className="text-gray-400">vs</span>
      <span className="font-medium">
        {match.teamBNames.join(" & ")}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Input
          className="w-16 text-center"
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
        />
        <span>:</span>
        <Input
          className="w-16 text-center"
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
        />
        <Button size="sm" onClick={handleSave}>
          Speichern
        </Button>
        {match.status === "completed" && (
          <Badge variant="secondary">Eingetragen</Badge>
        )}
      </div>
      {error && (
        <p className="w-full text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
