# Stops the backend now (back to US$0/hour) and removes the automatic-stop schedule. Safe to run twice.
#   powershell -File deploy\stop.ps1
. "$PSScriptRoot\common.ps1"

Aws ecs update-service --cluster $Cluster --service $Service --desired-count 0 | Out-Null
try { Aws scheduler delete-schedule --name $Schedule | Out-Null } catch {}
Write-Host "Reachable is stopping (the task ends within a minute). Nothing runs until deploy\start.ps1."
