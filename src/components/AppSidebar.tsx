import { LayoutDashboard, FolderKanban, Users, CalendarRange, Settings, ChevronDown, ChevronRight, LogOut, Gauge, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Projects', url: '/projects', icon: FolderKanban },
  { title: 'Resources', url: '/resources', icon: CalendarRange, roles: ['admin', 'manager'] as const },
  { title: 'Bandwidth', url: '/bandwidth', icon: Gauge, roles: ['admin', 'manager'] as const },
  { title: 'Insights', url: '/insights', icon: BarChart3, roles: ['admin', 'manager'] as const },
  { title: 'Team', url: '/team', icon: Users, roles: ['admin', 'manager'] as const },
  { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin'] as const },
];

/** Tooltip styling for collapsed sidebar — glassmorphism, right-aligned, no arrow, 120ms fade-in */
const SIDEBAR_TOOLTIP_CLASS =
  'max-w-[160px] truncate rounded-lg border border-white/10 bg-[rgba(15,20,40,0.85)] px-2.5 py-1.5 text-xs text-white/85 shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-[12px] animate-in fade-in-0 duration-[120ms] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-75';

export function AppSidebar() {
  const { state, open, toggleSidebar, isHoverExpanded } = useSidebar();
  const collapsed = state === 'collapsed';
  const isExpanded = open || isHoverExpanded;
  const { currentUser, users, switchUser, hasRole } = useAuth();
  const navigate = useNavigate();

  const roleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'CEO';
      case 'manager': return 'Manager';
      case 'member': return 'Team Member';
      default: return role;
    }
  };

  const collapsedTooltipProps = {
    side: 'right' as const,
    sideOffset: 8,
    className: SIDEBAR_TOOLTIP_CLASS,
  };

  return (
    <TooltipProvider delayDuration={400}>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className={cn('p-4', !isExpanded && 'p-2')}>
          {isExpanded && (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                <span className="text-sm font-bold text-sidebar-primary-foreground">PM</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-sidebar-foreground">ConsultPM</p>
                <p className="text-xs text-sidebar-muted">Resource Manager</p>
              </div>
            </div>
          )}
          {!isExpanded && (
            <div
              className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center mx-auto shrink-0 border-0 text-sidebar-primary-foreground"
              title="ConsultPM"
              aria-label="ConsultPM"
            >
              <span className="text-sm font-bold">P</span>
            </div>
          )}
        </SidebarHeader>

        <SidebarContent className="pt-2 flex-shrink-0">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.filter(item => {
                  if (!item.roles) return true;
                  return hasRole(...item.roles);
                }).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={!isExpanded ? { ...collapsedTooltipProps, children: item.title } : undefined}
                    >
                      <NavLink
                        to={item.url}
                        end={item.url === '/'}
                        className={cn(
                          "flex items-center w-full min-w-0 rounded-lg transition-all",
                          isExpanded ? "justify-start px-4 gap-3" : "justify-center px-2"
                        )}
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span
                          className={cn(
                            'truncate inline-block',
                            isExpanded
                              ? 'opacity-100 w-auto transition-opacity duration-[120ms] delay-[80ms] ease-out'
                              : 'opacity-0 w-0 overflow-hidden transition-opacity duration-[80ms] ease-out delay-0'
                          )}
                        >
                          {item.title}
                        </span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <div className="min-h-0 flex-1" aria-hidden="true" />

        <SidebarFooter className="p-3 flex-shrink-0">
          {/* Expand/collapse toggle — above user chip; contextual tooltip */}
          <div className={cn('flex w-full', isExpanded ? 'justify-start' : 'justify-center')}>
            {!open ? (
              isHoverExpanded ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Pin sidebar open"
                      className="h-7 w-7 shrink-0 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-[8px] flex items-center justify-center text-white/60 transition-[background] duration-150 ease-out hover:bg-white/[0.12] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 rotate-180" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent {...collapsedTooltipProps}>Click to keep open</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Expand sidebar"
                      className="h-7 w-7 shrink-0 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-[8px] flex items-center justify-center text-white/60 transition-[background] duration-150 ease-out hover:bg-white/[0.12] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 rotate-0" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent {...collapsedTooltipProps}>Expand sidebar</TooltipContent>
                </Tooltip>
              )
            ) : (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                className="h-7 w-7 shrink-0 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-[8px] flex items-center justify-center text-white/60 transition-[background] duration-150 ease-out hover:bg-white/[0.12] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <ChevronRight className="h-4 w-4 transition-transform duration-200 rotate-180" />
              </button>
            )}
          </div>
          {/* Divider and user chip */}
          <div className="border-t border-white/[0.08] pt-3 mt-1">
          {currentUser && (
            <DropdownMenu>
              {!isExpanded ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center px-0 w-full rounded-md p-2 hover:bg-sidebar-accent transition-[padding,opacity] duration-200 ease-linear"
                      >
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ backgroundColor: currentUser.avatarColor, color: 'white' }}
                        >
                          {currentUser.name.split(' ').map(n => n[0]).join('')}
                        </div>
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent {...collapsedTooltipProps}>{currentUser.name}</TooltipContent>
                </Tooltip>
              ) : (
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 w-full rounded-md p-2 hover:bg-sidebar-accent transition-[padding,opacity] duration-200 ease-linear text-left"
                    type="button"
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: currentUser.avatarColor, color: 'white' }}
                    >
                      {currentUser.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser.name}</p>
                      <p className="text-xs text-sidebar-muted">{roleLabel(currentUser.role)}</p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-sidebar-muted shrink-0" />
                  </button>
                </DropdownMenuTrigger>
              )}
            <DropdownMenuContent align="end" side="top" className="w-56">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Switch User</div>
              {users.map(user => (
                <DropdownMenuItem
                  key={user.id}
                  onClick={() => switchUser(user.id)}
                  className={currentUser.id === user.id ? 'bg-accent' : ''}
                >
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-2 shrink-0"
                    style={{ backgroundColor: user.avatarColor, color: 'white' }}
                  >
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-sm">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
          </div>
      </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}
