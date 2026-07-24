# Run this script from Windows PowerShell if pwsh is not installed:
# powershell.exe -ExecutionPolicy Bypass -File .\scripts\restore_claude_changes.ps1 -Branch 'claude/beautiful-varahamihira-207b79' -AutoStash -Push
param(
  [string]$Branch = 'claude/beautiful-varahamihira-207b79',
  [switch]$AutoStash,
  [switch]$Push
)

# Fail fast and create a transcript log for diagnostics
$ErrorActionPreference = 'Stop'
$LogFile = Join-Path -Path $PSScriptRoot -ChildPath 'restore_claude_changes.log'
if (Test-Path $LogFile) { Remove-Item $LogFile -ErrorAction SilentlyContinue }
Start-Transcript -Path $LogFile -Force | Out-Null

function Die($msg){
  Write-Error $msg
  Write-Error "LastExitCode: $LASTEXITCODE"
  if ($Error.Count -gt 0) { Write-Error "Last error: $($Error[0].Exception.Message)" }
  Stop-Transcript | Out-Null
  Exit 1
}

trap {
  $global:err = $_
  Die("Unhandled exception: $($_.Exception.Message)")
}
Write-Host "Ensuring git is available..."
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
  $gitCmd = Get-Command git.exe -ErrorAction SilentlyContinue
}
if (-not $gitCmd) {
  $possiblePaths = @(
    "$Env:ProgramFiles\Git\cmd\git.exe",
    "$Env:ProgramFiles(x86)\Git\cmd\git.exe",
    "$Env:ProgramFiles\Git\bin\git.exe",
    "$Env:ProgramFiles(x86)\Git\bin\git.exe"
  )
  foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
      $gitCmd = @{ Source = $path }
      break
    }
  }
}
if (-not $gitCmd) {
  Die 'git not found in PATH. Open a terminal where Git is installed and available, or install Git for Windows: https://git-scm.com/download/win. If you are using Bash in VS Code, use Git Bash or Windows PowerShell instead.'
}

Write-Host "Using git from: $($gitCmd.Source)"
Write-Host 'Fetching refs...'
& $gitCmd.Source fetch --all --prune

$porcelain = git status --porcelain
if ($porcelain) {
  if ($AutoStash) {
    Write-Host 'Stashing local changes...'
    git stash push -m "auto-stash-before-restore-$(Get-Date -UFormat %s)" | Out-Null
    $stashed = $true
  } else { Die 'You have uncommitted changes. Re-run with -AutoStash or commit/stash them first.' }
}

Write-Host "Switching to 'main' and pulling latest..."
git switch main
try { git pull --rebase origin main } catch { }
$backupBranch = "backup/main-before-claude-$(Get-Date -UFormat %s)"
Write-Host "Creating backup branch: $backupBranch"
git switch -c $backupBranch

$integrateBranch = "integrate/claude-$((($Branch -replace '[^a-zA-Z0-9]','-')))-$(Get-Date -UFormat %s)"
Write-Host "Creating integration branch: $integrateBranch"
git switch -c $integrateBranch

Write-Host "Merging $Branch into $integrateBranch"
$mergeExit = git merge --no-ff $Branch
if ($LASTEXITCODE -ne 0) { Die 'Merge reported conflicts. Resolve them, then run: git add <files>; git commit' }

Write-Host 'Files changed by merge:'
git --no-pager diff --name-only $backupBranch..$integrateBranch

if (Test-Path package.json) {
  Write-Host 'Installing dependencies (npm ci)...'
  try {
    npm ci
  } catch {
    Die 'npm ci failed — fix dependency installation before continuing.'
  }

  Write-Host 'Running build...'
  if (npm run build) {
    Write-Host 'Build succeeded.'
  } else {
    Die 'Build failed — inspect errors above.'
  }
} else { Write-Host 'No package.json found — skipping npm build steps.' }

$confirm = Read-Host "Integration branch ready. Merge into 'main' now? [y/N]"
if ($confirm -match '^[Yy]') {
  git switch main
  git merge --no-ff $integrateBranch
  if ($Push) { git push origin main } else { Write-Host "Merged locally; to push to origin: git push origin main" }
} else { Write-Host "Merge into 'main' skipped. You can test further on $integrateBranch or merge later." }

if ($stashed) { Write-Host 'You had auto-stashed changes. To reapply: git stash pop' }
Write-Host "Done. Integration branch: $integrateBranch   Backup branch: $backupBranch"
