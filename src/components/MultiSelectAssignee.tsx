import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Users } from 'lucide-react';
import type { User } from '@/lib/types';

interface Props {
  users: User[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export default function MultiSelectAssignee({ users, selectedIds = [], onChange, placeholder = 'Select assignees' }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (userId: string) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const selectedNames = users
    .filter(u => selectedIds.includes(u.id))
    .map(u => u.name.split(' ')[0]);

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
      <PopoverContent className="w-[240px] p-2" align="start">
        <div className="space-y-1 max-h-[200px] overflow-y-auto">
          {users.map(user => (
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
              <span className="truncate">{user.name}</span>
            </label>
          ))}
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">No team members available</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
