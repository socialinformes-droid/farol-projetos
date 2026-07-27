import { loadSettings } from '@/lib/actions/settings';
import { SettingsView } from './_view';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await loadSettings();
  return <SettingsView settings={settings} />;
}
