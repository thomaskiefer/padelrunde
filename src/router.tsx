import { Link, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { ConvexReactClient } from "convex/react";
import { routeTree } from "./routeTree.gen";

// App-wide fallbacks so a loader/render failure on any route degrades to a
// friendly, recoverable screen instead of the framework's bare error page.
function RouteErrorComponent() {
  return (
    <div className="mx-auto max-w-lg p-6 mt-12 text-center">
      <h2 className="font-display text-xl uppercase text-brand-navy mb-2">
        Etwas ist schiefgelaufen
      </h2>
      <p className="text-gray-500 text-sm mb-4">
        Die Seite konnte nicht geladen werden. Bitte versuche es erneut.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-red hover:text-brand-navy transition-colors"
      >
        Seite neu laden
      </button>
    </div>
  );
}

function RouteNotFoundComponent() {
  return (
    <div className="mx-auto max-w-lg p-6 mt-12 text-center">
      <h2 className="font-display text-xl uppercase text-brand-navy mb-2">
        Seite nicht gefunden
      </h2>
      <Link
        to="/"
        className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-400 hover:text-brand-red transition-colors"
      >
        Zur Startseite
      </Link>
    </div>
  );
}

export function getRouter() {
  const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL;
  if (!CONVEX_URL) {
    throw new Error("Missing required environment variable: VITE_CONVEX_URL");
  }

  const convexClient = new ConvexReactClient(CONVEX_URL);
  const convexQueryClient = new ConvexQueryClient(convexClient);

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const router = routerWithQueryClient(
    createRouter({
      routeTree,
      defaultPreload: "intent",
      context: { queryClient, convexClient, convexQueryClient },
      scrollRestoration: true,
      defaultPreloadStaleTime: 0,
      defaultErrorComponent: RouteErrorComponent,
      defaultNotFoundComponent: RouteNotFoundComponent,
    }),
    queryClient
  );

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
