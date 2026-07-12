$ErrorActionPreference = "Stop"

$TaskName = "CodeLink Daemon"
$StateDir = if ($env:CODELINK_STATE_DIR) {
    $env:CODELINK_STATE_DIR
} else {
    Join-Path $HOME ".codelink"
}

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    $ExistingTask | Stop-ScheduledTask -ErrorAction SilentlyContinue
}
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item `
    -LiteralPath (Join-Path $StateDir "runtime") `
    -Recurse `
    -Force `
    -ErrorAction SilentlyContinue
Write-Output "Uninstalled $TaskName (state in $StateDir was preserved)"
