# Shared settings and helpers for the deploy scripts (cycle 7). Dot-source it: . "$PSScriptRoot\common.ps1"
$ErrorActionPreference = "Stop"
$Region = "ap-southeast-2"
$Stack = "reachable"
$Cluster = "reachable"
$Service = "reachable"
$Schedule = "reachable-auto-stop"
$AutoStopHours = 9
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root "api\.venv\Scripts\python.exe"
$Temp = Join-Path $env:TEMP "reachable-deploy"
New-Item -ItemType Directory -Force -Path $Temp | Out-Null

function Aws {
  # Runs the AWS CLI in our region and stops the script with a readable message if it fails.
  $out = & aws @args --region $Region 2>&1
  if ($LASTEXITCODE -ne 0) { throw "aws $($args[0]) $($args[1]) failed: $out" }
  return $out
}

function AwsJson { return (Aws @args --output json) -join "`n" | ConvertFrom-Json }

function StackOutput([string]$key) {
  $s = AwsJson cloudformation describe-stacks --stack-name $Stack
  return ($s.Stacks[0].Outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue
}

function Say([string]$text) { Write-Host "  $text" }
