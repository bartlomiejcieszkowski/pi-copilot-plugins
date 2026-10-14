import { setTestPaths, resetTestPaths } from "../src/types.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

let testDir: string;

beforeAll(() => {
  testDir = mkdtempSync(join(tmpdir(), "pi-copilot-plugins-test-"));
  setTestPaths({
    piAgentDir: testDir,
    mcpJson: join(testDir, "mcp.json"),
    copilotPluginsJson: join(testDir, "copilot-plugins.json"),
    pluginCacheDir: join(testDir, "copilot-plugins-cache"),
    pluginDataDir: join(testDir, "copilot-plugins-data"),
    agentsDir: join(testDir, ".agents"),
    skillsDir: join(testDir, ".agents", "skills"),
    agentsSkillsDir: join(testDir, ".agents", "agents"),
  });
});

afterAll(() => {
  resetTestPaths();
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});
