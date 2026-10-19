// Backup utility for creating timestamped backups before file modifications.
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Create a timestamped backup of a file or directory.
 * Returns the backup path, or null if backup was skipped.
 */
export function createBackup(
  sourcePath: string,
  backupBase?: string
): string | null {
  if (!existsSync(sourcePath)) {
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseName = sourcePath.split(/[/\\]/).pop() || "backup";
  const backupDir = backupBase || `${sourcePath}.bak`;

  mkdirSync(backupDir, { recursive: true });

  if (existsSync(sourcePath) && !existsSync(join(sourcePath, "..", ".git"))) {
    // It's likely a file (not a directory)
    const backupPath = join(backupDir, `${baseName}.${timestamp}.bak`);
    copyFileSync(sourcePath, backupPath);
    return backupPath;
  }

  // It's a directory - copy the whole thing
  const backupPath = join(backupDir, `${baseName}.${timestamp}`);
  copyFileSync(sourcePath, backupPath);
  return backupPath;
}

/**
 * Create backups of multiple files before a batch operation.
 */
export function createBackups(paths: string[], backupBase?: string): string[] {
  const backups: string[] = [];
  for (const path of paths) {
    const backup = createBackup(path, backupBase);
    if (backup) {
      backups.push(backup);
    }
  }
  return backups;
}
