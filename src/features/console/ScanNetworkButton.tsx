import { lazy, Suspense, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi } from 'lucide-react';
import { ClassicButton } from '@/skins/classic/components/Button';

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

/** Legacy console `SCAN NETWORK` — opens the discovery dialog when it ships. */
export function ScanNetworkButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!DiscoveryDialog) return null;
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
