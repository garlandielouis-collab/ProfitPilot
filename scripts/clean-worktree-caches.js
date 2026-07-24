// Runs before `npm run dev` to free disk space by deleting .next caches
// from other inactive worktrees. Prevents disk-full 404s in Next.js dev mode.
const fs   = require('fs');
const path = require('path');

const currentWorktree = path.basename(path.resolve(__dirname, '..'));
const worktreesDir    = path.resolve(__dirname, '..', '..', '..', '.claude', 'worktrees');

// Check free disk space (Windows)
function getFreeBytesWindows() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('wmic logicaldisk where DeviceID="C:" get FreeSpace /value', { encoding: 'utf8' });
    const match = out.match(/FreeSpace=(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  } catch {
    return Infinity;
  }
}

const FREE_THRESHOLD_GB = 2; // clean if below 2 GB free

try {
  const freeBytes = getFreeBytesWindows();
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
