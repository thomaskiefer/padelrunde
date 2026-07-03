import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";

const routerState: {
  params: { groupSlug: string; token: string };
  navigate: ReturnType<typeof mock>;
} = {
  params: { groupSlug: "test-gruppe", token: "invite-token" },
  navigate: mock(() => undefined),
};

const authState = {
  isSignedIn: false,
};

const queryState: {
  suspenseResults: Array<{ data: any }>;
  lastSuspenseResult?: { data: any };
  queryResults: Array<{ data?: unknown; isLoading?: boolean }>;
  lastQueryResult?: { data?: unknown; isLoading?: boolean };
} = {
  suspenseResults: [],
  queryResults: [],
};

const mutationState = {
  joinWithInvite: mock(() =>
    Promise.resolve({
      groupSlug: "test-gruppe",
    })
  ),
};

mock.module("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  createFileRoute: () => () => ({
    useParams: () => routerState.params,
  }),
  useNavigate: () => routerState.navigate,
}));

mock.module("@clerk/tanstack-react-start", () => ({
  SignInButton: ({ children }: { children: unknown }) => children,
  useAuth: () => authState,
}));

mock.module("@tanstack/react-query", () => ({
  useSuspenseQuery: () => {
    const next = queryState.suspenseResults.shift();
    if (next) {
      queryState.lastSuspenseResult = next;
      return next;
    }
    if (queryState.lastSuspenseResult) {
      return queryState.lastSuspenseResult;
    }
    throw new Error("Missing mocked useSuspenseQuery() result");
  },
  useQuery: () => {
    const next = queryState.queryResults.shift();
    if (next) {
      queryState.lastQueryResult = next;
      return next;
    }
    return queryState.lastQueryResult ?? {};
  },
}));

mock.module("convex/react", () => ({
  useMutation: () => mutationState.joinWithInvite,
  useConvexAuth: () => ({
    isAuthenticated: authState.isSignedIn,
    isLoading: false,
  }),
}));

mock.module("@convex-dev/react-query", () => ({
  convexQuery: () => ({}),
}));

function setSuspenseResults(...results: Array<{ data: any }>) {
  queryState.suspenseResults = [...results];
  queryState.lastSuspenseResult = undefined;
}

function setQueryResults(
  ...results: Array<{ data?: unknown; isLoading?: boolean }>
) {
  queryState.queryResults = [...results];
  queryState.lastQueryResult = undefined;
}

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost:3000",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
  });
  authState.isSignedIn = false;
  routerState.navigate = mock(() => undefined);
  mutationState.joinWithInvite = mock(() =>
    Promise.resolve({
      groupSlug: "test-gruppe",
    })
  );
});

afterEach(() => {
  queryState.suspenseResults = [];
  queryState.lastSuspenseResult = undefined;
  queryState.queryResults = [];
  queryState.lastQueryResult = undefined;
  document.body.innerHTML = "";
});

describe("group join invite route", () => {
  it("renders sign-in state for valid invites when signed out", async () => {
    const { GroupJoinInvite } = await import(
      "../../../../src/routes/gruppe/$groupSlug/beitreten/$token"
    );

    setSuspenseResults({
      data: {
        status: "active",
        group: { _id: "g1", slug: "test-gruppe", name: "Padel Crew" },
        invite: { _id: "i1", expiresAt: Date.now() + 10_000 },
        alreadyMember: false,
      },
    });
    setQueryResults({ data: null });

    const html = renderToStaticMarkup(<GroupJoinInvite />);
    expect(html).toContain("Einladung für Padel Crew");
    expect(html).toContain("Anmelden und beitreten");
  });

  it("renders invalid token state", async () => {
    const { GroupJoinInvite } = await import(
      "../../../../src/routes/gruppe/$groupSlug/beitreten/$token"
    );

    setSuspenseResults({ data: { status: "not_found" } });
    setQueryResults({ data: null });

    const html = renderToStaticMarkup(<GroupJoinInvite />);
    expect(html).toContain("Einladung nicht gefunden");
  });

  it("renders already-member state for signed-in members", async () => {
    const { GroupJoinInvite } = await import(
      "../../../../src/routes/gruppe/$groupSlug/beitreten/$token"
    );

    authState.isSignedIn = true;
    setSuspenseResults({
      data: {
        status: "active",
        group: { _id: "g1", slug: "test-gruppe", name: "Padel Crew" },
        invite: { _id: "i1", expiresAt: Date.now() + 10_000 },
        alreadyMember: true,
      },
    });
    setQueryResults({ data: { _id: "u1", name: "Thomas" } });

    const html = renderToStaticMarkup(<GroupJoinInvite />);
    expect(html).toContain("Du bist bereits Mitglied dieser Gruppe.");
    expect(html).toContain("Zur Gruppe");
  });

  it("renders the join form with a prefilled display name for signed-in users", async () => {
    const { GroupJoinInvite } = await import(
      "../../../../src/routes/gruppe/$groupSlug/beitreten/$token"
    );

    authState.isSignedIn = true;
    setSuspenseResults({
      data: {
        status: "active",
        group: { _id: "g1", slug: "test-gruppe", name: "Padel Crew" },
        invite: { _id: "i1", expiresAt: Date.now() + 10_000 },
        alreadyMember: false,
      },
    });
    setQueryResults({ data: { _id: "u1", name: "Thomas Kiefer" } });

    const view = render(<GroupJoinInvite />);

    expect(
      (view.getByLabelText("Anzeigename") as HTMLInputElement).value
    ).toBe("Thomas Kiefer");
    expect(view.getByRole("button", { name: "Gruppe beitreten" })).toBeDefined();
  });

  it("submits the join form and navigates to the group", async () => {
    const { GroupJoinInvite } = await import(
      "../../../../src/routes/gruppe/$groupSlug/beitreten/$token"
    );

    authState.isSignedIn = true;
    setSuspenseResults({
      data: {
        status: "active",
        group: { _id: "g1", slug: "test-gruppe", name: "Padel Crew" },
        invite: { _id: "i1", expiresAt: Date.now() + 10_000 },
        alreadyMember: false,
      },
    });
    setQueryResults({ data: { _id: "u1", name: "Thomas Kiefer" } });

    const view = render(<GroupJoinInvite />);

    fireEvent.submit(
      view.getByRole("button", { name: "Gruppe beitreten" }).closest("form")!
    );

    await waitFor(() => {
      expect(mutationState.joinWithInvite).toHaveBeenCalledWith({
        token: "invite-token",
        displayName: "Thomas Kiefer",
      });
      expect(routerState.navigate).toHaveBeenCalledWith({
        to: "/gruppe/$groupSlug",
        params: { groupSlug: "test-gruppe" },
      });
    });
  });
});
