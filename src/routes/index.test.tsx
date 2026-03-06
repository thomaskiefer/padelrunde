import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const queryState: {
  suspenseResults: Array<{ data: unknown }>;
} = {
  suspenseResults: [],
};

mock.module("@tanstack/react-router", () => ({
  Link: ({ children }: { children: unknown }) => children,
  createFileRoute: () => () => ({}),
  useNavigate: () => () => undefined,
}));

mock.module("@clerk/tanstack-react-start", () => ({
  SignInButton: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ isSignedIn: true }),
}));

mock.module("@tanstack/react-query", () => ({
  useSuspenseQuery: () => {
    const next = queryState.suspenseResults.shift();
    if (!next) {
      throw new Error("Missing mocked useSuspenseQuery() result");
    }
    return next;
  },
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({
    invalidateQueries: () => Promise.resolve(),
  }),
}));

mock.module("@convex-dev/react-query", () => ({
  convexQuery: () => ({}),
}));

function setSuspenseResults(...results: Array<{ data: unknown }>) {
  queryState.suspenseResults = [...results];
}

describe("home route", () => {
  it("shows the Backoffice entry for super admins", async () => {
    const { Home } = await import("./index");

    setSuspenseResults(
      {
        data: [{ _id: "group-1", name: "Padel Crew", slug: "padel-crew" }],
      },
      {
        data: {
          _id: "user-1",
          isSuperAdmin: true,
          canCreateGroup: true,
          hasCreatedGroup: false,
        },
      }
    );

    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("Backoffice");
    expect(html).toContain("Meine Gruppen");
  });
});
