// The username rules (src/leaderboard/username.ts), shared by the form and
// the server.
import { describe, expect, it } from "vitest";
import { USERNAME_MESSAGES, isValidUsername, usernameKey, usernameProblems } from "../../src/leaderboard/username";

const DASHES = /[-‐-―−]/;

describe("username format", () => {
  it.each(["Abe", "checkers_king", "Player1", "a1b2c3", "Zed_9", "MaxLengthIs16abc", "noob_master", "badminton", "aiden", "class_act"])(
    "accepts %s",
    (name) => {
      expect(usernameProblems(name)).toEqual([]);
      expect(isValidUsername(name)).toBe(true);
    },
  );

  it.each([
    ["ab", "length"],
    ["", "length"],
    ["seventeen_chars_x", "length"],
    ["two words", "spaces"],
    ["dash-name", "characters"],
    ["emoji😀", "characters"],
    ["café", "characters"],
    ["1player", "startLetter"],
    ["12345", "startLetter"],
    ["_lead", "startLetter"],
    ["trail_", "endUnderscore"],
    ["double__under", "doubleUnderscore"],
    ["coooool", "repeats"],
    ["aaaab", "repeats"],
    ["ZzzZ", "repeats"],
  ] as const)("refuses %s for %s", (name, rule) => {
    expect(usernameProblems(name)).toContain(rule);
  });

  it("allows exactly 3 repeated characters", () => {
    expect(usernameProblems("cooolkid")).toEqual([]);
  });

  it("a name of digits only can never pass", () => {
    expect(isValidUsername("123456")).toBe(false);
  });

  it("compares without case", () => {
    expect(usernameKey("CheckersKing")).toBe(usernameKey("checkersking"));
  });

  it("every message is free of dashes and ends with a full stop", () => {
    for (const message of Object.values(USERNAME_MESSAGES)) {
      expect(message).not.toMatch(DASHES);
      expect(message.endsWith(".")).toBe(true);
    }
  });
});

describe("blocked words", () => {
  it.each(["fuck", "FuckFace", "fuuuck", "f_u_c_k", "fuck123", "sh1t_head", "xXbitchXx", "nigger", "n1gg3r", "porn_star", "asshole", "the_c0ck", "hitler88", "s3xy_girl"])(
    "blocks %s",
    (name) => {
      expect(usernameProblems(name)).toContain("blocked");
    },
  );

  // Listed words inside harmless names, and the reading of double letters.
  it.each(["peacock", "grapefruit", "virginia", "baldwin", "dickens", "scunthorpe", "nigeria", "hello_world", "classic", "passion", "shellfish", "therapist"])(
    "allows %s",
    (name) => {
      expect(usernameProblems(name)).not.toContain("blocked");
    },
  );
});

describe("reserved names", () => {
  it.each(["admin", "Admin_1", "4dm1n", "admin_no", "moderator", "support_desk", "Checkervia", "checkervia_fan", "official_bot", "ai", "ai_master", "computer", "System"])(
    "reserves %s",
    (name) => {
      const problems = usernameProblems(name);
      // Too short names also get the length message; reserved is still there.
      expect(problems.includes("reserved") || problems.includes("length")).toBe(true);
      if (name.length >= 3) expect(problems).toContain("reserved");
    },
  );

  it.each(["aiden", "badminton", "maiden", "computing_fan"])("does not reserve %s", (name) => {
    expect(usernameProblems(name)).not.toContain("reserved");
  });
});
