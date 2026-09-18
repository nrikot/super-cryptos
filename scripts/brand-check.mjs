#!/usr/bin/env node
/**
 * Brand-asset check: warns if the app is missing common social/share assets.
 *
 *   node scripts/brand-check.mjs [--root <dir>]
 */
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAX_CARD_BYTES = 600 * 1024;

export function computeBrandWarnings({ hasCanvas, workspaceRoot = process.cwd() }) {
  const warnings = [];
  const cardPath = [
    join(workspaceRoot, "public/og.jpg"),
    join(workspaceRoot, "public/og.png"),
  ].find(existsSync);

  if (cardPath !== undefined && statSync(cardPath).size > MAX_CARD_BYTES) {
    warnings.push(
      `BRAND WARNING: ${cardPath} is over 600 KB — link scrapers time out or skip images this heavy. Re-encode as JPEG (ffmpeg -q:v 4).`,
    );
  }

  if (!existsSync(join(workspaceRoot, "public/favicon.svg")) && !existsSync(join(workspaceRoot, "public/favicon.png"))) {
    warnings.push("BRAND NOTE: no public/favicon.svg or favicon.png — the browser tab will show a default icon.");
  }

  return warnings;
}

export function parseBrandCheckArgs(argv) {
  const usage = "usage: node scripts/brand-check.mjs [--root <dir>]";
  let root = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") {
      root = argv[++i];
      if (root === undefined) return { error: `--root needs a directory — ${usage}` };
    } else {
      return { error: `unexpected argument: ${argv[i]} — ${usage}` };
    }
  }
  return { root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseBrandCheckArgs(process.argv.slice(2));
  if (args.error) {
    console.error(JSON.stringify({ ok: false, error: args.error }, null, 2));
    process.exit(1);
  }
  const workspaceRoot = args.root ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const messages = computeBrandWarnings({ hasCanvas: false, workspaceRoot });
  const warnings = messages.filter((m) => m.startsWith("BRAND WARNING:"));
  console.log(
    JSON.stringify(
      {
        ok: warnings.length === 0,
        workspaceRoot,
        warnings: warnings.length,
        messages,
      },
      null,
      2,
    ),
  );
  process.exitCode = warnings.length === 0 ? 0 : 1;
}
