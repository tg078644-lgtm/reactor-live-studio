import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Layers,
  MessageSquare,
  Monitor,
  PictureInPicture2,
  Radio,
  Sliders,
  Smartphone,
  Square,
  Video,
} from 'lucide-react';
import { streamEngineBridge } from './bridge/streamEngine';
import { AndroidPackagePanel } from './components/AndroidPackagePanel';
import { AudioMixerPanel } from './components/AudioMixerPanel';
import { DestinationsPanel } from './components/DestinationsPanel';
import { LiveChatPanel } from './components/LiveChatPanel';
import { SceneEditorPanel } from './components/SceneEditorPanel';
import { StudioCanvas } from './components/StudioCanvas';
import {
  DEFAULT_AUDIO_CHANNELS,
  DEFAULT_CAMERA,
  DEFAULT_DESTINATIONS,
  DEFAULT_PIP,
  DEFAULT_QUALITY,
  DEFAULT_SCENES,
  INITIAL_CHAT_MESSAGES,
} from './data/defaults';
import type {
  AudioChannelState,
  CameraControlState,
  ChatMessage,
  LiveAlertEvent,
  NativeCapabilities,
  PipConfig,
  RtmpDestination,
  SceneLayer,
  SourceMode,
  StreamQualityConfig,
  StreamStatus,
  StreamTelemetry,
  StudioScene,
  VodRecording,
} from './types/studio';

type PrimaryNavTab = 'studio' | 'destinations' | 'mixer' | 'android';
type StudioDockTab = 'scenes' | 'audio' | 'chat';

const LIVE_SIMULATED_CHAT: { platform: 'youtube' | 'kick'; author: string; message: string }[] = [
  { platform: 'youtube', author: 'Amina_GG', message: 'No frame drops at all, bitrates looking rock solid!' },
  { platform: 'kick', author: 'DevonFPS', message: 'Can you switch to the Dual PiP facecam for the next round?' },
  { platform: 'youtube', author: 'LeoBuilds', message: 'Checking in from the YouTube side of the multistream!' },
  { platform: 'kick', author: 'PixelKitsune', message: 'That web source overlay sits cleanly over the arena UI.' },
];

function nowStamp(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function App() {
  // Navigation
  const [activeNav, setActiveNav] = useState<PrimaryNavTab>('studio');
  const [studioDockTab, setStudioDockTab] = useState<StudioDockTab>('scenes');

  // Core Broadcast State
  const [scenes, setScenes] = useState<StudioScene[]>(() => streamEngineBridge.loadScenesLocal() ?? DEFAULT_SCENES);
  const [activeSceneId, setActiveSceneId] = useState<string>(() => {
    const loaded = streamEngineBridge.loadScenesLocal();
    return loaded?.[0]?.id ?? DEFAULT_SCENES[0].id;
  });
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('layer-web-arena');
  const [sourceMode, setSourceMode] = useState<SourceMode>('dual_pip');
  const [destinations, setDestinations] = useState<RtmpDestination[]>(DEFAULT_DESTINATIONS);
  const [storageBackendLabel, setStorageBackendLabel] = useState<string>('EncryptedSharedPreferences Vault');
  const [quality, setQuality] = useState<StreamQualityConfig>(
    () => streamEngineBridge.loadQualityLocal() ?? DEFAULT_QUALITY
  );
  const [camera, setCamera] = useState<CameraControlState>(DEFAULT_CAMERA);
  const [pip, setPip] = useState<PipConfig>(DEFAULT_PIP);
  const [audioChannels, setAudioChannels] = useState<AudioChannelState[]>(DEFAULT_AUDIO_CHANNELS);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT_MESSAGES);
  const [activeAlert, setActiveAlert] = useState<LiveAlertEvent | null>(null);
  const [showFloatingChat, setShowFloatingChat] = useState<boolean>(false);
  const [showFloatingBubble, setShowFloatingBubble] = useState<boolean>(true);
  const [recordings, setRecordings] = useState<VodRecording[]>([]);

  // Live Runtime & Telemetry
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('idle');
  const [telemetry, setTelemetry] = useState<StreamTelemetry>({
    fps: 60,
    droppedFramesPct: 0,
    bitrateKbps: 0,
    uptimeSec: 0,
    activeEndpoints: 0,
    reconnectAttempt: 0,
    reconnectNextSec: 0,
  });
  const [capabilities, setCapabilities] = useState<NativeCapabilities>({
    isNativeAndroid: false,
    sdkInt: 35,
    supportsInternalAudio: true,
    hasCameraPermission: true,
    hasMicPermission: true,
    hasOverlayPermission: true,
    serviceRunning: false,
  });
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);

  // Live Browser MediaStreams & Audio Analyser Refs
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micHardwareActive, setMicHardwareActive] = useState<boolean>(false);

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamStartEpochRef = useRef<number>(0);
  const alertTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const chatSimIdxRef = useRef<number>(0);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];
  const micChannel = audioChannels.find((c) => c.id === 'mic') ?? audioChannels[0];
  const armedDestinations = destinations.filter((d) => d.enabled && d.rtmpUrl.trim() && d.streamKey.trim());

  // Initialize Capacitor native bridge & load encrypted RTMP vault
  useEffect(() => {
    let mounted = true;
    streamEngineBridge.getCapabilities().then((caps) => {
      if (mounted) setCapabilities(caps);
    });
    streamEngineBridge.loadDestinations().then((saved) => {
      if (mounted && saved) setDestinations(saved);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist scenes & quality settings
  useEffect(() => {
    streamEngineBridge.saveScenesLocal(scenes);
  }, [scenes]);

  useEffect(() => {
    streamEngineBridge.saveQualityLocal(quality);
  }, [quality]);

  // Real-time Audio dB Meter Loop (uses real Web Audio API AnalyserNode when mic connected)
  useEffect(() => {
    const dataArray = new Uint8Array(256);
    const interval = window.setInterval(() => {
      let realMicDb: number | null = null;
      if (analyserRef.current && micHardwareActive) {
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSq += normalized * normalized;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        realMicDb = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(rms, 0.001))));
      }

      setAudioChannels((prev) =>
        prev.map((ch) => {
          if (ch.muted || ch.volume === 0) {
            return { ...ch, db: -60, peakDb: Math.max(-60, ch.peakDb - 4) };
          }
          const gainFactor = ch.volume / 100;
          let targetDb: number;
          if (ch.id === 'mic' && realMicDb !== null) {
            targetDb = Math.max(-60, realMicDb + (gainFactor - 0.85) * 18);
          } else {
            const activeBoost = streamStatus === 'live' ? 14 : 6;
            const baseNoise = ch.id === 'mic' ? -30 : ch.id === 'game' ? -24 : -34;
            const jitter = (Math.random() - 0.42) * 14;
            targetDb = Math.max(-58, Math.min(-2, (baseNoise + activeBoost + jitter) * (0.45 + 0.55 * gainFactor)));
          }
          const nextPeak = targetDb > ch.peakDb ? targetDb : Math.max(targetDb, ch.peakDb - 1.5);
          return { ...ch, db: targetDb, peakDb: nextPeak };
        })
      );
    }, 110);

    return () => window.clearInterval(interval);
  }, [micHardwareActive, streamStatus]);

  // Live Telemetry & Periodic Chat Feed while ON AIR
  useEffect(() => {
    if (streamStatus !== 'live') return;

    const tick = window.setInterval(() => {
      const elapsed = Math.max(1, Math.floor((Date.now() - streamStartEpochRef.current) / 1000));
      const bitrateJitter = Math.round((Math.random() - 0.5) * 180);
      const fpsJitter = Math.random() > 0.9 ? -1 : 0;
      const dropped = Math.random() > 0.88 ? Number((Math.random() * 0.4).toFixed(1)) : 0;

      setTelemetry((prev) => ({
        ...prev,
        fps: Math.max(24, quality.fps + fpsJitter),
        bitrateKbps: quality.offlineRecordOnly ? 0 : Math.max(800, quality.videoBitrateKbps + bitrateJitter),
        droppedFramesPct: dropped,
        uptimeSec: elapsed,
        activeEndpoints: quality.offlineRecordOnly ? 0 : armedDestinations.length,
        reconnectAttempt: 0,
        reconnectNextSec: 0,
      }));

      // Incoming chat pulse every ~9 seconds while live
      if (elapsed % 9 === 0) {
        const sample = LIVE_SIMULATED_CHAT[chatSimIdxRef.current % LIVE_SIMULATED_CHAT.length];
        chatSimIdxRef.current += 1;
        setMessages((prev) => [
          ...prev.slice(-45),
          {
            id: `live-msg-${Date.now()}`,
            platform: sample.platform,
            author: sample.author,
            message: sample.message,
            timestamp: nowStamp(),
            type: 'chat',
          },
        ]);
      }
    }, 1000);

    return () => window.clearInterval(tick);
  }, [streamStatus, quality.fps, quality.videoBitrateKbps, quality.offlineRecordOnly, armedDestinations.length]);

  // Cleanup active streams on unmount
  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((t) => t.stop());
      screenStream?.getTracks().forEach((t) => t.stop());
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, [cameraStream, screenStream]);

  const showTempNotice = useCallback((text: string) => {
    setNoticeBanner(text);
    window.setTimeout(() => {
      setNoticeBanner((curr) => (curr === text ? null : curr));
    }, 4000);
  }, []);

  // Hardware Media Toggles
  const handleToggleCameraHardware = async () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      setCamera((c) => ({ ...c, liveHardwareActive: false }));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showTempNotice('Camera hardware API is unavailable in this browser context; using studio preview.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camera.facing === 'front' ? 'user' : 'environment' },
        audio: false,
      });
      setCameraStream(stream);
      setCamera((c) => ({ ...c, liveHardwareActive: true }));
    } catch {
      showTempNotice('Camera permission declined or no camera found — keeping preview backdrop active.');
    }
  };

  const handleToggleScreenHardware = async () => {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      showTempNotice('Screen capture uses Android MediaProjection inside the APK; using arena preview here.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => setScreenStream(null);
      }
      setScreenStream(stream);
    } catch {
      showTempNotice('Screen capture prompt dismissed — continuing with studio gameplay preview.');
    }
  };

  const handleToggleLiveMicCapture = async () => {
    if (micHardwareActive) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
      setMicHardwareActive(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showTempNotice('Microphone capture unavailable in this environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      micStreamRef.current = stream;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setMicHardwareActive(true);
      showTempNotice('Live microphone connected to real-time dB meter.');
    } catch {
      showTempNotice('Microphone permission was denied.');
    }
  };

  // Start / Stop Broadcast & Local VOD Recording
  const startLocalRecorderIfPossible = () => {
    const activeMedia = screenStream ?? cameraStream;
    recordedChunksRef.current = [];
    if (activeMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const recorder = new MediaRecorder(activeMedia);
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          const dur = Math.max(1, Math.floor((Date.now() - streamStartEpochRef.current) / 1000));
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          setRecordings((prev) => [
            {
              id: `vod-${Date.now()}`,
              filename: `CastForge_${stamp}.mp4`,
              durationSec: dur,
              sizeMb: Math.max(0.2, blob.size / (1024 * 1024)),
              createdAt: nowStamp(),
              resolution: `${quality.resolution} ${quality.fps}fps`,
              downloadUrl: url,
            },
            ...prev,
          ]);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch {
        mediaRecorderRef.current = null;
      }
    }
  };

  const handleGoLiveToggle = async () => {
    if (streamStatus !== 'idle') {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      await streamEngineBridge.stopStream();

      const durationSec = Math.max(1, Math.floor((Date.now() - streamStartEpochRef.current) / 1000));
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      } else if (quality.recordLocalVod || quality.offlineRecordOnly) {
        // Record metadata entry when running in preview without active MediaRecorder stream
        const estMb = Math.max(0.4, (durationSec * quality.videoBitrateKbps) / 8192);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        setRecordings((prev) => [
          {
            id: `vod-${Date.now()}`,
            filename: `CastForge_${stamp}.mp4`,
            durationSec,
            sizeMb: estMb,
            createdAt: nowStamp(),
            resolution: `${quality.resolution} ${quality.fps}fps`,
          },
          ...prev,
        ]);
      }

      setStreamStatus('idle');
      setTelemetry((prev) => ({
        ...prev,
        bitrateKbps: 0,
        droppedFramesPct: 0,
        uptimeSec: 0,
        activeEndpoints: 0,
        reconnectAttempt: 0,
        reconnectNextSec: 0,
      }));
      showTempNotice('Broadcast ended cleanly and Foreground Service stopped.');
      return;
    }

    if (!quality.offlineRecordOnly && armedDestinations.length === 0) {
      setActiveNav('destinations');
      showTempNotice('Enable at least one RTMP destination with a Stream Key before going live.');
      return;
    }

    setStreamStatus('connecting');
    try {
      await streamEngineBridge.startStream({
        destinations: armedDestinations,
        quality,
        activeScene,
        sourceMode,
        recordLocal: quality.recordLocalVod,
        offlineRecordOnly: quality.offlineRecordOnly,
        disconnectProtection: quality.disconnectProtection,
        showFloatingBubble,
      });

      window.setTimeout(() => {
        streamStartEpochRef.current = Date.now();
        if (quality.recordLocalVod || quality.offlineRecordOnly) {
          startLocalRecorderIfPossible();
        }
        setStreamStatus('live');
        setTelemetry({
          fps: quality.fps,
          droppedFramesPct: 0,
          bitrateKbps: quality.offlineRecordOnly ? 0 : quality.videoBitrateKbps,
          uptimeSec: 1,
          activeEndpoints: quality.offlineRecordOnly ? 0 : armedDestinations.length,
          reconnectAttempt: 0,
          reconnectNextSec: 0,
        });
      }, 650);
    } catch {
      setStreamStatus('idle');
      showTempNotice('Unable to start streaming session. Verify permissions and try again.');
    }
  };

  // Disconnect Protection Exponential Backoff Simulation
  const handleSimulateNetworkDrop = () => {
    if (streamStatus !== 'live' || !quality.disconnectProtection) return;
    setActiveNav('studio');
    setStreamStatus('reconnecting');
    setTelemetry((prev) => ({ ...prev, bitrateKbps: 0, reconnectAttempt: 1, reconnectNextSec: 2 }));

    reconnectTimerRef.current = window.setTimeout(() => {
      setTelemetry((prev) => ({ ...prev, reconnectAttempt: 2, reconnectNextSec: 4 }));
      reconnectTimerRef.current = window.setTimeout(() => {
        setStreamStatus('live');
        setTelemetry((prev) => ({
          ...prev,
          bitrateKbps: quality.videoBitrateKbps,
          reconnectAttempt: 0,
          reconnectNextSec: 0,
        }));
        showTempNotice('Disconnect Protection restored RTMP multistream without ending broadcast.');
      }, 3200);
    }, 2000);
  };

  // Scene & Layer Mutations
  const handleSelectScene = (sceneId: string) => {
    setActiveSceneId(sceneId);
    const next = scenes.find((s) => s.id === sceneId);
    if (next) {
      setSourceMode(next.sourceMode);
      setSelectedLayerId(next.layers[0]?.id ?? null);
      streamEngineBridge.switchScene(next);
    }
  };

  const handleAddScene = () => {
    const newScene: StudioScene = {
      id: `scene-${Date.now()}`,
      name: `Scene ${scenes.length + 1}`,
      sourceMode,
      layers: [],
    };
    setScenes((prev) => [...prev, newScene]);
    setActiveSceneId(newScene.id);
    setSelectedLayerId(null);
  };

  const handleAddLayer = (layerInput: Omit<SceneLayer, 'id' | 'zIndex'>) => {
    const maxZ = activeScene.layers.reduce((m, l) => Math.max(m, l.zIndex), 0);
    const created: SceneLayer = {
      ...layerInput,
      id: `layer-${Date.now()}`,
      zIndex: maxZ + 1,
    };
    setScenes((prev) =>
      prev.map((s) => (s.id === activeScene.id ? { ...s, layers: [...s.layers, created] } : s))
    );
    setSelectedLayerId(created.id);
  };

  const handleUpdateLayer = (layerId: string, patch: Partial<SceneLayer>) => {
    setScenes((prev) =>
      prev.map((s) =>
        s.id === activeScene.id
          ? {
              ...s,
              layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)),
            }
          : s
      )
    );
  };

  const handleDeleteLayer = (layerId: string) => {
    setScenes((prev) =>
      prev.map((s) =>
        s.id === activeScene.id
          ? { ...s, layers: s.layers.filter((l) => l.id !== layerId) }
          : s
      )
    );
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  };

  const handleReorderLayer = (layerId: string, direction: 'up' | 'down') => {
    const ordered = [...activeScene.layers].sort((a, b) => b.zIndex - a.zIndex);
    const idx = ordered.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;

    const currentZ = ordered[idx].zIndex;
    const targetZ = ordered[swapIdx].zIndex;
    const targetId = ordered[swapIdx].id;

    setScenes((prev) =>
      prev.map((s) =>
        s.id === activeScene.id
          ? {
              ...s,
              layers: s.layers.map((l) => {
                if (l.id === layerId) return { ...l, zIndex: targetZ };
                if (l.id === targetId) return { ...l, zIndex: currentZ };
                return l;
              }),
            }
          : s
      )
    );
  };

  const handleSourceModeSwitch = (mode: SourceMode) => {
    setSourceMode(mode);
    setScenes((prev) =>
      prev.map((s) => (s.id === activeScene.id ? { ...s, sourceMode: mode } : s))
    );
    streamEngineBridge.setSourceMode(mode, pip);
  };

  // Audio Mixer Actions
  const syncAudioToNative = (nextChannels: AudioChannelState[]) => {
    const mic = nextChannels.find((c) => c.id === 'mic')!;
    const game = nextChannels.find((c) => c.id === 'game')!;
    const web = nextChannels.find((c) => c.id === 'web')!;
    streamEngineBridge.syncAudioMix({
      micGain: mic.volume / 100,
      micMuted: mic.muted,
      gameGain: game.volume / 100,
      gameMuted: game.muted,
      webGain: web.volume / 100,
      webMuted: web.muted,
    });
  };

  const handleAudioVolumeChange = (id: AudioChannelState['id'], volume: number) => {
    setAudioChannels((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, volume } : c));
      syncAudioToNative(next);
      return next;
    });
  };

  const handleAudioMuteToggle = (id: AudioChannelState['id']) => {
    setAudioChannels((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c));
      syncAudioToNative(next);
      return next;
    });
  };

  // Chat & Alert Triggers
  const handleSendMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `host-${Date.now()}`,
        platform: 'youtube',
        author: 'Host (You)',
        message: text,
        timestamp: nowStamp(),
        type: 'chat',
      },
    ]);
  };

  const handleTriggerAlert = (alertInput: Omit<LiveAlertEvent, 'id'>) => {
    const event: LiveAlertEvent = { ...alertInput, id: `alert-${Date.now()}` };
    setActiveAlert(event);
    setMessages((prev) => [
      ...prev,
      {
        id: `event-${Date.now()}`,
        platform: alertInput.platform,
        author: alertInput.user,
        message: alertInput.detail,
        timestamp: nowStamp(),
        type: alertInput.kind,
        amount: alertInput.kind === 'superchat' ? '$25.00' : undefined,
      },
    ]);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setActiveAlert(null), 4800);
  };

  // Destination & Profile Actions
  const handleSaveDestinations = async () => {
    const res = await streamEngineBridge.saveDestinations(destinations);
    setStorageBackendLabel(res.storage);
  };

  const handleExportStudioProfile = () => {
    const payload = {
      app: 'CastForge Studio',
      packageId: 'com.castforge.studio',
      exportedAt: new Date().toISOString(),
      quality,
      scenes,
      destinations: destinations.map((d) => ({ ...d, streamKey: d.streamKey ? '***REDACTED***' : '' })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'castforge-studio-profile.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const primaryCtaLabel =
    streamStatus === 'live'
      ? 'End Stream'
      : streamStatus === 'connecting'
        ? 'Connecting...'
        : streamStatus === 'reconnecting'
          ? 'Stop Reconnect'
          : quality.offlineRecordOnly
            ? 'Start Recording'
            : 'Go Live';

  return (
    <div className="min-h-screen bg-[#0B0D10] text-zinc-100 flex flex-col">
      {/* Top Bar — Strict 3-Zone Contract */}
      <header className="sticky top-0 z-40 h-14 px-4 sm:px-6 bg-[#0B0D10]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveNav('studio')}
          className="text-base sm:text-lg font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          CastForge Studio
        </button>

        {/* Zone 2: 4 Single-line Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {(
            [
              { id: 'studio', label: 'Studio' },
              { id: 'destinations', label: 'Destinations' },
              { id: 'mixer', label: 'Mixer & Chat' },
              { id: 'android', label: 'Android APK' },
            ] as const
          ).map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveNav(item.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-rose-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Broadcast Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={handleGoLiveToggle}
            className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              streamStatus !== 'idle'
                ? 'bg-zinc-100 hover:bg-white text-zinc-950'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {streamStatus !== 'idle' ? (
              <Square className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Radio className="w-4 h-4" />
            )}
            {primaryCtaLabel}
          </button>
        </div>
      </header>

      {/* Non-intrusive Status Notice Toast */}
      {noticeBanner && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="max-w-7xl mx-auto px-4 py-2.5 rounded-xl bg-[#181E28] border border-white/[0.1] text-xs text-zinc-200 flex items-center justify-between gap-4">
            <span>{noticeBanner}</span>
            <button
              type="button"
              onClick={() => setNoticeBanner(null)}
              className="text-zinc-400 hover:text-white text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Canvas */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-24 md:pb-8">
        {activeNav === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Primary Broadcast Viewport Column */}
            <div className="lg:col-span-8 space-y-3">
              {/* Source Switcher & Orientation Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-1 p-1 bg-[#14181F] border border-white/[0.08] rounded-xl overflow-x-auto max-w-full">
                  {(
                    [
                      { id: 'screen', label: 'Screen Capture', icon: Monitor },
                      { id: 'camera', label: 'Camera IRL', icon: Camera },
                      { id: 'dual_pip', label: 'Dual PiP', icon: PictureInPicture2 },
                    ] as const
                  ).map((mode) => {
                    const Icon = mode.icon;
                    const active = sourceMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleSourceModeSwitch(mode.id)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                          active ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {mode.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick 9:16 vs 16:9 Orientation Switch */}
                  <div className="flex items-center gap-1 p-1 bg-[#14181F] border border-white/[0.08] rounded-xl">
                    {(['9:16', '16:9'] as const).map((orient) => (
                      <button
                        key={orient}
                        type="button"
                        onClick={() => setQuality((q) => ({ ...q, orientation: orient }))}
                        className={`min-h-[36px] px-2.5 rounded-lg text-xs font-mono-tabular font-medium transition-colors whitespace-nowrap shrink-0 ${
                          quality.orientation === orient
                            ? 'bg-[#232A36] text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {orient}
                      </button>
                    ))}
                  </div>

                  {/* Quick Floating Bubble Toggle */}
                  {(sourceMode === 'screen' || sourceMode === 'dual_pip') && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showFloatingBubble;
                        setShowFloatingBubble(next);
                        streamEngineBridge.setFloatingBubble(next).catch(() => {});
                      }}
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        showFloatingBubble
                          ? 'bg-rose-600/15 border-rose-500/45 text-rose-200'
                          : 'bg-[#14181F] border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Bubble {showFloatingBubble ? 'On' : 'Off'}
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Compositor Stage */}
              <StudioCanvas
                scene={activeScene}
                sourceMode={sourceMode}
                orientation={quality.orientation}
                streamStatus={streamStatus}
                telemetry={telemetry}
                camera={camera}
                pip={pip}
                selectedLayerId={selectedLayerId}
                activeAlert={activeAlert}
                cameraStream={cameraStream}
                screenStream={screenStream}
                showFloatingChat={showFloatingChat}
                showFloatingBubble={showFloatingBubble}
                recentMessages={messages}
                micMuted={micChannel.muted}
                reconnectMessage={quality.reconnectSlateMessage}
                isRecordingLocal={streamStatus !== 'idle' && (quality.recordLocalVod || quality.offlineRecordOnly)}
                onSelectLayer={setSelectedLayerId}
                onUpdateLayer={handleUpdateLayer}
                onUpdatePip={(patch) => setPip((prev) => ({ ...prev, ...patch }))}
                onUpdateCamera={(patch) => {
                  setCamera((prev) => {
                    const next = { ...prev, ...patch };
                    streamEngineBridge.applyCameraControl(next);
                    return next;
                  });
                }}
                onToggleCameraHardware={handleToggleCameraHardware}
                onToggleScreenHardware={handleToggleScreenHardware}
                onToggleMicMute={() => handleAudioMuteToggle('mic')}
                onToggleFloatingChat={() => setShowFloatingChat((v) => !v)}
                onStopStream={handleGoLiveToggle}
                onFocusTap={(x, y) => streamEngineBridge.applyCameraControl(camera, { x, y })}
              />

              {/* Compact Multistream Summary Strip below Canvas */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#14181F] border border-white/[0.08] rounded-xl text-xs">
                <div className="flex flex-wrap items-center gap-2 text-zinc-300">
                  <span className="font-medium text-white">Output</span>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {quality.resolution} {quality.orientation} {quality.fps}fps · {quality.videoBitrateKbps} kbps
                  </span>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span>
                    {quality.offlineRecordOnly
                      ? 'Offline MP4 Recording'
                      : armedDestinations.length > 0
                        ? armedDestinations.map((d) => d.name).join(' + ')
                        : 'No RTMP target armed'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav('destinations')}
                  className="text-rose-400 hover:text-rose-300 font-medium whitespace-nowrap shrink-0"
                >
                  Configure RTMP
                </button>
              </div>
            </div>

            {/* Right Studio Control Dock (Scenes / Audio / Chat) */}
            <aside className="lg:col-span-4 bg-[#11151C] border border-white/[0.08] rounded-2xl p-4 space-y-4">
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D10] rounded-xl border border-white/[0.06]">
                {(
                  [
                    { id: 'scenes', label: 'Scenes', icon: Layers },
                    { id: 'audio', label: 'Audio', icon: Sliders },
                    { id: 'chat', label: 'Chat', icon: MessageSquare },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const active = studioDockTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStudioDockTab(tab.id)}
                      className={`min-h-[38px] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                        active ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {studioDockTab === 'scenes' && (
                <SceneEditorPanel
                  scenes={scenes}
                  activeSceneId={activeScene.id}
                  selectedLayerId={selectedLayerId}
                  onSelectScene={handleSelectScene}
                  onAddScene={handleAddScene}
                  onSelectLayer={setSelectedLayerId}
                  onAddLayer={handleAddLayer}
                  onUpdateLayer={handleUpdateLayer}
                  onDeleteLayer={handleDeleteLayer}
                  onReorderLayer={handleReorderLayer}
                />
              )}

              {studioDockTab === 'audio' && (
                <AudioMixerPanel
                  channels={audioChannels}
                  audioBitrateKbps={quality.audioBitrateKbps}
                  micHardwareActive={micHardwareActive}
                  onChangeVolume={handleAudioVolumeChange}
                  onToggleMute={handleAudioMuteToggle}
                  onChangeAudioBitrate={(rate) => setQuality((q) => ({ ...q, audioBitrateKbps: rate }))}
                  onToggleLiveMicCapture={handleToggleLiveMicCapture}
                />
              )}

              {studioDockTab === 'chat' && (
                <LiveChatPanel
                  messages={messages}
                  showFloatingChat={showFloatingChat}
                  onToggleFloatingChat={() => setShowFloatingChat((v) => !v)}
                  onSendMessage={handleSendMessage}
                  onTriggerAlert={handleTriggerAlert}
                />
              )}
            </aside>
          </div>
        )}

        {activeNav === 'destinations' && (
          <DestinationsPanel
            destinations={destinations}
            quality={quality}
            streamStatus={streamStatus}
            storageBackendLabel={storageBackendLabel}
            recordings={recordings}
            onUpdateDestination={(id, patch) =>
              setDestinations((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
            }
            onSaveDestinations={handleSaveDestinations}
            onUpdateQuality={(patch) => setQuality((prev) => ({ ...prev, ...patch }))}
            onSimulateNetworkDrop={handleSimulateNetworkDrop}
          />
        )}

        {activeNav === 'mixer' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <AudioMixerPanel
              channels={audioChannels}
              audioBitrateKbps={quality.audioBitrateKbps}
              micHardwareActive={micHardwareActive}
              onChangeVolume={handleAudioVolumeChange}
              onToggleMute={handleAudioMuteToggle}
              onChangeAudioBitrate={(rate) => setQuality((q) => ({ ...q, audioBitrateKbps: rate }))}
              onToggleLiveMicCapture={handleToggleLiveMicCapture}
            />
            <LiveChatPanel
              messages={messages}
              showFloatingChat={showFloatingChat}
              onToggleFloatingChat={() => setShowFloatingChat((v) => !v)}
              onSendMessage={handleSendMessage}
              onTriggerAlert={handleTriggerAlert}
            />
          </div>
        )}

        {activeNav === 'android' && (
          <AndroidPackagePanel
            capabilities={capabilities}
            showFloatingBubble={showFloatingBubble}
            onToggleFloatingBubble={() => {
              const next = !showFloatingBubble;
              setShowFloatingBubble(next);
              streamEngineBridge.setFloatingBubble(next).catch(() => {});
            }}
            onRequestNativePermissions={() => {
              streamEngineBridge.requestPermissions().catch(() => {});
            }}
            onRequestOverlayPermission={() => {
              streamEngineBridge.requestOverlayPermission().catch(() => {});
            }}
            onExportStudioProfile={handleExportStudioProfile}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar — Ergonomic Thumb Zone (md:hidden) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0E1117]/95 backdrop-blur-md border-t border-white/[0.08] grid grid-cols-4 items-center h-16 pb-safe"
      >
        {(
          [
            { id: 'studio', label: 'Studio', icon: Video },
            { id: 'destinations', label: 'RTMP', icon: Radio },
            { id: 'mixer', label: 'Mixer', icon: Sliders },
            { id: 'android', label: 'APK', icon: Smartphone },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-rose-400' : 'text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
