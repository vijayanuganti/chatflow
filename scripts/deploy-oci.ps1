# DEPRECATED — ChatFlow production runs on AWS EC2, not OCI.
# This script forwards to deploy-aws.ps1. Do not use the old OCI host.

Write-Warning "deploy-oci.ps1 is deprecated. Deploying to AWS instead (see deploy-aws.ps1)."
& (Join-Path $PSScriptRoot "deploy-aws.ps1") @args
exit $LASTEXITCODE
