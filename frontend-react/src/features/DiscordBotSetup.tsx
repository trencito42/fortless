import { useState } from 'react';
import { Card, CardHeader, Checkbox, LoadingButton, SecretField, StatusBadge } from '@/design-system';

export interface BotConfig { intents: { guildMembers: boolean; messageContent: boolean; presence: boolean } }
export interface DiscordBotSetupProps {
  /** Whether a token is stored server-side. The token itself is never passed to the client. */
  hasToken: boolean;
  connected?: boolean;
  config: BotConfig;
  onReplaceToken: (token: string) => Promise<void>;
  onSaveConfig: (c: BotConfig) => Promise<void>;
}

/** Token and intents for a hosted Discord bot. The token is write-only from the browser: it can be replaced, never read back. */
export function DiscordBotSetup({ hasToken, connected, config, onReplaceToken, onSaveConfig }: DiscordBotSetupProps) {
  const [c, setC] = useState(config);
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  return (
    <Card pad="lg" className="grid gap-5">
      <CardHeader title="Discord bot" description="Create the bot in the Discord developer portal, then paste its token here." actions={<StatusBadge tone={connected ? 'good' : hasToken ? 'warn' : 'neutral'}>{connected ? 'Connected' : hasToken ? 'Token saved, not connected' : 'No token'}</StatusBadge>} />
      <SecretField label="Bot token" description="Stored encrypted. You can replace it, but it cannot be shown again." onReplace={onReplaceToken} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-bold text-ink2">Gateway intents</legend>
        <Checkbox label="Server members" description="Needed for welcome messages and member lists." checked={c.intents.guildMembers} onCheckedChange={(v) => setC({ intents: { ...c.intents, guildMembers: v } })} />
        <Checkbox label="Message content" description="Needed to read message text. Must also be enabled in the Discord portal." checked={c.intents.messageContent} onCheckedChange={(v) => setC({ intents: { ...c.intents, messageContent: v } })} />
        <Checkbox label="Presence" description="Shows who is online. Rarely needed." checked={c.intents.presence} onCheckedChange={(v) => setC({ intents: { ...c.intents, presence: v } })} />
      </fieldset>
      <div className="flex justify-end"><LoadingButton variant="primary" disabled={!dirty} onClick={() => onSaveConfig(c)}>Save intents</LoadingButton></div>
    </Card>
  );
}
