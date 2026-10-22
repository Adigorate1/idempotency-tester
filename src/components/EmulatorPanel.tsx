import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { EmulatorDeviceStatus } from '../types';

interface EmulatorPanelProps {
  onFillTargetUrl: (url: string) => void;
}

export const EmulatorPanel: React.FC<EmulatorPanelProps> = ({ onFillTargetUrl }) => {
  const [devicePort, setDevicePort] = useState<string>('8080');
  const [status, setStatus] = useState<EmulatorDeviceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectResult, setConnectResult] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emulator/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus({ adb: false, devices: [], message: 'Proxy endpoint unavailable' });
      }
    } catch {
      setStatus({ adb: false, devices: [], message: 'Could not connect to local proxy backend' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleConnect = async () => {
    const portNum = Number(devicePort);
    if (!portNum || portNum < 1 || portNum > 65535) {
      setConnectResult('Please enter a valid port number between 1 and 65535.');
      return;
    }

    setConnecting(true);
    setConnectResult('Forwarding port via ADB...');
    try {
      const res = await fetch('/api/emulator/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_port: portNum }),
      });
      const data = await res.json();
      if (data.ok && data.local_url) {
        onFillTargetUrl(data.local_url);
        setConnectResult(`Forwarded ${data.serial || 'device'}:${portNum} → ${data.local_url} (Target URL filled!)`);
      } else {
        setConnectResult(`Forwarding failed: ${data.error || 'Check that an emulator is running'}`);
      }
    } catch (err: any) {
      setConnectResult(`Error: ${err.message || 'Make sure ADB is installed'}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="a-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[rgb(var(--text-accent))]" />
            <h2 className="text-sm font-semibold text-[rgb(var(--text-primary))]">
              Android Emulator Traffic Bridge (ADB Forward)
            </h2>
          </div>
          <button
            type="button"
            onClick={checkStatus}
            disabled={loading}
            className="a-btn a-btn-ghost text-xs py-1 px-2.5 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>

        <p className="text-xs text-[rgb(var(--text-secondary))] mb-4">
          Connect directly to apps listening inside an Android emulator (Android Studio Emulator, BlueStacks, Nox, LDPlayer, MEmu, or Genymotion) without needing proxy settings, CA certificates, or APK modifications.
        </p>

        <div className="p-3 rounded-lg bg-[rgb(var(--bg-wash))] border border-[rgb(var(--border-secondary))] mb-4 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-[rgb(var(--text-primary))]">ADB Detection Status:</span>
            {status?.adb ? (
              <span className="inline-flex items-center gap-1 text-[rgb(var(--text-green))] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ADB found
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[rgb(var(--text-orange))] font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                ADB not detected on host PATH
              </span>
            )}
          </div>
          <div className="text-[rgb(var(--text-secondary))]">
            {status?.adb ? (
              status.devices.length > 0 ? (
                <span>Connected device(s): <strong className="font-mono text-[rgb(var(--text-primary))]">{status.devices.join(', ')}</strong></span>
              ) : (
                <span>ADB is installed, but no active emulator was detected. Start your emulator to connect.</span>
              )
            ) : (
              <span>Install Android platform-tools (<code className="font-mono">adb</code>) to enable one-click emulator port forwarding.</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold mb-1 text-[rgb(var(--text-primary))]">
              App Port Inside Emulator
            </label>
            <input
              type="number"
              min={1}
              max={65535}
              value={devicePort}
              onChange={(e) => setDevicePort(e.target.value)}
              placeholder="e.g. 8080"
              className="w-full p-2 rounded-md border border-[rgb(var(--border-primary))] bg-[rgb(var(--bg-wash))] text-xs font-mono text-[rgb(var(--text-primary))]"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="a-btn a-btn-primary text-xs py-2 px-4 w-full flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {connecting ? 'Connecting...' : 'Connect & Fill Target URL'}
            </button>
          </div>
        </div>

        {connectResult && (
          <div
            className={`mt-3 p-2.5 rounded text-xs ${
              connectResult.includes('Forwarded')
                ? 'bg-[rgb(var(--text-green)/0.1)] text-[rgb(var(--text-green))] border border-[rgb(var(--text-green)/0.2)]'
                : 'bg-[rgb(var(--text-orange)/0.1)] text-[rgb(var(--text-orange))] border border-[rgb(var(--text-orange)/0.2)]'
            }`}
          >
            {connectResult}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="a-panel text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-[rgb(var(--text-primary))]">
            <ShieldCheck className="w-4 h-4 text-[rgb(var(--text-accent))]" />
            Why plain HTTP via ADB Forward?
          </div>
          <p className="text-[rgb(var(--text-secondary))] leading-relaxed">
            Starting with Android 7 (Nougat), Android enforces strict network security configs that reject user-installed root CA certificates for HTTPS inspection unless the app is specifically recompiled with a debuggable network security configuration.
          </p>
          <p className="text-[rgb(var(--text-secondary))] leading-relaxed">
            By running plain HTTP inside the emulator and binding via <code>adb forward tcp:PORT tcp:PORT</code>, test requests reach the local server securely over local loopback with zero certificate warnings or app tampering needed.
          </p>
        </div>

        <div className="a-panel text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-[rgb(var(--text-primary))]">
            <HelpCircle className="w-4 h-4 text-[rgb(var(--text-accent))]" />
            Supported Emulators
          </div>
          <ul className="list-disc list-inside space-y-1 text-[rgb(var(--text-secondary))]">
            <li><strong>Android Studio AVD</strong>: Exposes ADB by default on port 5554+.</li>
            <li><strong>BlueStacks</strong>: Enable "Android Debug Bridge (ADB)" in Settings &gt; Advanced.</li>
            <li><strong>Nox Player</strong>: Settings &gt; General &gt; Turn on Root &amp; ADB.</li>
            <li><strong>LDPlayer</strong>: Settings &gt; Other settings &gt; Root permission enabled.</li>
            <li><strong>Genymotion</strong>: Uses host ADB out of the box.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
