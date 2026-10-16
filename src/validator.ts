import { yellow, bold } from "./colors.js";

const SCHEMA_1_0_0 = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

/**
 * Validate a plugin manifest against Agent Plugins 1.0.0 spec.
 * Returns true if valid, false if validation failed.
 * Only validates manifests targeting 1.0.0 — returns true immediately for other versions.
 */
export function validateManifest(manifest: Record<string, unknown>): boolean {
  // Only validate 1.0.0 manifests
  const schema = manifest["$schema"];
  if (typeof schema !== "string" || schema !== SCHEMA_1_0_0) {
    // Not a 1.0.0 manifest — skip validation
    return true;
  }

  // §5.3 Required fields (name is required; $schema is guaranteed 1.0.0 by now)
  if (!("name" in manifest)) {
    console.warn(
      yellow(bold("⚠ Warning:")) + " Missing required field 'name'."
    );
    valid = false;
  } else if (typeof manifest["name"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'name' must be a string."
    );
    valid = false;
  } else {
    const name = manifest["name"] as string;
    // §5.5 Name constraints
    if (name.length < 1 || name.length > 64) {
      console.warn(
        yellow(bold("⚠ Warning:")) + ` Plugin name "${name}" must be 1-64 characters (got ${name.length}).`
      );
      valid = false;
    }
    if (!/^[a-z0-9][a-z0-9.\-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + ` Plugin name "${name}" must be lowercase alphanumeric, hyphens, and periods, starting and ending with alphanumeric.`
      );
      valid = false;
    }
    if (/--|\.\./.test(name)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + ` Plugin name "${name}" must not contain consecutive hyphens (--) or consecutive periods (..).`
      );
      valid = false;
    }
  }

  // §5.4 Metadata fields — type checks only
  if ("version" in manifest && typeof manifest["version"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'version' must be a string."
    );
    valid = false;
  }
  if ("description" in manifest && typeof manifest["description"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'description' must be a string."
    );
    valid = false;
  }
  if ("author" in manifest) {
    const author = manifest["author"];
    if (typeof author !== "object" || author === null || Array.isArray(author)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + " 'author' must be an object with optional name, email, and url string fields."
      );
      valid = false;
    } else {
      for (const key of Object.keys(author as Record<string, unknown>)) {
        if (!["name", "email", "url"].includes(key)) {
          console.warn(
            yellow(bold("⚠ Warning:")) + ` 'author' contains unknown field '${key}'.`
          );
        }
      }
      for (const key of ["name", "email", "url"]) {
        if (key in (author as Record<string, unknown>) && typeof (author as Record<string, unknown>)[key] !== "string") {
          console.warn(
            yellow(bold("⚠ Warning:")) + ` 'author.${key}' must be a string.`
          );
          valid = false;
        }
      }
    }
  }
  if ("homepage" in manifest && typeof manifest["homepage"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'homepage' must be a string."
    );
    valid = false;
  }
  if ("repository" in manifest && typeof manifest["repository"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'repository' must be a string."
    );
    valid = false;
  }
  if ("license" in manifest && typeof manifest["license"] !== "string") {
    console.warn(
      yellow(bold("⚠ Warning:")) + " 'license' must be a string."
    );
    valid = false;
  }
  if ("keywords" in manifest) {
    const keywords = manifest["keywords"];
    if (!Array.isArray(keywords)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + " 'keywords' must be an array of strings."
      );
      valid = false;
    } else {
      for (let i = 0; i < keywords.length; i++) {
        if (typeof keywords[i] !== "string") {
          console.warn(
            yellow(bold("⚠ Warning:")) + ` 'keywords[${i}]' must be a string.`
          );
          valid = false;
        }
      }
    }
  }

  // §5.6 Extensions field
  if ("extensions" in manifest) {
    const extensions = manifest["extensions"];
    if (typeof extensions !== "object" || extensions === null || Array.isArray(extensions)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + " 'extensions' must be an object. Ignoring."
      );
      // Non-object extensions: report and ignore, continue loading (non-fatal)
      delete manifest["extensions"];
    } else {
      for (const [ns, value] of Object.entries(extensions as Record<string, unknown>)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          console.warn(
            yellow(bold("⚠ Warning:")) + ` Extension namespace '${ns}' value must be an object. Ignoring.`
          );
        }
      }
    }
  }

  // §5.2 Unknown fields — report and ignore (non-fatal)
  const allowedFields = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
  for (const key of Object.keys(manifest)) {
    if (!allowedFields.has(key)) {
      console.warn(
        yellow(bold("⚠ Warning:")) + ` Unknown field '${key}'. Ignoring per Agent Plugins 1.0.0 §5.2.`
      );
    }
  }

  return valid;
}
