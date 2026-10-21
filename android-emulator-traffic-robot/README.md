# Android Emulator Traffic Robot

Captures authorized HTTP and HTTPS traffic from Android emulators that expose ADB, including Android Studio Emulator, BlueStacks, Nox, LDPlayer, MEmu and Genymotion.

## What it records

- Exact UTC transaction time
- Method, URL and status
- Request and response bodies (up to 100 KB each)
- Request and response headers, with authorization and cookie values redacted
- A reusable cURL command for the idempotency tester
- Live traffic in mitmweb at `http://127.0.0.1:8081`
- JSON Lines output in `%USERPROFILE%\TrafficRobotCaptures\transactions.jsonl`

## Start

1. Start your Android emulator.
2. Enable ADB in the emulator settings. Android Studio emulators already expose ADB.
3. Right-click `Start-TrafficRobot.ps1` and choose **Run with PowerShell**.
4. The script installs mitmproxy locally, detects every connected emulator, configures the proxy and opens `mitm.it` inside each emulator.
5. In the emulator browser, install the **Android** certificate shown by `mitm.it`.
6. Run the transaction you are authorized to test.
7. Use the mitmweb window to inspect traffic, or open `transactions.jsonl` for the exported records.

Windows Chrome and other desktop apps are not affected. The script changes only the connected emulator's proxy, then `Stop-TrafficRobot.ps1` restores it.

To pause a request before it is sent, use mitmweb's **Intercept** control and enter a filter such as `~m POST` for POST requests. Resume or drop the request from the flow view.

If Windows blocks the script, open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Start-TrafficRobot.ps1
```

## Stop

Right-click `Stop-TrafficRobot.ps1` and choose **Run with PowerShell**. This stops the local proxy and clears the emulator proxy setting.

## Limitations

- This tool does not bypass certificate pinning.
- Android 7 and newer apps may reject user-installed certificates unless their app configuration allows them.
- Only capture traffic from apps and accounts you own or are authorized to test.
- The tool does not capture raw TCP or UDP traffic that does not use HTTP.
