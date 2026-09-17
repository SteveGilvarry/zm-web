import { lazy, Suspense, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi } from 'lucide-react';
import { ClassicButton } from '@/skins/classic/components/Button';
import { useZmConfigTable } from '@/features/config/useZmConfig';

type DialogProps = { open: boolean; onClose: () => void };
type DialogModule = { default?: ComponentType<DialogProps>; DiscoveryDialog?: ComponentType<DialogProps> };

/**
 * The ONVIF discovery dialog is built by another workstream at
 * `src/features/monitors/discovery/DiscoveryDialog.tsx`. Resolving it through
 * a glob keeps this file compiling whether or not that module exists yet:
 * no module, no button (legacy also hides SCAN NETWORK without arp).
 */
const modules = import.meta.glob<DialogModule>('/src/features/monitors/discovery/DiscoveryDialog.tsx');
const loader = modules['/src/features/monitors/discovery/DiscoveryDialog.tsx'];
const DiscoveryDialog = loader
  ? lazy(() => loader().then((m) => ({ default: (m.default ?? m.DiscoveryDialog) as ComponentType<DialogProps> })))
  : null;

/**
 * Legacy console `SCAN NETWORK` — opens the discovery dialog when it ships.
 * Shown only where the box can actually scan: console.php:186 gates the
 * button on `ZM_PATH_ARP` or `ZM_PATH_ARP_SCAN` being configured.
 */
export function ScanNetworkButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: configs } = useZmConfigTable();
  const hasArp = !!(configs?.ZM_PATH_ARP || configs?.ZM_PATH_ARP_SCAN);
  if (!DiscoveryDialog || !hasArp) return null;
  return (
    <>
      <ClassicButton tone="primary" icon={<Wifi size={14} />} onClick={() => setOpen(true)}>
        {t('Scan Network')}
      </ClassicButton>
      {open && (
        <Suspense fallback={null}>
          <DiscoveryDialog open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
