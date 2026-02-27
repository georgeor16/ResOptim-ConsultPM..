import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

export default function SettingsPage() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <div className="text-center py-12 text-muted-foreground">Access restricted</div>;
  }

  const handleResetData = () => {
    if (confirm('This will delete all data and re-seed. Continue?')) {
      localStorage.removeItem('consulting_pm_data');
      localStorage.removeItem('current_user_id');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Application configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Data Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            All data is stored in localStorage. Reset to re-seed with default data.
          </p>
          <Button variant="destructive" onClick={handleResetData}>
            <Trash2 className="h-4 w-4 mr-2" />
            Reset All Data
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Google Calendar, Google Drive, Slack webhook, and export integrations coming soon. Connect Lovable Cloud to enable these features.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
