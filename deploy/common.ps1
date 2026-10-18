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

function AwsCall {
  # Runs the AWS CLI in our region and stops the script with a readable message if it fails. Success is judged by
  # the exit code only: Windows PowerShell 5.1 treats any line the CLI writes to stderr (progress, warnings) as an
  # error. Only stdout is returned, so JSON output stays clean. (aws.exe: a function named "Aws" would call itself.)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $out = & aws.exe @args --region $Region 2>&1 } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "aws $($args[0]) $($args[1]) failed: $(($out | ForEach-Object { "$_" }) -join ' ')" }
  return $out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }
}

function AwsJson { return (AwsCall @args --output json) -join "`n" | ConvertFrom-Json }

function StackOutput([string]$key) {
  $s = AwsJson cloudformation describe-stacks --stack-name $Stack
  return ($s.Stacks[0].Outputs | Where-Object { $_.OutputKey -eq $key }).OutputValue
}

function Say([string]$text) { Write-Host "  $text" }
