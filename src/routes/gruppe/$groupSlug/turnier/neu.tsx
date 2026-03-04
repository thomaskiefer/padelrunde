import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useState } from "react";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/gruppe/$groupSlug/turnier/neu")({
  component: CreateTournament,
});

function CreateTournament() {
  const { groupSlug } = Route.useParams();
  const navigate = useNavigate();

  const { data: group } = useSuspenseQuery(
    convexQuery(api.groups.getBySlug, { slug: groupSlug })
  );
  const { data: members } = useSuspenseQuery(
    convexQuery(api.groups.getMembers, {
      groupId: (group?._id ?? "") as any,
    })
  );

  const createTournament = useMutation(api.tournaments.create);

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"amerikaner" | "cup">("amerikaner");
  const [courts, setCourts] = useState(1);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    new Set()
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!group) {
    return <div className="p-8 text-center">Gruppe nicht gefunden</div>;
  }

  const togglePlayer = (memberId: string) => {
    const next = new Set(selectedPlayers);
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    setSelectedPlayers(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tournamentId = await createTournament({
        groupId: group._id,
        name,
        mode,
        courts,
        playerIds: Array.from(selectedPlayers) as Id<"groupMembers">[],
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
    <div className="mx-auto max-w-md p-4 mt-8">
      <Card>
        <CardHeader>
          <CardTitle>Neues Turnier</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Turniername</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Sommer-Turnier 2026"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Modus</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "amerikaner" | "cup")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amerikaner">
                    Amerikaner (4-8 Spieler)
                  </SelectItem>
                  <SelectItem value="cup">Cup (8 Spieler)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Plätze</Label>
              <Select
                value={String(courts)}
                onValueChange={(v) => setCourts(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Platz</SelectItem>
                  <SelectItem value="2">2 Plätze</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Spieler ({selectedPlayers.size} ausgewählt)
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {members.map((m) => (
                  <Button
                    key={m._id}
                    type="button"
                    variant={
                      selectedPlayers.has(m._id) ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => togglePlayer(m._id)}
                  >
                    {m.displayName}
                  </Button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Erstelle..." : "Turnier erstellen"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
