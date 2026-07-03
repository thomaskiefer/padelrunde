import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { LiveTabelle } from "~/components/LiveTabelle";
import { SpielKarte } from "~/components/SpielKarte";
import { KnockoutBracket } from "~/components/KnockoutBracket";
import { PartnerStats } from "~/components/PartnerStats";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { canManageGroup } from "~/lib/groupPermissions";
import { cn } from "~/lib/utils";
import {
  KNOCKOUT_PHASES,
  modeLabels,
  phaseLabels,
  statusBadgeVariant,
  statusLabels,
} from "~/lib/tournament";

export const Route = createFileRoute(
  "/gruppe/$groupSlug/turnier/$tournamentId/"
)({
  component: TournamentView,
});

export function TournamentView() {
  const { groupSlug, tournamentId } = Route.useParams();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const { data: tournament } = useSuspenseQuery(
    convexQuery(api.tournaments.get, {
      tournamentId: tournamentId as Id<"tournaments">,
    })
  );
  const {
    data: members = [],
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery({
    ...convexQuery(api.groups.getMembers, {
      groupId: (tournament?.groupId ?? "missing") as any,
    }),
    enabled: !!tournament,
  });
  const {
    data: rounds = [],
    isLoading: roundsLoading,
    isError: roundsError,
  } = useQuery({
    ...convexQuery(api.rounds.listByTournament, {
      tournamentId: tournamentId as Id<"tournaments">,
    }),
    enabled: !!tournament,
  });
  const {
    data: standings = [],
    isLoading: standingsLoading,
    isError: standingsError,
  } = useQuery({
    ...convexQuery(api.standings.getStandings, {
      tournamentId: tournamentId as Id<"tournaments">,
    }),
    enabled: !!tournament,
  });
  const {
    data: allMatches = [],
    isLoading: matchesLoading,
    isError: matchesError,
  } = useQuery({
    ...convexQuery(api.matches.getByTournament, {
      tournamentId: tournamentId as Id<"tournaments">,
    }),
    enabled: !!tournament,
  });
  const generateRounds = useMutation(api.rounds.generateRounds);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);

  if (!tournament) {
    return (
      <div className="mx-auto max-w-5xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">Turnier nicht gefunden</h2>
        <p className="text-gray-500 text-sm mb-4">Dieses Turnier existiert nicht oder wurde gelöscht.</p>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5 justify-center"
        >
          <span className="text-lg leading-none" aria-hidden="true">←</span> Zurück zur Gruppe
        </Link>
      </div>
    );
  }

  if (roundsLoading || standingsLoading || matchesLoading) {
    return <div className="mx-auto max-w-5xl p-4 mt-12 text-center">Turnier wird geladen...</div>;
  }

  // Surface load failures instead of silently rendering a de-privileged page:
  // a failed getMembers would otherwise hide admin controls and lock genuine
  // participants out of entering scores with no indication anything went wrong.
  if (membersError || roundsError || standingsError || matchesError) {
    return (
      <div className="mx-auto max-w-5xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">
          Turnier konnte nicht geladen werden
        </h2>
        <p className="text-gray-500 text-sm mb-4">Bitte versuche es erneut.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-red hover:text-brand-navy transition-colors"
        >
          Seite neu laden
        </button>
      </div>
    );
  }

  const canManage = canManageGroup(me ?? null, members);
  const viewerTournamentMemberIds = new Set(
    members
      .filter(
        (member) =>
          member.userId === me?._id && tournament.playerIds.includes(member._id)
      )
      .map((member) => member._id)
  );

  const handleStartTournament = async () => {
    setStartError("");
    setStarting(true);
    try {
      await generateRounds({
        tournamentId: tournamentId as Id<"tournaments">,
      });
    } catch (err: any) {
      setStartError(err.message ?? "Turnier konnte nicht gestartet werden");
    } finally {
      setStarting(false);
    }
  };

  const winner = resolveTournamentWinner(tournament.mode, standings, rounds, allMatches);
  const playerNamesById = new Map(
    members.map((member) => [member._id, member.displayName] as const)
  );

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-8 animate-fade-in-up">
      {/* Header Section */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 min-w-0">
            <Link
              to="/gruppe/$groupSlug"
              params={{ groupSlug }}
              className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors inline-flex items-center gap-1.5"
            >
              <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zur Gruppe
            </Link>
            <h2 className="text-2xl sm:text-3xl font-display uppercase text-brand-navy leading-tight">
              {tournament.name}
            </h2>
          </div>

          {!membersLoading && canManage && (
            <Button variant="brandOutline" size="touchLg" asChild className="shrink-0">
              <Link
                to="/gruppe/$groupSlug/turnier/$tournamentId/admin"
                params={{ groupSlug, tournamentId }}
              >
                Verwaltung
              </Link>
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-gray-50">
          <Badge variant="brandNavy" size="xs">
            {modeLabels[tournament.mode] ?? tournament.mode}
          </Badge>
          <Badge variant={statusBadgeVariant[tournament.status] ?? "statusSetup"} size="xs" className="flex items-center gap-1.5">
            {tournament.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />}
            {statusLabels[tournament.status] ?? tournament.status}
          </Badge>
          <Badge variant="muted" size="xs">
            {tournament.playerIds.length} Spieler
          </Badge>
          <Badge variant="muted" size="xs">
            {tournament.courts} {tournament.courts === 1 ? "Platz" : "Plätze"}
          </Badge>
        </div>
      </div>

      {tournament.status === "finished" && winner && (
        <WinnerCard winner={winner} />
      )}

      {tournament.status === "setup" && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 sm:p-12 text-center bg-white/50">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 bg-brand-navy/5 rounded-full flex items-center justify-center mx-auto text-brand-navy">
              <span className="font-display text-2xl">{tournament.playerIds.length}</span>
            </div>
            <h3 className="font-display uppercase text-brand-navy text-lg">Bereit zum Starten?</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Das Turnier ist bereit. Alle Spieler wurden zugewiesen und die Plätze sind reserviert.
            </p>
            {!membersLoading && canManage && (
              <Button
                variant="brand"
                size="touchXl"
                className="w-full mt-4"
                onClick={handleStartTournament}
                disabled={starting}
              >
                {starting ? "Starte..." : "Turnier starten"}
              </Button>
            )}
            {startError && (
              <div className="bg-red-50 border-l-2 border-red-500 p-3 mt-4 text-left" role="alert">
                <p className="text-[10px] font-bold text-red-700 uppercase">{startError}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tournament.status !== "setup" && (
        <div className="space-y-12">
          <section className="space-y-4 animate-scale-in">
            <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
              Tabelle
            </h3>
            <LiveTabelle
              tournamentId={tournamentId as Id<"tournaments">}
              standings={standings}
            />
          </section>

          {tournament.mode === "cup" &&
            (tournament.status === "knockout" ||
              tournament.status === "finished") && (
              <section className="space-y-4 animate-scale-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
                  K.O.-Phase
                </h3>
                <KnockoutBracket
                  tournamentId={tournamentId as Id<"tournaments">}
                  isFinished={tournament.status === "finished"}
                />
              </section>
            )}

          <section className="space-y-4 animate-scale-in" style={{ animationDelay: '0.2s' }}>
            <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
              Statistik
            </h3>
            <PartnerStats
              tournamentId={tournamentId as Id<"tournaments">}
            />
          </section>

          <section className="space-y-6 animate-scale-in" style={{ animationDelay: '0.3s' }}>
            <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
              Spiele
            </h3>
            <RoundsDisplay
              rounds={rounds}
              viewerTournamentMemberIds={viewerTournamentMemberIds}
              allPlayerIds={tournament.playerIds}
              playerNamesById={playerNamesById}
            />

          </section>
        </div>
      )}
    </div>
  );
}

function RoundsDisplay({
  rounds,
  viewerTournamentMemberIds,
  allPlayerIds,
  playerNamesById,
}: {
  rounds: Array<{
    _id: Id<"rounds">;
    roundNumber: number;
    phase: string;
  }>;
  viewerTournamentMemberIds: Set<Id<"groupMembers">>;
  allPlayerIds: Array<Id<"groupMembers">>;
  playerNamesById: Map<string, string>;
}) {
  return (
    <div className="space-y-8">
      {[...rounds]
        .sort((a, b) => a.roundNumber - b.roundNumber)
        .map((round) => {
          const isKnockout = KNOCKOUT_PHASES.has(round.phase);
          const title =
            round.phase === "preliminary"
              ? `${phaseLabels[round.phase]} ${round.roundNumber}`
              : (phaseLabels[round.phase] ?? round.phase);

          return (
            <RoundSection
              key={round._id}
              roundId={round._id}
              title={title}
              isKnockout={isKnockout}
              viewerTournamentMemberIds={viewerTournamentMemberIds}
              allPlayerIds={round.phase === "preliminary" ? allPlayerIds : []}
              playerNamesById={playerNamesById}
            />
          );
        })}
    </div>
  );
}

function RoundSection({
  roundId,
  title,
  isKnockout,
  viewerTournamentMemberIds,
  allPlayerIds,
  playerNamesById,
}: {
  roundId: Id<"rounds">;
  title: string;
  isKnockout: boolean;
  viewerTournamentMemberIds: Set<Id<"groupMembers">>;
  allPlayerIds: Array<Id<"groupMembers">>;
  playerNamesById: Map<string, string>;
}) {
  const { data: matches } = useSuspenseQuery(
    convexQuery(api.matches.getByRound, { roundId })
  );

  const playingIds = new Set(
    matches.flatMap((match) => [...match.teamA, ...match.teamB])
  );
  const restingIds = allPlayerIds.filter((memberId) => !playingIds.has(memberId));
  // Only show the pause line once every resting name is known, so it never
  // flashes "?" while the members query is still loading.
  const restingNamesResolved = restingIds.every((memberId) =>
    playerNamesById.has(memberId)
  );
  const restingNames = restingIds.map(
    (memberId) => playerNamesById.get(memberId) ?? "?"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h4
          className={cn(
            "uppercase text-xs tracking-[0.2em] font-display",
            isKnockout ? "text-brand-red" : "text-brand-navy/60"
          )}
        >
          {title}
        </h4>
        <div className="flex-1 h-px bg-gray-100" aria-hidden="true" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {matches.map((match) => (
          <SpielKarte
            key={match._id}
            match={match}
            canSubmit={
              [...match.teamA, ...match.teamB].some((memberId) =>
                viewerTournamentMemberIds.has(memberId as Id<"groupMembers">)
              )
            }
          />
        ))}
      </div>
      {restingIds.length > 0 && restingNamesResolved && (
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
          Pause: <span className="text-brand-navy/60">{restingNames.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

function resolveTournamentWinner(
  mode: "americano" | "cup",
  standings: Array<{
    playerId: string;
    displayName: string;
    points: number;
    wins: number;
    diff: number;
  }>,
  rounds: Array<{
    _id: Id<"rounds">;
    phase: string;
  }>,
  matches: Array<{
    roundId: Id<"rounds">;
    teamA: Array<string>;
    teamB: Array<string>;
    winningSide?: "A" | "B";
  }>
) {
  if (mode === "americano") {
    return {
      displayName: standings[0].displayName,
      points: standings[0].points,
      wins: standings[0].wins,
      diff: standings[0].diff,
    };
  }

  const finalRound = rounds.find((round) => round.phase === "final");
  const finalMatch = finalRound
    ? matches.find((match) => match.roundId === finalRound._id)
    : undefined;
  if (!finalMatch?.winningSide) return null;

  const namesById = new Map(
    standings.map((standing) => [standing.playerId, standing.displayName])
  );
  const winningTeam =
    finalMatch.winningSide === "A" ? finalMatch.teamA : finalMatch.teamB;
  const winnerNames = winningTeam.map((playerId) => namesById.get(playerId) ?? "?");

  return {
    displayName: winnerNames.join(" & "),
    points: null,
    wins: null,
    diff: null,
  };
}

function WinnerCard({
  winner,
}: {
  winner: {
    displayName: string;
    points: number | null;
    wins: number | null;
    diff: number | null;
  };
}) {
  return (
    <div className="bg-gradient-to-br from-gold/20 via-white to-gold/10 rounded-xl border-2 border-gold/30 p-8 text-center shadow-xl relative overflow-hidden animate-scale-in">
      <div className="relative z-10 space-y-4">
        <div className="w-20 h-20 bg-gold/20 rounded-full flex items-center justify-center mx-auto mb-2 ring-4 ring-gold/10">
          <span className="font-display text-4xl text-gold" aria-hidden="true">1</span>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest font-bold text-gold/80">Turniersieger</p>
          <h3 className="font-display text-3xl sm:text-4xl uppercase text-brand-navy drop-shadow-sm">
            {winner.displayName}
          </h3>
        </div>
        <div className="flex items-center justify-center gap-6 pt-2">
          {winner.points !== null && winner.wins !== null && winner.diff !== null ? (
            <>
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Punkte</p>
                <p className="font-display text-xl text-brand-red">{winner.points}</p>
              </div>
              <div className="w-px h-8 bg-gold/20" aria-hidden="true" />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Siege</p>
                <p className="font-display text-xl text-brand-navy">{winner.wins}</p>
              </div>
              <div className="w-px h-8 bg-gold/20" aria-hidden="true" />
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Diff</p>
                <p className={cn(
                  "font-display text-xl",
                  winner.diff > 0 ? "text-brand-teal" : winner.diff < 0 ? "text-brand-red" : "text-gray-300"
                )}>{winner.diff > 0 ? `+${winner.diff}` : winner.diff}</p>
              </div>
            </>
          ) : (
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">
              Siegerteam des Finals
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
