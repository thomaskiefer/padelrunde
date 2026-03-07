import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../../convex/_generated/api";
import { canManageGroup } from "~/lib/groupPermissions";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import {
  modeLabels,
  statusBadgeVariant,
  statusDotColor,
  statusLabels,
} from "~/lib/tournament";

export const Route = createFileRoute("/gruppe/$groupSlug/")({
  component: GroupDashboard,
});

const modeBadgeVariant: Record<string, "brandNavy" | "brandTeal"> = {
  americano: "brandNavy",
  cup: "brandTeal",
};

function GroupDashboard() {
  const { groupSlug } = Route.useParams();
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

  if (!group) {
    return (
      <div className="mx-auto max-w-5xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">Gruppe nicht gefunden</h2>
        <p className="text-gray-500 text-sm mb-4">Diese Gruppe existiert nicht oder wurde gelöscht.</p>
        <Link to="/" className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"><span className="text-lg leading-none" aria-hidden="true">←</span> Startseite</Link>
      </div>
    );
  }

  const canManage = canManageGroup(me ?? null, members);

  return (
    <div className="mx-auto max-w-5xl p-4 space-y-8 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl uppercase text-brand-navy truncate">
            {group.name}
          </h2>
          <p className="text-sm text-gray-400">
            /{group.slug}
          </p>
        </div>
        {!membersLoading && canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="brand" size="touchLg" asChild>
              <Link
                to="/gruppe/$groupSlug/turnier/neu"
                params={{ groupSlug }}
              >
                Neues Turnier
              </Link>
            </Button>
            <Button variant="brandOutline" size="touchLg" asChild>
              <Link
                to="/gruppe/$groupSlug/einstellungen"
                params={{ groupSlug }}
              >
                Einstellungen
              </Link>
            </Button>
          </div>
        )}
      </div>

      <GroupMembers members={members} />
      <TournamentList groupId={group._id} groupSlug={groupSlug} />
    </div>
  );
}

function GroupMembers({
  members,
}: {
  members: Array<{
    _id: string;
    role: "admin" | "member";
    displayName: string;
  }>;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="uppercase tracking-widest text-[10px] font-bold text-gray-400 mb-3 flex items-center gap-2">
        Mitglieder <span className="font-display text-brand-navy text-sm">{members.length}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <Badge
            key={m._id}
            variant={m.role === "admin" ? "brandRed" : "muted"}
            size="xs"
            className="max-w-[180px] truncate gap-1.5"
          >
            {m.displayName}
            {m.role === "admin" && (
              <span className="ml-1 opacity-70">Admin</span>
            )}
          </Badge>
        ))}
      </div>
    </section>
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
      <div className="bg-white border border-gray-100 rounded-xl p-12 text-center shadow-sm animate-fade-in-up">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className="font-display text-sm uppercase tracking-widest text-gray-400">Noch keine Turniere</p>
        <p className="text-[11px] text-gray-400 mt-2">Starte jetzt dein erstes Americano- oder Padel-Cup-Turnier.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="uppercase tracking-widest text-[10px] font-bold text-gray-400 flex items-center gap-2 px-1">
        <span className="w-4 h-px bg-gray-200" aria-hidden="true" />
        Turniere
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {tournaments.map((t, i) => (
          <Link
            key={t._id}
            to="/gruppe/$groupSlug/turnier/$tournamentId"
            params={{ groupSlug, tournamentId: t._id }}
            className="animate-fade-in-up group bg-white relative overflow-hidden rounded-xl border border-gray-100 shadow-sm p-5 hover:border-brand-navy/20 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] block motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-brand-navy/50 focus-visible:outline-hidden"
            style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
          >
            <div className={cn(
              "absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 rotate-45 transition-colors opacity-[0.03] group-hover:opacity-[0.08]",
              statusDotColor[t.status]
            )} aria-hidden="true" />

            <div className="flex flex-col h-full relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    statusDotColor[t.status] ?? "bg-gray-300",
                    t.status === "active" && "animate-pulse"
                  )} aria-hidden="true" />
                  <h3 className="uppercase text-brand-navy truncate text-base group-hover:text-brand-red transition-colors">
                    {t.name}
                  </h3>
                </div>
                <Badge
                  variant={statusBadgeVariant[t.status] ?? "statusSetup"}
                  size="xs"
                  className="shrink-0"
                >
                  {statusLabels[t.status]}
                </Badge>
              </div>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  <span className="group-hover:text-brand-navy transition-colors">
                    {t.playerIds.length} Spieler
                  </span>
                  <span className="group-hover:text-brand-navy transition-colors">
                    {t.courts} {t.courts === 1 ? "Platz" : "Plätze"}
                  </span>
                </div>
                <Badge
                  variant={modeBadgeVariant[t.mode] ?? "muted"}
                  size="xs"
                >
                  {modeLabels[t.mode]}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
