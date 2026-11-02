import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Runs the real updater against a model-output fixture inside a throwaway copy of the repo.
test("updater keeps valid items, drops disallowed/invalid ones, and dedupes on re-run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lcs-"));
  try {
    cpSync(path.resolve("scripts"), path.join(dir, "scripts"), { recursive: true });
    cpSync(path.resolve("site/data"), path.join(dir, "site/data"), { recursive: true });
    cpSync(path.resolve("node_modules"), path.join(dir, "node_modules"), { recursive: true });
    cpSync(path.resolve("package.json"), path.join(dir, "package.json"));
    const fixture = { items: [
      { title: "Valid official announcement", summary: "This is a perfectly valid summary of an item.", why_it_matters: "Because it is useful.", url: "https://kubernetes.io/blog/", category: "cloud", level: "intermediate", tags: ["k8s"], published: "2026-11-01" },
      { title: "Sneaky unwanted site item", summary: "This summary is long enough but the site is not trusted.", url: "https://evil.example/post", category: "ai" },
      { title: "Shortener link item here", summary: "This summary is long enough but it is a blocked shortener.", url: "https://bit.ly/abc", category: "ai" } ],
      trending: [{ topic: "Agent security", why: "Prompt injection matters.", track: "ai" }] };
    const f = path.join(dir, "fixture.json"); writeFileSync(f, "Here you go:\n" + JSON.stringify(fixture));
    const run = () => execFileSync("node", ["scripts/update-news.mjs", "--mock", f], { cwd: dir, encoding: "utf8" });
    const out = run();
    assert.match(out, /accepted 1, rejected 2/);
    const news = JSON.parse(readFileSync(path.join(dir, "site/data/news.json"), "utf8"));
    assert.equal(news.items.length, 1);
    assert.equal(news.items[0].source, "kubernetes.io");
    assert.equal(news.trending.length, 1);
    run();
    assert.equal(JSON.parse(readFileSync(path.join(dir, "site/data/news.json"), "utf8")).items.length, 1);
    execFileSync("node", ["scripts/validate-content.mjs"], { cwd: dir });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
