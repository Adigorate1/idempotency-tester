$ErrorActionPreference = "Continue"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $ProjectDir ".traffic-robot.pid"
$PortFile = Join-Path $ProjectDir ".traffic-robot-port"
$ProxyPort = if (Test-Path $PortFile) { Get-Content $PortFile } else { "8080" }

function Find-Adb {
    foreach ($candidate in @(
        "adb",
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:ProgramFiles\BlueStacks_nxt\HD-Adb.exe",
        "${env:ProgramFiles(x86)}\BlueStacks_nxt\HD-Adb.exe",
        "$env:ProgramFiles\Nox\bin\nox_adb.exe",
        "${env:ProgramFiles(x86)}\Nox\bin\nox_adb.exe",
        "$env:ProgramFiles\LDPlayer\LDPlayer9\adb.exe",
        "$env:ProgramFiles\Microvirt\MEmu\adb.exe"
    )) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return (Get-Command $candidate).Source
        }
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

$AdbPath = Find-Adb
if ($AdbPath) {
    $Devices = & $AdbPath devices |
        ForEach-Object {
            if ($_ -match "^(\S+)\s+device$") {
                $Matches[1]
            }
        }
    foreach ($Serial in $Devices) {
        & $AdbPath -s $Serial shell settings put global http_proxy :0
        & $AdbPath -s $Serial reverse --remove "tcp:$ProxyPort"
    }
}

if (Test-Path $PidFile) {
    $ProcessId = Get-Content $PidFile
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -ErrorAction SilentlyContinue
}
Remove-Item $PortFile -ErrorAction SilentlyContinue

Write-Host "Traffic Robot stopped. Emulator proxy settings were cleared."
