import { Link, createFileRoute } from "@tanstack/react-router";
import { SignInButton, useAuth } from "@clerk/tanstack-react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import { canCreateAnotherGroup } from "~/lib/groupPermissions";

export const Route = createFileRoute("/")({
  component: Home,
});

export function Home() {
  const { isSignedIn } = useAuth();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      {!isSignedIn ? <Hero /> : <GroupList />}
    </main>
  );
}

function Hero() {
  return (
    <div className="mt-8 flex flex-col items-center text-center sm:mt-16 md:mt-20 px-2">
      <h2
        className="animate-fade-in-up font-display text-2xl uppercase leading-tight tracking-widest text-brand-navy sm:text-4xl md:text-5xl lg:text-6xl"
      >
        Organisiere dein
        <br className="hidden sm:inline" />
        {" "}Padel-Turnier
      </h2>
      <p
        className="animate-fade-in-up mt-4 sm:mt-5 max-w-lg text-base sm:text-lg text-gray-500"
        style={{ animationDelay: "0.1s" }}
      >
        Americano oder Padel Cup — stell dein Turnier zusammen und leg los.
        Gruppen erstellen, Spieler einladen, Ergebnisse live verfolgen.
      </p>
      <SignInButton mode="modal">
        <Button
          variant="brand"
          size="touchXl"
          className="animate-fade-in-up mt-8 sm:mt-10"
          style={{ animationDelay: "0.2s" }}
        >
          Jetzt loslegen
        </Button>
      </SignInButton>

      {/* Decorative divider */}
      <div
        className="animate-fade-in-up mt-12 sm:mt-16 flex items-center gap-3 text-xs uppercase tracking-widest text-gray-400"
        style={{ animationDelay: "0.3s" }}
      >
        <span className="h-px w-8 sm:w-10 bg-gray-300" aria-hidden="true" />
        Padel · Turniere · Ranglisten
        <span className="h-px w-8 sm:w-10 bg-gray-300" aria-hidden="true" />
      </div>
    </div>
  );
}

function GroupList() {
  const { data: groups } = useSuspenseQuery(
    convexQuery(api.groups.listForUser, {})
  );
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));
  const canCreateGroup = canCreateAnotherGroup(me);

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-xl sm:text-2xl uppercase tracking-widest text-brand-navy">
          Meine Gruppen
        </h2>
        <div className="flex flex-wrap gap-2">
          {me?.isSuperAdmin && (
            <Button variant="brandOutline" size="touchLg" asChild>
              <Link to="/internal">
                Backoffice
              </Link>
            </Button>
          )}
          {canCreateGroup && (
            <Button variant="brand" size="touchLg" asChild>
              <Link to="/gruppe/neu">
                Neue Gruppe
              </Link>
            </Button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm animate-fade-in-up">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="font-display text-lg uppercase text-brand-navy mb-2">Noch keine Gruppen</h3>
          <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed">
            {canCreateGroup
              ? "Du bist noch keiner Gruppe beigetreten. Bitte deinen Gruppenadmin um eine Einladung oder erstelle deine eigene."
              : me?.hasCreatedGroup
                ? "Du bist aktuell in keiner Gruppe (außer deiner eigenen, falls du nach dieser suchst). Bitte deinen Gruppenadmin um eine Einladung."
                : "Du bist noch keiner Gruppe beigetreten. Bitte deinen Gruppenadmin um eine Einladung."
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group, i) => (
              <Link
                key={group._id}
                to="/gruppe/$groupSlug"
                params={{ groupSlug: group.slug }}
                className="animate-fade-in-up group bg-white rounded-xl border border-gray-100 shadow-sm p-5 transition-all duration-300 hover:border-brand-red/30 hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] block relative overflow-hidden motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-brand-navy/50 focus-visible:outline-hidden"
                style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
              >
                {/* Slanted Accent Corner */}
                <div className="absolute top-0 right-0 w-16 h-16 -mr-8 -mt-8 bg-gray-50 rotate-45 group-hover:bg-brand-red/5 transition-colors" aria-hidden="true" />

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-red group-hover:scale-150 transition-transform" aria-hidden="true" />
                    <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400">Gruppe</p>
                  </div>
                  <p className="text-lg sm:text-xl font-display uppercase text-brand-navy group-hover:text-brand-red transition-colors leading-tight">
                    {group.name}
                  </p>
                </div>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}
