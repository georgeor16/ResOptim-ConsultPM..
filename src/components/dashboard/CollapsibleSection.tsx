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
}

export default function CollapsibleSection({ title, icon, defaultOpen = true, children, className }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
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
