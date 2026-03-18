#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
// Get the actual module directory (works with symlinks)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, "..");

const PORT = process.env.PORT || 6969;
const LAUNCH_CWD = process.cwd();

// --- Update source configuration ---
import { DEFAULT_UPDATE_SOURCE, FALLBACK_UPDATE_SOURCE, type UpdateSource } from "./update-sources";

// Read config from ~/.openui/config.json
function readConfig(): { updateChannel?: string; updateSource?: Partial<UpdateSource> } {
  try {
    const configPath = join(homedir(), ".openui", "config.json");
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch {}
  return {};
}

function getUpdateSource(): UpdateSource {
  const config = readConfig();
  if (config.updateSource) {
    return { ...DEFAULT_UPDATE_SOURCE, ...config.updateSource };
  }
  return DEFAULT_UPDATE_SOURCE;
}

// --- Auth detection ---

async function getGitHubToken(): Promise<string | null> {
  // Try gh auth token first (most Databricks devs have gh authenticated)
  try {
    const result = await $`gh auth token`.text().catch(() => "");
    const token = result.trim();
    if (token && token.length > 10) return token;
  } catch {}

  // Try GITHUB_TOKEN environment variable
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  return null;
}

// --- Plugin installation ---

function copyDirRecursive(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

async function ensurePluginInstalled() {
  const pluginDir = join(homedir(), ".openui", "claude-code-plugin");
  const pluginJson = join(pluginDir, ".claude-plugin", "plugin.json");

  if (existsSync(pluginJson)) {
    return; // Plugin already installed
  }

  console.log("\x1b[38;5;141m[plugin]\x1b[0m Installing Claude Code plugin...");

  // Try copying from local repo first (no network needed)
  const localPlugin = join(ROOT_DIR, "claude-code-plugin");
  if (existsSync(join(localPlugin, ".claude-plugin", "plugin.json"))) {
    try {
      copyDirRecursive(localPlugin, pluginDir);
      await $`chmod +x ${pluginDir}/hooks/status-reporter.sh`.quiet();
      console.log("\x1b[38;5;82m[plugin]\x1b[0m Plugin installed from local files!");
      return;
    } catch (e) {
      console.log("\x1b[38;5;208m[plugin]\x1b[0m Local copy failed, trying download...");
    }
  }

  // Fallback: download from GitHub
  const source = getUpdateSource();
  const ref = source.ref;
  const pluginPath = source.path ? `${source.path}/claude-code-plugin` : "claude-code-plugin";

  const token = await getGitHubToken();
  if (!token) {
    console.log("\x1b[38;5;208m[plugin]\x1b[0m No GitHub token found — cannot download plugin. Run 'gh auth login' to authenticate.");
    return;
  }
  const rawBase = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${ref}/${pluginPath}`;

  try {
    await $`mkdir -p ${pluginDir}/.claude-plugin ${pluginDir}/hooks`.quiet();
    await Promise.all([
      $`curl -sL -H ${"Authorization: token " + token} ${rawBase}/.claude-plugin/plugin.json -o ${pluginDir}/.claude-plugin/plugin.json`.quiet(),
      $`curl -sL -H ${"Authorization: token " + token} ${rawBase}/hooks/hooks.json -o ${pluginDir}/hooks/hooks.json`.quiet(),
      $`curl -sL -H ${"Authorization: token " + token} ${rawBase}/hooks/status-reporter.sh -o ${pluginDir}/hooks/status-reporter.sh`.quiet(),
    ]);
    await $`chmod +x ${pluginDir}/hooks/status-reporter.sh`.quiet();
    console.log("\x1b[38;5;82m[plugin]\x1b[0m Plugin installed successfully!");
  } catch (e) {
    console.error("\x1b[38;5;196m[plugin]\x1b[0m Failed to install plugin:", e);
  }
}

// --- API-based auto-updater ---

async function getTreeSha(source: UpdateSource, token: string | null): Promise<string | null> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  try {
    const url = `${source.apiBase}/repos/${source.owner}/${source.repo}/git/trees/${source.ref}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json() as { sha: string; tree: Array<{ path: string; sha: string }> };

    if (source.path === ".") {
      // Root of repo — use the tree SHA directly
      return data.sha ?? null;
    }

    // Find the subtree entry (e.g., openui/ in universe)
    const entry = data.tree.find((e: { path: string }) => e.path === source.path);
    return entry?.sha ?? null;
  } catch {
    return null;
  }
}

async function downloadUpdate(source: UpdateSource, token: string | null): Promise<boolean> {
  const tmp = `/tmp/openui-update-${Date.now()}`;
  try {
    const repoUrl = token
      ? `https://${token}@github.com/${source.owner}/${source.repo}.git`
      : `https://github.com/${source.owner}/${source.repo}.git`;

    const isSubdir = source.path !== ".";

    if (isSubdir) {
      // Sparse clone only the target directory (e.g., openui/ from universe)
      await $`git clone --filter=blob:none --sparse --depth=1 --branch ${source.ref} ${repoUrl} ${tmp}`.quiet();
      await $`git -C ${tmp} sparse-checkout set ${source.path}/`.quiet();
    } else {
      // Full shallow clone (e.g., JJ27/openui where the repo IS the project)
      await $`git clone --depth=1 --branch ${source.ref} ${repoUrl} ${tmp}`.quiet();
    }

    // Check if .git exists before rsync so we can verify it survives
    const hadGit = existsSync(join(ROOT_DIR, ".git"));

    const srcDir = isSubdir ? `${tmp}/${source.path}/` : `${tmp}/`;
    await $`rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='client/node_modules' --exclude='client/dist' --exclude='client/bun.lock' --exclude='bun.lock' --exclude='bin/update-sources.ts' ${srcDir} ${ROOT_DIR}/`.quiet();

    // Safety check: verify .git wasn't accidentally deleted
    if (hadGit && !existsSync(join(ROOT_DIR, ".git"))) {
      console.error(`\x1b[38;5;196m[update]\x1b[0m CRITICAL: .git directory was deleted during update! This is a bug.`);
    }

    return true;
  } catch (e) {
    console.log(`\x1b[38;5;208m[update]\x1b[0m Download failed: ${e}`);
    return false;
  } finally {
    // Clean up temp directory
    await $`rm -rf ${tmp}`.quiet().catch(() => {});
  }
}

async function rebuildClient() {
  console.log(`\x1b[38;5;141m[build]\x1b[0m Source code changed, rebuilding...`);

  // Reinstall deps (package.json may have changed)
  await $`cd ${ROOT_DIR} && bun install`.quiet();
  await $`cd ${join(ROOT_DIR, "client")} && bun install`.quiet();

  // Build client
  const buildProc = Bun.spawn(["bun", "run", "build"], {
    cwd: ROOT_DIR,
    stdio: ["inherit", "inherit", "inherit"],
  });
  await buildProc.exited;

  if (buildProc.exitCode === 0) {
    console.log(`\x1b[38;5;82m[build]\x1b[0m Client rebuilt successfully!\n`);
    return true;
  } else {
    console.error(`\x1b[38;5;196m[build]\x1b[0m Build failed. UI may be outdated.`);
    return false;
  }
}

async function tryUpdateFromSource(
  source: UpdateSource,
  token: string | null,
  treeShaFile: string,
  label: string
): Promise<boolean> {
  const treeSha = await getTreeSha(source, token);
  if (!treeSha) return false;

  // Compare with stored SHA
  const lastSha = existsSync(treeShaFile)
    ? readFileSync(treeShaFile, "utf8").trim()
    : "";

  if (treeSha === lastSha) return true; // Already up to date

  console.log(`\x1b[38;5;141m[update]\x1b[0m Update available, downloading from ${label}...`);

  const success = await downloadUpdate(source, token);
  if (success) {
    console.log(`\x1b[38;5;82m[update]\x1b[0m Files updated!`);
    const rebuilt = await rebuildClient();
    if (rebuilt) {
      await Bun.write(treeShaFile, treeSha);
    }
  }
  return true; // Source was reachable even if download/build failed
}

async function autoUpdateFromApi() {
  if (process.argv.includes("--no-update")) return;

  const dataDir = join(homedir(), ".openui");
  const treeShaFile = join(dataDir, ".build-tree-sha");
  mkdirSync(dataDir, { recursive: true });

  const token = await getGitHubToken();
  const source = getUpdateSource();

  // Try primary source (universe)
  const primaryOk = await tryUpdateFromSource(source, token, treeShaFile, `${source.owner}/${source.repo}`);
  if (primaryOk) return;

  // Primary failed — try fallback if configured
  if (FALLBACK_UPDATE_SOURCE) {
    console.log(`\x1b[38;5;245m[update]\x1b[0m Primary source unavailable, trying public fallback...`);
    const fallbackOk = await tryUpdateFromSource(FALLBACK_UPDATE_SOURCE, null, treeShaFile, `${FALLBACK_UPDATE_SOURCE.owner}/${FALLBACK_UPDATE_SOURCE.repo}`);
    if (fallbackOk) return;
  }

  // All sources failed
  if (!token) {
    console.log(`\x1b[38;5;208m[update]\x1b[0m No GitHub token — skipping update check. Run 'gh auth login' to enable auto-updates.`);
  }
}

// Legacy git-based auto-update (kept as additional fallback for standalone repo installs)
async function autoUpdateFromGit() {
  if (process.argv.includes("--no-update")) return;

  const gitDir = join(ROOT_DIR, ".git");
  if (!existsSync(gitDir)) return; // Not a standalone git clone

  // Check if this is a nested repo (universe) — skip git-based update
  // In universe, ROOT_DIR/.git won't exist (it's a subdirectory), so this check is redundant
  // but kept for clarity
  try {
    const parentGit = await $`git -C ${join(ROOT_DIR, "..")} rev-parse --git-dir`.text().catch(() => "");
    if (parentGit.trim()) return; // Nested in a larger repo — use API updater only
  } catch {}

  const dataDir = join(homedir(), ".openui");
  const buildCommitFile = join(dataDir, ".build-commit");

  const config = readConfig();
  const channel = config.updateChannel || "stable";
  const channelLabel = channel === "stable" ? "stable" : `${channel} (beta)`;
  console.log(`\x1b[38;5;245m[update]\x1b[0m Channel: ${channelLabel}`);
  try {
    await $`git -C ${ROOT_DIR} fetch origin ${channel} --quiet`.timeout(5000);

    const behind = (await $`git -C ${ROOT_DIR} rev-list HEAD..origin/${channel} --count`.text()).trim();
    if (parseInt(behind) > 0) {
      console.log(`\x1b[38;5;141m[update]\x1b[0m ${behind} new commit(s) on ${channelLabel}, pulling...`);
      const result = await $`git -C ${ROOT_DIR} pull --ff-only origin ${channel}`.quiet();
      if (result.exitCode !== 0) {
        console.log(`\x1b[38;5;208m[update]\x1b[0m Could not auto-update (local changes?). Run 'git pull' manually.`);
      } else {
        console.log(`\x1b[38;5;82m[update]\x1b[0m Updated to latest version!`);
      }
    }
  } catch {
    // No internet or fetch failed — continue with current code
  }

  // Check if rebuild is needed
  const currentHead = (await $`git -C ${ROOT_DIR} rev-parse HEAD`.text().catch(() => "")).trim();
  if (!currentHead) return;

  mkdirSync(dataDir, { recursive: true });
  const lastBuild = existsSync(buildCommitFile)
    ? readFileSync(buildCommitFile, "utf8").trim()
    : "";

  if (currentHead === lastBuild) return; // Build is up to date

  await rebuildClient();
  await Bun.write(buildCommitFile, currentHead);
}

// Clear screen and show ASCII art
console.clear();
console.log(`
\x1b[38;5;141m
    ██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗██╗███╗   ██╗ ██████╗
    ██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║██║████╗  ██║██╔════╝
    ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║██║██╔██╗ ██║██║  ███╗
    ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║██║██║╚██╗██║██║   ██║
    ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║██║██║ ╚████║╚██████╔╝
    ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝

    ██╗   ██╗ ██████╗ ██╗   ██╗██████╗      █████╗ ██╗
    ╚██╗ ██╔╝██╔═══██╗██║   ██║██╔══██╗    ██╔══██╗██║
     ╚████╔╝ ██║   ██║██║   ██║██████╔╝    ███████║██║
      ╚██╔╝  ██║   ██║██║   ██║██╔══██╗    ██╔══██║██║
       ██║   ╚██████╔╝╚██████╔╝██║  ██║    ██║  ██║██║
       ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝

     ██████╗ ██████╗ ███╗   ███╗███╗   ███╗ █████╗ ███╗   ██╗██████╗
    ██╔════╝██╔═══██╗████╗ ████║████╗ ████║██╔══██╗████╗  ██║██╔══██╗
    ██║     ██║   ██║██╔████╔██║██╔████╔██║███████║██╔██╗ ██║██║  ██║
    ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║╚██╗██║██║  ██║
    ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║██║ ╚████║██████╔╝
     ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝

     ██████╗███████╗███╗   ██╗████████╗███████╗██████╗
    ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔════╝██╔══██╗
    ██║     █████╗  ██╔██╗ ██║   ██║   █████╗  ██████╔╝
    ██║     ██╔══╝  ██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗
    ╚██████╗███████╗██║ ╚████║   ██║   ███████╗██║  ██║
     ╚═════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
\x1b[0m

\x1b[38;5;251m                    ╔═══════════════════════════════════════╗
                    ║                                       ║
                    ║   \x1b[1m\x1b[38;5;141mhttp://localhost:${PORT}\x1b[0m\x1b[38;5;251m                 ║
                    ║                                       ║
                    ╚═══════════════════════════════════════╝\x1b[0m

\x1b[38;5;245m                         Press Ctrl+C to stop\x1b[0m
`);

// Ensure plugin is installed and auto-update
await ensurePluginInstalled();

// Use API-based updater for all installs, with git-based fallback for standalone repos
await autoUpdateFromApi();
await autoUpdateFromGit();

// Fallback: build client if dist directory still doesn't exist
// (e.g. first clone with --no-update, or non-git install)
const clientDistPath = join(ROOT_DIR, "client", "dist");
if (!existsSync(clientDistPath)) {
  console.log("\x1b[38;5;141m[build]\x1b[0m Building client for first run...");
  const buildProc = Bun.spawn(["bun", "run", "build"], {
    cwd: ROOT_DIR,
    stdio: ["inherit", "inherit", "inherit"]
  });
  await buildProc.exited;
  if (buildProc.exitCode !== 0) {
    console.error("\x1b[38;5;196m[build]\x1b[0m Failed to build client");
    process.exit(1);
  }
  console.log("\x1b[38;5;82m[build]\x1b[0m Client built successfully!\n");
}

// Start the server with LAUNCH_CWD env var
// In production mode, OPENUI_QUIET suppresses verbose debug logs but high-level logs still show.
// In dev mode (--dev), all logs are visible.
const IS_DEV = process.env.NODE_ENV === "development" || process.argv.includes("--dev");
const server = Bun.spawn(["bun", "run", "server/index.ts"], {
  cwd: ROOT_DIR,
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, PORT: String(PORT), LAUNCH_CWD, OPENUI_QUIET: IS_DEV ? "" : "1" }
});

process.on("SIGINT", () => {
  server.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.kill();
  process.exit(0);
});

await server.exited;
