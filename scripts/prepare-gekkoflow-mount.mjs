#!/usr/bin/env node
/**
 * Build Kruispad artifacts for mounting into the GekkoFlow Vercel project.
 * Output: mount/public/kruispad/** and mount/api/kruispad/{notify,action}.js
 *
 * Usage: pnpm run prepare:gekkoflow-mount
 * Host: set KRUISPAD_MOUNT to this mount/ path (or copy into GekkoFlow).
 */
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mountRoot = path.join(root, "mount");
const publicOut = path.join(mountRoot, "public", "kruispad");
const apiOut = path.join(mountRoot, "api", "kruispad");

rmSync(mountRoot, { recursive: true, force: true });
mkdirSync(publicOut, { recursive: true });
mkdirSync(apiOut, { recursive: true });

const build = spawnSync("pnpm", ["exec", "vite", "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_BASE_PATH: "/kruispad/" },
  shell: process.platform === "win32",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const dist = path.join(root, "dist");
if (!existsSync(dist)) {
  console.error("vite build did not produce dist/");
  process.exit(1);
}
cpSync(dist, publicOut, { recursive: true });

await esbuild.build({
  entryPoints: {
    notify: path.join(root, "api/notify.ts"),
    action: path.join(root, "api/action.ts"),
  },
  outdir: apiOut,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  packages: "external",
  sourcemap: false,
  logLevel: "info",
});

console.log("Prepared mount at", mountRoot);
console.log("  SPA →", publicOut);
console.log("  API →", apiOut);
