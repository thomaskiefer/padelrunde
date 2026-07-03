import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import {
  maxCourtsForPlayers,
  validateTournamentConfig,
} from "../../../../../convex/model/validation";
import { resolveTournamentCreateAccess } from "../-access";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/gruppe/$groupSlug/turnier/neu")({
  component: CreateTournament,
});

export function CreateTournament() {
  const { groupSlug } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));

  const { data: group } = useSuspenseQuery(
    convexQuery(api.groups.getBySlug, { slug: groupSlug })
  );
  const { data: members = [], isLoading: membersLoading } = useQuery({
    ...convexQuery(api.groups.getMembers, {
      groupId: (group?._id ?? "missing") as any,
    }),
    enabled: !!group,
  });

  const createTournament = useMutation(api.tournaments.create);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"americano" | "cup">("americano");
  const [courts, setCourts] = useState(1);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const maxCourts = maxCourtsForPlayers(selectedPlayers.size);
  useEffect(() => {
    if (courts > maxCourts) setCourts(maxCourts);
  }, [courts, maxCourts]);

  if (!group) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center animate-fade-in-up">
        <h2 className="font-display uppercase text-brand-navy">Gruppe nicht gefunden</h2>
      </div>
    );
  }

  const access = resolveTournamentCreateAccess(me ?? null, members, membersLoading);
  if (access === "loading") {
    return <div className="mx-auto max-w-lg p-4 mt-12 text-center">Lade Berechtigungen...</div>;
  }
  if (access === "denied") {
    return (
      <div className="mx-auto max-w-md p-6 mt-8 text-center animate-fade-in-up bg-white rounded-xl border border-gray-100 shadow-sm">
        <h2 className="font-display uppercase text-brand-navy mb-2">Keine Berechtigung</h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Nur Gruppen-Admins dürfen neue Turniere planen und erstellen.
        </p>
        <Button variant="brandNavy" size="touchLg" asChild>
          <Link
            to="/gruppe/$groupSlug"
            params={{ groupSlug }}
          >
            &larr; Zurück zur Gruppe
          </Link>
        </Button>
      </div>
    );
  }

  const togglePlayer = (memberId: string) => {
    const next = new Set(selectedPlayers);
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    setSelectedPlayers(next);
  };

  const playerCountValid = validateTournamentConfig(
    mode,
    selectedPlayers.size,
    courts
  ).valid;
  const trimmedName = name.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tournamentId = await createTournament({
        groupId: group._id,
        name: trimmedName,
        mode,
        courts,
        playerIds: Array.from(selectedPlayers) as Array<Id<"groupMembers">>,
      });
      navigate({
        to: "/gruppe/$groupSlug/turnier/$tournamentId",
        params: { groupSlug, tournamentId },
      });
    } catch (err: any) {
      setError(err.message ?? "Fehler beim Erstellen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-4 space-y-8 animate-fade-in-up">
      <div className="space-y-2">
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors inline-flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zur Gruppe
        </Link>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-brand-navy">
          Neues Turnier
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-[10px] uppercase tracking-widest font-bold text-gray-400"
            >
              Turniername
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Sommer-Turnier 2026"
              required
              className="h-12 border-gray-200 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                Modus
              </Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "americano" | "cup")}
              >
                <SelectTrigger className="w-full h-12 border-gray-200 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="americano">Americano (4–8 Spieler)</SelectItem>
                  <SelectItem value="cup">Padel Cup (8 Spieler)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-gray-400 leading-relaxed">
                {mode === "cup"
                  ? "5 Vorrunden, danach Halbfinale, Finale und Spiel um Platz 3."
                  : "Jeder spielt mit wechselnden Partnern, 32 Punkte pro Spiel. Bei 5–7 Spielern pausieren pro Runde abwechselnd einzelne."}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                Plätze
              </Label>
              <Select
                value={String(courts)}
                onValueChange={(v) => setCourts(Number(v))}
              >
                <SelectTrigger className="w-full h-12 border-gray-200 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Platz</SelectItem>
                  <SelectItem value="2" disabled={maxCourts < 2}>
                    2 Plätze
                  </SelectItem>
                </SelectContent>
              </Select>
              {maxCourts < 2 && (
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  Für 2 Plätze mindestens 8 Spieler wählen.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                Spieler auswählen
              </Label>
              <span className={cn(
                "font-display text-xs",
                playerCountValid ? "text-brand-teal" : "text-brand-red"
              )}>
                {selectedPlayers.size} / {mode === "cup" ? "8" : "4–8"}
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {members.map((m) => (
                <Button
                  key={m._id}
                  type="button"
                  variant={selectedPlayers.has(m._id) ? "brand" : "outline"}
                  size="touchLg"
                  className={cn(
                    "justify-center",
                    selectedPlayers.has(m._id) && "shadow-md"
                  )}
                  onClick={() => togglePlayer(m._id)}
                >
                  {m.displayName}
                  {m.isGuest && <span className="opacity-60"> · Gast</span>}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant={loading || !playerCountValid ? "brandSubtle" : "brand"}
          size="touchXl"
          className="w-full"
          disabled={loading || !playerCountValid || !trimmedName}
        >
          {loading ? "Wird erstellt..." : "Turnier erstellen"}
        </Button>
      </form>
    </div>
  );
}
