# Deploy ChatFlow to OCI VPS (Ubuntu + Nginx + PM2).
# Usage:
#   .\scripts\deploy-oci.ps1
#   .\scripts\deploy-oci.ps1 -SshHost "ubuntu@140.245.209.196" -SshKey "$env:USERPROFILE\.ssh\id_rsa"
#
# Requires: SSH access to the VM, repo at /home/ubuntu/chatflow on the server.

param(
    [string]$SshHost = "ubuntu@140.245.209.196",
    [string]$SshKey = "",
    [string]$RemoteDir = "/home/ubuntu/chatflow",
    [switch]$SkipGitPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Invoke-Ssh([string]$RemoteCmd) {
    $sshArgs = @()
    if ($SshKey -and (Test-Path $SshKey)) {
        $sshArgs += @("-i", $SshKey)
    }
    $sshArgs += $SshHost, $RemoteCmd
    & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) { throw "SSH failed (exit $LASTEXITCODE): $RemoteCmd" }
}

Write-Host "==> ChatFlow OCI deploy -> $SshHost ($RemoteDir)" -ForegroundColor Cyan

if (-not $SkipGitPush) {
    Push-Location $RepoRoot
    $status = git status --porcelain 2>$null
    if ($status) {
        Write-Warning "You have uncommitted local changes. Commit/push first, or pass -SkipGitPush to deploy only what's already on the server remote."
    }
    $branch = git branch --show-current
    Write-Host "==> git push origin $branch"
    git push origin $branch
    Pop-Location
}

$deployScript = @"
set -e
cd $RemoteDir
echo '==> git pull'
git checkout -- frontend/yarn.lock 2>/dev/null || true
git stash push -m deploy-autostash -- frontend/yarn.lock 2>/dev/null || true
git pull --ff-only
echo '==> backend deps'
cd backend
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate
echo '==> pm2 restart'
pm2 restart chatflow-backend --update-env || pm2 start ecosystem.config.cjs
pm2 save
echo '==> frontend build'
cd ../frontend
npm install --no-audit --no-fund
npm run build
echo '==> nginx reload'
sudo nginx -t
sudo systemctl reload nginx
echo '==> done'
"@

Write-Host "==> Running remote deploy..." -ForegroundColor Cyan
Invoke-Ssh $deployScript
Write-Host "==> OCI deploy complete: https://140-245-209-196.sslip.io" -ForegroundColor Green
