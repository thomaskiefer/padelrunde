import { createFileRoute, Link } from "@tanstack/react-router";
import {
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/tanstack-react-start";
import { useSuspenseQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white p-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-bold">Paddel-Turnier</h1>
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <Button>Anmelden</Button>
            </SignInButton>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4">
        {!isSignedIn ? (
          <div className="mt-16 text-center">
            <h2 className="text-3xl font-bold">
              Willkommen bei Paddel-Turnier
            </h2>
            <p className="mt-4 text-gray-600">
              Organisiere Padel-Turniere im Amerikaner- oder Cup-Modus.
            </p>
            <SignInButton mode="modal">
              <Button size="lg" className="mt-8">
                Jetzt anmelden
              </Button>
            </SignInButton>
          </div>
        ) : (
          <GroupList />
        )}
      </main>
    </div>
  );
}

function GroupList() {
  const { data: groups } = useSuspenseQuery(
    convexQuery(api.groups.listForUser, {})
  );
  const { data: me } = useSuspenseQuery(convexQuery(api.users.me, {}));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Meine Gruppen</h2>
        <div className="flex gap-2">
          {me?.isDeveloper && (
            <Link to="/dev">
              <Button variant="outline">Entwickler</Button>
            </Link>
          )}
          {(me?.canCreateGroup || me?.isDeveloper) &&
            !me?.hasCreatedGroup && (
              <Link to="/gruppe/neu">
                <Button>Neue Gruppe</Button>
              </Link>
            )}
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            Du bist noch keiner Gruppe beigetreten.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) =>
            group ? (
              <Link
                key={group._id}
                to="/gruppe/$groupSlug"
                params={{ groupSlug: group.slug }}
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{group.name}</CardTitle>
                    <CardDescription>/{group.slug}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
