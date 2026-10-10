$ErrorActionPreference = "Stop"

$backendDirectory = Split-Path -Parent $PSScriptRoot
$workerPath = Join-Path $backendDirectory "dist\services\reportPdfWorker.js"
$nodePath = (Get-Command node.exe).Source
$taskName = "ESM Rest House Automatic Report PDFs"
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path $workerPath)) {
    throw "Report worker is missing. Run 'npm run build' in the backend folder first."
}

$reportFolders = @(
    "C:\ESM_REST_HOUSE\ESM_REPORT\Daily Report",
    "C:\ESM_REST_HOUSE\ESM_REPORT\Weekly Report",
    "C:\ESM_REST_HOUSE\ESM_REPORT\Monthly Report",
    "C:\ESM_REST_HOUSE\ESM_REPORT\Annually Report"
)
foreach ($folder in $reportFolders) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}

$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$workerPath`"" `
    -WorkingDirectory $backendDirectory
$triggers = @(
    (New-ScheduledTaskTrigger -AtLogOn -User $identity),
    (New-ScheduledTaskTrigger -Daily -At "9:00PM")
)
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -WakeToRun `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal `
    -UserId $identity `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Description "Generates ESM Rest House daily, weekly, monthly, and annual PDF reports in C:\ESM_REST_HOUSE\ESM_REPORT." `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Output "Registered and started '$taskName' for $identity."
