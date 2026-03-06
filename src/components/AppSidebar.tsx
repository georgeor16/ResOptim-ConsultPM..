import { LayoutDashboard, FolderKanban, Users, CalendarRange, Settings, ChevronDown, LogOut, Gauge, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
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

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Projects', url: '/projects', icon: FolderKanban },
  { title: 'Resources', url: '/resources', icon: CalendarRange, roles: ['admin', 'manager'] as const },
  { title: 'Bandwidth', url: '/bandwidth', icon: Gauge, roles: ['admin', 'manager'] as const },
  { title: 'Insights', url: '/insights', icon: BarChart3, roles: ['admin', 'manager'] as const },
  { title: 'Team', url: '/team', icon: Users, roles: ['admin', 'manager'] as const },
  { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin'] as const },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
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

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        {!collapsed && (
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
        {collapsed && (
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center mx-auto">
            <span className="text-sm font-bold text-sidebar-primary-foreground">P</span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.filter(item => {
                if (!item.roles) return true;
                return hasRole(...item.roles);
              }).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {currentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 w-full rounded-md p-2 hover:bg-sidebar-accent transition-colors text-left">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: currentUser.avatarColor, color: 'white' }}
                >
                  {currentUser.name.split(' ').map(n => n[0]).join('')}
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-sidebar-foreground truncate">{currentUser.name}</p>
                      <p className="text-xs text-sidebar-muted">{roleLabel(currentUser.role)}</p>
                    </div>
                    <ChevronDown className="h-3 w-3 text-sidebar-muted shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
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
      </SidebarFooter>
    </Sidebar>
  );
}
