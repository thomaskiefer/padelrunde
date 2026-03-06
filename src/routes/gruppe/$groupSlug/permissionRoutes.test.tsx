import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const routerState: {
  params: { groupSlug: string; tournamentId: string };
} = {
  params: { groupSlug: "test-gruppe", tournamentId: "test-turnier" },
};

const queryState: {
  suspenseResults: Array<{ data: unknown }>;
  queryResult: { data?: unknown; isLoading?: boolean };
} = {
  suspenseResults: [],
  queryResult: {},
};

mock.module("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  createFileRoute: () => () => ({
    useParams: () => routerState.params,
  }),
  useNavigate: () => () => undefined,
}));

mock.module("@tanstack/react-query", () => ({
  useSuspenseQuery: () => {
    const next = queryState.suspenseResults.shift();
    if (!next) {
      throw new Error("Missing mocked useSuspenseQuery() result");
    }
    return next;
  },
  useQuery: () => queryState.queryResult,
  useQueryClient: () => ({
    invalidateQueries: () => Promise.resolve(),
  }),
}));

mock.module("convex/react", () => ({
  useMutation: () => () => Promise.resolve(undefined),
}));

mock.module("@convex-dev/react-query", () => ({
  convexQuery: () => ({}),
}));

function setSuspenseResults(...results: Array<{ data: unknown }>) {
  queryState.suspenseResults = [...results];
}

describe("permission-gated routes", () => {
  it("renders denied state on settings page for non-admin members", async () => {
    const { GroupSettings } = await import("./einstellungen");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      { data: { _id: "group-1", name: "Padel Crew" } }
    );
    queryState.queryResult = {
      data: [{ _id: "gm-1", userId: "user-1", role: "member", displayName: "A" }],
      isLoading: false,
    };

    const html = renderToStaticMarkup(<GroupSettings />);
    expect(html).toContain("Keine Berechtigung");
    expect(html).toContain("Nur Gruppen-Admins dürfen diese Seite öffnen.");
  });

  it("renders loading state on settings page while permissions are loading", async () => {
    const { GroupSettings } = await import("./einstellungen");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      { data: { _id: "group-1", name: "Padel Crew" } }
    );
    queryState.queryResult = {
      data: [],
      isLoading: true,
    };

    const html = renderToStaticMarkup(<GroupSettings />);
    expect(html).toContain("Lade Berechtigungen...");
  });

  it("renders denied state on tournament admin page for non-admin members", async () => {
    const { TournamentAdmin } = await import("./turnier/$tournamentId/admin");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      {
        data: {
          _id: "tournament-1",
          groupId: "group-1",
          name: "Cup",
          mode: "cup",
          status: "setup",
        },
      },
      { data: [] },
      { data: false },
      { data: false },
      { data: false },
      { data: false }
    );
    queryState.queryResult = {
      data: [{ _id: "gm-1", userId: "user-1", role: "member", displayName: "A" }],
      isLoading: false,
    };

    const html = renderToStaticMarkup(<TournamentAdmin />);
    expect(html).toContain("Keine Berechtigung");
    expect(html).toContain("Nur Gruppen-Admins dürfen diese Seite öffnen.");
  });

  it("renders denied state on tournament create page for non-admin members", async () => {
    const { CreateTournament } = await import("./turnier/neu");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      { data: { _id: "group-1", slug: "test-gruppe", name: "Padel Crew" } }
    );
    queryState.queryResult = {
      data: [{ _id: "gm-1", userId: "user-1", role: "member", displayName: "A" }],
      isLoading: false,
    };

    const html = renderToStaticMarkup(<CreateTournament />);
    expect(html).toContain("Keine Berechtigung");
    expect(html).toContain(
      "Nur Gruppen-Admins dürfen neue Turniere planen und erstellen."
    );
  });

  it("renders not-found state on tournament view when tournament lookup returns null", async () => {
    const { TournamentView } = await import("./turnier/$tournamentId/index");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      { data: null }
    );
    queryState.queryResult = {
      data: [],
      isLoading: false,
    };

    const html = renderToStaticMarkup(<TournamentView />);
    expect(html).toContain("Turnier nicht gefunden");
  });

  it("renders not-found state on tournament admin page when tournament lookup returns null", async () => {
    const { TournamentAdmin } = await import("./turnier/$tournamentId/admin");

    setSuspenseResults(
      { data: { _id: "user-1", isSuperAdmin: false } },
      { data: null }
    );
    queryState.queryResult = {
      data: [],
      isLoading: false,
    };

    const html = renderToStaticMarkup(<TournamentAdmin />);
    expect(html).toContain("Turnier nicht gefunden");
  });
});
