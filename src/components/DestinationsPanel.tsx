import React, { useState } from 'react';
import {
  Check,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  Radio,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type {
  AspectOrientation,
  FpsPreset,
  ResolutionPreset,
  RtmpDestination,
  StreamQualityConfig,
  StreamStatus,
  VodRecording,
} from '../types/studio';

interface DestinationsPanelProps {
  destinations: RtmpDestination[];
  quality: StreamQualityConfig;
  streamStatus: StreamStatus;
  storageBackendLabel: string;
  recordings: VodRecording[];
  onUpdateDestination: (id: string, patch: Partial<RtmpDestination>) => void;
  onSaveDestinations: () => void;
  onUpdateQuality: (patch: Partial<StreamQualityConfig>) => void;
  onSimulateNetworkDrop: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export const DestinationsPanel: React.FC<DestinationsPanelProps> = ({
  destinations,
  quality,
  streamStatus,
  storageBackendLabel,
  recordings,
  onUpdateDestination,
  onSaveDestinations,
  onUpdateQuality,
  onSimulateNetworkDrop,
}) => {
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [savedNotice, setSavedNotice] = useState(false);

  const enabledTargets = destinations.filter((d) => d.enabled);
  const readyTargets = enabledTargets.filter((d) => d.rtmpUrl.trim() && d.streamKey.trim());

  const handleSave = () => {
    onSaveDestinations();
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  };

  return (
    <div className="space-y-6">
      {/* Multi-Platform RTMP & Multistreaming Engine */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-semibold text-white">
              Multi-Platform RTMP & Multistreaming
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              {readyTargets.length} active {readyTargets.length === 1 ? 'destination' : 'destinations'} · Shared H.264/AAC packet tee · {storageBackendLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {savedNotice ? 'Saved Encrypted' : 'Save Stream Keys'}
          </button>
        </div>

        {/* Multistream Tee Notice when 2+ enabled */}
        {readyTargets.length >= 2 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-950/30 border border-emerald-500/25 text-xs">
            <div className="flex items-center gap-2.5 text-emerald-200 min-w-0">
              <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">
                Multistream Tee ready: encoding once at {quality.videoBitrateKbps} kbps and fanning out to{' '}
                {readyTargets.map((t) => t.name).join(' + ')}
              </span>
            </div>
            <span className="font-mono-tabular text-emerald-300 shrink-0">
              {(quality.videoBitrateKbps * readyTargets.length / 1000).toFixed(1)} Mbps up
            </span>
          </div>
        )}

        <div className="divide-y divide-white/[0.07] bg-[#14181F] border border-white/[0.08] rounded-xl overflow-hidden">
          {destinations.map((dest) => {
            const keyVisible = Boolean(revealedKeys[dest.id]);
            const missingKey = dest.enabled && !dest.streamKey.trim();

            return (
              <div key={dest.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white truncate">{dest.name}</h3>
                      {dest.enabled && (
                        <span className={`text-[11px] font-medium ${missingKey ? 'text-amber-300' : 'text-emerald-400'}`}>
                          {missingKey ? 'Needs Stream Key' : streamStatus === 'live' ? 'Broadcasting' : 'Armed'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono-tabular text-zinc-500 truncate mt-0.5">
                      {dest.rtmpUrl}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={dest.enabled}
                    onClick={() => onUpdateDestination(dest.id, { enabled: !dest.enabled })}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      dest.enabled ? 'bg-rose-600' : 'bg-[#262E3D]'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        dest.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {dest.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">RTMP / RTMPS Ingest URL</label>
                      <input
                        type="url"
                        value={dest.rtmpUrl}
                        onChange={(e) => onUpdateDestination(dest.id, { rtmpUrl: e.target.value })}
                        placeholder="rtmps://..."
                        className="w-full h-10 px-3 rounded-lg bg-[#0B0D10] border border-white/[0.1] text-xs font-mono-tabular text-zinc-100 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Stream Key (Encrypted Storage)</label>
                      <div className="relative">
                        <input
                          type={keyVisible ? 'text' : 'password'}
                          value={dest.streamKey}
                          onChange={(e) => onUpdateDestination(dest.id, { streamKey: e.target.value })}
                          placeholder="Paste platform stream key"
                          className="w-full h-10 pl-3 pr-10 rounded-lg bg-[#0B0D10] border border-white/[0.1] text-xs font-mono-tabular text-zinc-100 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedKeys((prev) => ({ ...prev, [dest.id]: !prev[dest.id] }))
                          }
                          aria-label={keyVisible ? 'Hide stream key' : 'Show stream key'}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-400 hover:text-white"
                        >
                          {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Stream Quality, Bitrate & Orientation */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-display font-semibold text-white">
            Video Encoder & Bitrate
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Hardware MediaCodec H.264 profile · Adaptive CBR rate control
          </p>
        </div>

        <div className="p-4 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Resolution */}
            <div className="space-y-1.5">
              <label className="block text-xs text-zinc-400">Resolution</label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D10] rounded-lg border border-white/[0.06]">
                {(['480p', '720p', '1080p'] as ResolutionPreset[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => onUpdateQuality({ resolution: res })}
                    className={`min-h-[38px] rounded-md text-xs font-mono-tabular font-medium transition-colors ${
                      quality.resolution === res ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div className="space-y-1.5">
              <label className="block text-xs text-zinc-400">Canvas Aspect</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D10] rounded-lg border border-white/[0.06]">
                {(['9:16', '16:9'] as AspectOrientation[]).map((orient) => (
                  <button
                    key={orient}
                    type="button"
                    onClick={() => onUpdateQuality({ orientation: orient })}
                    className={`min-h-[38px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      quality.orientation === orient
                        ? 'bg-[#232A36] text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {orient === '9:16' ? '9:16 Vertical' : '16:9 Wide'}
                  </button>
                ))}
              </div>
            </div>

            {/* FPS */}
            <div className="space-y-1.5">
              <label className="block text-xs text-zinc-400">Frame Rate</label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D10] rounded-lg border border-white/[0.06]">
                {([30, 60] as FpsPreset[]).map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => onUpdateQuality({ fps })}
                    className={`min-h-[38px] rounded-md text-xs font-mono-tabular font-medium transition-colors ${
                      quality.fps === fps ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Adaptive Video Bitrate Slider */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium">Adaptive Video Bitrate</span>
              <span className="font-mono-tabular text-white font-semibold">
                {quality.videoBitrateKbps} kbps
              </span>
            </div>
            <input
              type="range"
              min={1000}
              max={8000}
              step={250}
              value={quality.videoBitrateKbps}
              onChange={(e) => onUpdateQuality({ videoBitrateKbps: parseInt(e.target.value, 10) })}
              className="studio-slider w-full"
            />
            <div className="flex justify-between text-[11px] font-mono-tabular text-zinc-500">
              <span>1000 kbps (4G)</span>
              <span>4500 kbps (1080p)</span>
              <span>8000 kbps (High Motion)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Disconnect Protection & Local VOD Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Disconnect Protection */}
        <section className="p-4 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white">Disconnect Protection</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Exponential backoff reconnect + fallback slate so YouTube/Kick never end the live session.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quality.disconnectProtection}
              onClick={() => onUpdateQuality({ disconnectProtection: !quality.disconnectProtection })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                quality.disconnectProtection ? 'bg-emerald-600' : 'bg-[#262E3D]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  quality.disconnectProtection ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">Reconnecting Slate Text</label>
            <input
              type="text"
              value={quality.reconnectSlateMessage}
              onChange={(e) => onUpdateQuality({ reconnectSlateMessage: e.target.value })}
              className="w-full h-10 px-3 rounded-lg bg-[#0B0D10] border border-white/[0.1] text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={onSimulateNetworkDrop}
            disabled={streamStatus !== 'live' || !quality.disconnectProtection}
            className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[#1C222C] hover:bg-[#252D3A] disabled:opacity-40 border border-white/[0.08] text-xs font-medium text-amber-200 flex items-center justify-center gap-2 transition-colors"
          >
            <WifiOff className="w-3.5 h-3.5" />
            {streamStatus === 'live'
              ? 'Simulate 4G Drop (Test Auto-Reconnect)'
              : 'Go Live to Test Disconnect Protection'}
          </button>
        </section>

        {/* Local Recording (VOD Backup) */}
        <section className="p-4 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <HardDrive className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white">Local VOD Backup (.mp4)</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Save simultaneous local recording while live, or record offline without going live.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quality.recordLocalVod}
              onClick={() => onUpdateQuality({ recordLocalVod: !quality.recordLocalVod })}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                quality.recordLocalVod ? 'bg-rose-600' : 'bg-[#262E3D]'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  quality.recordLocalVod ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer py-1 border-t border-white/[0.06] pt-3">
            <span>Offline Recording Mode (Do not push to RTMP)</span>
            <input
              type="checkbox"
              checked={quality.offlineRecordOnly}
              onChange={(e) =>
                onUpdateQuality({
                  offlineRecordOnly: e.target.checked,
                  recordLocalVod: e.target.checked ? true : quality.recordLocalVod,
                })
              }
              className="accent-rose-600 w-4 h-4"
            />
          </label>

          {/* Saved VOD Recordings List */}
          <div className="space-y-2 border-t border-white/[0.06] pt-3">
            <p className="text-[11px] font-medium text-zinc-400">
              Saved Recordings ({recordings.length})
            </p>
            {recordings.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Completed live or offline VOD recordings appear here for instant download.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {recordings.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0B0D10] border border-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono-tabular text-zinc-200 truncate">{rec.filename}</p>
                      <p className="text-[11px] text-zinc-500 font-mono-tabular">
                        {formatDuration(rec.durationSec)} · {rec.sizeMb.toFixed(1)} MB · {rec.resolution}
                      </p>
                    </div>
                    {rec.downloadUrl && (
                      <a
                        href={rec.downloadUrl}
                        download={rec.filename}
                        className="min-h-[34px] px-2.5 rounded-md bg-[#1C222C] hover:bg-[#262E3D] text-xs text-zinc-200 flex items-center gap-1 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Save
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
