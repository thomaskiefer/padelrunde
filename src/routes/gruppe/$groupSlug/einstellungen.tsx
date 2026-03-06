import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { resolveSettingsAccess } from "./access";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { canDemoteAdmin } from "~/lib/groupPermissions";

export const Route = createFileRoute("/gruppe/$groupSlug/einstellungen")({
  component: GroupSettings,
});

export function GroupSettings() {
  const { groupSlug } = Route.useParams();
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const { data: group } = useSuspenseQuery(
    convexQuery(api.groups.getBySlug, { slug: groupSlug })
  );
  const membersQuery = convexQuery(api.groups.getMembers, {
    groupId: (group?._id ?? "missing") as any,
  });
  const { data: members = [], isLoading: membersLoading } = useQuery({
    ...membersQuery,
    enabled: !!group,
  });
  const addableUsersQuery = convexQuery(api.groups.listAddableUsers, {
    groupId: (group?._id ?? "missing") as any,
  });
  const updateMemberRole = useMutation(api.groups.updateMemberRole);
  const addMember = useMutation(api.groups.addMember);
  const [actionError, setActionError] = useState("");
  const [actionLoadingMemberId, setActionLoadingMemberId] = useState<string | null>(null);
  const [addError, setAddError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"admin" | "member">("member");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [prefilledUserId, setPrefilledUserId] = useState("");

  const access = group
    ? resolveSettingsAccess(me ?? null, members, membersLoading)
    : "denied";
  const { data: addableUsers = [] } = useQuery({
    ...addableUsersQuery,
    enabled: !!group && access === "allowed",
  });

  useEffect(() => {
    if (!selectedUserId) {
      setDisplayName("");
      setPrefilledUserId("");
      return;
    }
    if (prefilledUserId === selectedUserId) return;

    const selectedUser = addableUsers.find((user) => user._id === selectedUserId);
    if (selectedUser) {
      setDisplayName(selectedUser.name);
      setPrefilledUserId(selectedUserId);
    }
  }, [addableUsers, prefilledUserId, selectedUserId]);

  if (!group) {
    return (
      <div className="p-8 text-center">
        <h2 className="font-display uppercase text-brand-navy">Gruppe nicht gefunden</h2>
        <Link to="/" className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center justify-center gap-1.5 mt-4">
          <span className="text-lg leading-none" aria-hidden="true">←</span> Startseite
        </Link>
      </div>
    );
  }

  if (access === "loading") {
    return <div className="mx-auto max-w-4xl p-4 mt-12 text-center">Lade Berechtigungen...</div>;
  }
  if (access === "denied") {
    return (
      <div className="mx-auto max-w-4xl p-4 mt-12 text-center animate-fade-in-up">
        <h2 className="font-display text-xl uppercase text-brand-navy mb-2">Keine Berechtigung</h2>
        <p className="text-gray-500 text-sm mb-4">
          Nur Gruppen-Admins dürfen diese Seite öffnen.
        </p>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">←</span> Zurück zur Gruppe
        </Link>
      </div>
    );
  }

  const handleRoleToggle = async (memberId: string, currentRole: "admin" | "member") => {
    setActionError("");
    setActionLoadingMemberId(memberId);
    try {
      await updateMemberRole({
        memberId: memberId as any,
        role: currentRole === "admin" ? "member" : "admin",
      });
    } catch (err: any) {
      setActionError(err.message ?? "Aktion fehlgeschlagen");
    } finally {
      setActionLoadingMemberId(null);
    }
  };

  const handleAddMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddError("");

    const selectedUser = addableUsers.find((user) => user._id === selectedUserId);
    if (!selectedUser) {
      setAddError("Bitte wähle einen Benutzer aus.");
      return;
    }
    if (!displayName.trim()) {
      setAddError("Bitte gib einen Anzeigenamen an.");
      return;
    }

    setIsAddingMember(true);
    try {
      await addMember({
        groupId: group._id,
        userId: selectedUser._id,
        displayName: displayName.trim(),
        role: newMemberRole,
      });
      setSelectedUserId("");
      setDisplayName("");
      setNewMemberRole("member");
      setPrefilledUserId("");
    } catch (err: any) {
      setAddError(err.message ?? "Mitglied konnte nicht hinzugefügt werden.");
    } finally {
      setIsAddingMember(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 space-y-6 animate-fade-in-up">
      <div>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zurück zur Gruppe
        </Link>
        <h2 className="font-display text-xl sm:text-2xl uppercase text-brand-navy mt-1">
          Einstellungen: {group.name}
        </h2>
      </div>

      <section>
        <h3 className="section-title-accent font-display uppercase tracking-wide text-base sm:text-lg text-brand-navy mb-1">
          Mitglied hinzufügen
        </h3>
        <div className="w-full h-px bg-brand-red/20 mb-4" aria-hidden="true" />
        <form
          onSubmit={handleAddMember}
          className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-user">Benutzer</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="member-user" className="w-full">
                  <SelectValue placeholder="Benutzer auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {addableUsers.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-role">Rolle</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value: "admin" | "member") => setNewMemberRole(value)}
              >
                <SelectTrigger id="member-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Mitglied</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Anzeigename</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name in der Gruppe"
            />
          </div>

          {addError && (
            <p className="text-sm text-red-600" role="alert">
              {addError}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Wähle einen registrierten Benutzer aus und passe den Anzeigenamen bei Bedarf an.
            </p>
            <Button
              type="submit"
              variant="brand"
              size="touchLg"
              disabled={isAddingMember || addableUsers.length === 0}
            >
              {addableUsers.length === 0
                ? "Keine weiteren Benutzer"
                : isAddingMember
                  ? "Wird hinzugefügt..."
                  : "Mitglied hinzufügen"}
            </Button>
          </div>
        </form>
      </section>

      <section>
        <h3 className="section-title-accent font-display uppercase tracking-wide text-base sm:text-lg text-brand-navy mb-1">
          Mitglieder verwalten
        </h3>
        <div className="w-full h-px bg-brand-red/20 mb-4" aria-hidden="true" />
        {actionError && <p className="mb-3 text-sm text-red-600" role="alert">{actionError}</p>}

        {/* Desktop: table layout */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Mitglieder verwalten</caption>
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="text-xs uppercase tracking-wider text-gray-400 pb-3 font-medium">
                  Name
                </th>
                <th scope="col" className="text-xs uppercase tracking-wider text-gray-400 pb-3 font-medium">
                  Rolle
                </th>
                <th scope="col" className="text-xs uppercase tracking-wider text-gray-400 pb-3 font-medium">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                (() => {
                  const canToggleRole = canDemoteAdmin(members, m);
                  return (
                    <tr key={m._id} className="border-b border-gray-100">
                      <td className="py-3 font-medium max-w-[200px] truncate">
                        {m.displayName}
                      </td>
                      <td className="py-3">
                        <Badge variant={m.role === "admin" ? "brandRed" : "muted"} size="xs">
                          {m.role === "admin" ? "Admin" : "Mitglied"}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <Button
                          variant="brandOutline"
                          size="touchLg"
                          aria-label={`${m.displayName} ${m.role === "admin" ? "zum Mitglied" : "zum Admin"} machen`}
                          onClick={() => handleRoleToggle(m._id, m.role)}
                          disabled={
                            actionLoadingMemberId === m._id || !canToggleRole
                          }
                        >
                          {!canToggleRole
                            ? "Mind. 1 Admin"
                            : m.role === "admin"
                              ? "Zum Mitglied machen"
                              : "Zum Admin machen"}
                        </Button>
                      </td>
                    </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: card layout */}
        <div className="sm:hidden space-y-3">
          {members.map((m) => (
            (() => {
              const canToggleRole = canDemoteAdmin(members, m);
              return (
                <div
                  key={m._id}
                  className="rounded-xl border border-gray-200 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate min-w-0">
                      {m.displayName}
                    </span>
                    <Badge variant={m.role === "admin" ? "brandRed" : "muted"} size="xs" className="shrink-0">
                      {m.role === "admin" ? "Admin" : "Mitglied"}
                    </Badge>
                  </div>
                  <Button
                    variant="brandOutline"
                    size="touchLg"
                    className="w-full"
                    aria-label={`${m.displayName} ${m.role === "admin" ? "zum Mitglied" : "zum Admin"} machen`}
                    onClick={() => handleRoleToggle(m._id, m.role)}
                    disabled={
                      actionLoadingMemberId === m._id || !canToggleRole
                    }
                  >
                    {!canToggleRole
                      ? "Mind. 1 Admin"
                      : m.role === "admin"
                        ? "Zum Mitglied machen"
                        : "Zum Admin machen"}
                  </Button>
                </div>
              );
            })()
          ))}
        </div>
      </section>
    </div>
  );
}
