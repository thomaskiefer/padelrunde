import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    isDeveloper: v.boolean(),
    canCreateGroup: v.boolean(),
    hasCreatedGroup: v.boolean(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  groups: defineTable({
    name: v.string(),
    slug: v.string(),
    createdBy: v.id("users"),
    isPaid: v.boolean(),
  })
    .index("by_slug", ["slug"]),

  groupMembers: defineTable({
    groupId: v.id("groups"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    displayName: v.string(),
  })
    .index("by_group", ["groupId"])
    .index("by_user", ["userId"])
    .index("by_group_and_user", ["groupId", "userId"]),

  tournaments: defineTable({
    groupId: v.id("groups"),
    name: v.string(),
    mode: v.union(v.literal("amerikaner"), v.literal("cup")),
    status: v.union(
      v.literal("setup"),
      v.literal("active"),
      v.literal("knockout"),
      v.literal("finished")
    ),
    courts: v.number(),
    playerIds: v.array(v.id("groupMembers")),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_and_status", ["groupId", "status"]),

  rounds: defineTable({
    tournamentId: v.id("tournaments"),
    roundNumber: v.number(),
    phase: v.union(
      v.literal("preliminary"),
      v.literal("semifinal"),
      v.literal("bronze"),
      v.literal("final")
    ),
  })
    .index("by_tournament", ["tournamentId"])
    .index("by_tournament_and_number", ["tournamentId", "roundNumber"]),

  matches: defineTable({
    roundId: v.id("rounds"),
    tournamentId: v.id("tournaments"),
    court: v.number(),
    teamA: v.array(v.id("groupMembers")),
    teamB: v.array(v.id("groupMembers")),
    scoreA: v.optional(v.number()),
    scoreB: v.optional(v.number()),
    reportedBy: v.optional(v.id("users")),
    status: v.union(
      v.literal("scheduled"),
      v.literal("in_progress"),
      v.literal("completed")
    ),
    winningSide: v.optional(v.union(v.literal("A"), v.literal("B"))),
    editHistory: v.optional(
      v.array(
        v.object({
          editedBy: v.id("users"),
          editedAt: v.number(),
          previousScoreA: v.number(),
          previousScoreB: v.number(),
        })
      )
    ),
  })
    .index("by_round", ["roundId"])
    .index("by_tournament", ["tournamentId"])
    .index("by_tournament_and_status", ["tournamentId", "status"]),
});
