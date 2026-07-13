param(
    [ValidateSet("all", "stop", "cleanup")]
    [string] $Phase = "all"
)

$ErrorActionPreference = "Stop"

$TaskName = "CodeLink Daemon"
$StateDir = if ($env:CODELINK_STATE_DIR) {
    $env:CODELINK_STATE_DIR
} else {
    Join-Path $HOME ".codelink"
}

if ($Phase -eq "all") {
    $NodeBin = if ($env:CODELINK_NODE_BIN) {
        $env:CODELINK_NODE_BIN
    } else {
        (Get-Command node -ErrorAction Stop).Source
    }
    & $NodeBin (Join-Path $PSScriptRoot "uninstall.mjs") --platform win32
    exit $LASTEXITCODE
}

$Tasks = @(
    Get-ScheduledTask -ErrorAction Stop | Where-Object {
        $_.TaskName -eq $TaskName -and $_.TaskPath -eq "\"
    }
)

if ($Phase -eq "stop") {
    if ($Tasks.Count -gt 0) {
        $Tasks | Stop-ScheduledTask -ErrorAction Stop
    }
    exit 0
}

if ($Tasks.Count -gt 0) {
    $Tasks | Unregister-ScheduledTask -Confirm:$false -ErrorAction Stop
}
$RuntimeDir = Join-Path $StateDir "runtime"
if (Test-Path -LiteralPath $RuntimeDir) {
    Remove-Item -LiteralPath $RuntimeDir -Recurse -Force -ErrorAction Stop
}
