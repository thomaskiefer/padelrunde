import { describe, expect, it } from "bun:test";
import { isValidSlugLength, normalizeSlug } from "./slug";

describe("normalizeSlug", () => {
  it("normalizes mixed case and spacing", () => {
    expect(normalizeSlug("  Padel Freunde Obersulm  ")).toBe(
      "padel-freunde-obersulm"
    );
  });

  it("drops non-alphanumeric separators and trims dashes", () => {
    expect(normalizeSlug("///Team@@@A+++B///")).toBe("team-a-b");
  });
});

describe("isValidSlugLength", () => {
  it("accepts length between 3 and 48", () => {
    expect(isValidSlugLength("abc")).toBe(true);
    expect(isValidSlugLength("a".repeat(48))).toBe(true);
  });

  it("rejects length outside bounds", () => {
    expect(isValidSlugLength("ab")).toBe(false);
    expect(isValidSlugLength("a".repeat(49))).toBe(false);
  });
});
