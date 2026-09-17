import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export interface NoteTypeOption {
  /** The substring matched against `Events.Notes`. */
  value: string;
  label: string;
}

/**
 * Legacy's Notes filter is not a free-text box: it is a fixed multi-select of
 * event types (`Filter::simple_widget`, Filter.php:1380-1400), each pick ORed
 * into the query as `Notes LIKE %value%`. Same list for both skins.
 */
export function useNoteTypeOptions(): NoteTypeOption[] {
  const { t } = useTranslation();
  return useMemo(() => [
    { value: 'Motion', label: t('Motion') },
    { value: 'ONVIF', label: t('ONVIF') },
    { value: 'Linked', label: t('Linked') },
    { value: 'detected', label: t('Any Object') },
    { value: 'aplr', label: t('Any license plate') },
    { value: 'person', label: t('Person') },
    { value: 'boat', label: t('Boat') },
    { value: 'bus', label: t('Bus') },
    { value: 'car', label: t('Car') },
    { value: 'truck', label: t('Truck') },
    { value: 'vehicle', label: t('Vehicle') },
  ], [t]);
}
