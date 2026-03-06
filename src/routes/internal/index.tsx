import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/internal/")({
  component: InternalDashboard,
});

function InternalDashboard() {
  const queryClient = useQueryClient();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const usersQuery = convexQuery(api.users.listAll, {});
  const orphanGroupsQuery = convexQuery(api.groups.listOrphanedForBackoffice, {});
  const { data: users = [], isLoading: usersLoading } = useQuery({
    ...usersQuery,
    enabled: Boolean(me?.isSuperAdmin),
  });
  const { data: orphanedGroups = [], isLoading: orphanGroupsLoading } = useQuery({
    ...orphanGroupsQuery,
    enabled: Boolean(me?.isSuperAdmin),
  });
  const toggleCanCreateGroup = useMutation(api.users.toggleCanCreateGroup);
  const deleteOrphanedGroup = useMutation(api.groups.deleteOrphanedGroup);
  const [actionError, setActionError] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingOrphanGroupId, setPendingOrphanGroupId] = useState<string | null>(null);

  if (!me?.isSuperAdmin) {
    return (
      <div className="p-8 text-center text-gray-500 font-display uppercase tracking-widest">
        Kein Zugriff
      </div>
    );
  }

  const isLoadingBackofficeData = usersLoading || orphanGroupsLoading;

  const handleToggleCreateGroup = async (userId: string, canCreateGroup: boolean) => {
    setActionError("");
    setPendingUserId(userId);
    try {
      await toggleCanCreateGroup({ userId: userId as any, canCreateGroup });
      await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
    } catch (err: any) {
      setActionError(err.message ?? "Aktion fehlgeschlagen");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleDeleteOrphanedGroup = async (groupId: string) => {
    setActionError("");
    setPendingOrphanGroupId(groupId);
    try {
      await deleteOrphanedGroup({ groupId: groupId as any });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orphanGroupsQuery.queryKey }),
        queryClient.invalidateQueries(),
      ]);
    } catch (err: any) {
      setActionError(err.message ?? "Verwaiste Gruppe konnte nicht gelöscht werden.");
    } finally {
      setPendingOrphanGroupId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-8 animate-fade-in-up">
      <div className="space-y-2">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none">&larr;</span> Startseite
        </Link>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-brand-navy">
          Backoffice
        </h2>
        <p className="text-sm text-gray-500">
          Interne Verwaltung fur globale Berechtigungen und verwaiste Daten.
        </p>
      </div>

      {actionError && (
        <p className="text-sm text-red-600" role="alert">
          {actionError}
        </p>
      )}

      {isLoadingBackofficeData ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Backoffice-Daten werden geladen...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
            <h3 className="section-title-accent font-display uppercase tracking-widest text-sm text-brand-navy">
              Gruppen-Erstellrechte
            </h3>
            <p className="text-sm text-gray-500">
              Berechtigungen werden hier bewusst nur pro Benutzer verwaltet.
              Sammelaktionen würden manuelle Freigaben und alte Altlasten nicht
              sauber unterscheiden.
            </p>
          </div>

          <section className="space-y-4">
            <h3 className="section-title-accent font-display uppercase tracking-widest text-sm text-brand-navy">
              Registrierte Benutzer ({users.length})
            </h3>

            <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
              <table className="w-full text-left border-collapse">
                <caption className="sr-only">Registrierte Benutzer</caption>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">Name</th>
                    <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">E-Mail</th>
                    <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">Status</th>
                    <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold text-right">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-4 text-sm font-semibold text-brand-navy">{user.name}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{user.email}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5 flex-wrap">
                          {user.isSuperAdmin && (
                            <Badge variant="brandRed" size="xs">Super Admin</Badge>
                          )}
                          {user.canCreateGroup && (
                            <Badge variant="brandTeal" size="xs">Kann erstellen</Badge>
                          )}
                          {user.hasCreatedGroup && (
                            <Badge variant="brandNavy" size="xs">Hat Gruppe</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        {!user.isSuperAdmin && (
                          <Button
                            variant={user.canCreateGroup ? "brandDestructive" : "brandTeal"}
                            size="touchLg"
                            aria-label={`${user.name} ${user.canCreateGroup ? "Berechtigung entziehen" : "freischalten"}`}
                            disabled={pendingUserId === user._id}
                            onClick={() =>
                              handleToggleCreateGroup(user._id, !user.canCreateGroup)
                            }
                          >
                            {pendingUserId === user._id
                              ? "Speichert..."
                              : user.canCreateGroup
                                ? "Entziehen"
                                : "Freischalten"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:hidden">
              {users.map((user) => (
                <div key={user._id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-brand-navy truncate">{user.name}</p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    </div>
                    {!user.isSuperAdmin && (
                      <Button
                        variant={user.canCreateGroup ? "brandDestructive" : "brandTeal"}
                        size="touchLg"
                        className="shrink-0"
                        disabled={pendingUserId === user._id}
                        aria-label={`${user.name} ${user.canCreateGroup ? "Berechtigung entziehen" : "freischalten"}`}
                        onClick={() =>
                          handleToggleCreateGroup(user._id, !user.canCreateGroup)
                        }
                      >
                        {pendingUserId === user._id
                          ? "Speichert..."
                          : user.canCreateGroup
                            ? "Entziehen"
                            : "Freischalten"}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap pt-2 border-t border-gray-50">
                    {user.isSuperAdmin && (
                      <Badge variant="brandRed" size="xs">Super Admin</Badge>
                    )}
                    {user.canCreateGroup && (
                      <Badge variant="brandTeal" size="xs">Kann erstellen</Badge>
                    )}
                    {user.hasCreatedGroup && (
                      <Badge variant="brandNavy" size="xs">Hat Gruppe</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="section-title-accent font-display uppercase tracking-widest text-sm text-brand-navy">
                Verwaiste Gruppen ({orphanedGroups.length})
              </h3>
              <p className="text-xs text-gray-500">
                Diese Gruppen sind aus der normalen Navigation ausgeblendet.
              </p>
            </div>

            {orphanedGroups.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                Keine verwaisten Gruppen gefunden.
              </div>
            ) : (
              <div className="grid gap-4">
                {orphanedGroups.map((group) => (
                  <article
                    key={group._id}
                    className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <h4 className="font-display text-lg uppercase text-brand-navy">
                          {group.name}
                        </h4>
                        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
                          /{group.slug}
                        </p>
                        <p className="text-sm text-gray-500">
                          {group.historicalMembers.length} historische Mitgliedschaften,{" "}
                          {group.tournamentCount} Turniere
                        </p>
                      </div>

                      <Button
                        variant="brandDestructive"
                        size="touchLg"
                        disabled={pendingOrphanGroupId === group._id}
                        onClick={() => handleDeleteOrphanedGroup(group._id)}
                      >
                        {pendingOrphanGroupId === group._id
                          ? "Loscht..."
                          : "Gruppe loschen"}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-widest text-gray-400">
                        Historische Mitgliedschaften
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.historicalMembers.map((member) => (
                          <Badge key={member._id} variant="muted" size="xs">
                            {member.displayName} · {member.role === "admin" ? "Admin" : "Mitglied"}
                            {member.hasUser ? "" : " · Benutzer entfernt"}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
