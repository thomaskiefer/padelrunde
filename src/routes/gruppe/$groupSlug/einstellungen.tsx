import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { resolveSettingsAccess } from "./-access";
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
import { cn } from "~/lib/utils";

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
    <div className="mx-auto max-w-5xl p-4 space-y-8 animate-fade-in-up">
      <div>
        <Link
          to="/gruppe/$groupSlug"
          params={{ groupSlug }}
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Zurück zur Gruppe
        </Link>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-brand-navy mt-1">
          Einstellungen: {group.name}
        </h2>
      </div>

      <section>
        <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy mb-4">
          Mitglied hinzufügen
        </h3>
        <form
          onSubmit={handleAddMember}
          className="relative overflow-hidden rounded-xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 rotate-45 bg-brand-navy/5" aria-hidden="true" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member-user" className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Benutzer</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="member-user" className="w-full h-12">
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
              <Label htmlFor="member-role" className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Rolle</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value: "admin" | "member") => setNewMemberRole(value)}
              >
                <SelectTrigger id="member-role" className="w-full h-12">
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
            <Label htmlFor="display-name" className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Anzeigename</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name in der Gruppe"
              className="h-12"
            />
          </div>

          {addError && (
            <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                {addError}
              </p>
            </div>
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
        <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy mb-4">
          Mitglieder verwalten
        </h3>
        {actionError && (
          <div className="mb-3 bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">{actionError}</p>
          </div>
        )}

        {/* Desktop: table layout */}
        <div className="hidden md:block overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-left border-collapse">
            <caption className="sr-only">Mitglieder verwalten</caption>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">
                  Name
                </th>
                <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">
                  Rolle
                </th>
                <th scope="col" className="text-[10px] uppercase tracking-widest text-gray-400 px-4 py-3 font-bold">
                  Aktion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map((m, i) => (
                (() => {
                  const canToggleRole = canDemoteAdmin(members, m);
                  const isMe = m.userId === me?._id;
                  return (
                    <tr key={m._id} className={cn("border-b border-gray-100 animate-slide-in-left", isMe && "bg-brand-navy/[0.03]")} style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                      <td className="px-4 py-4 font-medium max-w-[200px] truncate">
                        {m.displayName}
                        {isMe && <span className="ml-2 text-[10px] uppercase tracking-widest font-bold text-gray-400">(Du)</span>}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={m.role === "admin" ? "brandRed" : "muted"} size="xs">
                          {m.role === "admin" ? "Admin" : "Mitglied"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
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
        <div className="md:hidden space-y-3">
          {members.map((m, i) => (
            (() => {
              const canToggleRole = canDemoteAdmin(members, m);
              const isMe = m.userId === me?._id;
              return (
                <div
                  key={m._id}
                  className={cn("rounded-xl border border-gray-100 bg-white p-3 shadow-sm space-y-2 animate-fade-in-up", isMe && "ring-2 ring-brand-navy/10")}
                  style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate min-w-0">
                      {m.displayName}
                      {isMe && <span className="ml-1.5 text-[10px] uppercase tracking-widest font-bold text-gray-400">(Du)</span>}
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
