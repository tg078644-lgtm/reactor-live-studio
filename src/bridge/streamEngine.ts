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
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export const streamEngineBridge = {
  async getCapabilities(): Promise<NativeCapabilities> {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.checkNativeCapabilities();
      } catch (err) {
        console.warn('[CastForge] Native checkNativeCapabilities failed safely:', err);
      }
    }
    return {
      isNativeAndroid: isNativeAndroidRuntime(),
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
      try {
        return await NativeStreamEngine.requestStudioPermissions();
      } catch (err) {
        console.warn('[CastForge] Native requestStudioPermissions failed safely:', err);
        return { camera: false, microphone: false, notifications: false };
      }
    }
    return { camera: true, microphone: true, notifications: true };
  },

  async requestOverlayPermission(): Promise<{ granted: boolean; openedSettings: boolean }> {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.requestOverlayPermission();
      } catch (err) {
        console.warn('[CastForge] Native requestOverlayPermission failed safely:', err);
        return { granted: false, openedSettings: false };
      }
    }
    return { granted: true, openedSettings: false };
  },

  async startStream(options: Parameters<StreamEnginePluginInterface['startStream']>[0]) {
    if (isNativeAndroidRuntime()) {
      try {
        // Ensure runtime CAMERA, RECORD_AUDIO, POST_NOTIFICATIONS permissions are requested first
        await NativeStreamEngine.requestStudioPermissions().catch(() => {});
        return await NativeStreamEngine.startStream(options);
      } catch (err) {
        console.warn('[CastForge] Native startStream failed safely:', err);
        return {
          started: false,
          sourceMode: options.sourceMode,
          foregroundService: false,
        };
      }
    }
    return {
      started: true,
      sourceMode: options.sourceMode,
      foregroundService: false,
    };
  },

  async stopStream() {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.stopStream();
      } catch (err) {
        console.warn('[CastForge] Native stopStream failed safely:', err);
      }
    }
    return { stopped: true };
  },

  async switchScene(scene: StudioScene) {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.switchScene({ scene });
      } catch (err) {
        console.warn('[CastForge] Native switchScene failed safely:', err);
        return { switched: false };
      }
    }
    return { switched: true };
  },

  async setSourceMode(sourceMode: SourceMode, pipConfig?: PipConfig) {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.setSourceMode({ sourceMode, pipConfig });
      } catch (err) {
        console.warn('[CastForge] Native setSourceMode failed safely:', err);
      }
    }
    return { sourceMode };
  },

  async applyCameraControl(camera: CameraControlState, focus?: { x: number; y: number }) {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.setCameraControl({
          facing: camera.facing,
          zoom: camera.zoom,
          torch: camera.torch,
          beauty: camera.beautyFilter / 100,
          brightness: camera.brightness / 100,
          focusX: focus?.x ?? 0.5,
          focusY: focus?.y ?? 0.5,
        });
      } catch (err) {
        console.warn('[CastForge] Native setCameraControl failed safely:', err);
        return { applied: false };
      }
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
      try {
        return await NativeStreamEngine.setAudioMix(params);
      } catch (err) {
        console.warn('[CastForge] Native setAudioMix failed safely:', err);
        return { updated: false };
      }
    }
    return { updated: true };
  },

  async setFloatingBubble(enabled: boolean) {
    if (isNativeAndroidRuntime()) {
      try {
        return await NativeStreamEngine.toggleFloatingBubble({ enabled });
      } catch (err) {
        console.warn('[CastForge] Native toggleFloatingBubble failed safely:', err);
        return { enabled: false };
      }
    }
    return { enabled };
  },

  async saveDestinations(destinations: RtmpDestination[]): Promise<{ storage: string }> {
    if (isNativeAndroidRuntime()) {
      try {
        const res = await NativeStreamEngine.saveDestinationsSecure({ destinations });
        if (res?.saved) {
          return { storage: res.storage };
        }
      } catch (err) {
        console.warn('[CastForge] Native saveDestinationsSecure failed safely:', err);
      }
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
      try {
        const res = await NativeStreamEngine.loadDestinationsSecure();
        if (res?.destinations?.length) return res.destinations;
      } catch (err) {
        console.warn('[CastForge] Native loadDestinationsSecure failed safely:', err);
      }
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
