import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { loadOrgExternalConfig } from '@/lib/externalNotifications';
import { ChannelChips } from '@/components/ChannelChips';

interface ExternalChannelStatusReadOnlyProps {
  orgId: string;
}

export function ExternalChannelStatusReadOnly({ orgId }: ExternalChannelStatusReadOnlyProps) {
  const config = loadOrgExternalConfig(orgId);

  return (
    <Card className="bg-card/50 border-white/10">
      <CardHeader>
        <CardTitle className="text-sm font-medium">External channels</CardTitle>
        <p className="text-xs text-muted-foreground">Read-only status. Organisation Admin configures delivery in Settings.</p>
      </CardHeader>
      <CardContent>
        <ChannelChips
          config={config}
          connectingChannel={null}
          onChannelClick={() => {}}
          onToggleChannel={() => {}}
          onReconfigure={() => {}}
          readOnly
        />
      </CardContent>
    </Card>
  );
}
