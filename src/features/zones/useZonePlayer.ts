import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What the zone editor can play behind the polygon. Legacy offers ZMS MJPEG,
 * Go2RTC, RTSP2Web and Janus (`zone.php:239-252`); zm-api serves none of
 * those players, only WebRTC and HLS through `/live`, and a refreshing JPEG
 * snapshot, so those are the choices here.
 */
export type ZonePlayer = '' | 'stills' | 'webrtc' | 'hls';

/** What actually plays once Auto is resolved. */
export type ZonePlayerResolved = Exclude<ZonePlayer, ''>;

const STORAGE_KEY = 'zmZonePlayer';
const PLAYERS: readonly ZonePlayer[] = ['', 'stills', 'webrtc', 'hls'];

/**
 * Auto follows the monitor's Default Player, as legacy's does: anything
 * HLS plays HLS, any WebRTC/MSE/Janus player plays WebRTC, and ZMS or no
 * preference plays stills — the nearest thing here to ZMS MJPEG.
 */
export function resolveZonePlayer(choice: ZonePlayer, defaultPlayer: string | null | undefined): ZonePlayerResolved {
  if (choice) return choice;
  const d = (defaultPlayer ?? '').toLowerCase();
  if (d.includes('hls')) return 'hls';
  if (d.includes('webrtc') || d.includes('mse') || d.includes('janus') || d === 'go2rtc') return 'webrtc';
  return 'stills';
}

function load(): ZonePlayer {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) ?? '';
    return (PLAYERS as readonly string[]).includes(v) ? (v as ZonePlayer) : '';
  } catch {
    return '';
  }
}

export interface ZonePlayerState {
  player: ZonePlayer;
  setPlayer: (p: ZonePlayer) => void;
  resolved: ZonePlayerResolved;
  options: { value: ZonePlayer; label: string }[];
}

/**
 * The Player select, kept per browser like legacy's `zmZonePlayer` cookie.
 */
export function useZonePlayer(defaultPlayer: string | null | undefined): ZonePlayerState {
  const { t } = useTranslation();
  const [player, setPlayerState] = useState<ZonePlayer>(load);
  const setPlayer = (p: ZonePlayer) => {
    setPlayerState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  };
  return {
    player,
    setPlayer,
    resolved: resolveZonePlayer(player, defaultPlayer),
    options: [
      { value: '', label: t('Auto') },
      { value: 'stills', label: t('Still images') },
      { value: 'webrtc', label: 'WebRTC' },
      { value: 'hls', label: 'HLS' },
    ],
  };
}
