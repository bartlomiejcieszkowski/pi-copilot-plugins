import { basename, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

/** Protocols that may be handed to `git clone` without executing anything. */
const ALLOWED_GIT_PROTOCOLS = ["https:", "ssh:"];

/**
 * Characters that have no business being in a repository url. They are the ones
 * a shell would interpret, and they also break `git`'s own url parsing.
 */
const UNSAFE_URL_CHARS = /[\s"'`$;&|<>()*\\]/;

/** scp-like ssh form: `git@host:path/to/repo.git` */
const SCP_LIKE_SSH_URL = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+$/;

function unsafeUrl(url: string, why: string): Error {
  return new Error(`Unsafe git url: ${why} ("${url}")`);
}

/**
 * Validate a repository url that is about to be passed to `git clone`.
 * Marketplace manifests are remote input, so anything that could make `git`
 * spawn a command (the `ext::` transport) or that would not survive being
 * written into a config file unquoted is rejected here.
 */
export function validateGitUrl(url: string): string {
  if (!url) throw unsafeUrl(url, "is empty");
  if (url.startsWith("-")) throw unsafeUrl(url, "starts with an option flag");
  if (UNSAFE_URL_CHARS.test(url)) throw unsafeUrl(url, "contains shell syntax or whitespace");

  if (SCP_LIKE_SSH_URL.test(url)) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw unsafeUrl(url, "is not a parseable url");
  }

  if (!ALLOWED_GIT_PROTOCOLS.includes(parsed.protocol)) {
    throw unsafeUrl(url, `protocol "${parsed.protocol}" is not allowed, use https:// or ssh://`);
  }
  if (!parsed.hostname) throw unsafeUrl(url, "has no host");

  return url;
}

/**
 * Throw unless `target` resolves to `root` or below it, after unwinding
 * symlinks and junctions. Plugin trees are remote input, so a path inside a
 * cloned repository is only trusted once we know where it actually points.
 */
export function assertPathWithinRoot(root: string, target: string): void {
  const realRoot = realpathSync(root);
  const realTarget = realpathSync(target);

  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    throw new Error(
      `Refusing to install plugin component "${basename(target)}": it resolves outside the plugin root` +
        ` (${realTarget})`
    );
  }
}

/**
 * An `owner/repo` slug that is safe to interpolate into a github url or path.
 */
export function isSafeRepoSlug(slug: string): boolean {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(slug);
}

/**
 * Resolve a repository-relative sub path and assert it stays under `base`.
 */
export function resolveSubPathUnder(base: string, subPath: string): string {
  const baseResolved = resolve(base);
  const candidate = resolve(baseResolved, subPath);

  if (candidate !== baseResolved && !candidate.startsWith(baseResolved + sep)) {
    throw new Error(`Sub path "${subPath}" escapes the cache directory`);
  }

  return candidate;
}
