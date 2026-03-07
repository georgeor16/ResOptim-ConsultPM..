import { useState } from 'react';
import { Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DndProfile, ActiveDndState } from '@/lib/dndProfiles';
import { getDndRemainingMinutes } from '@/lib/dndProfiles';

function formatRemaining(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface DndSectionProps {
  profiles: DndProfile[];
  activeDnd: ActiveDndState | null;
  dndRemainingMinutes: number;
  onActivate: (profile: DndProfile) => void;
  onResume: () => void;
  onOpenManageProfiles: () => void;
  onQuickAlertsChange: (on: boolean) => void;
}

export function DndSection({
  profiles,
  activeDnd,
  dndRemainingMinutes,
  onActivate,
  onResume,
  onOpenManageProfiles,
  onQuickAlertsChange,
}: DndSectionProps) {
  const [confirmProfile, setConfirmProfile] = useState<DndProfile | null>(null);

  const handleChipClick = (profile: DndProfile) => {
    if (profile.suppressCritical) {
      setConfirmProfile(profile);
      return;
    }
    onActivate(profile);
  };

  const handleConfirmActivate = () => {
    if (confirmProfile) {
      onActivate(confirmProfile);
      setConfirmProfile(null);
    }
  };

  const visibleProfiles = profiles.filter(p => !p.isArchived);

  return (
    <div
      className="rounded-xl p-4 mb-4 transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-white/10 p-2 shrink-0">
            <Moon className="h-4 w-4 text-white/80" />
          </div>
          <div>
            <p className="text-sm font-normal text-white/90">Do Not Disturb</p>
            <p className="text-xs text-white/50 mt-0.5">Activate a preset pause profile in one tap</p>
          </div>
        </div>
        <button type="button" onClick={onOpenManageProfiles} className="text-xs text-white/50 hover:text-white/70 underline shrink-0">
          Manage profiles
        </button>
      </div>

      {activeDnd ? (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          <p className="text-xs text-white/70">
            <span className="mr-1">{activeDnd.profileIcon}</span>
            {activeDnd.profileName} · {formatRemaining(dndRemainingMinutes)} remaining
          </p>
          <button type="button" onClick={() => { onResume(); onQuickAlertsChange(true); }} className="text-xs text-amber-400/90 hover:text-amber-300 underline">
            Resume now
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {visibleProfiles.map(p => {
              const isActive = activeDnd?.profileId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleChipClick(p)}
                  className={cn(
                    'shrink-0 rounded-full h-8 px-3 flex items-center gap-1.5 text-xs border transition-all duration-200',
                    'border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20',
                    isActive && 'ring-2 ring-emerald-500/60 shadow-[0_0_0_2px_rgba(52,211,153,0.6)]'
                  )}
                >
                  <span className="text-base leading-none">{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
          {confirmProfile && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs border border-amber-500/20 bg-amber-500/10 text-amber-200/90">
              <p className="mb-2">This will suppress all alerts including Critical — activate {confirmProfile.name}?</p>
              <div className="flex gap-2">
                <button type="button" onClick={handleConfirmActivate} className="rounded-full px-3 py-1 bg-amber-500/30 border border-amber-500/40">Activate</button>
                <button type="button" onClick={() => setConfirmProfile(null)} className="underline">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
