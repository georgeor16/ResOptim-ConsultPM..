import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users } from 'lucide-react';
import type { User, Allocation } from '@/lib/types';

interface Props {
  users: User[];
  allUsers?: User[];
  allocations?: Allocation[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export default function MultiSelectAssignee({ users, allUsers, allocations = [], selectedIds = [], onChange, placeholder = 'Select assignees' }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (userId: string) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const teamIds = new Set(users.map(u => u.id));
  const externalUsers = (allUsers || []).filter(u => !teamIds.has(u.id));

  const getBandwidth = (userId: string) => {
    const totalFTE = allocations.filter(a => a.userId === userId).reduce((s, a) => s + a.ftePercent, 0);
    return totalFTE;
  };

  const selectedNames = [...users, ...externalUsers]
    .filter(u => selectedIds.includes(u.id))
    .map(u => u.name.split(' ')[0]);

  const renderUser = (user: User) => {
    const bandwidth = getBandwidth(user.id);
    const bandwidthColor = bandwidth > 100 ? 'text-destructive' : bandwidth > 80 ? 'text-warning' : 'text-muted-foreground';

    return (
      <label
        key={user.id}
        className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent/50 cursor-pointer text-sm"
      >
        <Checkbox
          checked={selectedIds.includes(user.id)}
          onCheckedChange={() => toggle(user.id)}
        />
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ backgroundColor: user.avatarColor, color: 'white' }}
        >
          {user.name.split(' ').map(n => n[0]).join('')}
        </div>
        <span className="truncate flex-1">{user.name}</span>
        <span className={`text-[10px] font-medium shrink-0 ${bandwidthColor}`}>
          {bandwidth}%
        </span>
      </label>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start text-sm font-normal h-10">
          <Users className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
          {selectedNames.length > 0 ? (
            <span className="truncate">
              {selectedNames.length <= 2 ? selectedNames.join(', ') : `${selectedNames.length} selected`}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {users.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1">Project Team</p>
              {users.map(renderUser)}
            </>
          )}
          {externalUsers.length > 0 && (
            <>
              <div className="border-t my-1.5" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pt-1">Other Members</p>
              {externalUsers.map(renderUser)}
            </>
          )}
          {users.length === 0 && externalUsers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No team members available</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
