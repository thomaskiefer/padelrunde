import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { resolveSettingsAccess } from "./-access";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  canDemoteAdmin,
  canRemoveGroupMember,
  getRemoveGroupMemberBlockReason,
} from "~/lib/groupPermissions";
import { cn } from "~/lib/utils";

export const Route = createFileRoute("/gruppe/$groupSlug/einstellungen")({
  component: GroupSettings,
});

export function GroupSettings() {
  const { groupSlug } = Route.useParams();
  const navigate = useNavigate();
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
  const inviteTokensQuery = convexQuery(api.groups.listInviteTokens, {
    groupId: (group?._id ?? "missing") as any,
  });
  const updateMemberRole = useMutation(api.groups.updateMemberRole);
  const removeMember = useMutation(api.groups.removeMember);
  const createInviteToken = useMutation(api.groups.createInviteToken);
  const revokeInviteToken = useMutation(api.groups.revokeInviteToken);
  const deleteInviteToken = useMutation(api.groups.deleteInviteToken);
  const deleteGroup = useMutation(api.groups.deleteGroup);
  const addGuestMember = useMutation(api.groups.addGuestMember);
  const updateMemberDisplayName = useMutation(api.groups.updateMemberDisplayName);
  const [actionError, setActionError] = useState("");
  const [actionLoadingMemberId, setActionLoadingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteLabel, setInviteLabel] = useState("");
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState("");
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [latestInvite, setLatestInvite] = useState<{
    inviteTokenId: string;
    token: string;
    groupSlug: string;
    expiresAt: number;
    label?: string;
  } | null>(null);

  const access = group
    ? resolveSettingsAccess(me ?? null, members, membersLoading)
    : "denied";
  const { data: inviteTokens = [] } = useQuery({
    ...inviteTokensQuery,
    enabled: !!group && access === "allowed",
  });
  const latestInviteStatus =
    latestInvite === null
      ? null
      : Date.now() >= latestInvite.expiresAt
        ? "expired"
        : inviteTokens.find((invite) => invite._id === latestInvite.inviteTokenId)
            ?.status ?? "active";
  const origin = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );
  // Server-computed invite.status is a snapshot; a token that crosses its
  // expiresAt while this page stays open would keep showing "Aktiv" (with a
  // working copy button) until an unrelated refetch. Recompute effective status
  // against a client clock. Starts at 0 (matches SSR) then ticks on the client.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const buildInviteUrl = (token: string) =>
    origin
      ? `${origin}/gruppe/${groupSlug}/beitreten/${token}`
      : `/gruppe/${groupSlug}/beitreten/${token}`;

  const handleCreateInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteError("");
    setIsCreatingInvite(true);
    try {
      const createdInvite = await createInviteToken({
        groupId: group._id,
        label: inviteLabel.trim() || undefined,
      });
      setLatestInvite(createdInvite);
      setInviteLabel("");
    } catch (err: any) {
      setInviteError(err.message ?? "Einladungslink konnte nicht erstellt werden.");
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const copyInvite = async (inviteId: string, token: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(token));
      setCopiedInviteId(inviteId);
      setTimeout(() => {
        setCopiedInviteId((current) => (current === inviteId ? null : current));
      }, 1500);
    } catch {
      setInviteError("Link konnte nicht kopiert werden.");
    }
  };

  const handleRevokeInvite = async (inviteTokenId: string) => {
    setInviteError("");
    setRevokingInviteId(inviteTokenId);
    try {
      await revokeInviteToken({ inviteTokenId: inviteTokenId as any });
      if (latestInvite?.inviteTokenId === inviteTokenId) {
        setLatestInvite(null);
      }
    } catch (err: any) {
      setInviteError(err.message ?? "Einladung konnte nicht widerrufen werden.");
    } finally {
      setRevokingInviteId(null);
    }
  };

  const handleDeleteInvite = async (inviteTokenId: string) => {
    setInviteError("");
    setDeletingInviteId(inviteTokenId);
    try {
      await deleteInviteToken({ inviteTokenId: inviteTokenId as any });
      if (latestInvite?.inviteTokenId === inviteTokenId) {
        setLatestInvite(null);
      }
    } catch (err: any) {
      setInviteError(err.message ?? "Einladung konnte nicht gelöscht werden.");
    } finally {
      setDeletingInviteId(null);
    }
  };

  const handleRemoveMember = async (memberId: string, displayName: string) => {
    if (!window.confirm(`${displayName} wirklich aus der Gruppe entfernen?`)) {
      return;
    }
    setActionError("");
    setRemovingMemberId(memberId);
    try {
      await removeMember({ memberId: memberId as any });
    } catch (err: any) {
      setActionError(err.message ?? "Mitglied konnte nicht entfernt werden.");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleAddGuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGuestError("");
    const name = guestName.trim();
    if (!name) return;
    setIsAddingGuest(true);
    try {
      await addGuestMember({ groupId: group._id, displayName: name });
      setGuestName("");
    } catch (err: any) {
      setGuestError(err.message ?? "Gast konnte nicht hinzugefügt werden.");
    } finally {
      setIsAddingGuest(false);
    }
  };

  const startRename = (memberId: string, currentName: string) => {
    setActionError("");
    setEditingMemberId(memberId);
    setEditNameValue(currentName);
  };

  const cancelRename = () => {
    setEditingMemberId(null);
    setEditNameValue("");
  };

  const handleRename = async (memberId: string) => {
    const name = editNameValue.trim();
    if (!name) return;
    setActionError("");
    setSavingRename(true);
    try {
      await updateMemberDisplayName({ memberId: memberId as any, displayName: name });
      cancelRename();
    } catch (err: any) {
      setActionError(err.message ?? "Name konnte nicht geändert werden.");
    } finally {
      setSavingRename(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (
      !window.confirm(
        "Diese Gruppe, alle Turniere, Spiele und Einladungen endgültig löschen?"
      )
    ) {
      return;
    }
    setGroupError("");
    setIsDeletingGroup(true);
    try {
      await deleteGroup({ groupId: group._id });
      navigate({ to: "/" });
    } catch (err: any) {
      setGroupError(err.message ?? "Gruppe konnte nicht gelöscht werden.");
    } finally {
      setIsDeletingGroup(false);
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
          Einladungen
        </h3>
        <form
          onSubmit={handleCreateInvite}
          className="rounded-xl border border-gray-100 bg-white p-4 sm:p-5 shadow-sm space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="invite-label" className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Bezeichnung (optional)</Label>
            <Input
              id="invite-label"
              value={inviteLabel}
              onChange={(event) => setInviteLabel(event.target.value)}
              placeholder="z.B. Training Mittwoch"
              className="h-12"
            />
          </div>

          {latestInvite && latestInviteStatus === "active" && (
            <div className="space-y-2 rounded-xl border border-brand-teal/20 bg-brand-teal/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-teal">
                Neuer Link erstellt
              </p>
              <Input
                readOnly
                value={buildInviteUrl(latestInvite.token)}
                className="h-12 bg-white"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500">
                  Läuft am {new Date(latestInvite.expiresAt).toLocaleString("de-DE")} ab.
                </p>
                <Button
                  type="button"
                  variant="brandTeal"
                  size="touchLg"
                  onClick={() =>
                    copyInvite(latestInvite.inviteTokenId, latestInvite.token)
                  }
                >
                  {copiedInviteId === latestInvite.inviteTokenId ? "Kopiert" : "Link kopieren"}
                </Button>
              </div>
            </div>
          )}

          {inviteError && (
            <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">
                {inviteError}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Einladungslinks sind 7 Tage gültig, können mehrfach genutzt, erneut kopiert und jederzeit widerrufen werden.
            </p>
            <Button
              type="submit"
              variant="brand"
              size="touchLg"
              disabled={isCreatingInvite}
            >
              {isCreatingInvite ? "Wird erstellt..." : "Einladungslink erstellen"}
            </Button>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {inviteTokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white/70 p-4 text-sm text-gray-500">
              Noch keine Einladungen erstellt.
            </div>
          ) : (
            inviteTokens.map((invite, index) => {
              const status =
                invite.status === "active" &&
                now > 0 &&
                now >= invite.expiresAt
                  ? "expired"
                  : invite.status;
              const inviteToken = invite.token;
              const statusLabel =
                status === "active"
                  ? "Aktiv"
                  : status === "expired"
                    ? "Abgelaufen"
                    : "Widerrufen";
              const statusVariant =
                status === "active"
                  ? "brandTeal"
                  : status === "expired"
                    ? "muted"
                    : "brandRed";

              return (
                <div
                  key={invite._id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm animate-fade-in-up"
                  style={{ animationDelay: `${Math.min(index * 0.05, 0.3)}s` }}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-brand-navy">
                            {invite.label || "Einladungslink"}
                          </p>
                          <Badge variant={statusVariant} size="xs">
                            {statusLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          Erstellt am {new Date(invite.createdAt).toLocaleString("de-DE")} · Gültig bis {new Date(invite.expiresAt).toLocaleString("de-DE")}
                        </p>
                      </div>
                    </div>
                    {status === "active" && inviteToken ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          readOnly
                          value={buildInviteUrl(inviteToken)}
                          className="h-10 min-w-0 flex-1 bg-gray-50 text-xs"
                        />
                        <div className="flex shrink-0 items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="brandOutline"
                            size="sm"
                            onClick={() => copyInvite(invite._id, inviteToken)}
                          >
                            {copiedInviteId === invite._id ? "Kopiert" : "Link kopieren"}
                          </Button>
                          <Button
                            type="button"
                            variant="brandDestructive"
                            size="sm"
                            disabled={revokingInviteId === invite._id}
                            onClick={() => handleRevokeInvite(invite._id)}
                          >
                            {revokingInviteId === invite._id ? "..." : "Widerrufen"}
                          </Button>
                        </div>
                      </div>
                    ) : status === "active" ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-gray-500">
                          Dieser ältere Link kann nicht erneut angezeigt werden. Erstelle bei Bedarf einen neuen Link oder widerrufe ihn.
                        </p>
                        <Button
                          type="button"
                          variant="brandDestructive"
                          size="sm"
                          className="shrink-0"
                          disabled={revokingInviteId === invite._id}
                          onClick={() => handleRevokeInvite(invite._id)}
                        >
                          {revokingInviteId === invite._id ? "..." : "Widerrufen"}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-gray-500">
                          Dieser Link ist nicht mehr nutzbar.
                        </p>
                        <Button
                          type="button"
                          variant="brandDestructive"
                          size="sm"
                          className="shrink-0"
                          disabled={deletingInviteId === invite._id}
                          onClick={() => handleDeleteInvite(invite._id)}
                        >
                          {deletingInviteId === invite._id ? "..." : "Löschen"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy mb-4">
          Mitglieder verwalten
        </h3>

        <form
          onSubmit={handleAddGuest}
          className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm space-y-3"
        >
          <div className="space-y-1">
            <Label
              htmlFor="guest-name"
              className="text-[10px] uppercase tracking-widest font-bold text-gray-400"
            >
              Gastspieler hinzufügen
            </Label>
            <p className="text-xs text-gray-500">
              Für Mitspieler ohne Konto. Sie können ausgewählt werden wie alle
              anderen und jederzeit wieder entfernt werden.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="guest-name"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Name des Gastes"
              className="h-12 min-w-0 flex-1"
              maxLength={60}
            />
            <Button
              type="submit"
              variant="brand"
              size="touchLg"
              className="shrink-0"
              disabled={isAddingGuest || !guestName.trim()}
            >
              {isAddingGuest ? "Wird hinzugefügt..." : "Gast hinzufügen"}
            </Button>
          </div>
          {guestError && (
            <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">
                {guestError}
              </p>
            </div>
          )}
        </form>

        {actionError && (
          <div className="mb-3 bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{actionError}</p>
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
                  const removeBlockReason = getRemoveGroupMemberBlockReason(members, m);
                  const canRemove = canRemoveGroupMember(members, m);
                  const isMe = m.userId === me?._id;
                  const isEditing = editingMemberId === m._id;
                  return (
                    <tr key={m._id} className={cn("animate-slide-in-left hover:bg-gray-50/50 transition-colors", isMe && "bg-brand-navy/[0.03]")} style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}>
                      <td className="px-4 py-4 max-w-[280px]">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editNameValue}
                              onChange={(event) => setEditNameValue(event.target.value)}
                              className="h-9 min-w-0"
                              maxLength={60}
                              autoFocus
                              aria-label="Neuer Anzeigename"
                            />
                            <Button
                              variant="brand"
                              size="sm"
                              className="shrink-0"
                              onClick={() => handleRename(m._id)}
                              disabled={savingRename || !editNameValue.trim()}
                            >
                              {savingRename ? "..." : "Speichern"}
                            </Button>
                            <Button
                              variant="brandOutline"
                              size="sm"
                              className="shrink-0"
                              onClick={cancelRename}
                              disabled={savingRename}
                            >
                              Abbrechen
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-brand-navy text-sm truncate">{m.displayName}</span>
                            {isMe && <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 shrink-0">(Du)</span>}
                            <button
                              type="button"
                              onClick={() => startRename(m._id, m.displayName)}
                              className="ml-auto text-[10px] uppercase tracking-widest font-bold text-gray-400 hover:text-brand-red transition-colors shrink-0"
                            >
                              Umbenennen
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {m.isGuest ? (
                          <Badge variant="muted" size="xs">Gast</Badge>
                        ) : (
                          <Badge variant={m.role === "admin" ? "brandRed" : "muted"} size="xs">
                            {m.role === "admin" ? "Admin" : "Mitglied"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {!m.isGuest && (
                            !canToggleRole ? (
                              <Badge variant="muted" size="xs">Mind. 1 Admin</Badge>
                            ) : (
                              <Button
                                variant="brandOutline"
                                size="sm"
                                aria-label={`${m.displayName} ${m.role === "admin" ? "zum Mitglied" : "zum Admin"} machen`}
                                onClick={() => handleRoleToggle(m._id, m.role)}
                                disabled={actionLoadingMemberId === m._id}
                              >
                                {m.role === "admin"
                                  ? "Zum Mitglied machen"
                                  : "Zum Admin machen"}
                              </Button>
                            )
                          )}
                          {!isMe && (
                            canRemove ? (
                              <Button
                                variant="brandDestructive"
                                size="sm"
                                onClick={() => handleRemoveMember(m._id, m.displayName)}
                                disabled={removingMemberId === m._id}
                              >
                                {removingMemberId === m._id ? "Entfernt..." : "Entfernen"}
                              </Button>
                            ) : (
                              <Badge variant="muted" size="xs">
                                {removeBlockReason === "referenced"
                                  ? "Im Turnier"
                                  : removeBlockReason === "last-member"
                                    ? "Letztes Mitglied"
                                    : "Mind. 1 Admin"}
                              </Badge>
                            )
                          )}
                        </div>
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
              const removeBlockReason = getRemoveGroupMemberBlockReason(members, m);
              const canRemove = canRemoveGroupMember(members, m);
              const isMe = m.userId === me?._id;
              const isEditing = editingMemberId === m._id;
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
                    {m.isGuest ? (
                      <Badge variant="muted" size="xs" className="shrink-0">Gast</Badge>
                    ) : (
                      <Badge variant={m.role === "admin" ? "brandRed" : "muted"} size="xs" className="shrink-0">
                        {m.role === "admin" ? "Admin" : "Mitglied"}
                      </Badge>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="grid gap-2">
                      <Input
                        value={editNameValue}
                        onChange={(event) => setEditNameValue(event.target.value)}
                        className="h-11"
                        maxLength={60}
                        autoFocus
                        aria-label="Neuer Anzeigename"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="brand"
                          size="touchLg"
                          onClick={() => handleRename(m._id)}
                          disabled={savingRename || !editNameValue.trim()}
                        >
                          {savingRename ? "..." : "Speichern"}
                        </Button>
                        <Button
                          variant="brandOutline"
                          size="touchLg"
                          onClick={cancelRename}
                          disabled={savingRename}
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Button
                        variant="brandOutline"
                        size="touchLg"
                        className="w-full"
                        onClick={() => startRename(m._id, m.displayName)}
                      >
                        Umbenennen
                      </Button>
                      {!m.isGuest && (
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
                      )}
                      {!isMe && (
                        <Button
                          variant="brandDestructive"
                          size="touchLg"
                          className="w-full"
                          onClick={() => handleRemoveMember(m._id, m.displayName)}
                          disabled={removingMemberId === m._id || !canRemove}
                        >
                          {!canRemove
                            ? removeBlockReason === "referenced"
                              ? "Im Turnier"
                              : removeBlockReason === "last-member"
                                ? "Letztes Mitglied"
                                : "Mind. 1 Admin"
                            : removingMemberId === m._id
                              ? "Entfernt..."
                              : "Mitglied entfernen"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-brand-red/20 bg-white p-4 sm:p-5 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="section-title-accent font-display text-sm uppercase tracking-widest text-brand-navy">
            Gruppe löschen
          </h3>
          <p className="text-sm text-gray-500">
            Löscht die Gruppe mitsamt Turnieren, Spielen, Mitgliedschaften und Einladungen endgültig.
          </p>
        </div>

        {groupError && (
          <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">
              {groupError}
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="brandDestructive"
          size="touchLg"
          onClick={handleDeleteGroup}
          disabled={isDeletingGroup}
        >
          {isDeletingGroup ? "Gruppe wird gelöscht..." : "Gruppe löschen"}
        </Button>
      </section>
    </div>
  );
}
