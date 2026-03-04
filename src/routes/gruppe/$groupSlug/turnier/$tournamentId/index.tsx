import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { LiveTabelle } from "~/components/LiveTabelle";
import { SpielKarte } from "~/components/SpielKarte";
import type { Id } from "../../../../../../convex/_generated/dataModel";

export const Route = createFileRoute(
  "/gruppe/$groupSlug/turnier/$tournamentId/"
)({
  component: TournamentView,
});

function TournamentView() {
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
  const generateRounds = useMutation(api.rounds.generateRounds);

  if (!tournament) {
    return <div className="p-8 text-center">Turnier nicht gefunden</div>;
  }

  const statusLabels: Record<string, string> = {
    setup: "Vorbereitung",
    active: "Aktiv",
    knockout: "K.O.-Phase",
    finished: "Beendet",
  };

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/gruppe/$groupSlug"
            params={{ groupSlug }}
            className="text-sm text-gray-500 hover:underline"
          >
            Zurück zur Gruppe
          </Link>
          <h2 className="text-2xl font-bold">{tournament.name}</h2>
          <div className="mt-1 flex gap-2">
            <Badge variant="outline">
              {tournament.mode === "amerikaner" ? "Americano" : "Cup"}
            </Badge>
            <Badge
              variant={
                tournament.status === "active" ? "default" : "secondary"
              }
            >
              {statusLabels[tournament.status]}
            </Badge>
            <Badge variant="outline">
              {tournament.courts}{" "}
              {tournament.courts === 1 ? "Platz" : "Plätze"}
            </Badge>
          </div>
        </div>
        <Link
          to="/gruppe/$groupSlug/turnier/$tournamentId/admin"
          params={{ groupSlug, tournamentId }}
        >
          <Button variant="outline" size="sm">
            Verwaltung
          </Button>
        </Link>
      </div>

      {tournament.status === "setup" && (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <p className="mb-4 text-gray-500">
            Turnier bereit zum Starten mit {tournament.playerIds.length}{" "}
            Spielern.
          </p>
          <Button
            onClick={() =>
              generateRounds({
                tournamentId: tournamentId as Id<"tournaments">,
              })
            }
          >
            Turnier starten
          </Button>
        </div>
      )}

      {tournament.status !== "setup" && (
        <>
          <LiveTabelle
            tournamentId={tournamentId as Id<"tournaments">}
          />
          <RoundsDisplay rounds={rounds} />
        </>
      )}
    </div>
  );
}

function RoundsDisplay({
  rounds,
}: {
  rounds: Array<{
    _id: Id<"rounds">;
    roundNumber: number;
    phase: string;
  }>;
}) {
  const phaseLabels: Record<string, string> = {
    preliminary: "Vorrunde",
    semifinal: "Halbfinale",
    bronze: "Spiel um Platz 3",
    final: "Finale",
  };

  return (
    <div className="space-y-6">
      {rounds
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map((round) => (
          <RoundSection
            key={round._id}
            roundId={round._id}
            title={`${phaseLabels[round.phase] ?? round.phase} ${round.roundNumber}`}
          />
        ))}
    </div>
  );
}

function RoundSection({
  roundId,
  title,
}: {
  roundId: Id<"rounds">;
  title: string;
}) {
  const { data: matches } = useSuspenseQuery(
    convexQuery(api.matches.getByRound, { roundId })
  );

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((match) => (
          <SpielKarte key={match._id} match={match} />
        ))}
      </div>
    </div>
  );
}
