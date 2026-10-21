param(
    [int]$ProxyPort = 8080,
    [int]$WebPort = 8081
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CaptureDir = Join-Path $env:USERPROFILE "TrafficRobotCaptures"
$PidFile = Join-Path $ProjectDir ".traffic-robot.pid"
$PortFile = Join-Path $ProjectDir ".traffic-robot-port"

function Find-Python {
    foreach ($candidate in @("py", "python", "python3")) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return $candidate
        }
    }
    throw "Python 3 is required. Install it from https://www.python.org/downloads/windows/ and rerun this script."
}

function Find-Adb {
    $commands = @("adb")
    $paths = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:ProgramFiles\BlueStacks_nxt\HD-Adb.exe",
        "${env:ProgramFiles(x86)}\BlueStacks_nxt\HD-Adb.exe",
        "$env:ProgramFiles\Nox\bin\nox_adb.exe",
        "${env:ProgramFiles(x86)}\Nox\bin\nox_adb.exe",
        "$env:ProgramFiles\LDPlayer\LDPlayer9\adb.exe",
        "$env:ProgramFiles\Microvirt\MEmu\adb.exe"
    )
    foreach ($candidate in $commands + $paths) {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            return (Get-Command $candidate).Source
        }
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    throw "ADB was not found. Enable ADB in the emulator and install Android platform-tools."
}

function Invoke-Adb {
    param([string]$Serial, [string[]]$Arguments)
    & $script:AdbPath -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "ADB command failed for emulator $Serial."
    }
}

$Python = Find-Python
$script:AdbPath = Find-Adb

Write-Host "Installing or updating mitmproxy..."
& $Python -m pip install --user --upgrade mitmproxy
if ($LASTEXITCODE -ne 0) {
    throw "mitmproxy installation failed."
}

$ScriptsDir = (& $Python -c "import sysconfig; print(sysconfig.get_path('scripts'))").Trim()
$MitmWeb = Join-Path $ScriptsDir "mitmweb.exe"
if (-not (Test-Path $MitmWeb)) {
    $MitmWebCommand = Get-Command mitmweb -ErrorAction SilentlyContinue
    if (-not $MitmWebCommand) {
        throw "mitmweb was installed but its executable could not be found."
    }
    $MitmWeb = $MitmWebCommand.Source
}

New-Item -ItemType Directory -Force -Path $CaptureDir | Out-Null
$env:TRAFFIC_ROBOT_OUTPUT = $CaptureDir

$AddonPath = Join-Path $ProjectDir "capture_addon.py"
$Arguments = @(
    "--listen-host", "127.0.0.1",
    "--listen-port", "$ProxyPort",
    "--web-host", "127.0.0.1",
    "--web-port", "$WebPort",
    "--set", "block_global=false",
    "-s", "`"$AddonPath`""
)
$Process = Start-Process -FilePath $MitmWeb -ArgumentList $Arguments -PassThru
$Process.Id | Set-Content -Path $PidFile
$ProxyPort | Set-Content -Path $PortFile
Start-Sleep -Seconds 3

$Devices = & $script:AdbPath devices |
    ForEach-Object {
        if ($_ -match "^(\S+)\s+device$") {
            $Matches[1]
        }
    }

if (-not $Devices) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Remove-Item $PortFile -ErrorAction SilentlyContinue
    throw "No ADB emulator was detected. Start the emulator, enable its ADB option, then rerun this script."
}

foreach ($Serial in $Devices) {
    Write-Host "Connecting traffic robot to $Serial..."
    Invoke-Adb $Serial @("reverse", "tcp:$ProxyPort", "tcp:$ProxyPort")
    Invoke-Adb $Serial @("shell", "settings", "put", "global", "http_proxy", "127.0.0.1:$ProxyPort")
    Invoke-Adb $Serial @("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", "http://mitm.it")
}

Start-Process "http://127.0.0.1:$WebPort"

Write-Host ""
Write-Host "Traffic Robot is running."
Write-Host "1. In each emulator, install the Android certificate from the mitm.it page that opened."
Write-Host "2. Run only the app or transaction you are authorized to test."
Write-Host "3. View live traffic at http://127.0.0.1:$WebPort"
Write-Host "4. Timestamped JSON is saved to $CaptureDir\transactions.jsonl"
Write-Host "5. Run Stop-TrafficRobot.ps1 when finished to remove the emulator proxy."
Write-Host ""
Write-Warning "Android apps that reject user certificates or use certificate pinning will not expose decrypted HTTPS traffic."
