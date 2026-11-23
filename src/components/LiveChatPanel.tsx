import React, { useState } from 'react';
import { Bell, MessageSquare, Send, Sparkles, UserPlus } from 'lucide-react';
import type { ChatMessage, LiveAlertEvent, PlatformId } from '../types/studio';

interface LiveChatPanelProps {
  messages: ChatMessage[];
  showFloatingChat: boolean;
  onToggleFloatingChat: () => void;
  onSendMessage: (text: string) => void;
  onTriggerAlert: (alert: Omit<LiveAlertEvent, 'id'>) => void;
}

const PLATFORM_LABELS: Record<PlatformId, string> = {
  youtube: 'YouTube',
  kick: 'Kick',
  twitch: 'Twitch',
  facebook: 'Facebook',
  custom: 'RTMP',
};

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  messages,
  showFloatingChat,
  onToggleFloatingChat,
  onSendMessage,
  onTriggerAlert,
}) => {
  const [filter, setFilter] = useState<'all' | 'youtube' | 'kick' | 'events'>('all');
  const [draft, setDraft] = useState('');

  const filtered = messages.filter((msg) => {
    if (filter === 'all') return true;
    if (filter === 'events') return msg.type !== 'chat';
    return msg.platform === filter;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSendMessage(draft.trim());
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header & Floating Chat Overlay Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-display font-semibold text-white">Unified Live Chat & Events</h2>
          <p className="text-xs text-zinc-400">YouTube · Kick · Superchats & Subscribers</p>
        </div>

        <button
          type="button"
          onClick={onToggleFloatingChat}
          className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            showFloatingChat
              ? 'bg-rose-600/20 border-rose-500/50 text-rose-200'
              : 'bg-[#1C222C] border-white/[0.08] text-zinc-300 hover:bg-[#252D3A]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {showFloatingChat ? 'Overlay Chat On' : 'Float Chat on Game'}
        </button>
      </div>

      {/* Platform Filter Segmented Bar */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0D10] rounded-lg border border-white/[0.06]">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'youtube', label: 'YouTube' },
            { id: 'kick', label: 'Kick' },
            { id: 'events', label: 'Events' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[36px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              filter === tab.id ? 'bg-[#232A36] text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alert Box Simulator / Webhook Trigger Bar */}
      <div className="p-3 bg-[#14181F] border border-white/[0.08] rounded-xl space-y-2">
        <p className="text-[11px] font-medium text-zinc-400">Test On-Screen Alert Box</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() =>
              onTriggerAlert({
                kind: 'subscriber',
                user: 'RamiArena',
                detail: 'Just subscribed on YouTube!',
                platform: 'youtube',
              })
            }
            className="min-h-[38px] px-2 py-1.5 rounded-lg bg-[#1B212C] hover:bg-[#252D3C] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Bell className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            Sub Alert
          </button>
          <button
            type="button"
            onClick={() =>
              onTriggerAlert({
                kind: 'superchat',
                user: 'SoraGG',
                detail: '$25.00 · Clutch victory!',
                platform: 'youtube',
              })
            }
            className="min-h-[38px] px-2 py-1.5 rounded-lg bg-[#1B212C] hover:bg-[#252D3C] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Superchat
          </button>
          <button
            type="button"
            onClick={() =>
              onTriggerAlert({
                kind: 'follow',
                user: 'KaitoStream',
                detail: 'Followed on Kick',
                platform: 'kick',
              })
            }
            className="min-h-[38px] px-2 py-1.5 rounded-lg bg-[#1B212C] hover:bg-[#252D3C] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            Follow
          </button>
        </div>
      </div>

      {/* Unified Feed */}
      <div className="flex-1 min-h-[260px] max-h-[420px] overflow-y-auto divide-y divide-white/[0.06] bg-[#14181F] border border-white/[0.08] rounded-xl">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            No messages match this filter yet.
          </div>
        ) : (
          filtered.map((msg) => (
            <div
              key={msg.id}
              className={`px-3.5 py-3 space-y-1 ${
                msg.type === 'superchat'
                  ? 'bg-amber-500/8'
                  : msg.type === 'subscriber'
                    ? 'bg-rose-500/8'
                    : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-white truncate">{msg.author}</span>
                  <span className="text-zinc-600" aria-hidden="true">·</span>
                  <span
                    className={
                      msg.platform === 'youtube'
                        ? 'text-rose-400'
                        : msg.platform === 'kick'
                          ? 'text-emerald-400'
                          : 'text-sky-400'
                    }
                  >
                    {PLATFORM_LABELS[msg.platform]}
                  </span>
                  {msg.amount && (
                    <>
                      <span className="text-zinc-600" aria-hidden="true">·</span>
                      <span className="font-mono-tabular font-semibold text-amber-300">
                        {msg.amount}
                      </span>
                    </>
                  )}
                </div>
                <span className="font-mono-tabular text-zinc-500 shrink-0">{msg.timestamp}</span>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed">{msg.message}</p>
            </div>
          ))
        )}
      </div>

      {/* Host Reply Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply to unified chat..."
          className="flex-1 h-11 px-3.5 rounded-xl bg-[#14181F] border border-white/[0.1] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
        />
        <button
          type="submit"
          aria-label="Send chat message"
          className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 flex items-center justify-center transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
