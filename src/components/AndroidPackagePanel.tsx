import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  KeyRound,
  Layers,
  Shield,
  Smartphone,
  Terminal,
} from 'lucide-react';
import type { NativeCapabilities } from '../types/studio';

interface AndroidPackagePanelProps {
  capabilities: NativeCapabilities;
  showFloatingBubble: boolean;
  onToggleFloatingBubble: () => void;
  onRequestNativePermissions: () => void;
  onRequestOverlayPermission: () => void;
  onExportStudioProfile: () => void;
}

const ANDROID_PERMISSIONS = [
  { name: 'FOREGROUND_SERVICE_MEDIA_PROJECTION', purpose: 'Screen & internal game audio broadcast while in background' },
  { name: 'FOREGROUND_SERVICE_CAMERA', purpose: 'Front/back CameraX & Dual PiP facecam capture' },
  { name: 'FOREGROUND_SERVICE_MICROPHONE', purpose: 'Low-latency 48kHz voiceover & AudioRecord PCM mixer' },
  { name: 'SYSTEM_ALERT_WINDOW', purpose: 'Draggable floating control bubble & in-game chat overlay' },
  { name: 'INTERNET & WAKE_LOCK', purpose: 'Persistent multi-RTMP / RTMPS packet tee & reconnect loop' },
];

const NATIVE_FILES = [
  { path: 'StreamEnginePlugin.kt', role: 'Capacitor bridge · MediaProjection, Camera2, EncryptedSharedPreferences' },
  { path: 'StreamingForegroundService.kt', role: 'Typed FGS · MediaCodec H.264/AAC, AudioPlaybackCapture, Multi-RTMP Tee & MP4 Muxer' },
  { path: 'FloatingBubbleService.kt', role: 'Draggable overlay bubble for mute, chat toggle, and stop stream inside games' },
  { path: 'AndroidManifest.xml', role: 'Android 14/15 FGS types, permissions, FileProvider & network security config' },
  { path: 'build.gradle (ensureSigningKeystore)', role: 'Auto-provisions PKCS12 keystore when CI secrets are omitted' },
  { path: 'build-apk.yml', role: 'GitHub Actions cloud workflow compiling signed Debug & Release APKs' },
];

export const AndroidPackagePanel: React.FC<AndroidPackagePanelProps> = ({
  capabilities,
  showFloatingBubble,
  onToggleFloatingBubble,
  onRequestNativePermissions,
  onRequestOverlayPermission,
  onExportStudioProfile,
}) => {
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  const handleRequestPerms = () => {
    onRequestNativePermissions();
    setPermissionNotice(
      capabilities.isNativeAndroid
        ? 'Requested Android Camera, Microphone, and Notification permissions.'
        : 'Web preview mode active — Android runtime permissions activate automatically inside the compiled APK.'
    );
  };

  return (
    <div className="space-y-6">
      {/* Native Runtime & Capacitor Bridge Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-white">
                Android Native Streaming Engine & APK Pipeline
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Package ID com.castforge.studio · Compile SDK 36 · Target SDK 35 · Capacitor 8 + Kotlin
              </p>
            </div>
            <span className="text-xs font-mono-tabular text-zinc-300">
              {capabilities.isNativeAndroid ? `Android API ${capabilities.sdkInt}` : 'Web Studio Preview'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRequestPerms}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5" />
              Request Studio Permissions
            </button>
            <button
              type="button"
              onClick={onRequestOverlayPermission}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#1C222C] hover:bg-[#252D3A] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Overlay Permission
            </button>
            <button
              type="button"
              onClick={onToggleFloatingBubble}
              className={`min-h-[42px] px-4 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                showFloatingBubble
                  ? 'bg-rose-600/20 border-rose-500/50 text-rose-200'
                  : 'bg-[#1C222C] border-white/[0.08] text-zinc-200 hover:bg-[#252D3A]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {showFloatingBubble ? 'Floating Bubble Visible' : 'Show Floating Bubble'}
            </button>
            <button
              type="button"
              onClick={onExportStudioProfile}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[#1C222C] hover:bg-[#252D3A] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export Studio JSON
            </button>
          </div>

          {permissionNotice && (
            <p className="text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-500/25 rounded-lg px-3 py-2">
              {permissionNotice}
            </p>
          )}
        </div>

        {/* Automated Gradle Signing Highlight */}
        <div className="p-5 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-white">
            <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-sm font-display font-semibold">Auto-Signed APK Task</h3>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The custom Gradle task <span className="font-mono-tabular text-zinc-200">ensureSigningKeystore</span> checks{' '}
            <span className="font-mono-tabular text-zinc-200">ANDROID_KEYSTORE_BASE64</span> in GitHub Secrets and
            automatically generates a valid 2048-bit PKCS12 keystore via <span className="font-mono-tabular text-zinc-200">keytool</span> if omitted.
          </p>
          <p className="text-xs text-emerald-300 font-medium">
            Zero-config signed Debug & Release APKs in local or cloud CI builds.
          </p>
        </div>
      </div>

      {/* Native Android Deliverables & Permissions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-[#14181F] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-zinc-400" />
            <h3 className="text-sm font-display font-semibold text-white">Included Android & CI/CD Modules</h3>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {NATIVE_FILES.map((file) => (
              <div key={file.path} className="px-4 py-3 space-y-0.5">
                <p className="text-xs font-mono-tabular font-medium text-zinc-100">{file.path}</p>
                <p className="text-xs text-zinc-400">{file.role}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#14181F] border border-white/[0.08] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-display font-semibold text-white">Manifest Permissions Configured</h3>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {ANDROID_PERMISSIONS.map((perm) => (
              <div key={perm.name} className="px-4 py-3 space-y-0.5">
                <p className="text-xs font-mono-tabular font-medium text-zinc-100">{perm.name}</p>
                <p className="text-xs text-zinc-400">{perm.purpose}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Cloud Build Command Reference */}
      <section className="p-4 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <h3 className="text-sm font-display font-semibold text-white">Build Commands (Local or GitHub Actions)</h3>
        </div>
        <pre className="p-3.5 rounded-lg bg-[#0B0D10] border border-white/[0.06] text-xs font-mono-tabular text-zinc-300 overflow-x-auto leading-relaxed">
{`# 1. Build web bundle & sync Capacitor Android native project
npm run cap:sync

# 2. Auto-generate signing keystore (if needed) & compile signed Release APK
npm run android:release

# 3. Cloud CI: push to main or trigger "Build Signed Android APK" in GitHub Actions`}
        </pre>
      </section>
    </div>
  );
};
