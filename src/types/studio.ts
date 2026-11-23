export type SourceMode = 'screen' | 'camera' | 'dual_pip';

export type AspectOrientation = '9:16' | '16:9';

export type ResolutionPreset = '480p' | '720p' | '1080p';

export type FpsPreset = 30 | 60;

export type AudioBitratePreset = 128 | 192;

export type PipFrameStyle = 'circle' | 'rounded-square';

export type PipCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type StreamStatus = 'idle' | 'connecting' | 'live' | 'reconnecting';

export type SlateTheme = 'starting_soon' | 'live_gameplay' | 'brb' | 'stream_ending';

export type LayerType =
  | 'web'
  | 'slate'
  | 'image'
  | 'text_ticker'
  | 'timer'
  | 'goal_bar'
  | 'alert_box';

export interface SceneLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  /** Position and dimensions stored as canvas percentages (0-100) so layers scale cleanly across 9:16 and 16:9 */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  /** Layer-specific payload */
  url?: string;
  transparentBg?: boolean;
  imageDataUrl?: string;
  text?: string;
  accentColor?: string;
  slateTheme?: SlateTheme;
  goalLabel?: string;
  goalCurrent?: number;
  goalTarget?: number;
  timerMode?: 'uptime' | 'countdown';
  countdownMinutes?: number;
  webhookUrl?: string;
}

export interface StudioScene {
  id: string;
  name: string;
  sourceMode: SourceMode;
  layers: SceneLayer[];
}

export type PlatformId = 'youtube' | 'kick' | 'twitch' | 'facebook' | 'custom';

export interface RtmpDestination {
  id: string;
  platform: PlatformId;
  name: string;
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
  connected?: boolean;
  latencyMs?: number;
}

export interface StreamQualityConfig {
  resolution: ResolutionPreset;
  orientation: AspectOrientation;
  fps: FpsPreset;
  videoBitrateKbps: number;
  audioBitrateKbps: AudioBitratePreset;
  disconnectProtection: boolean;
  reconnectSlateMessage: string;
  recordLocalVod: boolean;
  offlineRecordOnly: boolean;
}

export interface CameraControlState {
  facing: 'front' | 'back';
  zoom: number; // 1.0 to 5.0
  torch: boolean;
  beautyFilter: number; // 0 to 100
  brightness: number; // -30 to +30
  liveHardwareActive: boolean;
}

export interface PipConfig {
  corner: PipCorner;
  x: number; // percentage
  y: number; // percentage
  size: number; // percentage width
  frameStyle: PipFrameStyle;
  visible: boolean;
}

export interface AudioChannelState {
  id: 'mic' | 'game' | 'web';
  label: string;
  subtitle: string;
  volume: number; // 0 to 100
  muted: boolean;
  db: number; // -60 to 0
  peakDb: number;
}

export interface ChatMessage {
  id: string;
  platform: PlatformId;
  author: string;
  message: string;
  timestamp: string;
  type: 'chat' | 'superchat' | 'subscriber' | 'follow';
  amount?: string;
}

export interface LiveAlertEvent {
  id: string;
  kind: 'subscriber' | 'superchat' | 'follow';
  user: string;
  detail: string;
  platform: PlatformId;
}

export interface StreamTelemetry {
  fps: number;
  droppedFramesPct: number;
  bitrateKbps: number;
  uptimeSec: number;
  activeEndpoints: number;
  reconnectAttempt: number;
  reconnectNextSec: number;
}

export interface VodRecording {
  id: string;
  filename: string;
  durationSec: number;
  sizeMb: number;
  createdAt: string;
  resolution: string;
  downloadUrl?: string;
}

export interface NativeCapabilities {
  isNativeAndroid: boolean;
  sdkInt: number;
  supportsInternalAudio: boolean;
  hasCameraPermission: boolean;
  hasMicPermission: boolean;
  hasOverlayPermission: boolean;
  serviceRunning: boolean;
}
