import type { TFunction } from 'i18next';
import type { ZoneType } from '@/api/zones';

/** The editor's per-type stroke and fill, drawn over video. */
export const ZONE_TYPE_COLORS: Record<string, { stroke: string; fill: string }> = {
  Active:     { stroke: '#00d4ff', fill: 'rgba(0,212,255,0.18)'  },
  Inclusive:  { stroke: '#00ff9d', fill: 'rgba(0,255,157,0.18)'  },
  Exclusive:  { stroke: '#ffb000', fill: 'rgba(255,176,0,0.18)'  },
  Preclusive: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.18)' },
  Inactive:   { stroke: '#566b85', fill: 'rgba(86,107,133,0.15)' },
  Privacy:    { stroke: '#ff3366', fill: 'rgba(255,51,102,0.22)' },
};

/** `Zones.Type`'s enum order, which legacy's Type select follows. */
export const ZONE_TYPE_ORDER: ZoneType[] = ['Active', 'Inclusive', 'Exclusive', 'Preclusive', 'Inactive', 'Privacy'];

/** Display label for a zone type (wire value stays as-is). Unknown types echo back. */
export function zoneTypeLabel(type: string, t: TFunction): string {
  switch (type) {
    case 'Active':     return t('Active');
    case 'Inclusive':  return t('Inclusive');
    case 'Exclusive':  return t('Exclusive');
    case 'Preclusive': return t('Preclusive');
    case 'Inactive':   return t('Inactive');
    case 'Privacy':    return t('Privacy');
    default:           return type;
  }
}

export function zoneTypeHint(type: string, t: TFunction): string {
  switch (type) {
    case 'Active':     return t('Triggers alarms on motion inside this region.');
    case 'Inclusive':  return t('Motion only counts if it also overlaps an Active zone.');
    case 'Exclusive':  return t('Motion in this region is ignored.');
    case 'Preclusive': return t('If motion fills this region, the whole frame is rejected (camera shake).');
    case 'Inactive':   return t('Disabled — no detection here. Useful for parking it.');
    case 'Privacy':    return t('Region is blacked out in recordings and live view.');
    default:           return '';
  }
}
