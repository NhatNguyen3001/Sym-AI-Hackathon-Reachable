# One-time setup (and re-run to change the allowed web origin): copies the keys from api/.env into AWS Parameter
# Store (encrypted, never printed) and creates or updates the AWS stack. Costs nothing until start.ps1 runs.
#   powershell -File deploy\setup.ps1 [-VercelUrl https://reachable.vercel.app]
param([string]$VercelUrl = "")
. "$PSScriptRoot\common.ps1"

Write-Host "Reachable setup ($Region)"
$envFile = Join-Path $Root "api\.env"
$values = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $values[$Matches[1]] = $Matches[2].Trim().Trim('"') }
}
$keys = "TFNSW_API_KEY", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "ANTHROPIC_API_KEY", "ADMIN_KEY"
$missing = $keys | Where-Object { -not $values[$_] }
if ($missing) { throw "api/.env is missing: $($missing -join ', ')" }
foreach ($k in $keys) {
  # The value goes through a temporary file so it never appears on screen or in the command line.
  $f = Join-Path $Temp "param.json"
  @{ Name = "/reachable/$k"; Type = "SecureString"; Overwrite = $true; Value = $values[$k] } |
    ConvertTo-Json | Set-Content -Encoding Ascii $f
  Aws ssm put-parameter --cli-input-json "file://$f" | Out-Null
  Remove-Item $f
  Say "saved $k (encrypted)"
}

$vpc = (Aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text).Trim()
$subnets = ((Aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query "Subnets[].SubnetId" --output text) -split "\s+") -join ","
$pl = (Aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing --query "PrefixLists[0].PrefixListId" --output text).Trim()
$cors = if ($VercelUrl) { "[`"$($VercelUrl.TrimEnd('/'))`"]" } else { '["*"]' }
$params = Join-Path $Temp "stack-params.json"
@("VpcId=$vpc", "SubnetIds=$subnets", "CloudFrontPrefixList=$pl", "CorsOrigins=$cors") | ConvertTo-Json | Set-Content -Encoding Ascii $params
Say "deploying the stack (first time takes ~5 minutes: CloudFront)..."
Aws cloudformation deploy --stack-name $Stack --template-file (Join-Path $PSScriptRoot "aws\reachable.yaml") `
  --capabilities CAPABILITY_IAM --parameter-overrides "file://$params" --no-fail-on-empty-changeset | Out-Null
Write-Host "Done. API address (fixed): $(StackOutput 'ApiUrl')"
Write-Host "Next: deploy\push.ps1, then deploy\start.ps1"
