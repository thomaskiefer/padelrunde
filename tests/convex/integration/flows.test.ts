import { fileURLToPath } from "node:url";
import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "../../../convex/_generated/api";
import schema from "../../../convex/schema";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { TestConvex } from "convex-test";

function resolveModulePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

const convexModules = {
  [resolveModulePath("../../../convex/_generated/api.js")]: () =>
    import("../../../convex/_generated/api.js"),
  [resolveModulePath("../../../convex/_generated/server.js")]: () =>
    import("../../../convex/_generated/server.js"),
  [resolveModulePath("../../../convex/groups.ts")]: () =>
    import("../../../convex/groups.ts"),
  [resolveModulePath("../../../convex/helpers.ts")]: () =>
    import("../../../convex/helpers.ts"),
  [resolveModulePath("../../../convex/matches.ts")]: () =>
    import("../../../convex/matches.ts"),
  [resolveModulePath("../../../convex/rounds.ts")]: () =>
    import("../../../convex/rounds.ts"),
  [resolveModulePath("../../../convex/standings.ts")]: () =>
    import("../../../convex/standings.ts"),
  [resolveModulePath("../../../convex/stats.ts")]: () =>
    import("../../../convex/stats.ts"),
  [resolveModulePath("../../../convex/tournaments.ts")]: () =>
    import("../../../convex/tournaments.ts"),
  [resolveModulePath("../../../convex/users.ts")]: () =>
    import("../../../convex/users.ts"),
};

function createTestClient() {
  return convexTest(schema, convexModules);
}

type ConvexClient = TestConvex<typeof schema>;

function fail(message: string): never {
  throw new Error(message);
}

async function findUserByClerkId(t: ConvexClient, clerkId: string) {
  return t.run((ctx) =>
    ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique()
  );
}

async function upsertUser(
  t: ConvexClient,
  clerkId: string,
  options: { canCreateGroup?: boolean; isSuperAdmin?: boolean } = {}
) {
  await t.mutation(internal.users.upsertFromClerk, {
    data: {
      id: clerkId,
      name: `User ${clerkId}`,
      email: `${clerkId}@example.com`,
    },
  });

  const user = await findUserByClerkId(t, clerkId);
  if (!user) throw new Error(`User ${clerkId} was not inserted`);

  if (
    options.canCreateGroup !== undefined ||
    options.isSuperAdmin !== undefined
  ) {
    await t.run((ctx) =>
      ctx.db.patch("users", user._id, {
        ...(options.canCreateGroup !== undefined
          ? { canCreateGroup: options.canCreateGroup }
          : {}),
        ...(options.isSuperAdmin !== undefined
          ? { isSuperAdmin: options.isSuperAdmin }
          : {}),
      })
    );
  }

  const updated = await t.run((ctx) => ctx.db.get("users", user._id));
  if (!updated) throw new Error(`User ${clerkId} disappeared`);
  return updated;
}

async function setupAmericanoTournament(
  t: ConvexClient,
  options: { includeSpectator?: boolean } = {}
) {
  const owner = await upsertUser(t, "owner", { canCreateGroup: true });
  const player1 = await upsertUser(t, "player-1");
  const player2 = await upsertUser(t, "player-2");
  const player3 = await upsertUser(t, "player-3");
  const spectator = options.includeSpectator
    ? await upsertUser(t, "spectator")
    : null;

  const ownerCtx = t.withIdentity({ subject: "owner" });
  const groupId = await ownerCtx.mutation(api.groups.create, {
    name: "Americano Group",
    slug: `americano-group-${options.includeSpectator ? "spectator" : "base"}`,
  });

  for (const user of [player1, player2, player3, spectator].filter(Boolean)) {
    await ownerCtx.mutation(api.groups.addMember, {
      groupId,
      userId: (user as Doc<"users">)._id,
      displayName: (user as Doc<"users">).name,
    });
  }

  const members = await ownerCtx.query(api.groups.getMembers, { groupId });
  const tournamentPlayers = members.filter(
    (member) => member.userId !== spectator?._id
  );

  const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
    groupId,
    name: "Americano Test",
    mode: "americano",
    courts: 1,
    playerIds: tournamentPlayers.map((member) => member._id),
  });

  await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
  const rounds = await ownerCtx.query(api.rounds.listByTournament, {
    tournamentId,
  });
  const firstRound = rounds[0] ?? fail("Missing first round");
  const matches = await ownerCtx.query(api.matches.getByRound, {
    roundId: firstRound._id,
  });
  const firstMatch = matches[0] ?? fail("Missing first match");

  return {
    owner,
    ownerCtx,
    groupId,
    tournamentId,
    members,
    firstMatch,
    spectator,
  };
}

describe("convex integration flows", () => {
  it("can provision the signed-in user without waiting for the Clerk webhook", async () => {
    const t = createTestClient();
    const freshCtx = t.withIdentity({
      subject: "fresh-user",
      name: "Fresh User",
      email: "fresh@example.com",
    });

    expect(await freshCtx.query(api.users.me, {})).toBeNull();

    const ensured = await freshCtx.mutation(api.users.ensureCurrentUser, {});
    expect(ensured?.clerkId).toBe("fresh-user");
    expect(ensured?.name).toBe("Fresh User");
    expect(ensured?.email).toBe("fresh@example.com");

    const me = await freshCtx.query(api.users.me, {});
    expect(me?.clerkId).toBe("fresh-user");
  });

  it("grants create-group rights when an existing user becomes a super admin", async () => {
    const t = createTestClient();
    await upsertUser(t, "future-dev", { canCreateGroup: false });

    const futureDevCtx = t.withIdentity({
      subject: "future-dev",
      name: "Future Dev",
      email: "future-dev@example.com",
    });
    const beforeEnsure = await futureDevCtx.query(api.users.me, {});
    expect(beforeEnsure?.isSuperAdmin).toBe(false);
    expect(beforeEnsure?.canCreateGroup).toBe(false);

    const previousSuperAdminIds = process.env.SUPERADMIN_CLERK_IDS;
    process.env.SUPERADMIN_CLERK_IDS = "future-dev";
    try {
      const ensured = await futureDevCtx.mutation(api.users.ensureCurrentUser, {});
      expect(ensured?.isSuperAdmin).toBe(true);
      expect(ensured?.canCreateGroup).toBe(false);

      const groupId = await futureDevCtx.mutation(api.groups.create, {
        name: "Super Admin Group",
        slug: "super-admin-group",
      });
      expect(groupId).toBeDefined();
    } finally {
      process.env.SUPERADMIN_CLERK_IDS = previousSuperAdminIds;
    }
  });

  it("lets only participating teams submit match results", async () => {
    const t = createTestClient();
    const { firstMatch, spectator } = await setupAmericanoTournament(t, {
      includeSpectator: true,
    });

    const participantMember = await t.run((ctx) =>
      ctx.db.get("groupMembers", firstMatch.teamA[0] as any)
    );
    const participantUser = participantMember
      ? await t.run((ctx) => ctx.db.get("users", participantMember.userId))
      : null;
    if (!participantUser || !spectator) fail("Missing participant test users");

    const spectatorCtx = t.withIdentity({ subject: "spectator" });
    await expect(
      spectatorCtx.mutation(api.matches.submitScore, {
        matchId: firstMatch._id,
        scoreA: 20,
        scoreB: 12,
      })
    ).rejects.toThrow("Nur beteiligte Teams können Ergebnisse eintragen");

    const participantCtx = t.withIdentity({ subject: participantUser.clerkId });
    await participantCtx.mutation(api.matches.submitScore, {
      matchId: firstMatch._id,
      scoreA: 20,
      scoreB: 12,
    });

    const updatedMatch = await t.run((ctx) => ctx.db.get("matches", firstMatch._id));
    expect(updatedMatch?.status).toBe("completed");
    expect(updatedMatch?.reportedBy).toBe(participantUser._id);
  });

  it("records edit history when an admin changes an existing result", async () => {
    const t = createTestClient();
    const { firstMatch, owner, ownerCtx } = await setupAmericanoTournament(t);

    const participantMember = await t.run((ctx) =>
      ctx.db.get("groupMembers", firstMatch.teamA[0] as any)
    );
    const participantUser = participantMember
      ? await t.run((ctx) => ctx.db.get("users", participantMember.userId))
      : null;
    if (!participantUser) fail("Missing participant");

    const participantCtx = t.withIdentity({ subject: participantUser.clerkId });
    await participantCtx.mutation(api.matches.submitScore, {
      matchId: firstMatch._id,
      scoreA: 20,
      scoreB: 12,
    });

    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: firstMatch._id,
      scoreA: 18,
      scoreB: 14,
    });

    const editedMatch = await t.run((ctx) => ctx.db.get("matches", firstMatch._id));
    expect(editedMatch?.scoreA).toBe(18);
    expect(editedMatch?.scoreB).toBe(14);
    expect(editedMatch?.reportedBy).toBe(owner._id);
    expect(editedMatch?.editHistory).toHaveLength(1);
    expect(editedMatch?.editHistory?.[0]).toMatchObject({
      editedBy: owner._id,
      previousScoreA: 20,
      previousScoreB: 12,
    });
  });

  it("persists backoffice-promoted super admins across Clerk syncs", async () => {
    const t = createTestClient();
    await upsertUser(t, "actor", { isSuperAdmin: true });
    const promoted = await upsertUser(t, "promoted-user");
    const actorCtx = t.withIdentity({ subject: "actor" });

    await actorCtx.mutation(api.users.setSuperAdmin, {
      userId: promoted._id,
      isSuperAdmin: true,
    });

    await t.mutation(internal.users.upsertFromClerk, {
      data: {
        id: "promoted-user",
        name: "Promoted User Updated",
        email: "promoted-user-updated@example.com",
      },
    });

    const stored = await findUserByClerkId(t, "promoted-user");
    expect(stored?.isSuperAdmin).toBe(true);

    const promotedCtx = t.withIdentity({
      subject: "promoted-user",
      name: "Promoted User Updated",
      email: "promoted-user-updated@example.com",
    });
    const ensured = await promotedCtx.mutation(api.users.ensureCurrentUser, {});
    expect(ensured?.isSuperAdmin).toBe(true);
  });

  it("prevents removing the last stored super admin", async () => {
    const t = createTestClient();
    const onlyAdmin = await upsertUser(t, "only-admin", { isSuperAdmin: true });
    const onlyAdminCtx = t.withIdentity({ subject: "only-admin" });

    await expect(
      onlyAdminCtx.mutation(api.users.setSuperAdmin, {
        userId: onlyAdmin._id,
        isSuperAdmin: false,
      })
    ).rejects.toThrow("Mindestens ein Super-Admin muss bleiben");
  });

  it("blocks backoffice demotion of bootstrap super admins", async () => {
    const t = createTestClient();
    const previousSuperAdminIds = process.env.SUPERADMIN_CLERK_IDS;
    process.env.SUPERADMIN_CLERK_IDS = "bootstrap-admin";

    try {
      await upsertUser(t, "actor", { isSuperAdmin: true });
      const target = await upsertUser(t, "bootstrap-admin");

      const bootstrapCtx = t.withIdentity({
        subject: "bootstrap-admin",
        name: "Bootstrap Admin",
        email: "bootstrap-admin@example.com",
      });
      await bootstrapCtx.mutation(api.users.ensureCurrentUser, {});

      const actorCtx = t.withIdentity({ subject: "actor" });
      await expect(
        actorCtx.mutation(api.users.setSuperAdmin, {
          userId: target._id,
          isSuperAdmin: false,
        })
      ).rejects.toThrow(
        "Bootstrap-Super-Admins müssen über SUPERADMIN_CLERK_IDS verwaltet werden"
      );
    } finally {
      process.env.SUPERADMIN_CLERK_IDS = previousSuperAdminIds;
    }
  });

  it("keeps groups private to members and supports slug-normalized lookup", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "owner", { canCreateGroup: true });
    const member = await upsertUser(t, "member");
    await upsertUser(t, "outsider");

    const ownerCtx = t.withIdentity({ subject: "owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Padel Crew",
      slug: "Padel Crew",
    });

    await ownerCtx.mutation(api.groups.addMember, {
      groupId,
      userId: member._id,
      displayName: member.name,
    });

    const outsiderCtx = t.withIdentity({ subject: "outsider" });
    const hidden = await outsiderCtx.query(api.groups.getBySlug, {
      slug: "padel-crew",
    });
    expect(hidden).toBeNull();

    const memberCtx = t.withIdentity({ subject: "member" });
    const visible = await memberCtx.query(api.groups.getBySlug, {
      slug: "PADEL CREW",
    });
    expect(visible?._id).toBe(groupId);

    const myGroups = await memberCtx.query(api.groups.listForUser, {});
    const groupIds = myGroups.map((group) => group._id);
    expect(groupIds).toContain(groupId);

    const ownerMembership = await t.run((ctx) =>
      ctx.db
        .query("groupMembers")
        .withIndex("by_group_and_user", (q) =>
          q.eq("groupId", groupId).eq("userId", owner._id)
        )
        .unique()
    );
    expect(ownerMembership?.role).toBe("admin");
  });

  it("rejects whitespace-only group names on the backend", async () => {
    const t = createTestClient();
    await upsertUser(t, "blank-group-owner", { canCreateGroup: true });

    const ownerCtx = t.withIdentity({ subject: "blank-group-owner" });
    await expect(
      ownerCtx.mutation(api.groups.create, {
        name: "   ",
        slug: "blank-group",
      })
    ).rejects.toThrow("Gruppenname darf nicht leer sein");
  });

  it("covers cup tournament lifecycle from setup to finals", async () => {
    const t = createTestClient();
    await upsertUser(t, "cup-owner", { canCreateGroup: true });
    const players: Array<Doc<"users">> = [];
    for (let i = 1; i <= 7; i++) {
      players.push(await upsertUser(t, `player-${i}`));
    }
    await upsertUser(t, "cup-outsider");

    const ownerCtx = t.withIdentity({ subject: "cup-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Cup Group",
      slug: "cup-group",
    });

    for (const player of players) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: player._id,
        displayName: player.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(members).toHaveLength(8);

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Winter Cup",
      mode: "cup",
      courts: 2,
      playerIds: members.map((member) => member._id),
    });

    const outsiderCtx = t.withIdentity({ subject: "cup-outsider" });
    await expect(
      outsiderCtx.query(api.tournaments.listByGroup, { groupId })
    ).rejects.toThrow("Kein Mitglied");
    const hiddenTournament = await outsiderCtx.query(api.tournaments.get, {
      tournamentId,
    });
    expect(hiddenTournament).toBeNull();

    const playerCtx = t.withIdentity({ subject: "player-1" });
    const visibleTournaments = await playerCtx.query(api.tournaments.listByGroup, {
      groupId,
    });
    expect(visibleTournaments.map((tournament) => tournament._id)).toContain(
      tournamentId
    );

    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
    const startedTournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    expect(startedTournament?.status).toBe("active");

    const preliminaryRounds = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    expect(preliminaryRounds).toHaveLength(5);
    expect(preliminaryRounds.every((round) => round.phase === "preliminary")).toBe(
      true
    );

    await expect(
      ownerCtx.mutation(api.rounds.generateKnockoutRounds, { tournamentId })
    ).rejects.toThrow("Alle Vorrundenspiele müssen abgeschlossen sein");

    for (const round of preliminaryRounds) {
      const roundMatches = await ownerCtx.query(api.matches.getByRound, {
        roundId: round._id,
      });
      for (const match of roundMatches) {
        await ownerCtx.mutation(api.matches.adminEditScore, {
          matchId: match._id,
          scoreA: 20,
          scoreB: 12,
        });
      }
    }

    await ownerCtx.mutation(api.rounds.generateKnockoutRounds, { tournamentId });
    const knockoutTournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    expect(knockoutTournament?.status).toBe("knockout");

    const roundsAfterKnockout = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    const semifinalRound = roundsAfterKnockout.find(
      (round) => round.phase === "semifinal"
    );
    expect(semifinalRound).toBeDefined();
    if (!semifinalRound) return;

    await expect(
      ownerCtx.mutation(api.rounds.advanceToFinals, { tournamentId })
    ).rejects.toThrow("Beide Halbfinalspiele müssen abgeschlossen sein");

    const semifinalMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: semifinalRound._id,
    });
    expect(semifinalMatches).toHaveLength(2);
    const semifinalMatchA = semifinalMatches[0] ?? fail("Missing semifinal A");
    const semifinalMatchB = semifinalMatches[1] ?? fail("Missing semifinal B");

    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: semifinalMatchA._id,
      scoreA: 16,
      scoreB: 16,
      winningSide: "A",
    });
    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: semifinalMatchB._id,
      scoreA: 16,
      scoreB: 16,
      winningSide: "B",
    });

    const semifinalsCompleted = await ownerCtx.query(
      api.matches.allMatchesCompletedForPhase,
      {
        tournamentId,
        phase: "semifinal",
      }
    );
    expect(semifinalsCompleted).toBe(true);

    await ownerCtx.mutation(api.rounds.advanceToFinals, { tournamentId });
    const roundsAfterFinals = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    const finalRound = roundsAfterFinals.find((round) => round.phase === "final");
    const bronzeRound = roundsAfterFinals.find((round) => round.phase === "bronze");
    expect(finalRound).toBeDefined();
    expect(bronzeRound).toBeDefined();
    if (!finalRound || !bronzeRound) return;

    const finalMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: finalRound._id,
    });
    const bronzeMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: bronzeRound._id,
    });
    expect(finalMatches).toHaveLength(1);
    expect(bronzeMatches).toHaveLength(1);

    await expect(
      ownerCtx.mutation(api.tournaments.updateStatus, {
        tournamentId,
        status: "finished",
      })
    ).rejects.toThrow("Cup kann erst nach Finale und Spiel um Platz 3 beendet werden");

    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: finalMatches[0]._id,
      scoreA: 20,
      scoreB: 12,
    });
    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: bronzeMatches[0]._id,
      scoreA: 18,
      scoreB: 14,
    });

    await ownerCtx.mutation(api.tournaments.updateStatus, {
      tournamentId,
      status: "finished",
    });
    const finishedTournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    expect(finishedTournament?.status).toBe("finished");
  });

  it("rejects whitespace-only tournament names on the backend", async () => {
    const t = createTestClient();
    await upsertUser(t, "blank-name-owner", { canCreateGroup: true });
    const extraPlayers: Array<Doc<"users">> = [];
    for (let i = 1; i <= 3; i++) {
      extraPlayers.push(await upsertUser(t, `blank-player-${i}`));
    }

    const ownerCtx = t.withIdentity({ subject: "blank-name-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Whitespace Group",
      slug: "whitespace-group",
    });

    for (const player of extraPlayers) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: player._id,
        displayName: player.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    await expect(
      ownerCtx.mutation(api.tournaments.create, {
        groupId,
        name: "   ",
        mode: "americano",
        courts: 1,
        playerIds: members.map((member) => member._id),
      })
    ).rejects.toThrow("Turniername darf nicht leer sein");
  });

  it("keeps cup knockout matches on configured courts when only one court exists", async () => {
    const t = createTestClient();
    await upsertUser(t, "single-court-owner", { canCreateGroup: true });
    const players: Array<Doc<"users">> = [];
    for (let i = 1; i <= 7; i++) {
      players.push(await upsertUser(t, `single-court-player-${i}`));
    }

    const ownerCtx = t.withIdentity({ subject: "single-court-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Single Court Cup",
      slug: "single-court-cup",
    });

    for (const player of players) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: player._id,
        displayName: player.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "One Court Knockout",
      mode: "cup",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });

    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
    const preliminaryRounds = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    for (const round of preliminaryRounds) {
      const roundMatches = await ownerCtx.query(api.matches.getByRound, {
        roundId: round._id,
      });
      for (const match of roundMatches) {
        await ownerCtx.mutation(api.matches.adminEditScore, {
          matchId: match._id,
          scoreA: 20,
          scoreB: 12,
        });
      }
    }

    await ownerCtx.mutation(api.rounds.generateKnockoutRounds, { tournamentId });
    const roundsAfterKnockout = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    const semifinalRound = roundsAfterKnockout.find(
      (round) => round.phase === "semifinal"
    );
    expect(semifinalRound).toBeDefined();
    if (!semifinalRound) return;

    const semifinalMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: semifinalRound._id,
    });
    expect(semifinalMatches).toHaveLength(2);
    expect(semifinalMatches.every((match) => match.court === 1)).toBe(true);

    const semifinalMatchA = semifinalMatches[0] ?? fail("Missing semifinal A");
    const semifinalMatchB = semifinalMatches[1] ?? fail("Missing semifinal B");

    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: semifinalMatchA._id,
      scoreA: 16,
      scoreB: 16,
      winningSide: "A",
    });
    await ownerCtx.mutation(api.matches.adminEditScore, {
      matchId: semifinalMatchB._id,
      scoreA: 16,
      scoreB: 16,
      winningSide: "B",
    });

    await ownerCtx.mutation(api.rounds.advanceToFinals, { tournamentId });
    const roundsAfterFinals = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    const finalRound = roundsAfterFinals.find((round) => round.phase === "final");
    const bronzeRound = roundsAfterFinals.find((round) => round.phase === "bronze");
    expect(finalRound).toBeDefined();
    expect(bronzeRound).toBeDefined();
    if (!finalRound || !bronzeRound) return;

    const finalMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: finalRound._id,
    });
    const bronzeMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: bronzeRound._id,
    });
    expect(finalMatches[0]?.court).toBe(1);
    expect(bronzeMatches[0]?.court).toBe(1);
  });

  it("blocks finishing americano tournaments before all preliminary matches are completed", async () => {
    const t = createTestClient();
    await upsertUser(t, "americano-owner", { canCreateGroup: true });
    const players: Array<Doc<"users">> = [];
    for (let i = 1; i <= 3; i++) {
      players.push(await upsertUser(t, `americano-player-${i}`));
    }

    const ownerCtx = t.withIdentity({ subject: "americano-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Americano Group",
      slug: "americano-group",
    });

    for (const player of players) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: player._id,
        displayName: player.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Spring Americano",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });

    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    await expect(
      ownerCtx.mutation(api.tournaments.updateStatus, {
        tournamentId,
        status: "finished",
      })
    ).rejects.toThrow(
      "Americano kann erst nach allen Vorrundenspielen beendet werden"
    );

    const rounds = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    for (const round of rounds) {
      const roundMatches = await ownerCtx.query(api.matches.getByRound, {
        roundId: round._id,
      });
      for (const match of roundMatches) {
        await ownerCtx.mutation(api.matches.adminEditScore, {
          matchId: match._id,
          scoreA: 20,
          scoreB: 12,
        });
      }
    }

    await ownerCtx.mutation(api.tournaments.updateStatus, {
      tournamentId,
      status: "finished",
    });
    const finishedTournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    expect(finishedTournament?.status).toBe("finished");
  });

  it("preserves historical member ids when deleting users from Clerk", async () => {
    const t = createTestClient();
    await upsertUser(t, "history-owner", { canCreateGroup: true });
    const departing = await upsertUser(t, "history-departing");
    const staying = await upsertUser(t, "history-staying");
    const extra = await upsertUser(t, "history-extra");

    const ownerCtx = t.withIdentity({ subject: "history-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "History Group",
      slug: "history-group",
    });

    for (const user of [departing, staying, extra]) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: user._id,
        displayName: user.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const departingMembership = members.find(
      (member) => member.userId === departing._id
    );
    expect(departingMembership).toBeDefined();
    if (!departingMembership) return;

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "History Tournament",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });

    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
    await t.mutation(internal.users.deleteFromClerk, {
      clerkUserId: "history-departing",
    });

    const deletedUser = await findUserByClerkId(t, "history-departing");
    expect(deletedUser).toBeNull();

    const preservedMembership = await t.run((ctx) =>
      ctx.db.get("groupMembers", departingMembership._id)
    );
    expect(preservedMembership).not.toBeNull();
    expect(preservedMembership?.role).toBe("member");

    const tournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    expect(tournament?.playerIds).toContain(departingMembership._id);

    const visibleMembers = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(visibleMembers.map((member) => member._id)).not.toContain(
      departingMembership._id
    );
  });

  it("blocks starting setup tournaments when a selected player was deleted", async () => {
    const t = createTestClient();
    await upsertUser(t, "setup-owner", { canCreateGroup: true });
    const departing = await upsertUser(t, "setup-departing");
    const stayingOne = await upsertUser(t, "setup-staying-1");
    const stayingTwo = await upsertUser(t, "setup-staying-2");

    const ownerCtx = t.withIdentity({ subject: "setup-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Setup Group",
      slug: "setup-group",
    });

    for (const user of [departing, stayingOne, stayingTwo]) {
      await ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: user._id,
        displayName: user.name,
      });
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Setup Tournament",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });

    await t.mutation(internal.users.deleteFromClerk, {
      clerkUserId: "setup-departing",
    });

    await expect(
      ownerCtx.mutation(api.rounds.generateRounds, { tournamentId })
    ).rejects.toThrow("Alle Spieler müssen aktive Mitglieder dieser Gruppe sein");
  });

  it("lets super admins add members without joining the group", async () => {
    const t = createTestClient();
    await upsertUser(t, "admin-owner", { canCreateGroup: true });
    const candidate = await upsertUser(t, "candidate-user");

    const previousSuperAdminIds = process.env.SUPERADMIN_CLERK_IDS;
    process.env.SUPERADMIN_CLERK_IDS = "backoffice-admin";
    try {
      const superAdminCtx = t.withIdentity({
        subject: "backoffice-admin",
        name: "Backoffice Admin",
        email: "backoffice@example.com",
      });
      await superAdminCtx.mutation(api.users.ensureCurrentUser, {});

      const ownerCtx = t.withIdentity({ subject: "admin-owner" });
      const groupId = await ownerCtx.mutation(api.groups.create, {
        name: "Admin Group",
        slug: "admin-group",
      });

      const addableUsers = await superAdminCtx.query(api.groups.listAddableUsers, {
        groupId,
      });
      expect(addableUsers.map((user) => user._id)).toContain(candidate._id);

      await superAdminCtx.mutation(api.groups.addMember, {
        groupId,
        userId: candidate._id,
        displayName: "Candidate Override",
        role: "admin",
      });

      const members = await ownerCtx.query(api.groups.getMembers, { groupId });
      const addedMember = members.find((member) => member.userId === candidate._id);
      expect(addedMember?.displayName).toBe("Candidate Override");
      expect(addedMember?.role).toBe("admin");
    } finally {
      process.env.SUPERADMIN_CLERK_IDS = previousSuperAdminIds;
    }
  });

  it("rejects whitespace-only member display names on the backend", async () => {
    const t = createTestClient();
    await upsertUser(t, "display-owner", { canCreateGroup: true });
    const candidate = await upsertUser(t, "display-candidate");

    const ownerCtx = t.withIdentity({ subject: "display-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Display Group",
      slug: "display-group",
    });

    await expect(
      ownerCtx.mutation(api.groups.addMember, {
        groupId,
        userId: candidate._id,
        displayName: "   ",
      })
    ).rejects.toThrow("Bitte gib einen Anzeigenamen an.");
  });

  it("hides orphaned groups from normal listings and exposes them in backoffice", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "orphan-owner", { canCreateGroup: true });
    const orphanPlayerOne = await upsertUser(t, "orphan-player-1");
    const orphanPlayerTwo = await upsertUser(t, "orphan-player-2");
    const orphanPlayerThree = await upsertUser(t, "orphan-player-3");

    const previousSuperAdminIds = process.env.SUPERADMIN_CLERK_IDS;
    process.env.SUPERADMIN_CLERK_IDS = "backoffice-admin";
    try {
      const superAdminCtx = t.withIdentity({
        subject: "backoffice-admin",
        name: "Backoffice Admin",
        email: "backoffice@example.com",
      });
      await superAdminCtx.mutation(api.users.ensureCurrentUser, {});

      const ownerCtx = t.withIdentity({ subject: "orphan-owner" });
      const groupId = await ownerCtx.mutation(api.groups.create, {
        name: "Orphan Group",
        slug: "orphan-group",
      });
      for (const player of [
        orphanPlayerOne,
        orphanPlayerTwo,
        orphanPlayerThree,
      ]) {
        await ownerCtx.mutation(api.groups.addMember, {
          groupId,
          userId: player._id,
          displayName: player.name,
        });
      }
      const members = await ownerCtx.query(api.groups.getMembers, { groupId });
      const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
        groupId,
        name: "Orphan Tournament",
        mode: "americano",
        courts: 1,
        playerIds: members.map((member) => member._id),
      });

      await t.run(async (ctx) => {
        for (const user of [
          owner,
          orphanPlayerOne,
          orphanPlayerTwo,
          orphanPlayerThree,
        ]) {
          await ctx.db.delete("users", user._id);
        }
      });

      const visibleGroups = await superAdminCtx.query(api.groups.listForUser, {});
      expect(visibleGroups.map((group) => group._id)).not.toContain(groupId);
      const hiddenTournament = await superAdminCtx.query(api.tournaments.get, {
        tournamentId,
      });
      expect(hiddenTournament).toBeNull();

      const orphanedGroups = await superAdminCtx.query(
        api.groups.listOrphanedForBackoffice,
        {}
      );
      const orphanedGroup = orphanedGroups.find((group) => group._id === groupId);
      expect(orphanedGroup).toBeDefined();
      expect(orphanedGroup?.historicalMembers).toHaveLength(4);
      expect(
        orphanedGroup?.historicalMembers.every((member) => !member.hasUser)
      ).toBe(true);

      await superAdminCtx.mutation(api.groups.deleteOrphanedGroup, { groupId });

      const deletedGroup = await t.run((ctx) => ctx.db.get("groups", groupId));
      expect(deletedGroup).toBeNull();
    } finally {
      process.env.SUPERADMIN_CLERK_IDS = previousSuperAdminIds;
    }
  });
});
