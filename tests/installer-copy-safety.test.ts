import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  mkdtempSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyDir } from "../src/installer.js";

/**
 * A plugin's files are remote input. `copyDir` is the only place that reads a
 * whole plugin tree and writes it into the user's `~/.agents/skills/`, so it is
 * the choke point for "never read anything outside the plugin we just cloned".
 *
 * Without that rule, a marketplace plugin can put a symlink (or a Windows
 * junction) inside `skills/<name>/` and have install exfiltrate any readable
 * local file into a location that Pi will later load.
 */
describe("copyDir refuses to read outside the plugin root", () => {
  let root: string;
  let pluginRoot: string;
  let outside: string;
  let dest: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pi-copy-safety-"));
    pluginRoot = join(root, "plugin");
    outside = join(root, "outside");
    dest = join(root, "dest");

    mkdirSync(join(pluginRoot, "skills", "demo"), { recursive: true });
    writeFileSync(join(pluginRoot, "skills", "demo", "SKILL.md"), "# real skill\n");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "secret.env"), "TOKEN=topsecret\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("copies an ordinary skill tree", () => {
    copyDir(join(pluginRoot, "skills", "demo"), dest, pluginRoot);

    expect(readFileSync(join(dest, "SKILL.md"), "utf-8")).toBe("# real skill\n");
  });

  it("refuses a skill file that is a symlink to a file outside the plugin", () => {
    symlinkSync(join(outside, "secret.env"), join(pluginRoot, "skills", "demo", ".env"), "file");

    expect(() => copyDir(join(pluginRoot, "skills", "demo"), dest, pluginRoot)).toThrow(
      /outside the plugin root/i
    );
  });

  it("refuses a skill directory that is a symlink to a directory outside the plugin", () => {
    symlinkSync(outside, join(pluginRoot, "skills", "demo", "nested"), "dir");

    expect(() => copyDir(join(pluginRoot, "skills", "demo"), dest, pluginRoot)).toThrow(
      /outside the plugin root/i
    );
  });

  it("does not leave a partially copied skill behind when it refuses", () => {
    symlinkSync(join(outside, "secret.env"), join(pluginRoot, "skills", "demo", ".env"), "file");

    expect(() => copyDir(join(pluginRoot, "skills", "demo"), dest, pluginRoot)).toThrow(
      /outside the plugin root/i
    );
    // Nothing is written at all when the level is refused, so no half-installed skill.
    expect(existsSync(dest)).toBe(false);
  });
});
