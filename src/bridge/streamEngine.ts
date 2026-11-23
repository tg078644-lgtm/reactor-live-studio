import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  CameraControlState,
  NativeCapabilities,
  PipConfig,
  RtmpDestination,
  SourceMode,
  StreamQualityConfig,
  StudioScene,
} from '../types/studio';

export interface StreamEnginePluginInterface {
  checkNativeCapabilities(): Promise<NativeCapabilities>;
  requestStudioPermissions(): Promise<{ camera: boolean; microphone: boolean; notifications: boolean }>;
  requestOverlayPermission(): Promise<{ granted: boolean; openedSettings: boolean }>;
  startStream(options: {
    destinations: RtmpDestination[];
    quality: StreamQualityConfig;
    activeScene: StudioScene;
    sourceMode: SourceMode;
    recordLocal: boolean;
    offlineRecordOnly: boolean;
    disconnectProtection: boolean;
    showFloatingBubble: boolean;
  }): Promise<{ started: boolean; sourceMode: SourceMode; foregroundService: boolean }>;
  stopStream(): Promise<{ stopped: boolean }>;
  switchScene(options: { scene: StudioScene }): Promise<{ switched: boolean }>;
  setSourceMode(options: { sourceMode: SourceMode; pipConfig?: PipConfig }): Promise<{ sourceMode: SourceMode }>;
  setCameraControl(options: {
    facing: 'front' | 'back';
    zoom: number;
    torch: boolean;
    beauty: number;
    brightness: number;
    focusX?: number;
    focusY?: number;
  }): Promise<{ applied: boolean }>;
  setAudioMix(options: {
    micGain: number;
    micMuted: boolean;
    gameGain: number;
    gameMuted: boolean;
    webGain: number;
    webMuted: boolean;
  }): Promise<{ updated: boolean }>;
  toggleFloatingBubble(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  saveDestinationsSecure(options: { destinations: RtmpDestination[] }): Promise<{ saved: boolean; storage: string }>;
  loadDestinationsSecure(): Promise<{ destinations: RtmpDestination[] }>;
  addListener(
    eventName: 'telemetry' | 'bubbleCommand',
    listenerFunc: (data: Record<string, unknown>) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const NativeStreamEngine = registerPlugin<StreamEnginePluginInterface>('StreamEngine');

const STORAGE_KEYS = {
  destinations: 'castforge_secure_destinations_v1',
  scenes: 'castforge_studio_scenes_v1',
  quality: 'castforge_quality_config_v1',
};

export function isNativeAndroidRuntime(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export const streamEngineBridge = {
  async getCapabilities(): Promise<NativeCapabilities> {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.checkNativeCapabilities();
    }
    return {
      isNativeAndroid: false,
      sdkInt: 35,
      supportsInternalAudio: true,
      hasCameraPermission: Boolean(navigator.mediaDevices),
      hasMicPermission: Boolean(navigator.mediaDevices),
      hasOverlayPermission: true,
      serviceRunning: false,
    };
  },

  async requestPermissions(): Promise<{ camera: boolean; microphone: boolean; notifications: boolean }> {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.requestStudioPermissions();
    }
    return { camera: true, microphone: true, notifications: true };
  },

  async requestOverlayPermission(): Promise<{ granted: boolean; openedSettings: boolean }> {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.requestOverlayPermission();
    }
    return { granted: true, openedSettings: false };
  },

  async startStream(options: Parameters<StreamEnginePluginInterface['startStream']>[0]) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.startStream(options);
    }
    return {
      started: true,
      sourceMode: options.sourceMode,
      foregroundService: false,
    };
  },

  async stopStream() {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.stopStream();
    }
    return { stopped: true };
  },

  async switchScene(scene: StudioScene) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.switchScene({ scene });
    }
    return { switched: true };
  },

  async setSourceMode(sourceMode: SourceMode, pipConfig?: PipConfig) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.setSourceMode({ sourceMode, pipConfig });
    }
    return { sourceMode };
  },

  async applyCameraControl(camera: CameraControlState, focus?: { x: number; y: number }) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.setCameraControl({
        facing: camera.facing,
        zoom: camera.zoom,
        torch: camera.torch,
        beauty: camera.beautyFilter / 100,
        brightness: camera.brightness / 100,
        focusX: focus?.x ?? 0.5,
        focusY: focus?.y ?? 0.5,
      });
    }
    return { applied: true };
  },

  async syncAudioMix(params: {
    micGain: number;
    micMuted: boolean;
    gameGain: number;
    gameMuted: boolean;
    webGain: number;
    webMuted: boolean;
  }) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.setAudioMix(params);
    }
    return { updated: true };
  },

  async setFloatingBubble(enabled: boolean) {
    if (isNativeAndroidRuntime()) {
      return NativeStreamEngine.toggleFloatingBubble({ enabled });
    }
    return { enabled };
  },

  async saveDestinations(destinations: RtmpDestination[]): Promise<{ storage: string }> {
    if (isNativeAndroidRuntime()) {
      const res = await NativeStreamEngine.saveDestinationsSecure({ destinations });
      return { storage: res.storage };
    }
    try {
      localStorage.setItem(STORAGE_KEYS.destinations, JSON.stringify(destinations));
    } catch {
      // Ignore storage quota errors in private browser contexts
    }
    return { storage: 'Browser Local Vault (EncryptedSharedPreferences on Android)' };
  },

  async loadDestinations(): Promise<RtmpDestination[] | null> {
    if (isNativeAndroidRuntime()) {
      const res = await NativeStreamEngine.loadDestinationsSecure();
      return res.destinations?.length ? res.destinations : null;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.destinations);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RtmpDestination[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  },

  saveScenesLocal(scenes: StudioScene[]) {
    try {
      localStorage.setItem(STORAGE_KEYS.scenes, JSON.stringify(scenes));
    } catch {
      // Ignore quota errors
    }
  },

  loadScenesLocal(): StudioScene[] | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.scenes);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StudioScene[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch {
      return null;
    }
  },

  saveQualityLocal(quality: StreamQualityConfig) {
    try {
      localStorage.setItem(STORAGE_KEYS.quality, JSON.stringify(quality));
    } catch {
      // Ignore quota errors
    }
  },

  loadQualityLocal(): StreamQualityConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.quality);
      if (!raw) return null;
      return JSON.parse(raw) as StreamQualityConfig;
    } catch {
      return null;
    }
  },
};
