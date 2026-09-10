// Runs before `npm run dev` to free disk space by deleting .next caches
// from other inactive worktrees. Prevents disk-full 404s in Next.js dev mode.
const fs   = require('fs');
const path = require('path');

const currentWorktree = path.basename(path.resolve(__dirname, '..'));
// Worktrees live in <repo>/.claude/worktrees — one level up from scripts/, not three.
const worktreesDir    = path.resolve(__dirname, '..', '.claude', 'worktrees');

// Free space on the volume holding the repo. `fs.statfsSync` asks the OS
// directly — `wmic` was removed from Windows 11, and its absence made this
// return Infinity, so the cleanup below never ran when it was needed.
function getFreeBytes() {
  try {
    const st = fs.statfsSync(path.resolve(__dirname, '..'));
    return st.bavail * st.bsize;
  } catch {
    return Infinity;
  }
}

// A single .next cache here can reach ~2.7 GB, so trigger well before the disk
// is actually tight — at 2 GB the build can already fail mid-write.
const FREE_THRESHOLD_GB = 6; // clean if below 6 GB free

try {
  const freeBytes = getFreeBytes();
  const freeGB    = freeBytes / (1024 ** 3);

  if (freeGB >= FREE_THRESHOLD_GB) {
    // Plenty of space — skip
    process.exit(0);
  }

  if (!fs.existsSync(worktreesDir)) process.exit(0);

  const dirs = fs.readdirSync(worktreesDir);
  let freed = 0;

  for (const dir of dirs) {
    if (dir === currentWorktree) continue; // never delete the active worktree
    const nextDir = path.join(worktreesDir, dir, '.next');
    if (fs.existsSync(nextDir)) {
      try {
        fs.rmSync(nextDir, { recursive: true, force: true });
        freed++;
      } catch (e) {
        // ignore individual failures
      }
    }
  }

  if (freed > 0) {
    console.log(`[predev] Low disk space (${freeGB.toFixed(1)} GB free) — cleaned .next from ${freed} inactive worktree(s).`);
  }
} catch {
  // Never block dev server startup
}
