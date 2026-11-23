import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  Move,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Sun,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { STUDIO_ASSETS } from '../data/defaults';
import type {
  AspectOrientation,
  CameraControlState,
  ChatMessage,
  LiveAlertEvent,
  PipConfig,
  SceneLayer,
  SourceMode,
  StreamStatus,
  StreamTelemetry,
  StudioScene,
} from '../types/studio';

interface StudioCanvasProps {
  scene: StudioScene;
  sourceMode: SourceMode;
  orientation: AspectOrientation;
  streamStatus: StreamStatus;
  telemetry: StreamTelemetry;
  camera: CameraControlState;
  pip: PipConfig;
  selectedLayerId: string | null;
  activeAlert: LiveAlertEvent | null;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  showFloatingChat: boolean;
  showFloatingBubble: boolean;
  recentMessages: ChatMessage[];
  micMuted: boolean;
  reconnectMessage: string;
  isRecordingLocal: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, patch: Partial<SceneLayer>) => void;
  onUpdatePip: (patch: Partial<PipConfig>) => void;
  onUpdateCamera: (patch: Partial<CameraControlState>) => void;
  onToggleCameraHardware: () => void;
  onToggleScreenHardware: () => void;
  onToggleMicMute: () => void;
  onToggleFloatingChat: () => void;
  onStopStream: () => void;
  onFocusTap: (normX: number, normY: number) => void;
}

function formatDuration(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export const StudioCanvas: React.FC<StudioCanvasProps> = ({
  scene,
  sourceMode,
  orientation,
  streamStatus,
  telemetry,
  camera,
  pip,
  selectedLayerId,
  activeAlert,
  cameraStream,
  screenStream,
  showFloatingChat,
  showFloatingBubble,
  recentMessages,
  micMuted,
  reconnectMessage,
  isRecordingLocal,
  onSelectLayer,
  onUpdateLayer,
  onUpdatePip,
  onUpdateCamera,
  onToggleCameraHardware,
  onToggleScreenHardware,
  onToggleMicMute,
  onToggleFloatingChat,
  onStopStream,
  onFocusTap,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);

  const [focusReticle, setFocusReticle] = useState<{ x: number; y: number; key: number } | null>(null);
  const [countdownSec, setCountdownSec] = useState<number>(300);
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number }>({ x: 14, y: 56 });
  const [bubbleExpanded, setBubbleExpanded] = useState<boolean>(false);
  const [showSafeArea, setShowSafeArea] = useState<boolean>(false);

  // Sync camera/screen MediaStreams to <video> elements
  useEffect(() => {
    const mainEl = mainVideoRef.current;
    if (!mainEl) return;
    if (sourceMode === 'camera' && cameraStream) {
      mainEl.srcObject = cameraStream;
      mainEl.play().catch(() => {});
    } else if ((sourceMode === 'screen' || sourceMode === 'dual_pip') && screenStream) {
      mainEl.srcObject = screenStream;
      mainEl.play().catch(() => {});
    } else {
      mainEl.srcObject = null;
    }
  }, [sourceMode, cameraStream, screenStream]);

  useEffect(() => {
    const pipEl = pipVideoRef.current;
    if (!pipEl) return;
    if (sourceMode === 'dual_pip' && cameraStream) {
      pipEl.srcObject = cameraStream;
      pipEl.play().catch(() => {});
    } else {
      pipEl.srcObject = null;
    }
  }, [sourceMode, cameraStream]);

  // Countdown tick for countdown timer widgets
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownSec((prev) => (prev > 0 ? prev - 1 : 300));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Pointer drag/resize for Scene Layers
  const beginLayerDrag = (e: React.PointerEvent, layer: SceneLayer, mode: 'move' | 'resize') => {
    if (layer.locked) return;
    e.stopPropagation();
    onSelectLayer(layer.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = layer.x;
    const origY = layer.y;
    const origW = layer.width;
    const origH = layer.height;

    const handleMove = (moveEvent: PointerEvent) => {
      const dxPct = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dyPct = ((moveEvent.clientY - startY) / rect.height) * 100;

      if (mode === 'move') {
        const nextX = Math.max(0, Math.min(100 - origW, origX + dxPct));
        const nextY = Math.max(0, Math.min(100 - origH, origY + dyPct));
        onUpdateLayer(layer.id, {
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
        });
      } else {
        const nextW = Math.max(12, Math.min(100 - origX, origW + dxPct));
        const nextH = Math.max(8, Math.min(100 - origY, origH + dyPct));
        onUpdateLayer(layer.id, {
          width: Math.round(nextW * 10) / 10,
          height: Math.round(nextH * 10) / 10,
        });
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // Pointer drag for PiP facecam overlay
  const beginPipDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = pip.x;
    const origY = pip.y;

    const handleMove = (moveEvent: PointerEvent) => {
      const dxPct = ((moveEvent.clientX - startX) / rect.width) * 100;
      const dyPct = ((moveEvent.clientY - startY) / rect.height) * 100;
      const nextX = Math.max(2, Math.min(96 - pip.size, origX + dxPct));
      const nextY = Math.max(2, Math.min(82, origY + dyPct));
      onUpdatePip({
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  // Pointer drag for Floating Control Bubble preview
  const beginBubbleDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = bubblePos.x;
    const origY = bubblePos.y;
    let moved = false;

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
      const nextX = Math.max(8, Math.min(rect.width - 56, origX + dx));
      const nextY = Math.max(8, Math.min(rect.height - 56, origY + dy));
      setBubblePos({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (!moved) {
        setBubbleExpanded((prev) => !prev);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleCanvasTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onSelectLayer(null);
    }
    if (sourceMode === 'camera') {
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      setFocusReticle({ x: xPct, y: yPct, key: Date.now() });
      onFocusTap(xPct / 100, yPct / 100);
    }
  };

  const cameraFilterCss = `brightness(${1 + camera.brightness / 100}) contrast(${
    1 + camera.beautyFilter / 500
  }) saturate(${1 + camera.beautyFilter / 320})`;

  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const isVertical = orientation === '9:16';

  return (
    <div className="flex flex-col gap-3">
      {/* Live Broadcast Telemetry Bar — Zero-Pill Tabular Readouts */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#14181F] border border-white/[0.08] rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            {streamStatus === 'live' && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" aria-hidden="true" />
            )}
            {streamStatus === 'reconnecting' && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
            )}
            <span
              className={`text-xs font-semibold tracking-wide whitespace-nowrap ${
                streamStatus === 'live'
                  ? 'text-rose-400'
                  : streamStatus === 'reconnecting'
                    ? 'text-amber-300'
                    : streamStatus === 'connecting'
                      ? 'text-sky-300'
                      : 'text-zinc-400'
              }`}
            >
              {streamStatus === 'live'
                ? 'ON AIR'
                : streamStatus === 'reconnecting'
                  ? 'RECONNECTING'
                  : streamStatus === 'connecting'
                    ? 'CONNECTING'
                    : 'PREVIEW'}
            </span>
          </div>
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <span className="text-xs font-mono-tabular text-zinc-200 whitespace-nowrap">
            {formatDuration(telemetry.uptimeSec)}
          </span>
          {isRecordingLocal && (
            <>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span className="text-xs font-mono-tabular text-rose-300 whitespace-nowrap">REC MP4</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono-tabular text-zinc-300 overflow-x-auto">
          <span className="whitespace-nowrap">
            <span className="text-zinc-500 mr-1">FPS</span>
            {telemetry.fps.toFixed(0)}
          </span>
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <span className="whitespace-nowrap">
            <span className="text-zinc-500 mr-1">Bitrate</span>
            {telemetry.bitrateKbps} kbps
          </span>
          <span className="text-zinc-600" aria-hidden="true">·</span>
          <span
            className={`whitespace-nowrap ${
              telemetry.droppedFramesPct > 2
                ? 'text-rose-400'
                : telemetry.droppedFramesPct > 0.5
                  ? 'text-amber-300'
                  : 'text-emerald-400'
            }`}
          >
            <span className="text-zinc-500 mr-1">Dropped</span>
            {telemetry.droppedFramesPct.toFixed(1)}%
          </span>
          <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setShowSafeArea((v) => !v)}
            className={`hidden sm:inline-flex items-center gap-1 text-xs font-sans transition-colors whitespace-nowrap shrink-0 ${
              showSafeArea ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Safe Guides
          </button>
        </div>
      </div>

      {/* Main Compositor Stage */}
      <div className="relative w-full flex items-center justify-center bg-[#090B0E] border border-white/[0.08] rounded-2xl p-3 sm:p-4 overflow-hidden min-h-[340px] lg:min-h-[460px]">
        <div
          ref={canvasRef}
          onClick={handleCanvasTap}
          className={`relative overflow-hidden rounded-xl bg-black shadow-2xl border border-white/10 select-none touch-none ${
            isVertical
              ? 'aspect-[9/16] h-[470px] sm:h-[540px] max-w-full'
              : 'aspect-video w-full max-w-[820px]'
          }`}
        >
          {/* Base Video Feed: Live Hardware Stream or High-Fidelity Fallback Preview */}
          {(sourceMode === 'camera' && cameraStream) ||
          ((sourceMode === 'screen' || sourceMode === 'dual_pip') && screenStream) ? (
            <video
              ref={mainVideoRef}
              autoPlay
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={
                sourceMode === 'camera'
                  ? {
                      transform: `scale(${camera.zoom}) ${camera.facing === 'front' ? 'scaleX(-1)' : ''}`,
                      filter: cameraFilterCss,
                    }
                  : undefined
              }
            />
          ) : (
            <img
              src={sourceMode === 'camera' ? STUDIO_ASSETS.facecamPreview : STUDIO_ASSETS.gameplayBackdrop}
              alt={sourceMode === 'camera' ? 'Camera live preview' : 'Game screen capture preview'}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-150"
              style={
                sourceMode === 'camera'
                  ? {
                      transform: `scale(${camera.zoom}) ${camera.facing === 'front' ? 'scaleX(-1)' : ''}`,
                      filter: cameraFilterCss,
                    }
                  : undefined
              }
            />
          )}

          {/* Subtle Torch Illumination Overlay when Camera Torch enabled */}
          {sourceMode === 'camera' && camera.torch && (
            <div className="absolute inset-0 bg-amber-100/10 pointer-events-none mix-blend-screen" />
          )}

          {/* Broadcast Safe-Area Guides */}
          {showSafeArea && (
            <div className="absolute inset-4 border border-dashed border-white/30 pointer-events-none z-40">
              <div className="absolute inset-4 border border-dotted border-white/20" />
            </div>
          )}

          {/* Tap-to-Focus Reticle in Camera Mode */}
          {sourceMode === 'camera' && focusReticle && (
            <div
              key={focusReticle.key}
              className="absolute w-14 h-14 border border-amber-400 rounded-md pointer-events-none z-40 animate-focus-reticle"
              style={{ left: `${focusReticle.x}%`, top: `${focusReticle.y}%` }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-amber-400 rounded-full" />
            </div>
          )}

          {/* Interactive Scene Layers */}
          {sortedLayers.map((layer) => {
            if (!layer.visible) return null;
            const isSelected = selectedLayerId === layer.id;

            return (
              <div
                key={layer.id}
                onPointerDown={(e) => beginLayerDrag(e, layer, 'move')}
                style={{
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  width: `${layer.width}%`,
                  height: `${layer.height}%`,
                  zIndex: 10 + layer.zIndex,
                  opacity: layer.opacity / 100,
                }}
                className={`absolute group transition-shadow ${
                  layer.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                } ${isSelected ? 'ring-2 ring-rose-500 ring-offset-1 ring-offset-black/60' : 'hover:ring-1 hover:ring-white/40'}`}
              >
                {/* Layer Content */}
                {layer.type === 'web' && (
                  <div
                    className={`w-full h-full rounded-lg overflow-hidden relative ${
                      layer.transparentBg ? 'bg-transparent' : 'bg-[#0F131A]'
                    } border border-white/15`}
                  >
                    <iframe
                      title={layer.name}
                      src={layer.url}
                      className="w-full h-full border-0 pointer-events-none"
                      sandbox="allow-scripts allow-same-origin"
                    />
                    <div className="absolute top-1.5 left-2 text-[10px] font-mono-tabular text-white/80 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none truncate max-w-[85%]">
                      Web · {layer.name}
                    </div>
                  </div>
                )}

                {layer.type === 'slate' && (
                  <div className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center text-center px-6">
                    <img
                      src={STUDIO_ASSETS.slateBackdrop}
                      alt="Stream slate backdrop"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/65" />
                    <div className="relative z-10 max-w-md space-y-2">
                      <p className="text-xs font-medium tracking-wider text-rose-400">
                        {layer.slateTheme === 'starting_soon'
                          ? 'Broadcast Standby'
                          : layer.slateTheme === 'brb'
                            ? 'Short Intermission'
                            : layer.slateTheme === 'stream_ending'
                              ? 'Thanks For Watching'
                              : 'Live Gameplay Frame'}
                      </p>
                      <h3 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight text-balance">
                        {layer.text || 'Stream Starting Soon'}
                      </h3>
                      <p className="text-xs text-zinc-300">
                        CastForge Studio · 1080p 60fps Multistream
                      </p>
                    </div>
                  </div>
                )}

                {layer.type === 'image' && (
                  <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-lg">
                    {layer.imageDataUrl ? (
                      <img
                        src={layer.imageDataUrl}
                        alt={layer.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full border border-dashed border-white/30 bg-black/50 flex items-center justify-center text-xs text-zinc-300 px-2 text-center">
                        Custom PNG/GIF Overlay
                      </div>
                    )}
                  </div>
                )}

                {layer.type === 'text_ticker' && (
                  <div className="w-full h-full bg-black/78 backdrop-blur-sm border-y border-white/15 flex items-center overflow-hidden px-3 rounded">
                    <div className="whitespace-nowrap animate-ticker text-xs sm:text-sm font-medium text-zinc-100 tracking-wide">
                      {layer.text || 'LIVE BROADCAST · FOLLOW & SUBSCRIBE'}
                    </div>
                  </div>
                )}

                {layer.type === 'timer' && (
                  <div className="w-full h-full bg-black/75 backdrop-blur-md border border-white/15 rounded-lg flex flex-col items-center justify-center px-2">
                    <span className="text-[10px] text-zinc-400 leading-none mb-0.5">
                      {layer.timerMode === 'countdown' ? 'Starting In' : 'Live Uptime'}
                    </span>
                    <span className="font-mono-tabular text-sm sm:text-base font-semibold text-white leading-tight">
                      {layer.timerMode === 'countdown'
                        ? formatDuration(countdownSec)
                        : formatDuration(telemetry.uptimeSec)}
                    </span>
                  </div>
                )}

                {layer.type === 'goal_bar' && (
                  <div className="w-full h-full bg-black/78 backdrop-blur-md border border-white/15 rounded-lg px-3 py-1.5 flex flex-col justify-center gap-1">
                    <div className="flex items-center justify-between text-[11px] font-medium text-zinc-100 gap-2">
                      <span className="truncate">{layer.goalLabel || 'Subscriber Goal'}</span>
                      <span className="font-mono-tabular text-zinc-300 shrink-0">
                        {layer.goalCurrent ?? 0} / {layer.goalTarget ?? 100}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/15 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(((layer.goalCurrent ?? 0) / Math.max(1, layer.goalTarget ?? 100)) * 100)
                          )}%`,
                          backgroundColor: layer.accentColor || '#E11D48',
                        }}
                      />
                    </div>
                  </div>
                )}

                {layer.type === 'alert_box' && (
                  <div className="w-full h-full flex items-center justify-center">
                    {activeAlert ? (
                      <div className="w-full bg-[#14181F]/95 border border-rose-500/70 rounded-xl px-4 py-2.5 text-center shadow-xl">
                        <p className="text-[11px] font-semibold text-rose-400">
                          New {activeAlert.kind === 'superchat' ? 'Superchat' : activeAlert.kind === 'subscriber' ? 'Subscriber' : 'Follower'} · {activeAlert.platform.toUpperCase()}
                        </p>
                        <p className="text-sm sm:text-base font-display font-bold text-white truncate">
                          {activeAlert.user}
                        </p>
                        <p className="text-xs text-zinc-300 truncate">{activeAlert.detail}</p>
                      </div>
                    ) : isSelected ? (
                      <div className="w-full h-full border border-dashed border-rose-400/70 bg-rose-950/25 rounded-lg flex items-center justify-center text-[11px] text-rose-200 px-2 text-center">
                        Alert Box Zone (Trigger test alert in Chat tab)
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Selection Header & Resize Handle */}
                {isSelected && !layer.locked && (
                  <>
                    <div className="absolute -top-6 left-0 flex items-center gap-1.5 bg-rose-600 text-white text-[10px] font-medium px-2 py-0.5 rounded-t whitespace-nowrap pointer-events-none">
                      <Move className="w-2.5 h-2.5" />
                      {layer.name} · Z{layer.zIndex}
                    </div>
                    <button
                      type="button"
                      aria-label={`Resize ${layer.name}`}
                      onPointerDown={(e) => beginLayerDrag(e, layer, 'resize')}
                      className="absolute -bottom-2 -right-2 w-5 h-5 rounded-full bg-white text-zinc-900 border-2 border-rose-600 flex items-center justify-center cursor-nwse-resize shadow"
                    >
                      <Maximize2 className="w-2.5 h-2.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Dual Camera / PiP Draggable Facecam Overlay */}
          {sourceMode === 'dual_pip' && pip.visible && (
            <div
              onPointerDown={beginPipDrag}
              style={{
                left: `${pip.x}%`,
                top: `${pip.y}%`,
                width: `${pip.size}%`,
                aspectRatio: pip.frameStyle === 'circle' ? '1 / 1' : '4 / 3',
                zIndex: 35,
              }}
              className={`absolute overflow-hidden border-2 border-white/85 shadow-2xl cursor-grab active:cursor-grabbing bg-black ${
                pip.frameStyle === 'circle' ? 'rounded-full' : 'rounded-2xl'
              }`}
            >
              {cameraStream ? (
                <video
                  ref={pipVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                  style={{
                    transform: camera.facing === 'front' ? 'scaleX(-1)' : undefined,
                    filter: cameraFilterCss,
                  }}
                />
              ) : (
                <img
                  src={STUDIO_ASSETS.facecamPreview}
                  alt="PiP facecam preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover pointer-events-none"
                  style={{ filter: cameraFilterCss }}
                />
              )}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/65 px-2 py-0.5 rounded text-[9px] font-medium text-white/90 whitespace-nowrap pointer-events-none">
                Facecam PiP
              </div>
            </div>
          )}

          {/* Floating In-Game Chat Overlay */}
          {showFloatingChat && (
            <div className="absolute left-3 bottom-3 w-[62%] max-w-[270px] z-36 pointer-events-none space-y-1">
              {recentMessages.slice(-3).map((msg) => (
                <div
                  key={msg.id}
                  className="bg-black/72 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1 text-[11px] leading-snug text-zinc-100"
                >
                  <span className="font-semibold text-rose-300 mr-1.5">{msg.author}</span>
                  <span className="text-zinc-200">{msg.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Draggable Floating Control Bubble (Android SYSTEM_ALERT_WINDOW interactive preview) */}
          {showFloatingBubble && (sourceMode === 'screen' || sourceMode === 'dual_pip') && (
            <div
              style={{ left: `${bubblePos.x}px`, top: `${bubblePos.y}px` }}
              className="absolute z-45 flex items-center gap-2"
            >
              <button
                type="button"
                onPointerDown={beginBubbleDrag}
                title="Drag or tap Floating Control Bubble"
                className="w-11 h-11 rounded-full bg-rose-600 text-white border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold tracking-tight cursor-grab active:cursor-grabbing shrink-0"
              >
                {streamStatus === 'live' ? 'LIVE' : 'CTRL'}
              </button>
              {bubbleExpanded && (
                <div className="flex items-center gap-1 bg-[#14181F]/95 backdrop-blur-md border border-white/15 rounded-full px-2 py-1 shadow-xl">
                  <button
                    type="button"
                    onClick={onToggleMicMute}
                    className={`min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center transition-colors ${
                      micMuted ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-200 hover:bg-white/10'
                    }`}
                    title={micMuted ? 'Unmute Mic' : 'Mute Mic'}
                  >
                    {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleFloatingChat}
                    className={`min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center transition-colors ${
                      showFloatingChat ? 'bg-white/15 text-white' : 'text-zinc-400 hover:bg-white/10'
                    }`}
                    title="Toggle Chat Overlay"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  {streamStatus !== 'idle' && (
                    <button
                      type="button"
                      onClick={onStopStream}
                      className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors"
                      title="Stop Stream"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBubbleExpanded(false)}
                    className="min-h-[36px] min-w-[36px] rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
                    title="Collapse Bubble"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Disconnect Protection Fallback "Reconnecting..." Slate */}
          {streamStatus === 'reconnecting' && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center text-center px-6 bg-black/88 backdrop-blur-md">
              <img
                src={STUDIO_ASSETS.slateBackdrop}
                alt="Reconnecting slate"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-35"
              />
              <div className="relative z-10 max-w-sm space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto">
                  <WifiOff className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-display font-bold text-white">Disconnect Protection Active</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">{reconnectMessage}</p>
                <div className="flex items-center justify-center gap-2 text-xs font-mono-tabular text-amber-300 pt-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Attempt #{telemetry.reconnectAttempt} · Retrying in {telemetry.reconnectNextSec}s
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Holding YouTube & Kick broadcast sessions open with fallback keyframes
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contextual Hardware Control Strip under Canvas */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#14181F] border border-white/[0.08] rounded-xl">
        {/* Live Hardware Input Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {(sourceMode === 'screen' || sourceMode === 'dual_pip') && (
            <button
              type="button"
              onClick={onToggleScreenHardware}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                screenStream
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-[#1C222C] text-zinc-200 hover:bg-[#242C38] border border-white/[0.08]'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              {screenStream ? 'Stop Screen Feed' : 'Capture Live Screen'}
            </button>
          )}

          {(sourceMode === 'camera' || sourceMode === 'dual_pip') && (
            <button
              type="button"
              onClick={onToggleCameraHardware}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                cameraStream
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-[#1C222C] text-zinc-200 hover:bg-[#242C38] border border-white/[0.08]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              {cameraStream ? 'Stop Camera Feed' : 'Enable Live Camera'}
            </button>
          )}
        </div>

        {/* Camera Mode Specific Controls */}
        {sourceMode === 'camera' && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onUpdateCamera({ facing: camera.facing === 'front' ? 'back' : 'front' })}
              className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#1C222C] hover:bg-[#242C38] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {camera.facing === 'front' ? 'Front Cam' : 'Back Cam'}
            </button>

            <button
              type="button"
              onClick={() => onUpdateCamera({ torch: !camera.torch })}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                camera.torch
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                  : 'bg-[#1C222C] border-white/[0.08] text-zinc-300 hover:bg-[#242C38]'
              }`}
            >
              {camera.torch ? <Flashlight className="w-3.5 h-3.5" /> : <FlashlightOff className="w-3.5 h-3.5" />}
              Torch
            </button>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <Camera className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-mono-tabular w-9">{camera.zoom.toFixed(1)}x</span>
              <input
                type="range"
                min={1}
                max={4}
                step={0.1}
                value={camera.zoom}
                onChange={(e) => onUpdateCamera({ zoom: parseFloat(e.target.value) })}
                className="studio-slider w-20"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <Sparkles className="w-3.5 h-3.5 text-zinc-400" />
              <span className="whitespace-nowrap">Beauty</span>
              <input
                type="range"
                min={0}
                max={100}
                value={camera.beautyFilter}
                onChange={(e) => onUpdateCamera({ beautyFilter: parseInt(e.target.value, 10) })}
                className="studio-slider w-16"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <Sun className="w-3.5 h-3.5 text-zinc-400" />
              <span className="whitespace-nowrap">Bright</span>
              <input
                type="range"
                min={-30}
                max={30}
                value={camera.brightness}
                onChange={(e) => onUpdateCamera({ brightness: parseInt(e.target.value, 10) })}
                className="studio-slider w-16"
              />
            </label>
          </div>
        )}

        {/* Dual Camera / PiP Controls */}
        {sourceMode === 'dual_pip' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#0F1218] p-1 rounded-lg border border-white/[0.06]">
              <button
                type="button"
                onClick={() => onUpdatePip({ frameStyle: 'rounded-square' })}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  pip.frameStyle === 'rounded-square' ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Rounded
              </button>
              <button
                type="button"
                onClick={() => onUpdatePip({ frameStyle: 'circle' })}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  pip.frameStyle === 'circle' ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Circle
              </button>
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'top-left', label: 'TL', x: 4, y: 5 },
                  { id: 'top-right', label: 'TR', x: 70, y: 5 },
                  { id: 'bottom-left', label: 'BL', x: 4, y: 62 },
                  { id: 'bottom-right', label: 'BR', x: 70, y: 62 },
                ] as const
              ).map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => onUpdatePip({ corner: pos.id, x: pos.x, y: pos.y })}
                  className={`min-h-[36px] min-w-[36px] px-2 rounded-lg text-xs font-mono-tabular border transition-colors ${
                    pip.corner === pos.id
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold'
                      : 'bg-[#1C222C] text-zinc-300 border-white/[0.08] hover:bg-[#252D3A]'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
