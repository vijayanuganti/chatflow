# Deploy ChatFlow to AWS EC2 (Ubuntu + Nginx + PM2).
# Usage:
#   .\scripts\deploy-aws.ps1
#   .\scripts\deploy-aws.ps1 -SshKey "C:\path\to\chatflow-aws.pem"
#   .\scripts\deploy-aws.ps1 -SkipGitPush
#
# Requires: SSH access to the EC2 instance, repo at /home/ubuntu/chatflow on the server.

param(
    [string]$SshHost = "ubuntu@3.108.152.171",
    [string]$SshKey = "",
    [string]$RemoteDir = "/home/ubuntu/chatflow",
    [string]$PublicUrl = "https://vijay-chatflow.duckdns.org",
    [switch]$SkipGitPush
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $SshKey) {
    $candidates = @(
        "$env:USERPROFILE\OneDrive\Documents\chatflow-aws.pem",
        "$env:USERPROFILE\.ssh\chatflow-aws.pem",
        (Join-Path $RepoRoot "chatflow-aws.pem"),
        (Join-Path $RepoRoot "scripts\chatflow-aws.pem")
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            $SshKey = $candidate
            break
        }
    }
}

if (-not $SshKey -or -not (Test-Path $SshKey)) {
    throw "AWS SSH key not found. Pass -SshKey or place chatflow-aws.pem in OneDrive\Documents or .ssh."
}

function Invoke-Ssh([string]$RemoteCmd) {
    $sshArgs = @("-i", $SshKey, "-o", "StrictHostKeyChecking=accept-new", $SshHost, $RemoteCmd)
    & ssh @sshArgs
    if ($LASTEXITCODE -ne 0) { throw "SSH failed (exit $LASTEXITCODE)" }
}

Write-Host "==> ChatFlow AWS deploy -> $SshHost ($RemoteDir)" -ForegroundColor Cyan
Write-Host "==> Using SSH key: $SshKey" -ForegroundColor DarkGray

if (-not $SkipGitPush) {
    Push-Location $RepoRoot
    $status = git status --porcelain 2>$null
    if ($status) {
        Write-Warning "You have uncommitted local changes. Commit/push first, or pass -SkipGitPush."
    }
    $branch = git branch --show-current
    Write-Host "==> git push origin $branch"
    git push origin $branch
    Pop-Location
}

$deployScript = @"
set -e
if [[ ! -f /swapfile ]]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
chmod o+x /home/ubuntu /home/ubuntu/chatflow /home/ubuntu/chatflow/frontend
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
export NODE_OPTIONS="--max-old-space-size=1536"
npm run build
chmod -R o+rX build
echo '==> nginx reload'
sudo nginx -t
sudo systemctl reload nginx
echo '==> done'
"@

Write-Host "==> Running remote deploy..." -ForegroundColor Cyan
Invoke-Ssh $deployScript
Write-Host "==> AWS deploy complete: $PublicUrl" -ForegroundColor Green
