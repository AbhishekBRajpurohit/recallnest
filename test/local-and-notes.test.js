import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const dir = await mkdtemp(join(tmpdir(), "brain-notes-"));
process.env.DB_PATH = join(dir, "test.sqlite");

const { readingStats, filterLocal } = await import("../public/local.js");
const { clean } = await import("../src/notes.js");
const { db } = await import("../src/db.js");

test.after(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

test("readingStats formats word count and estimated minutes", () => {
  assert.deepEqual(readingStats(""), {
    words: 0,
    minutes: 1,
    label: "0 words · 1 min read",
  });
  assert.deepEqual(readingStats("hello"), {
    words: 1,
    minutes: 1,
    label: "1 word · 1 min read",
  });
  const longText = Array.from({ length: 250 }, (_, i) => `word${i}`).join(" ");
  assert.deepEqual(readingStats(longText), {
    words: 250,
    minutes: 2,
    label: "250 words · 2 min read",
  });
});

test("filterLocal matches query words, folder hierarchy, tags, collections, and excludes deleted", () => {
  const notes = [
    {
      id: "1",
      title: "Deadlock Prevention",
      body: "Banker algorithm and resource ordering",
      tags: ["os", "exam"],
      folder: "College/OS",
      collection: "Placement",
      updated: 100,
      deleted: 0,
    },
    {
      id: "2",
      title: "SQL Joins",
      body: "Inner and outer joins in Postgres",
      tags: ["dbms"],
      folder: "College/DBMS",
      collection: "Placement",
      updated: 300,
      deleted: 0,
    },
    {
      id: "3",
      title: "Old Deleted Note",
      body: "Should never appear",
      tags: ["os"],
      folder: "College/OS",
      collection: "Placement",
      updated: 500,
      deleted: 1,
    },
    {
      id: "4",
      title: "College2 Notes",
      body: "Different root folder",
      tags: ["misc"],
      folder: "College2",
      collection: "Other",
      updated: 200,
      deleted: 0,
    },
  ];

  // Empty filters return non-deleted notes sorted newest first
  assert.deepEqual(
    filterLocal(notes, "", "", "", "").map((n) => n.id),
    ["2", "4", "1"],
  );

  // Multi-word search across title/body/tags
  assert.deepEqual(
    filterLocal(notes, "banker os", "", "", "").map((n) => n.id),
    ["1"],
  );

  // Folder prefix matches exact folder and descendants, not College2
  assert.deepEqual(
    filterLocal(notes, "", "College", "", "").map((n) => n.id),
    ["2", "1"],
  );

  // Tag + collection filtering
  assert.deepEqual(
    filterLocal(notes, "", "", "dbms", "Placement").map((n) => n.id),
    ["2"],
  );
});

test("clean normalizes note metadata and rejects invalid inputs", () => {
  const normalized = clean({
    title: "  Spring Boot Basics  ",
    body: "Dependency injection and REST controllers",
    url: "https://spring.io/guides",
    tags: "Java, spring, JAVA, ",
    folder: " Backend / Java / ",
    collection: " Internship ",
  });
  assert.deepEqual(normalized, {
    title: "Spring Boot Basics",
    body: "Dependency injection and REST controllers",
    url: "https://spring.io/guides",
    tags: ["java", "spring"],
    folder: "Backend/Java",
    collection: "Internship",
  });

  assert.throws(() => clean({ title: "   ", body: "empty title" }), { status: 400 });
  assert.throws(
    () => clean({ title: "Bad URL", url: "javascript:alert(1)" }),
    { status: 400 },
  );
  assert.throws(
    () =>
      clean({
        title: "Too many tags",
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }),
    { status: 400 },
  );
});
