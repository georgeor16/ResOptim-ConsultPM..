import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  storageKey?: string;
}

function getInitialOpen(storageKey: string | undefined, defaultOpen: boolean): boolean {
  if (!storageKey) return defaultOpen;
  const stored = localStorage.getItem(`collapse:${storageKey}`);
  if (stored === 'false') return false;
  if (stored === 'true') return true;
  return defaultOpen;
}

export default function CollapsibleSection({ title, icon, defaultOpen = true, children, className, storageKey }: CollapsibleSectionProps) {
  const key = storageKey ?? title.toLowerCase().replace(/\s+/g, '-');
  const [open, setOpen] = useState(() => getInitialOpen(key, defaultOpen));

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    localStorage.setItem(`collapse:${key}`, String(value));
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange} className={className}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full group cursor-pointer select-none py-1">
        {icon}
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className="flex-1 h-px bg-border ml-2" />
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
