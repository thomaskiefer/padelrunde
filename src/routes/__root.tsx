import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import * as React from "react";
import { api } from "../../convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "~/styles/app.css?url";
import { AppHeader } from "~/components/AppHeader";
import { shouldEnsureCurrentUser } from "~/lib/currentUserSync";

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const authState = await auth();
  const token = await authState.getToken({ template: "convex" });
  return { token };
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PadelRunde" },
      { name: "theme-color", content: "#1D3557" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  beforeLoad: async (ctx) => {
    const { token } = await fetchClerkAuth();
    const serverHttpClient = ctx.context.convexQueryClient.serverHttpClient;
    if (token && serverHttpClient) {
      serverHttpClient.setAuth(token);
      await serverHttpClient.mutation(api.users.ensureCurrentUser, {});
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const { convexClient } = Route.useRouteContext();

  return (
    <RootDocument>
      <ClerkProvider>
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          <AppHeader />
          <EnsureCurrentUserInBackground />
          <Outlet />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </RootDocument>
  );
}

function EnsureCurrentUserInBackground() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isLoading: convexAuthLoading, isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const { isLoading: meLoading } = useQuery({
    ...convexQuery(api.users.me, {}),
    enabled: isLoaded && isSignedIn && isAuthenticated,
  });
  const ensureCurrentUser = useMutation(api.users.ensureCurrentUser);
  const ensuredUserIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isSignedIn || !userId) {
      ensuredUserIdRef.current = null;
    }
  }, [isSignedIn, userId]);

  React.useEffect(() => {
    if (
      !shouldEnsureCurrentUser({
        isClerkLoaded: isLoaded,
        isSignedIn,
        userId: userId ?? null,
        isConvexAuthLoading: convexAuthLoading,
        isConvexAuthenticated: isAuthenticated,
        isMeLoading: meLoading,
        ensuredUserId: ensuredUserIdRef.current,
      })
    ) {
      return;
    }

    let cancelled = false;
    ensuredUserIdRef.current = userId ?? null;

    void ensureCurrentUser({})
      .then(async () => {
        if (cancelled) return;
        await queryClient.invalidateQueries();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        ensuredUserIdRef.current = null;
        console.error("Failed to provision current user", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    convexAuthLoading,
    ensureCurrentUser,
    isAuthenticated,
    isLoaded,
    isSignedIn,
    meLoading,
    queryClient,
    userId,
  ]);

  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-[#FAFAF9] text-[#1A1A1A] antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
