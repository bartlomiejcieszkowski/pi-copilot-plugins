import { describe, it, expect } from "vitest";
import { parseSpec } from "../src/commands.js";

describe("parseSpec", () => {
  it("parses marketplace format", () => {
    // This will fail if marketplace is not registered, so we test the error path
    const result = parseSpec("plugin-name");
    expect(result.name).toBe("plugin-name");
    expect(result.source.type).toBe("marketplace");
  });

  it("parses GitHub repo", () => {
    const result = parseSpec("owner/repo");
    expect(result.name).toBe("repo");
    expect(result.source.type).toBe("github");
    if (result.source.type === "github") {
      expect(result.source.repo).toBe("owner/repo");
    }
  });

  it("parses GitHub repo with subdirectory", () => {
    const result = parseSpec("owner/repo:plugins/subdir");
    expect(result.name).toBe("subdir");
    expect(result.source.type).toBe("github");
    if (result.source.type === "github") {
      expect(result.source.repo).toBe("owner/repo");
      expect(result.source.path).toBe("plugins/subdir");
    }
  });

  it("parses git URL", () => {
    const result = parseSpec("https://github.com/owner/repo.git");
    expect(result.name).toBe("repo");
    expect(result.source.type).toBe("git");
    if (result.source.type === "git") {
      expect(result.source.url).toBe("https://github.com/owner/repo.git");
    }
  });

  it("parses local path", () => {
    const result = parseSpec("./my-plugin");
    expect(result.name).toBe("my-plugin");
    expect(result.source.type).toBe("local");
  });

  it("parses absolute local path", () => {
    const result = parseSpec("/home/user/my-plugin");
    expect(result.name).toBe("my-plugin");
    expect(result.source.type).toBe("local");
  });
});
