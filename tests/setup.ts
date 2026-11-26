import { join } from "path";
import { tmpdir } from "os";

// Each test worker gets its own directory so parallel forks never touch the same
// registry file. Must run before any test file imports src/types.js, which reads
// PI_TEST_DIR at import time.
process.env.PI_TEST_DIR = join(tmpdir(), "pi-copilot-plugins-test", String(process.pid));
