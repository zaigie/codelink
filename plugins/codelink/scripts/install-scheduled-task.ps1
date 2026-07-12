$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginDir = Split-Path -Parent $ScriptDir
$TaskName = "CodeLink Daemon"
$StateDir = if ($env:CODELINK_STATE_DIR) {
    $env:CODELINK_STATE_DIR
} else {
    Join-Path $HOME ".codelink"
}
$RuntimeDir = Join-Path $StateDir "runtime"
$RuntimeCli = Join-Path $RuntimeDir "cli.cjs"
$RunnerPath = Join-Path $RuntimeDir "start-daemon.ps1"
$StdoutPath = Join-Path $StateDir "daemon.stdout.log"
$StderrPath = Join-Path $StateDir "daemon.stderr.log"
$NodeBin = if ($env:CODELINK_NODE_BIN) {
    $env:CODELINK_NODE_BIN
} else {
    (Get-Command node -ErrorAction Stop).Source
}
$CodexBin = if ($env:CODELINK_CODEX_BIN) {
    $env:CODELINK_CODEX_BIN
} else {
    (Get-Command codex -ErrorAction Stop).Source
}
$PowerShellBin = (Get-Process -Id $PID).Path

function ConvertTo-SingleQuotedLiteral([string] $Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

New-Item -ItemType Directory -Force -Path $StateDir, $RuntimeDir | Out-Null
@("cli.js", "cli.mjs", "cli.cjs") | ForEach-Object {
    Remove-Item `
        -LiteralPath (Join-Path $RuntimeDir $_) `
        -Force `
        -ErrorAction SilentlyContinue
}
Copy-Item -Force (Join-Path $PluginDir "dist\cli.cjs") $RuntimeCli

$Runner = @(
    '$ErrorActionPreference = "Stop"'
    '$env:CODELINK_STATE_DIR = ' + (ConvertTo-SingleQuotedLiteral $StateDir)
    '$env:CODELINK_CODEX_BIN = ' + (ConvertTo-SingleQuotedLiteral $CodexBin)
    '$NodeBin = ' + (ConvertTo-SingleQuotedLiteral $NodeBin)
    '$RuntimeCli = ' + (ConvertTo-SingleQuotedLiteral $RuntimeCli)
    '$StdoutPath = ' + (ConvertTo-SingleQuotedLiteral $StdoutPath)
    '$StderrPath = ' + (ConvertTo-SingleQuotedLiteral $StderrPath)
    '& $NodeBin $RuntimeCli daemon 1>> $StdoutPath 2>> $StderrPath'
    'exit $LASTEXITCODE'
) -join [Environment]::NewLine
[IO.File]::WriteAllText($RunnerPath, $Runner, [Text.UTF8Encoding]::new($false))

$ActionArguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $RunnerPath + '"'
$Action = New-ScheduledTaskAction `
    -Execute $PowerShellBin `
    -Argument $ActionArguments `
    -WorkingDirectory $RuntimeDir
$Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $Identity
$Principal = New-ScheduledTaskPrincipal `
    -UserId $Identity `
    -LogonType Interactive `
    -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$Task = New-ScheduledTask `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Settings $Settings

$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    $ExistingTask | Stop-ScheduledTask -ErrorAction SilentlyContinue
}
Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started $TaskName"
Write-Output "Logs: $StdoutPath and $StderrPath"
