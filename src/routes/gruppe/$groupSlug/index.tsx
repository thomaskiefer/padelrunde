import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export const Route = createFileRoute("/gruppe/$groupSlug/")({
  component: GroupDashboard,
});

function GroupDashboard() {
  const { groupSlug } = Route.useParams();
  const { data: group } = useSuspenseQuery(
    convexQuery(api.groups.getBySlug, { slug: groupSlug })
  );

  if (!group) {
    return (
      <div className="p-8 text-center text-gray-500">
        Gruppe nicht gefunden
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{group.name}</h2>
          <p className="text-gray-500">/{group.slug}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/gruppe/$groupSlug/turnier/neu"
            params={{ groupSlug }}
          >
            <Button>Neues Turnier</Button>
          </Link>
          <Link
            to="/gruppe/$groupSlug/einstellungen"
            params={{ groupSlug }}
          >
            <Button variant="outline">Einstellungen</Button>
          </Link>
        </div>
      </div>

      <GroupMembers groupId={group._id} />
      <TournamentList groupId={group._id} groupSlug={groupSlug} />
    </div>
  );
}

function GroupMembers({ groupId }: { groupId: string }) {
  const { data: members } = useSuspenseQuery(
    convexQuery(api.groups.getMembers, { groupId: groupId as any })
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mitglieder ({members.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <Badge
              key={m._id}
              variant={m.role === "admin" ? "default" : "secondary"}
            >
              {m.displayName}
              {m.role === "admin" && " (Admin)"}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TournamentList({
  groupId,
  groupSlug,
}: {
  groupId: string;
  groupSlug: string;
}) {
  const { data: tournaments } = useSuspenseQuery(
    convexQuery(api.tournaments.listByGroup, { groupId: groupId as any })
  );

  if (tournaments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Noch keine Turniere erstellt.
        </CardContent>
      </Card>
    );
  }

  const statusLabels: Record<string, string> = {
    setup: "Vorbereitung",
    active: "Aktiv",
    knockout: "K.O.-Phase",
    finished: "Beendet",
  };

  const modeLabels: Record<string, string> = {
    amerikaner: "Amerikaner",
    cup: "Cup",
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Turniere</h3>
      {tournaments.map((t) => (
        <Link
          key={t._id}
          to="/gruppe/$groupSlug/turnier/$tournamentId"
          params={{ groupSlug, tournamentId: t._id }}
        >
          <Card className="transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t.name}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline">{modeLabels[t.mode]}</Badge>
                  <Badge
                    variant={t.status === "active" ? "default" : "secondary"}
                  >
                    {statusLabels[t.status]}
                  </Badge>
                </div>
              </div>
              <CardDescription>
                {t.playerIds.length} Spieler · {t.courts} {t.courts === 1 ? "Platz" : "Plätze"}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
