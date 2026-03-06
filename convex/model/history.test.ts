import { describe, expect, it } from "bun:test";
import { collectHistoricalMemberIds } from "./history";

describe("collectHistoricalMemberIds", () => {
  it("collects ids from tournament players and match teams", () => {
    const ids = collectHistoricalMemberIds([
      {
        playerIds: ["m1", "m2", "m3", "m4"],
        matches: [{ teamA: ["m1", "m2"], teamB: ["m3", "m4"] }],
      },
    ]);

    expect(ids.has("m1")).toBe(true);
    expect(ids.has("m2")).toBe(true);
    expect(ids.has("m3")).toBe(true);
    expect(ids.has("m4")).toBe(true);
    expect(ids.size).toBe(4);
  });

  it("deduplicates ids across tournaments and matches", () => {
    const ids = collectHistoricalMemberIds([
      {
        playerIds: ["m1", "m2"],
        matches: [{ teamA: ["m1", "m2"], teamB: ["m1", "m2"] }],
      },
      {
        playerIds: ["m2", "m3"],
        matches: [{ teamA: ["m2", "m3"], teamB: ["m2", "m3"] }],
      },
    ]);

    expect(Array.from(ids).sort()).toEqual(["m1", "m2", "m3"]);
  });
});
