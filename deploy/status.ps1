# Is it running, where, and when does it stop itself?
#   powershell -File deploy\status.ps1
. "$PSScriptRoot\common.ps1"

$svc = (AwsJson ecs describe-services --cluster $Cluster --services $Service).services[0]
$apiUrl = StackOutput "ApiUrl"
Write-Host "Tasks: $($svc.runningCount) running, $($svc.desiredCount) wanted"
try {
  $s = AwsJson scheduler get-schedule --name $Schedule
  Write-Host "Auto stop: $($s.ScheduleExpression) UTC"
} catch { Write-Host "Auto stop: none scheduled" }
try {
  $h = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 "$apiUrl/health"
  Write-Host "Health: $($h.StatusCode) at $apiUrl"
} catch { Write-Host "Health: not answering at $apiUrl" }
