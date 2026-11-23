import React from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { AudioBitratePreset, AudioChannelState } from '../types/studio';

interface AudioMixerPanelProps {
  channels: AudioChannelState[];
  audioBitrateKbps: AudioBitratePreset;
  micHardwareActive: boolean;
  onChangeVolume: (channelId: AudioChannelState['id'], volume: number) => void;
  onToggleMute: (channelId: AudioChannelState['id']) => void;
  onChangeAudioBitrate: (bitrate: AudioBitratePreset) => void;
  onToggleLiveMicCapture: () => void;
}

function dbToPercent(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  return ((clamped + 60) / 60) * 100;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  channels,
  audioBitrateKbps,
  micHardwareActive,
  onChangeVolume,
  onToggleMute,
  onChangeAudioBitrate,
  onToggleLiveMicCapture,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-display font-semibold text-white">Real-Time Audio Mixer</h2>
          <p className="text-xs text-zinc-400">
            Dual PCM mixer · 48 kHz stereo AAC · {audioBitrateKbps} kbps
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleLiveMicCapture}
          className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 ${
            micHardwareActive
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
              : 'bg-[#1C222C] border-white/[0.08] text-zinc-200 hover:bg-[#252D3A]'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          {micHardwareActive ? 'Live Mic Active' : 'Connect Real Mic'}
        </button>
      </div>

      {/* Audio Channels */}
      <div className="divide-y divide-white/[0.07] bg-[#14181F] border border-white/[0.08] rounded-xl overflow-hidden">
        {channels.map((ch) => {
          const levelPct = ch.muted ? 0 : dbToPercent(ch.db);
          const peakPct = ch.muted ? 0 : dbToPercent(ch.peakDb);
          const isClipping = !ch.muted && ch.db > -4;
          const isWarm = !ch.muted && ch.db > -14 && ch.db <= -4;

          return (
            <div key={ch.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white truncate">{ch.label}</h3>
                    {ch.muted && (
                      <span className="text-[11px] font-medium text-rose-400">Muted</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{ch.subtitle}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-mono-tabular w-14 text-right ${
                      ch.muted
                        ? 'text-zinc-600'
                        : isClipping
                          ? 'text-rose-400'
                          : isWarm
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                    }`}
                  >
                    {ch.muted ? '-∞ dB' : `${ch.db.toFixed(0)} dB`}
                  </span>

                  <button
                    type="button"
                    onClick={() => onToggleMute(ch.id)}
                    aria-label={ch.muted ? `Unmute ${ch.label}` : `Mute ${ch.label}`}
                    className={`min-h-[42px] min-w-[42px] rounded-xl border flex items-center justify-center transition-colors ${
                      ch.muted
                        ? 'bg-rose-600/20 border-rose-500/50 text-rose-300'
                        : 'bg-[#1B212C] border-white/[0.08] text-zinc-200 hover:bg-[#242C3B]'
                    }`}
                  >
                    {ch.id === 'mic' ? (
                      ch.muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />
                    ) : ch.muted ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Segmented Broadcast dB Meter */}
              <div className="space-y-1.5">
                <div className="relative h-2.5 w-full rounded-full bg-[#0B0D10] overflow-hidden border border-white/[0.05]">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${levelPct}%`,
                      background:
                        'linear-gradient(90deg, #10B981 0%, #10B981 68%, #F59E0B 82%, #E11D48 100%)',
                    }}
                  />
                  {peakPct > 2 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-white/90 transition-all duration-150"
                      style={{ left: `${peakPct}%` }}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono-tabular text-zinc-500">
                  <span>-60</span>
                  <span>-36</span>
                  <span>-18</span>
                  <span>-6</span>
                  <span>0 dB</span>
                </div>
              </div>

              {/* Volume Fader */}
              <div className="flex items-center gap-3 pt-0.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={ch.volume}
                  onChange={(e) => onChangeVolume(ch.id, parseInt(e.target.value, 10))}
                  className="studio-slider flex-1"
                  aria-label={`${ch.label} volume`}
                />
                <span className="text-xs font-mono-tabular text-zinc-300 w-10 text-right">
                  {ch.volume}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Audio Encoder Bitrate Selection */}
      <div className="flex items-center justify-between gap-4 p-4 bg-[#14181F] border border-white/[0.08] rounded-xl">
        <div>
          <p className="text-xs font-semibold text-white">AAC Audio Bitrate</p>
          <p className="text-[11px] text-zinc-400">Encoded into shared RTMP & MP4 muxer stream</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-[#0B0D10] rounded-lg border border-white/[0.06]">
          {([128, 192] as const).map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => onChangeAudioBitrate(rate)}
              className={`min-h-[36px] px-3 rounded-md text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 ${
                audioBitrateKbps === rate
                  ? 'bg-[#232A36] text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {rate} kbps
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
