import { describe, expect, test } from "bun:test";
import { AppDatabase } from "../src/db";
import { DigestBuilder } from "../src/digest";

describe("DigestBuilder", () => {
  test("suppresses empty digest", () => {
    const db = new AppDatabase(":memory:");
    db.init();
    const digest = new DigestBuilder(db, "America/Los_Angeles").build(new Date("2026-03-19T18:00:00Z"));
    expect(digest).toBeNull();
  });
});
