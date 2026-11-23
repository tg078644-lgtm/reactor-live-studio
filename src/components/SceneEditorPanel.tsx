import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Clock,
  Eye,
  EyeOff,
  Globe,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Lock,
  Plus,
  Target,
  Trash2,
  Type,
  Unlock,
} from 'lucide-react';
import type { LayerType, SceneLayer, SlateTheme, StudioScene } from '../types/studio';

interface SceneEditorPanelProps {
  scenes: StudioScene[];
  activeSceneId: string;
  selectedLayerId: string | null;
  onSelectScene: (sceneId: string) => void;
  onAddScene: () => void;
  onSelectLayer: (layerId: string | null) => void;
  onAddLayer: (layer: Omit<SceneLayer, 'id' | 'zIndex'>) => void;
  onUpdateLayer: (layerId: string, patch: Partial<SceneLayer>) => void;
  onDeleteLayer: (layerId: string) => void;
  onReorderLayer: (layerId: string, direction: 'up' | 'down') => void;
}

const SLATE_THEMES: { id: SlateTheme; label: string; defaultText: string }[] = [
  { id: 'starting_soon', label: 'Starting Soon', defaultText: 'Stream Starting Soon' },
  { id: 'live_gameplay', label: 'Live Gameplay', defaultText: 'Live Gameplay' },
  { id: 'brb', label: 'Be Right Back', defaultText: 'Be Right Back' },
  { id: 'stream_ending', label: 'Stream Ending', defaultText: 'Thanks For Watching' },
];

export const SceneEditorPanel: React.FC<SceneEditorPanelProps> = ({
  scenes,
  activeSceneId,
  selectedLayerId,
  onSelectScene,
  onAddScene,
  onSelectLayer,
  onAddLayer,
  onUpdateLayer,
  onDeleteLayer,
  onReorderLayer,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? scenes[0];
  const orderedLayers = [...activeScene.layers].sort((a, b) => b.zIndex - a.zIndex);
  const selectedLayer = activeScene.layers.find((l) => l.id === selectedLayerId) ?? null;

  const handleQuickAdd = (type: LayerType) => {
    setShowAddMenu(false);
    if (type === 'image') {
      fileInputRef.current?.click();
      return;
    }

    switch (type) {
      case 'web':
        onAddLayer({
          name: 'Browser / Web Source',
          type: 'web',
          visible: true,
          locked: false,
          x: 8,
          y: 12,
          width: 46,
          height: 32,
          opacity: 100,
          url: 'https://tg078644-lgtm.github.io/flags-battle-arena/',
          transparentBg: true,
        });
        break;
      case 'text_ticker':
        onAddLayer({
          name: 'Live Text Ticker',
          type: 'text_ticker',
          visible: true,
          locked: false,
          x: 0,
          y: 88,
          width: 100,
          height: 9,
          opacity: 94,
          text: 'WELCOME TO THE STREAM  ·  DROP A FOLLOW  ·  NEW MATCHES STARTING NOW',
        });
        break;
      case 'timer':
        onAddLayer({
          name: 'Stream Timer',
          type: 'timer',
          visible: true,
          locked: false,
          x: 70,
          y: 8,
          width: 26,
          height: 10,
          opacity: 95,
          timerMode: 'uptime',
        });
        break;
      case 'goal_bar':
        onAddLayer({
          name: 'Subscriber Goal',
          type: 'goal_bar',
          visible: true,
          locked: false,
          x: 6,
          y: 80,
          width: 58,
          height: 11,
          opacity: 96,
          goalLabel: 'Stream Goal',
          goalCurrent: 120,
          goalTarget: 250,
          accentColor: '#E11D48',
        });
        break;
      case 'alert_box':
        onAddLayer({
          name: 'Alert Box',
          type: 'alert_box',
          visible: true,
          locked: false,
          x: 15,
          y: 35,
          width: 70,
          height: 18,
          opacity: 100,
          webhookUrl: 'https://streamlabs.com/alert-box/v3/custom',
        });
        break;
      case 'slate':
        onAddLayer({
          name: 'Stream Frame Slate',
          type: 'slate',
          visible: true,
          locked: false,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          opacity: 100,
          slateTheme: 'starting_soon',
          text: 'Stream Starting Soon',
        });
        break;
    }
  };

  const handleImageImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddLayer({
        name: file.name.replace(/\.[^.]+$/, ''),
        type: 'image',
        visible: true,
        locked: false,
        x: 15,
        y: 15,
        width: 40,
        height: 30,
        opacity: 100,
        imageDataUrl: typeof reader.result === 'string' ? reader.result : undefined,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-5">
      {/* Hidden Gallery Input for Custom PNG/GIF Overlays */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/gif,image/webp,image/jpeg"
        onChange={handleImageImport}
        className="hidden"
      />

      {/* Seamless Multi-Scene Switcher */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-semibold text-white">Scenes</h2>
            <p className="text-xs text-zinc-400">Switch live without disconnecting RTMP</p>
          </div>
          <button
            type="button"
            onClick={onAddScene}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1C222C] hover:bg-[#252D3A] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New Scene
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {scenes.map((scene, idx) => {
            const active = scene.id === activeSceneId;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectScene(scene.id)}
                className={`min-h-[48px] px-3 py-2.5 rounded-xl text-left border transition-colors ${
                  active
                    ? 'bg-rose-600/15 border-rose-500/60 text-white'
                    : 'bg-[#14181F] border-white/[0.08] text-zinc-300 hover:bg-[#1A202A]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{scene.name}</span>
                  <span className="text-[11px] font-mono-tabular text-zinc-500 shrink-0">0{idx + 1}</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                  {scene.layers.length} layers · {scene.sourceMode === 'dual_pip' ? 'Dual PiP' : scene.sourceMode === 'camera' ? 'Camera' : 'Screen'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="border-t border-white/[0.07]" />

      {/* Layer Stack & Add Source */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-400" />
            <h2 className="text-sm font-display font-semibold text-white">Layers</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMenu((v) => !v)}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Layer
          </button>
        </div>

        {/* Add Layer Quick Palette */}
        {showAddMenu && (
          <div className="grid grid-cols-2 gap-1.5 p-2.5 bg-[#0F1218] border border-white/[0.08] rounded-xl">
            <button
              type="button"
              onClick={() => handleQuickAdd('web')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">Web Source URL</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('image')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <ImagePlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Import PNG / GIF</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('slate')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <LayoutTemplate className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Theme Frame</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('text_ticker')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <Type className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
              <span className="truncate">Text Ticker</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('timer')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <Clock className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
              <span className="truncate">Stream Timer</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('goal_bar')}
              className="min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <Target className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">Goal Bar</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickAdd('alert_box')}
              className="col-span-2 min-h-[40px] px-2.5 py-2 rounded-lg bg-[#171C25] hover:bg-[#202735] text-xs text-zinc-200 flex items-center gap-2 text-left"
            >
              <Bell className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">On-Screen Alert Box / Webhook</span>
            </button>
          </div>
        )}

        {/* Layer Rows */}
        <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden bg-[#14181F]">
          {orderedLayers.length === 0 ? (
            <div className="p-5 text-center text-xs text-zinc-400">
              No overlay layers in this scene. Add a Web Source, Theme Frame, or Goal Bar above.
            </div>
          ) : (
            orderedLayers.map((layer, index) => {
              const selected = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => onSelectLayer(layer.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                    selected ? 'bg-rose-600/12' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-medium truncate ${selected ? 'text-white' : 'text-zinc-200'}`}>
                      {layer.name}
                    </p>
                    <p className="text-[11px] text-zinc-500 font-mono-tabular">
                      Z{layer.zIndex} · {Math.round(layer.width)}%×{Math.round(layer.height)}%
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onReorderLayer(layer.id, 'up')}
                      title="Move Layer Up (Higher Z-Index)"
                      className="min-h-[34px] min-w-[30px] flex items-center justify-center rounded text-zinc-400 hover:text-white disabled:opacity-25"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === orderedLayers.length - 1}
                      onClick={() => onReorderLayer(layer.id, 'down')}
                      title="Move Layer Down (Lower Z-Index)"
                      className="min-h-[34px] min-w-[30px] flex items-center justify-center rounded text-zinc-400 hover:text-white disabled:opacity-25"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })}
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      className="min-h-[34px] min-w-[30px] flex items-center justify-center rounded text-zinc-400 hover:text-white"
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateLayer(layer.id, { locked: !layer.locked })}
                      title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                      className="min-h-[34px] min-w-[30px] flex items-center justify-center rounded text-zinc-400 hover:text-white"
                    >
                      {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLayer(layer.id)}
                      title="Delete Layer"
                      className="min-h-[34px] min-w-[30px] flex items-center justify-center rounded text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Selected Layer Inspector */}
      {selectedLayer && (
        <section className="space-y-3 pt-1">
          <div className="border-t border-white/[0.07] pt-4">
            <h3 className="text-xs font-semibold text-zinc-300 mb-3">
              Inspector · {selectedLayer.name}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Layer Name</label>
                <input
                  type="text"
                  value={selectedLayer.name}
                  onChange={(e) => onUpdateLayer(selectedLayer.id, { name: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {selectedLayer.type === 'web' && (
                <>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Live Web / Alert Box URL</label>
                    <input
                      type="url"
                      value={selectedLayer.url || ''}
                      onChange={(e) => onUpdateLayer(selectedLayer.id, { url: e.target.value })}
                      placeholder="https://tg078644-lgtm.github.io/flags-battle-arena/"
                      className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs font-mono-tabular text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer py-1">
                    <span>Transparent Background</span>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedLayer.transparentBg)}
                      onChange={(e) => onUpdateLayer(selectedLayer.id, { transparentBg: e.target.checked })}
                      className="accent-rose-600 w-4 h-4"
                    />
                  </label>
                </>
              )}

              {selectedLayer.type === 'slate' && (
                <>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1.5">Built-in Stream Frame Theme</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SLATE_THEMES.map((theme) => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() =>
                            onUpdateLayer(selectedLayer.id, {
                              slateTheme: theme.id,
                              text: theme.defaultText,
                            })
                          }
                          className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selectedLayer.slateTheme === theme.id
                              ? 'bg-rose-600/20 border-rose-500/60 text-white'
                              : 'bg-[#0F1218] border-white/[0.08] text-zinc-300 hover:bg-[#191F29]'
                          }`}
                        >
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Headline Text</label>
                    <input
                      type="text"
                      value={selectedLayer.text || ''}
                      onChange={(e) => onUpdateLayer(selectedLayer.id, { text: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </>
              )}

              {selectedLayer.type === 'text_ticker' && (
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Scrolling Ticker Copy</label>
                  <input
                    type="text"
                    value={selectedLayer.text || ''}
                    onChange={(e) => onUpdateLayer(selectedLayer.id, { text: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              )}

              {selectedLayer.type === 'goal_bar' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] text-zinc-400 mb-1">Goal Label</label>
                    <input
                      type="text"
                      value={selectedLayer.goalLabel || ''}
                      onChange={(e) => onUpdateLayer(selectedLayer.id, { goalLabel: e.target.value })}
                      className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Current</label>
                    <input
                      type="number"
                      value={selectedLayer.goalCurrent ?? 0}
                      onChange={(e) =>
                        onUpdateLayer(selectedLayer.id, { goalCurrent: parseInt(e.target.value || '0', 10) })
                      }
                      className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs font-mono-tabular text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Target</label>
                    <input
                      type="number"
                      value={selectedLayer.goalTarget ?? 100}
                      onChange={(e) =>
                        onUpdateLayer(selectedLayer.id, { goalTarget: Math.max(1, parseInt(e.target.value || '1', 10)) })
                      }
                      className="w-full h-10 px-3 rounded-lg bg-[#0F1218] border border-white/[0.1] text-xs font-mono-tabular text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              )}

              {selectedLayer.type === 'timer' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateLayer(selectedLayer.id, { timerMode: 'uptime' })}
                    className={`flex-1 min-h-[38px] rounded-lg text-xs font-medium border ${
                      selectedLayer.timerMode !== 'countdown'
                        ? 'bg-rose-600/20 border-rose-500/60 text-white'
                        : 'bg-[#0F1218] border-white/[0.08] text-zinc-400'
                    }`}
                  >
                    Live Uptime
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateLayer(selectedLayer.id, { timerMode: 'countdown' })}
                    className={`flex-1 min-h-[38px] rounded-lg text-xs font-medium border ${
                      selectedLayer.timerMode === 'countdown'
                        ? 'bg-rose-600/20 border-rose-500/60 text-white'
                        : 'bg-[#0F1218] border-white/[0.08] text-zinc-400'
                    }`}
                  >
                    5m Countdown
                  </button>
                </div>
              )}

              {/* Scale & Opacity Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Width</span>
                    <span className="font-mono-tabular">{Math.round(selectedLayer.width)}%</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={100}
                    value={selectedLayer.width}
                    onChange={(e) => onUpdateLayer(selectedLayer.id, { width: parseInt(e.target.value, 10) })}
                    className="studio-slider w-full"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Height</span>
                    <span className="font-mono-tabular">{Math.round(selectedLayer.height)}%</span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={100}
                    value={selectedLayer.height}
                    onChange={(e) => onUpdateLayer(selectedLayer.id, { height: parseInt(e.target.value, 10) })}
                    className="studio-slider w-full"
                  />
                </div>
                <div className="col-span-2">
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Opacity</span>
                    <span className="font-mono-tabular">{selectedLayer.opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={selectedLayer.opacity}
                    onChange={(e) => onUpdateLayer(selectedLayer.id, { opacity: parseInt(e.target.value, 10) })}
                    className="studio-slider w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
