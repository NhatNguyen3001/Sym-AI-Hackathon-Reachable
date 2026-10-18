# Builds both images and uploads them to AWS (ECR). Run after code changes, then start.ps1 -Fresh.
#   powershell -File deploy\push.ps1 [-Only api|valhalla]
param([string]$Only = "")
. "$PSScriptRoot\common.ps1"

$account = (AwsCall sts get-caller-identity --query Account --output text).Trim()
$registry = "$account.dkr.ecr.$Region.amazonaws.com"
Write-Host "Signing in to $registry"
# Windows PowerShell 5.1 changes text piped into programs (line endings, encoding), which garbles the token: hand it
# to Docker through a file that cmd feeds straight in, and delete it at once. (A 12-hour ECR token, never printed.)
$tokenFile = Join-Path $Temp "ecr.txt"
try {
  [System.IO.File]::WriteAllText($tokenFile, ((AwsCall ecr get-login-password) -join "").Trim())
  cmd /c "docker login --username AWS --password-stdin $registry < `"$tokenFile`"" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker login failed" }
} finally {
  Remove-Item -Force -ErrorAction SilentlyContinue $tokenFile
}

$images = @(
  @{ Name = "reachable-api"; File = (Join-Path $Root "api\Dockerfile"); Context = (Join-Path $Root "api") },
  @{ Name = "reachable-valhalla"; File = (Join-Path $PSScriptRoot "valhalla.Dockerfile"); Context = (Join-Path $Root "valhalla\custom_files") }
)
foreach ($img in $images) {
  if ($Only -and $img.Name -ne "reachable-$Only") { continue }
  $tag = "$registry/$($img.Name):latest"
  Write-Host "Building $($img.Name)"
  $env:DOCKER_BUILDKIT = "1"
  docker build --platform linux/amd64 -f $img.File -t $tag $img.Context
  if ($LASTEXITCODE -ne 0) { throw "build failed: $($img.Name)" }
  Write-Host "Uploading $($img.Name) (the first upload of Valhalla is ~1 GB)"
  docker push $tag
  if ($LASTEXITCODE -ne 0) { throw "push failed: $($img.Name)" }
}
Write-Host "Done."
