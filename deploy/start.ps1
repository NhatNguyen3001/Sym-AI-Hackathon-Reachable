# Starts the backend for a demo: one task (~US$0.12/hour), points CloudFront at it, waits until it answers, and
# schedules the automatic stop 9 hours from now. Safe to run twice.
#   powershell -File deploy\start.ps1 [-Fresh]    (-Fresh: start a new task with the latest pushed images)
param([switch]$Fresh)
. "$PSScriptRoot\common.ps1"

$apiUrl = StackOutput "ApiUrl"
$distId = StackOutput "DistributionId"
$roleArn = StackOutput "SchedulerRoleArn"
Write-Host "Starting Reachable (about US`$0.12 an hour while it runs)"
if ($Fresh) { Aws ecs update-service --cluster $Cluster --service $Service --desired-count 1 --force-new-deployment | Out-Null }
else { Aws ecs update-service --cluster $Cluster --service $Service --desired-count 1 | Out-Null }

# 1. Wait for the task to run, and find its public address.
$dns = $null
for ($i = 0; $i -lt 60 -and -not $dns; $i++) {
  Start-Sleep -Seconds 5
  $arns = (AwsJson ecs list-tasks --cluster $Cluster --service-name $Service --desired-status RUNNING).taskArns
  if (-not $arns) { Say "waiting for a task..."; continue }
  $tasks = (AwsJson ecs describe-tasks --cluster $Cluster --tasks $arns).tasks | Where-Object { $_.lastStatus -eq "RUNNING" }
  if ($Fresh) { $tasks = $tasks | Sort-Object startedAt -Descending | Select-Object -First 1 }
  $task = $tasks | Select-Object -First 1
  if (-not $task) { Say "task starting (downloading images)..."; continue }
  $eni = ($task.attachments[0].details | Where-Object { $_.name -eq "networkInterfaceId" }).value
  $dns = (Aws ec2 describe-network-interfaces --network-interface-ids $eni --query "NetworkInterfaces[0].Association.PublicDnsName" --output text).Trim()
}
if (-not $dns -or $dns -eq "None") { throw "The task didn't start within 5 minutes. Check deploy\status.ps1 and the /reachable logs." }
Say "task running at $dns"

# 2. Point CloudFront at it (only if it moved).
$cfg = Join-Path $Temp "dist.json"
Aws cloudfront get-distribution-config --id $distId --output json | Set-Content -Encoding Ascii $cfg
$current = & $Python -c "import json,sys;print(json.load(open(sys.argv[1]))['DistributionConfig']['Origins']['Items'][0]['DomainName'])" $cfg
if ($current.Trim() -ne $dns) {
  $etag = & $Python -c "import json,sys;print(json.load(open(sys.argv[1]))['ETag'])" $cfg
  $new = Join-Path $Temp "dist-new.json"
  & $Python -c "import json,sys;d=json.load(open(sys.argv[1]))['DistributionConfig'];d['Origins']['Items'][0]['DomainName']=sys.argv[2];json.dump(d,open(sys.argv[3],'w'))" $cfg $dns $new
  Aws cloudfront update-distribution --id $distId --if-match $etag.Trim() --distribution-config "file://$new" | Out-Null
  Say "CloudFront pointed at the new task; updating (a few minutes)..."
  Aws cloudfront wait distribution-deployed --id $distId | Out-Null
}

# 3. Wait until the app answers through the fixed address.
$ok = $false
for ($i = 0; $i -lt 36 -and -not $ok; $i++) {
  try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$apiUrl/health").StatusCode -eq 200 } catch { Start-Sleep -Seconds 5 }
}
if (-not $ok) { throw "The task is running but $apiUrl/health isn't answering yet. Try deploy\status.ps1 in a minute." }

# 4. The automatic stop, 9 hours from now (replaces any earlier one).
try { Aws scheduler delete-schedule --name $Schedule | Out-Null } catch {}
$at = (Get-Date).ToUniversalTime().AddHours($AutoStopHours).ToString("yyyy-MM-ddTHH:mm:ss")
$target = Join-Path $Temp "target.json"
@{ Arn = "arn:aws:scheduler:::aws-sdk:ecs:updateService"; RoleArn = $roleArn
   Input = (@{ Cluster = $Cluster; Service = $Service; DesiredCount = 0 } | ConvertTo-Json -Compress) } |
  ConvertTo-Json | Set-Content -Encoding Ascii $target
Aws scheduler create-schedule --name $Schedule --schedule-expression "at($at)" --schedule-expression-timezone UTC `
  --flexible-time-window Mode=OFF --target "file://$target" --action-after-completion DELETE | Out-Null
Write-Host ""
Write-Host "Reachable is up: $apiUrl"
Write-Host "It stops itself at $at UTC ($AutoStopHours hours). Stop it sooner with deploy\stop.ps1."
