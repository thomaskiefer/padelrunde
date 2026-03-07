import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export const Route = createFileRoute("/gruppe/$groupSlug/beitreten/$token")({
  component: GroupJoinInvite,
});

export function GroupJoinInvite() {
  const { groupSlug, token } = Route.useParams();
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const { data: me } = useQuery(convexQuery(api.users.me, {}));
  const { data: invite } = useSuspenseQuery(
    convexQuery(api.groups.getJoinInvite, { token })
  );
  const joinWithInvite = useMutation(api.groups.joinWithInvite);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (me?.name) {
      setDisplayName((current) => current || me.name);
    }
  }, [me?.name]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setJoining(true);
    try {
      const result = await joinWithInvite({
        token,
        displayName,
      });
      navigate({
        to: "/gruppe/$groupSlug",
        params: { groupSlug: result.groupSlug },
      });
    } catch (err: any) {
      setError(err.message ?? "Beitritt fehlgeschlagen");
    } finally {
      setJoining(false);
    }
  };

  const inviteStatus = invite.status;
  const group = "group" in invite ? invite.group : null;
  const pageTitle = group ? `Einladung für ${group.name}` : "Einladung";

  if (inviteStatus === "not_found") {
    return (
      <JoinStateShell title="Einladung nicht gefunden">
        <p className="text-sm text-gray-500 leading-relaxed">
          Dieser Einladungslink ist ungültig oder gehört nicht mehr zu einer aktiven Gruppe.
        </p>
        <BackHomeLink />
      </JoinStateShell>
    );
  }

  if (inviteStatus === "revoked") {
    return (
      <JoinStateShell title={pageTitle}>
        <p className="text-sm text-gray-500 leading-relaxed">
          Dieser Einladungslink wurde widerrufen.
        </p>
        <BackHomeLink />
      </JoinStateShell>
    );
  }

  if (inviteStatus === "expired") {
    return (
      <JoinStateShell title={pageTitle}>
        <p className="text-sm text-gray-500 leading-relaxed">
          Dieser Einladungslink ist abgelaufen.
        </p>
        <BackHomeLink />
      </JoinStateShell>
    );
  }

  if (!isSignedIn) {
    return (
      <JoinStateShell title={pageTitle}>
        <p className="text-sm text-gray-500 leading-relaxed">
          Melde dich an, um der Gruppe beizutreten.
        </p>
        <SignInButton mode="modal">
          <Button variant="brand" size="touchLg">
            Anmelden und beitreten
          </Button>
        </SignInButton>
      </JoinStateShell>
    );
  }

  if (invite.alreadyMember) {
    return (
      <JoinStateShell title={pageTitle}>
        <p className="text-sm text-gray-500 leading-relaxed">
          Du bist bereits Mitglied dieser Gruppe.
        </p>
        <Button variant="brandNavy" size="touchLg" asChild>
          <Link to="/gruppe/$groupSlug" params={{ groupSlug }}>
            Zur Gruppe
          </Link>
        </Button>
      </JoinStateShell>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4 space-y-8 animate-fade-in-up">
      <div className="space-y-2">
        <Link
          to="/"
          className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors flex items-center gap-1.5"
        >
          <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Startseite
        </Link>
        <h2 className="font-display text-2xl sm:text-3xl uppercase text-brand-navy">
          {pageTitle}
        </h2>
        <p className="text-sm text-gray-500">
          Gib an, wie du in der Gruppe angezeigt werden möchtest.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-white p-6 rounded-xl border border-gray-100 shadow-sm"
      >
        <div className="space-y-2">
          <Label
            htmlFor="display-name"
            className="text-[10px] uppercase tracking-widest font-bold text-gray-400"
          >
            Anzeigename
          </Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Name in der Gruppe"
            className="h-12 border-gray-200 font-medium"
          />
        </div>

        <p className="text-xs text-gray-500">
          Der Link ist gültig bis {new Date(invite.invite.expiresAt).toLocaleString("de-DE")}.
        </p>

        {error && (
          <div className="bg-red-50 border-l-2 border-red-500 p-3" role="alert">
            <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant={joining ? "brandSubtle" : "brand"}
          size="touchXl"
          className="w-full"
          disabled={joining || !displayName.trim()}
        >
          {joining ? "Wird beigetreten..." : "Gruppe beitreten"}
        </Button>
      </form>
    </div>
  );
}

function JoinStateShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg p-4 mt-8 animate-fade-in-up">
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm text-center space-y-4">
        <h2 className="font-display text-2xl uppercase text-brand-navy">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

function BackHomeLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors"
    >
      <span className="text-lg leading-none" aria-hidden="true">&larr;</span> Startseite
    </Link>
  );
}
