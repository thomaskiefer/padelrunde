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

async function addGroupMember(
  t: ConvexClient,
  groupId: Doc<"groups">["_id"],
  userId: Doc<"users">["_id"],
  displayName: string,
  role?: "admin" | "member"
) {
  return t.mutation(internal.groups.addMember, {
    groupId,
    userId,
    displayName,
    role,
  });
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
    await addGroupMember(t, groupId, (user as Doc<"users">)._id, (user as Doc<"users">).name,);
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
      ? await t.run((ctx) => ctx.db.get("users", participantMember.userId!))
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

  it("shows all group tournaments to every group member even when they are not selected to play", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "visibility-owner", {
      canCreateGroup: true,
    });
    const player1 = await upsertUser(t, "visibility-player-1");
    const player2 = await upsertUser(t, "visibility-player-2");
    const player3 = await upsertUser(t, "visibility-player-3");
    const player4 = await upsertUser(t, "visibility-player-4");
    await upsertUser(t, "visibility-outsider");
    const spectator = await upsertUser(t, "visibility-spectator");

    const ownerCtx = t.withIdentity({ subject: "visibility-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Visibility Group",
      slug: "visibility-group",
    });

    for (const user of [player1, player2, player3, player4, spectator]) {
      await addGroupMember(t, groupId, user._id, user.name,);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const memberIdByUserId = new Map(
      members.map((member) => [member.userId, member._id])
    );

    const firstTournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Morning Americano",
      mode: "americano",
      courts: 1,
      playerIds: [
        owner._id,
        player1._id,
        player2._id,
        player3._id,
      ].map((userId) => memberIdByUserId.get(userId)!),
    });
    const secondTournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Evening Americano",
      mode: "americano",
      courts: 1,
      playerIds: [
        owner._id,
        player2._id,
        player3._id,
        player4._id,
      ].map((userId) => memberIdByUserId.get(userId)!),
    });

    await ownerCtx.mutation(api.rounds.generateRounds, {
      tournamentId: firstTournamentId,
    });
    await ownerCtx.mutation(api.rounds.generateRounds, {
      tournamentId: secondTournamentId,
    });

    const spectatorCtx = t.withIdentity({ subject: "visibility-spectator" });
    const visibleTournaments = await spectatorCtx.query(api.tournaments.listByGroup, {
      groupId,
    });
    expect(visibleTournaments.map((tournament) => tournament._id)).toEqual(
      expect.arrayContaining([firstTournamentId, secondTournamentId])
    );

    expect(
      await spectatorCtx.query(api.tournaments.get, {
        tournamentId: firstTournamentId,
      })
    ).not.toBeNull();
    expect(
      await spectatorCtx.query(api.tournaments.get, {
        tournamentId: secondTournamentId,
      })
    ).not.toBeNull();

    const visibleRounds = await spectatorCtx.query(api.rounds.listByTournament, {
      tournamentId: firstTournamentId,
    });
    expect(visibleRounds.length).toBeGreaterThan(0);

    const firstRound = visibleRounds[0] ?? fail("Missing visible first round");
    const visibleMatches = await spectatorCtx.query(api.matches.getByRound, {
      roundId: firstRound._id,
    });
    expect(visibleMatches.length).toBeGreaterThan(0);

    const outsiderCtx = t.withIdentity({ subject: "visibility-outsider" });
    await expect(
      outsiderCtx.query(api.tournaments.listByGroup, { groupId })
    ).rejects.toThrow("Kein Mitglied");
    expect(
      await outsiderCtx.query(api.tournaments.get, {
        tournamentId: firstTournamentId,
      })
    ).toBeNull();
  });

  it("records edit history when an admin changes an existing result", async () => {
    const t = createTestClient();
    const { firstMatch, owner, ownerCtx } = await setupAmericanoTournament(t);

    const participantMember = await t.run((ctx) =>
      ctx.db.get("groupMembers", firstMatch.teamA[0] as any)
    );
    const participantUser = participantMember
      ? await t.run((ctx) => ctx.db.get("users", participantMember.userId!))
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

    await addGroupMember(t, groupId, member._id, member.name,);

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
      await addGroupMember(t, groupId, player._id, player.name,);
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
      await addGroupMember(t, groupId, player._id, player.name,);
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
      await addGroupMember(t, groupId, player._id, player.name,);
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
      await addGroupMember(t, groupId, player._id, player.name,);
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
      await addGroupMember(t, groupId, user._id, user.name,);
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
      await addGroupMember(t, groupId, user._id, user.name,);
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

  it("lets super admins manage group members without joining the group", async () => {
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

      await addGroupMember(t, groupId, candidate._id, "Candidate Override");

      const members = await ownerCtx.query(api.groups.getMembers, { groupId });
      const candidateMembership = members.find(
        (member) => member.userId === candidate._id
      );
      expect(candidateMembership?.displayName).toBe("Candidate Override");
      expect(candidateMembership?.role).toBe("member");
      if (!candidateMembership) fail("Missing candidate membership");

      await superAdminCtx.mutation(api.groups.removeMember, {
        memberId: candidateMembership._id,
      });

      const remainingMembers = await ownerCtx.query(api.groups.getMembers, {
        groupId,
      });
      expect(
        remainingMembers.find((member) => member.userId === candidate._id)
      ).toBeUndefined();
    } finally {
      process.env.SUPERADMIN_CLERK_IDS = previousSuperAdminIds;
    }
  });

  it("lets promoted group admins manage members and tournaments", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "promote-owner", { canCreateGroup: true });
    const promotedUser = await upsertUser(t, "promote-admin");
    const player1 = await upsertUser(t, "promote-player-1");
    const player2 = await upsertUser(t, "promote-player-2");
    const lateJoiner = await upsertUser(t, "promote-late-joiner");

    const ownerCtx = t.withIdentity({ subject: "promote-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Promotion Group",
      slug: "promotion-group",
    });

    for (const user of [promotedUser, player1, player2]) {
      await addGroupMember(t, groupId, user._id, user.name);
    }

    const promotedCtx = t.withIdentity({ subject: "promote-admin" });
    await expect(
      promotedCtx.mutation(api.groups.createInviteToken, {
        groupId,
        label: "Pre-Promotion Invite",
      })
    ).rejects.toThrow("Nur für Admins");

    const membersBeforePromotion = await ownerCtx.query(api.groups.getMembers, {
      groupId,
    });
    const promotedMembership = membersBeforePromotion.find(
      (member) => member.userId === promotedUser._id
    );
    if (!promotedMembership) fail("Missing promoted member");

    await ownerCtx.mutation(api.groups.updateMemberRole, {
      memberId: promotedMembership._id,
      role: "admin",
    });

    const invite = await promotedCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Admin Invite",
    });

    const lateJoinerCtx = t.withIdentity({ subject: "promote-late-joiner" });
    await lateJoinerCtx.mutation(api.groups.joinWithInvite, {
      token: invite.token,
      displayName: "Late Joiner",
    });

    const membersAfterPromotion = await promotedCtx.query(api.groups.getMembers, {
      groupId,
    });
    expect(
      membersAfterPromotion.find((member) => member.userId === lateJoiner._id)
        ?.displayName
    ).toBe("Late Joiner");

    const tournamentPlayers = membersAfterPromotion
      .filter(
        (member) =>
          member.userId != null &&
          [owner._id, promotedUser._id, player1._id, player2._id].includes(
            member.userId
          )
      )
      .map((member) => member._id);

    const tournamentId = await promotedCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Admin Created Americano",
      mode: "americano",
      courts: 1,
      playerIds: tournamentPlayers,
    });
    await promotedCtx.mutation(api.rounds.generateRounds, { tournamentId });

    const createdTournament = await promotedCtx.query(api.tournaments.get, {
      tournamentId,
    });
    expect(createdTournament?.createdBy).toBe(promotedUser._id);
  });

  it("lets members leave groups but blocks the last admin from leaving", async () => {
    const t = createTestClient();
    await upsertUser(t, "leave-owner", { canCreateGroup: true });
    const memberOne = await upsertUser(t, "leave-member-1");
    const memberTwo = await upsertUser(t, "leave-member-2");

    const ownerCtx = t.withIdentity({ subject: "leave-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Leave Group",
      slug: "leave-group",
    });

    for (const user of [memberOne, memberTwo]) {
      await addGroupMember(t, groupId, user._id, user.name);
    }

    const memberOneCtx = t.withIdentity({ subject: "leave-member-1" });
    await memberOneCtx.mutation(api.groups.leaveGroup, { groupId });

    await expect(
      memberOneCtx.query(api.groups.getBySlug, { slug: "leave-group" })
    ).resolves.toBeNull();

    await expect(
      ownerCtx.mutation(api.groups.leaveGroup, { groupId })
    ).rejects.toThrow("Mindestens ein Admin muss in der Gruppe bleiben");

    const remainingMembers = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(remainingMembers.map((member) => member.userId)).toEqual(
      expect.arrayContaining([memberTwo._id])
    );
    expect(remainingMembers.map((member) => member.userId)).not.toContain(
      memberOne._id
    );
  });

  it("lets admins remove members but blocks removing the last admin", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "remove-owner", { canCreateGroup: true });
    const member = await upsertUser(t, "remove-member");
    await upsertUser(t, "remove-super", { isSuperAdmin: true });

    const ownerCtx = t.withIdentity({ subject: "remove-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Remove Group",
      slug: "remove-group",
    });
    await addGroupMember(t, groupId, member._id, member.name);

    const membersBeforeRemoval = await ownerCtx.query(api.groups.getMembers, {
      groupId,
    });
    const ownerMembership = membersBeforeRemoval.find(
      (entry) => entry.userId === owner._id
    );
    const memberMembership = membersBeforeRemoval.find(
      (entry) => entry.userId === member._id
    );
    if (!ownerMembership || !memberMembership) {
      fail("Missing memberships for remove-member test");
    }

    const superAdminCtx = t.withIdentity({ subject: "remove-super" });
    await expect(
      superAdminCtx.mutation(api.groups.removeMember, {
        memberId: ownerMembership._id,
      })
    ).rejects.toThrow("Mindestens ein Admin muss in der Gruppe bleiben");

    await ownerCtx.mutation(api.groups.removeMember, {
      memberId: memberMembership._id,
    });

    const memberCtx = t.withIdentity({ subject: "remove-member" });
    await expect(
      memberCtx.query(api.groups.getBySlug, { slug: "remove-group" })
    ).resolves.toBeNull();
  });

  it("blocks leaving or removing members who are referenced by tournaments", async () => {
    const t = createTestClient();
    await upsertUser(t, "referenced-owner", { canCreateGroup: true });
    const player1 = await upsertUser(t, "referenced-player-1");
    const player2 = await upsertUser(t, "referenced-player-2");
    const player3 = await upsertUser(t, "referenced-player-3");

    const ownerCtx = t.withIdentity({ subject: "referenced-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Referenced Group",
      slug: "referenced-group",
    });

    for (const user of [player1, player2, player3]) {
      await addGroupMember(t, groupId, user._id, user.name);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const referencedMember = members.find((member) => member.userId === player1._id);
    if (!referencedMember) fail("Missing referenced membership");

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Referenced Tournament",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
    const membersAfterTournament = await ownerCtx.query(api.groups.getMembers, {
      groupId,
    });
    const referencedMemberAfterTournament = membersAfterTournament.find(
      (member) => member.userId === player1._id
    );
    if (!referencedMemberAfterTournament) fail("Missing referenced membership after tournament");
    expect(referencedMemberAfterTournament.isReferenced).toBe(true);

    const playerCtx = t.withIdentity({ subject: "referenced-player-1" });
    await expect(
      playerCtx.mutation(api.groups.leaveGroup, { groupId })
    ).rejects.toThrow(
      "Mitglied ist in Turnieren dieser Gruppe enthalten und kann nicht entfernt werden"
    );

    await expect(
      ownerCtx.mutation(api.groups.removeMember, {
        memberId: referencedMemberAfterTournament._id,
      })
    ).rejects.toThrow(
      "Mitglied ist in Turnieren dieser Gruppe enthalten und kann nicht entfernt werden"
    );
  });

  it("still allows leaving and removing members who were never referenced", async () => {
    const t = createTestClient();
    await upsertUser(t, "unreferenced-owner", { canCreateGroup: true });
    const player1 = await upsertUser(t, "unreferenced-player-1");
    const player2 = await upsertUser(t, "unreferenced-player-2");
    const player3 = await upsertUser(t, "unreferenced-player-3");
    const reserve = await upsertUser(t, "unreferenced-reserve");

    const ownerCtx = t.withIdentity({ subject: "unreferenced-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Unreferenced Group",
      slug: "unreferenced-group",
    });

    for (const user of [player1, player2, player3, reserve]) {
      await addGroupMember(t, groupId, user._id, user.name);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const reserveMember = members.find((member) => member.userId === reserve._id);
    if (!reserveMember) fail("Missing reserve membership");
    expect(reserveMember.isReferenced).toBe(false);

    const tournamentPlayers = members
      .filter((member) => member.userId !== reserve._id)
      .map((member) => member._id);

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Unreferenced Tournament",
      mode: "americano",
      courts: 1,
      playerIds: tournamentPlayers,
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    const reserveCtx = t.withIdentity({ subject: "unreferenced-reserve" });
    await reserveCtx.mutation(api.groups.leaveGroup, { groupId });
    await expect(
      reserveCtx.query(api.groups.getBySlug, { slug: "unreferenced-group" })
    ).resolves.toBeNull();

    const replacement = await upsertUser(t, "unreferenced-replacement");
    await addGroupMember(t, groupId, replacement._id, replacement.name);

    const updatedMembers = await ownerCtx.query(api.groups.getMembers, { groupId });
    const replacementMembership = updatedMembers.find(
      (member) => member.userId === replacement._id
    );
    if (!replacementMembership) fail("Missing replacement membership");

    await ownerCtx.mutation(api.groups.removeMember, {
      memberId: replacementMembership._id,
    });

    const replacementCtx = t.withIdentity({ subject: "unreferenced-replacement" });
    await expect(
      replacementCtx.query(api.groups.getBySlug, { slug: "unreferenced-group" })
    ).resolves.toBeNull();
  });

  it("deletes active groups and restores the creator's group-creation right", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "delete-owner", { canCreateGroup: true });
    const player1 = await upsertUser(t, "delete-player-1");
    const player2 = await upsertUser(t, "delete-player-2");
    const player3 = await upsertUser(t, "delete-player-3");

    const ownerCtx = t.withIdentity({ subject: "delete-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Delete Group",
      slug: "delete-group",
    });

    for (const user of [player1, player2, player3]) {
      await addGroupMember(t, groupId, user._id, user.name);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Delete Tournament",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    const invite = await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Delete Invite",
    });

    await ownerCtx.mutation(api.groups.deleteGroup, { groupId });

    const deletedGroup = await t.run((ctx) => ctx.db.get("groups", groupId));
    const deletedTournament = await t.run((ctx) =>
      ctx.db.get("tournaments", tournamentId)
    );
    const deletedInvite = await t.run((ctx) =>
      ctx.db.get("groupInviteTokens", invite.inviteTokenId as any)
    );
    const remainingMemberships = await t.run((ctx) =>
      ctx.db
        .query("groupMembers")
        .withIndex("by_group", (q) => q.eq("groupId", groupId))
        .collect()
    );
    const refreshedOwner = await t.run((ctx) => ctx.db.get("users", owner._id));

    expect(deletedGroup).toBeNull();
    expect(deletedTournament).toBeNull();
    expect(deletedInvite).toBeNull();
    expect(remainingMemberships).toHaveLength(0);
    expect(refreshedOwner?.hasCreatedGroup).toBe(false);

    const nextGroupId = await ownerCtx.mutation(api.groups.create, {
      name: "Delete Group Replacement",
      slug: "delete-group-replacement",
    });
    expect(nextGroupId).toBeDefined();
  });

  it("creates reusable invite tokens and lets invited users join privately", async () => {
    const t = createTestClient();
    await upsertUser(t, "invite-owner", { canCreateGroup: true });
    const player1 = await upsertUser(t, "invite-player-1");
    const player2 = await upsertUser(t, "invite-player-2");
    const player3 = await upsertUser(t, "invite-player-3");
    await upsertUser(t, "invite-outsider");
    await upsertUser(t, "invite-joiner-1");
    await upsertUser(t, "invite-joiner-2");

    const ownerCtx = t.withIdentity({ subject: "invite-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Invite Group",
      slug: "invite-group",
    });

    for (const user of [player1, player2, player3]) {
      await addGroupMember(t, groupId, user._id, user.name,);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Invite Americano",
      mode: "americano",
      courts: 1,
      playerIds: members.map((member) => member._id),
    });

    const invite = await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Open Training",
    });
    await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Reserve Link",
    });

    const inviteList = await ownerCtx.query(api.groups.listInviteTokens, { groupId });
    expect(inviteList).toHaveLength(2);
    expect(inviteList.every((entry) => entry.status === "active")).toBe(true);
    expect(inviteList.every((entry) => typeof entry.token === "string")).toBe(true);

    const outsiderCtx = t.withIdentity({ subject: "invite-outsider" });
    expect(
      await outsiderCtx.query(api.groups.getBySlug, { slug: "invite-group" })
    ).toBeNull();
    await expect(
      outsiderCtx.query(api.tournaments.listByGroup, { groupId })
    ).rejects.toThrow("Kein Mitglied");

    const joinerOneCtx = t.withIdentity({ subject: "invite-joiner-1" });
    const joinResultOne = await joinerOneCtx.mutation(api.groups.joinWithInvite, {
      token: invite.token,
      displayName: "Joiner One",
    });
    expect(joinResultOne.groupSlug).toBe("invite-group");

    const groupAfterJoin = await joinerOneCtx.query(api.groups.getBySlug, {
      slug: "invite-group",
    });
    expect(groupAfterJoin?._id).toBe(groupId);
    const visibleTournaments = await joinerOneCtx.query(api.tournaments.listByGroup, {
      groupId,
    });
    expect(visibleTournaments.map((entry) => entry._id)).toContain(tournamentId);

    const joinerTwoCtx = t.withIdentity({ subject: "invite-joiner-2" });
    const joinResultTwo = await joinerTwoCtx.mutation(api.groups.joinWithInvite, {
      token: invite.token,
      displayName: "Joiner Two",
    });
    expect(joinResultTwo.groupSlug).toBe("invite-group");

    await expect(
      joinerOneCtx.mutation(api.groups.joinWithInvite, {
        token: invite.token,
        displayName: "Joiner One",
      })
    ).rejects.toThrow("Du bist bereits Mitglied dieser Gruppe");

    await expect(
      outsiderCtx.mutation(api.groups.joinWithInvite, {
        token: invite.token,
        displayName: "   ",
      })
    ).rejects.toThrow("Bitte gib einen Anzeigenamen an.");

    const joinInvite = await outsiderCtx.query(api.groups.getJoinInvite, {
      token: invite.token,
    });
    expect(joinInvite.status).toBe("active");
    if (joinInvite.status !== "active") fail("Expected active invite");
    expect(joinInvite.group.slug).toBe("invite-group");
  });

  it("revokes and expires invite tokens", async () => {
    const t = createTestClient();
    await upsertUser(t, "invite-admin", { canCreateGroup: true });
    const player1 = await upsertUser(t, "invite-admin-player-1");
    const player2 = await upsertUser(t, "invite-admin-player-2");
    const player3 = await upsertUser(t, "invite-admin-player-3");
    await upsertUser(t, "invite-late-joiner");
    await upsertUser(t, "invite-expired-joiner");

    const ownerCtx = t.withIdentity({ subject: "invite-admin" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Invite Admin Group",
      slug: "invite-admin-group",
    });
    for (const user of [player1, player2, player3]) {
      await addGroupMember(t, groupId, user._id, user.name,);
    }

    const revokableInvite = await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Revokable",
    });
    const expirableInvite = await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Expirable",
    });

    const inviteTokens = await ownerCtx.query(api.groups.listInviteTokens, { groupId });
    const revokableRecord = inviteTokens.find((entry) => entry.label === "Revokable");
    const expirableRecord = inviteTokens.find((entry) => entry.label === "Expirable");
    if (!revokableRecord || !expirableRecord) fail("Missing invite records");
    expect(revokableRecord.token).toBe(revokableInvite.token);
    expect(expirableRecord.token).toBe(expirableInvite.token);

    await ownerCtx.mutation(api.groups.revokeInviteToken, {
      inviteTokenId: revokableRecord._id,
    });
    const inviteTokensAfterRevoke = await ownerCtx.query(api.groups.listInviteTokens, {
      groupId,
    });
    const revokedRecordAfterUpdate = inviteTokensAfterRevoke.find(
      (entry) => entry._id === revokableRecord._id
    );
    if (!revokedRecordAfterUpdate) fail("Missing revoked invite record");
    expect(revokedRecordAfterUpdate.status).toBe("revoked");
    expect(revokedRecordAfterUpdate.token).toBeNull();
    const revokedStatus = await ownerCtx.query(api.groups.getJoinInvite, {
      token: revokableInvite.token,
    });
    expect(revokedStatus.status).toBe("revoked");

    const lateJoinerCtx = t.withIdentity({ subject: "invite-late-joiner" });
    await expect(
      lateJoinerCtx.mutation(api.groups.joinWithInvite, {
        token: revokableInvite.token,
        displayName: "Late Joiner",
      })
    ).rejects.toThrow("Einladung wurde widerrufen");

    await t.run((ctx) =>
      ctx.db.patch("groupInviteTokens", expirableRecord._id, {
        expiresAt: Date.now() - 1_000,
      })
    );

    const expiredStatus = await ownerCtx.query(api.groups.getJoinInvite, {
      token: expirableInvite.token,
    });
    expect(expiredStatus.status).toBe("expired");

    const expiredJoinerCtx = t.withIdentity({ subject: "invite-expired-joiner" });
    await expect(
      expiredJoinerCtx.mutation(api.groups.joinWithInvite, {
        token: expirableInvite.token,
        displayName: "Expired Joiner",
      })
    ).rejects.toThrow("Einladung ist abgelaufen");
  });

  it("allows deleting revoked and expired invite tokens", async () => {
    const t = createTestClient();
    await upsertUser(t, "invite-delete-admin", { canCreateGroup: true });
    const player1 = await upsertUser(t, "invite-delete-player-1");
    const player2 = await upsertUser(t, "invite-delete-player-2");
    const player3 = await upsertUser(t, "invite-delete-player-3");

    const ownerCtx = t.withIdentity({ subject: "invite-delete-admin" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Invite Delete Group",
      slug: "invite-delete-group",
    });
    for (const user of [player1, player2, player3]) {
      await addGroupMember(t, groupId, user._id, user.name,);
    }

    await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Delete Revoked",
    });
    await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Delete Expired",
    });

    const inviteTokens = await ownerCtx.query(api.groups.listInviteTokens, { groupId });
    const revokedRecord = inviteTokens.find((entry) => entry.label === "Delete Revoked");
    const expiredRecord = inviteTokens.find((entry) => entry.label === "Delete Expired");
    if (!revokedRecord || !expiredRecord) fail("Missing invite records");

    await ownerCtx.mutation(api.groups.revokeInviteToken, {
      inviteTokenId: revokedRecord._id,
    });
    await ownerCtx.mutation(api.groups.deleteInviteToken, {
      inviteTokenId: revokedRecord._id,
    });

    await t.run((ctx) =>
      ctx.db.patch("groupInviteTokens", expiredRecord._id, {
        expiresAt: Date.now() - 1_000,
      })
    );
    await ownerCtx.mutation(api.groups.deleteInviteToken, {
      inviteTokenId: expiredRecord._id,
    });

    const remainingInvites = await ownerCtx.query(api.groups.listInviteTokens, {
      groupId,
    });
    expect(remainingInvites).toHaveLength(0);

    const activeInvite = await ownerCtx.mutation(api.groups.createInviteToken, {
      groupId,
      label: "Delete Active",
    });
    const activeRecord = (
      await ownerCtx.query(api.groups.listInviteTokens, { groupId })
    ).find((entry) => entry.label === "Delete Active");
    if (!activeRecord) fail("Missing active invite");

    await expect(
      ownerCtx.mutation(api.groups.deleteInviteToken, {
        inviteTokenId: activeRecord._id,
      })
    ).rejects.toThrow("Aktive Einladungen müssen zuerst widerrufen werden");

    const stillUsable = await ownerCtx.query(api.groups.getJoinInvite, {
      token: activeInvite.token,
    });
    expect(stillUsable.status).toBe("active");
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
      addGroupMember(t, groupId, candidate._id, "   ")
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
        await addGroupMember(t, groupId, player._id, player.name,);
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

describe("guest players, renaming and small americanos", () => {
  it("lets an admin add a guest and use it as a tournament player", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "guest-owner", { canCreateGroup: true });
    const ownerCtx = t.withIdentity({ subject: "guest-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Guest Group",
      slug: "guest-group",
    });

    const guestId = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "  Gast Gustav  ",
    });

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const guest = members.find((member) => member._id === guestId);
    expect(guest?.isGuest).toBe(true);
    expect(guest?.displayName).toBe("Gast Gustav");
    expect(guest?.userId).toBeUndefined();

    // Owner (admin) is auto-added as a member on group creation; add two more guests
    const guest2 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast Greta",
    });
    const guest3 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast Georg",
    });
    const ownerMember = members.find((member) => member.userId === owner._id);

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Gäste-Americano",
      mode: "americano",
      courts: 1,
      playerIds: [ownerMember!._id, guestId, guest2, guest3],
    });

    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });
    const rounds = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    expect(rounds.length).toBe(3);
  });

  it("rejects promoting a guest to admin", async () => {
    const t = createTestClient();
    await upsertUser(t, "promo-owner", { canCreateGroup: true });
    const ownerCtx = t.withIdentity({ subject: "promo-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Promo Group",
      slug: "promo-group",
    });
    const guestId = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Nur Gast",
    });

    await expect(
      ownerCtx.mutation(api.groups.updateMemberRole, {
        memberId: guestId,
        role: "admin",
      })
    ).rejects.toThrow("Gäste können keine Admins sein");
  });

  it("lets admins rename anyone and members rename themselves only", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "rename-owner", { canCreateGroup: true });
    const memberA = await upsertUser(t, "rename-a");
    const memberB = await upsertUser(t, "rename-b");
    const ownerCtx = t.withIdentity({ subject: "rename-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Rename Group",
      slug: "rename-group",
    });
    await addGroupMember(t, groupId, memberA._id, "Alte A");
    await addGroupMember(t, groupId, memberB._id, "Alte B");
    const guestId = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Alter Gast",
    });

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const memberAId = members.find((m) => m.userId === memberA._id)!._id;
    const memberBId = members.find((m) => m.userId === memberB._id)!._id;

    // Admin renames another member and a guest.
    await ownerCtx.mutation(api.groups.updateMemberDisplayName, {
      memberId: memberBId,
      displayName: "Neue B",
    });
    await ownerCtx.mutation(api.groups.updateMemberDisplayName, {
      memberId: guestId,
      displayName: "Neuer Gast",
    });

    // Member renames themselves.
    const memberACtx = t.withIdentity({ subject: "rename-a" });
    await memberACtx.mutation(api.groups.updateMemberDisplayName, {
      memberId: memberAId,
      displayName: "Neue A",
    });

    // Member cannot rename someone else.
    await expect(
      memberACtx.mutation(api.groups.updateMemberDisplayName, {
        memberId: memberBId,
        displayName: "Gekapert",
      })
    ).rejects.toThrow("Nur für Admins");

    // Empty names are rejected.
    await expect(
      ownerCtx.mutation(api.groups.updateMemberDisplayName, {
        memberId: memberBId,
        displayName: "   ",
      })
    ).rejects.toThrow("Bitte gib einen Namen an.");

    const updated = await ownerCtx.query(api.groups.getMembers, { groupId });
    const byId = new Map(updated.map((m) => [m._id, m.displayName]));
    expect(byId.get(memberAId)).toBe("Neue A");
    expect(byId.get(memberBId)).toBe("Neue B");
    expect(byId.get(guestId)).toBe("Neuer Gast");
    expect(owner.name).toBeDefined();
  });

  it("rotates who rests each round in a six player americano", async () => {
    const t = createTestClient();
    await upsertUser(t, "six-owner", { canCreateGroup: true });
    const ownerCtx = t.withIdentity({ subject: "six-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Six Group",
      slug: "six-group",
    });
    for (let i = 0; i < 5; i++) {
      const user = await upsertUser(t, `six-player-${i}`);
      await addGroupMember(t, groupId, user._id, `Spieler ${i}`);
    }

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(members).toHaveLength(6);
    const playerMemberIds = members.map((m) => m._id);

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Sechser-Americano",
      mode: "americano",
      courts: 1,
      playerIds: playerMemberIds,
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    const rounds = (
      await ownerCtx.query(api.rounds.listByTournament, { tournamentId })
    ).sort((a, b) => a.roundNumber - b.roundNumber);
    expect(rounds.length).toBe(5);

    const restingPerRound: Array<Array<string>> = [];
    for (const round of rounds) {
      const roundMatches = await ownerCtx.query(api.matches.getByRound, {
        roundId: round._id,
      });
      expect(roundMatches.length).toBe(1);
      const playing = new Set(
        roundMatches.flatMap((m) => [...m.teamA, ...m.teamB])
      );
      expect(playing.size).toBe(4);
      const resting = playerMemberIds.filter((id) => !playing.has(id));
      expect(resting.length).toBe(2);
      restingPerRound.push(resting);
    }

    // Rest counts stay balanced.
    const counts = new Map<string, number>();
    for (const roundRest of restingPerRound) {
      for (const id of roundRest) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const values = playerMemberIds.map((id) => counts.get(id) ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);

    // Nobody rests in two consecutive rounds.
    for (let r = 1; r < restingPerRound.length; r++) {
      const prev = new Set(restingPerRound[r - 1]);
      for (const id of restingPerRound[r]) {
        expect(prev.has(id)).toBe(false);
      }
    }
  });

  it("keeps a guest that has played but removes an unused one", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "rm-owner", { canCreateGroup: true });
    const ownerCtx = t.withIdentity({ subject: "rm-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Remove Group",
      slug: "remove-group",
    });

    // Unused guest can be removed.
    const spareGuest = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Ungenutzt",
    });
    await ownerCtx.mutation(api.groups.removeMember, { memberId: spareGuest });
    const afterRemoval = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(afterRemoval.some((m) => m._id === spareGuest)).toBe(false);

    // A guest referenced by a tournament cannot be removed.
    const g1 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast 1",
    });
    const g2 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast 2",
    });
    const g3 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast 3",
    });
    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const ownerMember = members.find((m) => m.userId === owner._id)!._id;

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Gast-Turnier",
      mode: "americano",
      courts: 1,
      playerIds: [ownerMember, g1, g2, g3],
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    await expect(
      ownerCtx.mutation(api.groups.removeMember, { memberId: g1 })
    ).rejects.toThrow("Turnieren");
  });

  it("treats a group with only guests left as orphaned and deletes it", async () => {
    const t = createTestClient();
    await upsertUser(t, "orphan-owner", { canCreateGroup: true });
    const ownerCtx = t.withIdentity({ subject: "orphan-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Orphan Group",
      slug: "orphan-group",
    });
    const guestId = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Einsamer Gast",
    });

    // The only account holder deletes their account; a guest cannot keep the
    // group alive, so the whole group is removed.
    await t.mutation(internal.users.deleteFromClerk, {
      clerkUserId: "orphan-owner",
    });

    const group = await t.run((ctx) => ctx.db.get("groups", groupId));
    expect(group).toBeNull();
    const guest = await t.run((ctx) => ctx.db.get("groupMembers", guestId));
    expect(guest).toBeNull();
  });

  it("records scores and standings for a tournament that includes guests", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "score-owner", { canCreateGroup: true });
    const realPlayer = await upsertUser(t, "score-real");
    const ownerCtx = t.withIdentity({ subject: "score-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Score Group",
      slug: "score-group",
    });
    await addGroupMember(t, groupId, realPlayer._id, "Echt Spieler");
    const guestA = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast Anna",
    });
    const guestB = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "Gast Ben",
    });

    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const ownerMember = members.find((m) => m.userId === owner._id)!._id;
    const realMember = members.find((m) => m.userId === realPlayer._id)!._id;

    const tournamentId = await ownerCtx.mutation(api.tournaments.create, {
      groupId,
      name: "Gemischtes Turnier",
      mode: "americano",
      courts: 1,
      playerIds: [ownerMember, realMember, guestA, guestB],
    });
    await ownerCtx.mutation(api.rounds.generateRounds, { tournamentId });

    const rounds = await ownerCtx.query(api.rounds.listByTournament, {
      tournamentId,
    });
    const firstRoundMatches = await ownerCtx.query(api.matches.getByRound, {
      roundId: rounds[0]._id,
    });
    const match = firstRoundMatches[0];

    // The owner participates in every 4-player round and can submit.
    await ownerCtx.mutation(api.matches.submitScore, {
      matchId: match._id,
      scoreA: 20,
      scoreB: 12,
    });

    const standings = await ownerCtx.query(api.standings.getStandings, {
      tournamentId,
    });
    expect(standings).toHaveLength(4);
    const names = standings.map((s) => s.displayName);
    expect(names).toContain("Gast Anna");
    expect(names).toContain("Gast Ben");
    // Each of the four players carries their team's score (2×20 + 2×12).
    expect(standings.reduce((sum, s) => sum + s.points, 0)).toBe(64);
    expect(standings.filter((s) => s.points === 20)).toHaveLength(2);
  });

  it("lets a super admin who is not a group member rename a member", async () => {
    const t = createTestClient();
    const owner = await upsertUser(t, "sa-owner", { canCreateGroup: true });
    await upsertUser(t, "sa-super", { isSuperAdmin: true });
    const ownerCtx = t.withIdentity({ subject: "sa-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "SA Group",
      slug: "sa-group",
    });
    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const ownerMember = members.find((m) => m.userId === owner._id)!._id;

    const superCtx = t.withIdentity({ subject: "sa-super" });
    await superCtx.mutation(api.groups.updateMemberDisplayName, {
      memberId: ownerMember,
      displayName: "Von Super umbenannt",
    });

    const updated = await ownerCtx.query(api.groups.getMembers, { groupId });
    expect(updated.find((m) => m._id === ownerMember)?.displayName).toBe(
      "Von Super umbenannt"
    );
  });

  it("rejects guest creation and tournament configs from unauthorized callers", async () => {
    const t = createTestClient();
    await upsertUser(t, "authz-owner", { canCreateGroup: true });
    const memberUser = await upsertUser(t, "authz-member");
    const ownerCtx = t.withIdentity({ subject: "authz-owner" });
    const groupId = await ownerCtx.mutation(api.groups.create, {
      name: "Authz Group",
      slug: "authz-group",
    });
    await addGroupMember(t, groupId, memberUser._id, "Nur Mitglied");

    // A non-admin member cannot add guests.
    const memberCtx = t.withIdentity({ subject: "authz-member" });
    await expect(
      memberCtx.mutation(api.groups.addGuestMember, {
        groupId,
        displayName: "Verbotener Gast",
      })
    ).rejects.toThrow("Nur für Admins");

    // Two courts require at least eight players — enforced at the mutation layer.
    const g1 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "G1",
    });
    const g2 = await ownerCtx.mutation(api.groups.addGuestMember, {
      groupId,
      displayName: "G2",
    });
    const members = await ownerCtx.query(api.groups.getMembers, { groupId });
    const ownerMember = members.find((m) => m.role === "admin")!._id;
    const memberId = members.find((m) => m.userId === memberUser._id)!._id;

    await expect(
      ownerCtx.mutation(api.tournaments.create, {
        groupId,
        name: "Zu viele Plätze",
        mode: "americano",
        courts: 2,
        playerIds: [ownerMember, memberId, g1, g2],
      })
    ).rejects.toThrow("2 Plätze");
  });
});
