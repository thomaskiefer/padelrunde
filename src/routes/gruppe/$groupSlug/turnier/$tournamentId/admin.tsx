import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { resolveTournamentAdminAccess } from "../../-access";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { KNOCKOUT_PHASES, phaseLabels } from "~/lib/tournament";

export const Route = createFileRoute(
  "/gruppe/$groupSlug/turnier/$tournamentId/admin"
)({
  component: TournamentAdmin,
});

export function TournamentAdmin() {
  const { groupSlug, tournamentId } = Route.useParams();
  const tid = tournamentId as Id<"tournaments">;
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const { data: tournament } = useSuspenseQuery(
    convexQuery(api.tournaments.get, { tournamentId: tid })
  );
  const { data: members = [], isLoading: membersLoading } = useQuery({
    ...convexQuery(api.groups.getMembers, {
      groupId: (tournament?.groupId ?? "missing") as any,
    }),
    enabled: !!tournament,
  });
  const { data: rounds = [], isLoading: roundsLoading } = useQuery({
    ...convexQuery(api.rounds.listByTournament, { tournamentId: tid }),
    enabled: !!tournament,
  });
  const updateStatus = useMutation(api.tournaments.updateStatus);
  const generateKnockout = useMutation(api.rounds.generateKnockoutRounds);
  const advanceToFinals = useMutation(api.rounds.advanceToFinals);
  const deleteTournament = useMutation(api.tournaments.deleteTournament);

  const [confirmFinish, setConfirmFinish] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState<
    "knockout" | "finals" | "finish" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const { data: prelimDone = false, isLoading: prelimDoneLoading } = useQuery({
    ...convexQuery(api.matches.allMatchesCompletedForPhase, {
      tournamentId: tid,
      phase: "preliminary",
    }),
    enabled: !!tournament,
  });
  const { data: sfDone = false, isLoading: sfDoneLoading } = useQuery({
    ...convexQuery(api.matches.allMatchesCompletedForPhase, {
      tournamentId: tid,
      phase: "semifinal",
    }),
    enabled: !!tournament,
  });
  const { data: finalDone = false, isLoading: finalDoneLoading } = useQuery({
    ...convexQuery(api.matches.allMatchesCompletedForPhase, {
      tournamentId: tid,
      phase: "final",
    }),
    enabled: !!tournament,
  });
  const { data: bronzeDone = false, isLoading: bronzeDoneLoading } = useQuery({
    ...convexQuery(api.matches.allMatchesCompletedForPhase, {
      tournamentId: tid,
      phase: "bronze",
    }),
    enabled: !!tournament,
  });

  if (!tournament) {
    return (
      <div className="mx-auto max-w-5xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">Turnier nicht gefunden</h2>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5 justify-center"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zurück zur Gruppe
        </Link>
      </div>
    );
  }

  if (roundsLoading || prelimDoneLoading || sfDoneLoading || finalDoneLoading || bronzeDoneLoading) {
    return <div className="mx-auto max-w-5xl p-4 mt-12 text-center">Turnier wird geladen...</div>;
  }

  const access = resolveTournamentAdminAccess(me ?? null, members, membersLoading);
  if (access === "loading") {
    return <div className="mx-auto max-w-5xl p-4 mt-12 text-center">Lade Berechtigungen...</div>;
  }

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-5xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">Keine Berechtigung</h2>
        <p className="text-gray-500 text-sm mb-4">
          Nur Gruppen-Admins dürfen diese Seite öffnen.
        </p>
        <Link
          to="/gruppe/$groupSlug/turnier/$tournamentId"
          params={{ groupSlug, tournamentId }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5 justify-center"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zurück zum Turnier
        </Link>
      </div>
    );
  }

  const hasFinal = rounds.some((r) => r.phase === "final");
  const canFinishTournament =
    tournament.mode === "americano" ? prelimDone : finalDone && bronzeDone;

  const runAction = async (
    action: "knockout" | "finals" | "finish",
    fn: () => Promise<void>
  ) => {
    setActionError("");
    setActionLoading(action);
    try {
      await fn();
      return true;
    } catch (err: any) {
      setActionError(err.message ?? "Aktion fehlgeschlagen");
      return false;
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteTournament = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteTournament({ tournamentId: tid });
      navigate({ to: "/gruppe/$groupSlug", params: { groupSlug } });
    } catch (err: any) {
      setDeleteError(err.message ?? "Turnier konnte nicht gelöscht werden");
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-8 animate-fade-in-up">
      <div>
        <Link
          to="/gruppe/$groupSlug/turnier/$tournamentId"
          params={{ groupSlug, tournamentId }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zurück zum Turnier
        </Link>
        <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-2">Verwaltung</p>
        <h2 className="text-2xl sm:text-3xl font-display uppercase text-brand-navy truncate">
          {tournament.name}
        </h2>
      </div>

      <div className="bg-gradient-to-br from-brand-navy to-[#142a47] text-white rounded-xl p-4 sm:p-6 shadow-lg">
        <h3 className="section-title-accent font-display uppercase tracking-widest text-sm text-white mb-4">
          Turnier-Status
        </h3>
        <div className="flex flex-wrap gap-2">
          {tournament.mode === "cup" &&
            tournament.status === "active" &&
            prelimDone && (
              <Button
                variant="brand"
                size="touchLg"
                onClick={() =>
                  runAction("knockout", async () => {
                    await generateKnockout({ tournamentId: tid });
                  })
                }
                disabled={actionLoading !== null}
              >
                Zur K.O.-Phase
              </Button>
            )}

          {tournament.status === "knockout" && sfDone && !hasFinal && (
            <Button
              variant="brandTeal"
              size="touchLg"
              onClick={() =>
                runAction("finals", async () => {
                  await advanceToFinals({ tournamentId: tid });
                })
              }
              disabled={actionLoading !== null}
            >
              {"Finale & Bronzespiel erstellen"}
            </Button>
          )}

          {tournament.status !== "finished" && !confirmFinish && canFinishTournament && (
            <Button
              variant="brandDestructive"
              size="touchLg"
              onClick={() => setConfirmFinish(true)}
              disabled={actionLoading !== null}
            >
              Turnier beenden
            </Button>
          )}
          {confirmFinish && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-white/80">Wirklich beenden?</span>
              <Button
                variant="brandDestructive"
                size="touchLg"
                onClick={async () => {
                  const success = await runAction("finish", async () => {
                    await updateStatus({ tournamentId: tid, status: "finished" });
                  });
                  if (success) setConfirmFinish(false);
                }}
                disabled={actionLoading !== null}
              >
                Ja, beenden
              </Button>
              <Button
                variant="brandGhost"
                size="touchLg"
                onClick={() => setConfirmFinish(false)}
              >
                Abbrechen
              </Button>
            </div>
          )}
        </div>
        {actionError && <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-red-200" role="alert">{actionError}</p>}
      </div>

      <div className="rounded-xl border border-brand-red/20 bg-white p-4 sm:p-5 shadow-sm space-y-3">
        <div className="space-y-1">
          <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
            Turnier löschen
          </h3>
          <p className="text-sm text-gray-500">
            Entfernt dieses Turnier mit allen Runden und Spielen. Spieler, die nur
            hier eingetragen sind, lassen sich danach wieder aus der Gruppe entfernen.
          </p>
        </div>
        {!confirmDelete ? (
          <Button
            type="button"
            variant="brandDestructive"
            size="touchLg"
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
          >
            Turnier löschen
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-600">Wirklich löschen?</span>
            <Button
              type="button"
              variant="brandDestructive"
              size="touchLg"
              onClick={handleDeleteTournament}
              disabled={deleting}
            >
              {deleting ? "Wird gelöscht..." : "Ja, löschen"}
            </Button>
            <Button
              type="button"
              variant="brandGhost"
              size="touchLg"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Abbrechen
            </Button>
          </div>
        )}
        {deleteError && (
          <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{deleteError}</p>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {[...rounds]
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

  const isKnockout = KNOCKOUT_PHASES.has(phase);
  const label = phaseLabels[phase] ?? phase;
  const title = isKnockout ? label : `${label} ${roundNumber}`;

  return (
    <div className="border-b border-gray-100 pb-6">
      <h3
        className={cn(
          "font-display text-sm uppercase tracking-widest mb-4",
          isKnockout ? "text-brand-red" : "text-brand-navy"
        )}
      >
        {title}
      </h3>
      <div className="space-y-4">
        {matches.map((match) => (
          <AdminMatchRow
            key={match._id}
            match={match}
            isKnockout={isKnockout}
          />
        ))}
      </div>
    </div>
  );
}

function AdminMatchRow({
  match,
  isKnockout,
}: {
  match: {
    _id: Id<"matches">;
    teamANames: Array<string>;
    teamBNames: Array<string>;
    scoreA?: number;
    scoreB?: number;
    winningSide?: "A" | "B";
    status: string;
  };
  isKnockout: boolean;
}) {
  const adminEditScore = useMutation(api.matches.adminEditScore);
  const [scoreA, setScoreA] = useState(String(match.scoreA ?? ""));
  const [scoreB, setScoreB] = useState(String(match.scoreB ?? ""));
  const [winningSide, setWinningSide] = useState<"A" | "B" | undefined>(
    match.winningSide
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Tracks whether the admin has unsaved edits. While dirty, a reactive query
  // update must not overwrite what they are typing; after a save we clear it so
  // the row re-syncs to the freshly stored server value.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setScoreA(String(match.scoreA ?? ""));
    setScoreB(String(match.scoreB ?? ""));
    setWinningSide(match.winningSide);
  }, [match.scoreA, match.scoreB, match.winningSide, dirty]);

  const aVal = scoreA === "" ? NaN : Number(scoreA);
  const bVal = scoreB === "" ? NaN : Number(scoreB);
  const isValid = !isNaN(aVal) && !isNaN(bVal) && aVal + bVal === 32 && aVal >= 0 && bVal >= 0;
  const isTie = isValid && aVal === bVal;

  const handleSave = async () => {
    setError("");
    if (!isValid) {
      setError("Punkte müssen zusammen 32 ergeben");
      return;
    }
    if (isKnockout && isTie && !winningSide) {
      setError("Gewinner muss bestimmt werden");
      return;
    }
    setSaving(true);
    try {
      await adminEditScore({
        matchId: match._id,
        scoreA: aVal,
        scoreB: bVal,
        winningSide: isTie ? winningSide : undefined,
      });
      setDirty(false);
    } catch (err: any) {
      setError(err.message ?? "Fehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-gray-400 border-b border-gray-50 pb-2">
        <span>Admin-Bearbeitung</span>
        {match.status === "completed" && (
          <Badge variant="brandTeal" size="xs">Abgeschlossen</Badge>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right min-w-0">
          <p className="text-xs font-bold text-brand-navy truncate">
            {match.teamANames.join(" & ")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Punkte Team A"
            className={cn(
              "w-12 h-12 font-display text-xl text-center rounded-lg border-2 transition-all focus-visible:ring-[3px] focus-visible:ring-brand-red/30 outline-hidden",
              isValid ? "border-brand-teal bg-brand-teal/5 text-brand-teal" : "border-gray-200 focus-visible:border-brand-red"
            )}
            value={scoreA}
            onChange={(e) => {
              setDirty(true);
              setScoreA(e.target.value.replace(/\D/g, ""));
            }}
          />
          <span className="text-gray-300 font-display" aria-hidden="true">:</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Punkte Team B"
            className={cn(
              "w-12 h-12 font-display text-xl text-center rounded-lg border-2 transition-all focus-visible:ring-[3px] focus-visible:ring-brand-red/30 outline-hidden",
              isValid ? "border-brand-teal bg-brand-teal/5 text-brand-teal" : "border-gray-200 focus-visible:border-brand-red"
            )}
            value={scoreB}
            onChange={(e) => {
              setDirty(true);
              setScoreB(e.target.value.replace(/\D/g, ""));
            }}
          />
        </div>

        <div className="text-left min-w-0">
          <p className="text-xs font-bold text-brand-navy truncate">
            {match.teamBNames.join(" & ")}
          </p>
        </div>
      </div>

      {isKnockout && isTie && (
        <div className="bg-gray-50 p-3 rounded-xl space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-center text-gray-400">Gewinner bestimmen</p>
          <div className="flex gap-2">
            <Button
              variant={winningSide === "A" ? "brand" : "outline"}
              size="touch"
              className="flex-1 truncate"
              onClick={() => {
                setDirty(true);
                setWinningSide("A");
              }}
            >
              {match.teamANames.join(" & ")}
            </Button>
            <Button
              variant={winningSide === "B" ? "brand" : "outline"}
              size="touch"
              className="flex-1 truncate"
              onClick={() => {
                setDirty(true);
                setWinningSide("B");
              }}
            >
              {match.teamBNames.join(" & ")}
            </Button>
          </div>
        </div>
      )}

      <Button
        variant={isValid ? "brandNavy" : "brandSubtle"}
        size="touch"
        className="w-full"
        onClick={handleSave}
        disabled={saving || !isValid}
      >
        {saving ? "Speichere..." : "Ergebnis überschreiben"}
      </Button>

      {error && (
        <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
          <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{error}</p>
        </div>
      )}
    </div>
  );
}
