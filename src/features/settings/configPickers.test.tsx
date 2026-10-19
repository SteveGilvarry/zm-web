import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import type { ZmConfig } from '@/types';
import {
  configPickerOptions, formatZoneName, gmtOffsetLabel, timezoneOptions, zoneOffsetMinutes,
} from './configPickers';
import { TypedConfigInput } from './TypedConfigInput';

const t = i18n.t.bind(i18n);
const cfg = (over: Partial<ZmConfig> & { name: string }): ZmConfig => ({
  id: 1, value: '', type: 'string', category: 'web', readonly: 0, private: 0, system: 0, source: 'db', ...over,
});

describe('timezone list', () => {
  it('labels offsets the way legacy format_GMT_offset does', () => {
    expect(gmtOffsetLabel(0)).toBe('GMT');
    expect(gmtOffsetLabel(330)).toBe('GMT+05:30');
    expect(gmtOffsetLabel(-180)).toBe('GMT-03:00');
    expect(gmtOffsetLabel(-570)).toBe('GMT-09:30');
  });

  it('formats zone names as legacy format_timezone_name', () => {
    expect(formatZoneName('America/Argentina/Buenos_Aires')).toBe('America, Argentina, Buenos Aires');
    expect(formatZoneName('America/St_Johns')).toBe('America, St. Johns');
  });

  it('reads a zone offset at a given instant, daylight saving included', () => {
    expect(zoneOffsetMinutes('UTC', new Date('2026-01-15T12:00:00Z'))).toBe(0);
    expect(zoneOffsetMinutes('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBe(330);
    expect(zoneOffsetMinutes('America/Toronto', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(zoneOffsetMinutes('America/Toronto', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
  });

  it('lists every zone sorted by offset, then name', () => {
    const at = new Date('2026-01-15T12:00:00Z');
    const list = timezoneOptions(at);
    expect(list.length).toBeGreaterThan(300);
    const offsets = list.map((o) => zoneOffsetMinutes(o.value, at));
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(list.find((o) => o.value === 'Asia/Tokyo')?.label).toBe('(GMT+09:00) Asia, Tokyo');
    expect(list.find((o) => o.value === 'UTC')?.label).toBe('(GMT) UTC');
  });
});

describe('configPickerOptions', () => {
  it('starts the time zone list with the unset choice', () => {
    const list = configPickerOptions(cfg({ name: 'ZM_TIMEZONE', value: 'America/Toronto' }), t)!;
    expect(list[0]).toEqual({ value: '', label: 'Unset - use value in php.ini' });
    expect(list.some((o) => o.value === 'America/Toronto')).toBe(true);
  });

  it('offers legacy home views, installed languages, locales and skins', () => {
    expect(configPickerOptions(cfg({ name: 'ZM_WEB_HOMEVIEW', value: 'console' }), t)!.map((o) => o.value))
      .toEqual(['console', 'events', 'map', 'montage', 'montagereview', 'watch']);
    const langs = configPickerOptions(cfg({ name: 'ZM_LANG_DEFAULT', value: 'en_gb' }), t)!;
    expect(langs).toContainEqual({ value: 'de_de', label: 'Deutsch' });
    expect(langs.some((o) => o.value === '')).toBe(false);
    const locales = configPickerOptions(cfg({ name: 'ZM_LOCALE_DEFAULT', value: '' }), t)!;
    expect(locales[0]).toEqual({ value: '', label: 'System Default' });
    expect(locales.map((o) => o.value)).toContain('pt_BR');
    expect(configPickerOptions(cfg({ name: 'ZM_SKIN_DEFAULT', value: 'classic' }), t)!.map((o) => o.value))
      .toEqual(['modern', 'classic']);
    expect(configPickerOptions(cfg({ name: 'ZM_CSS_DEFAULT', value: 'classic' }), t)!.map((o) => o.value))
      .toEqual(['base', 'classic', 'dark']);
  });

  it('keeps a stored value the list does not know', () => {
    const list = configPickerOptions(cfg({ name: 'ZM_LANG_DEFAULT', value: 'xx_yy' }), t)!;
    expect(list.at(-1)).toEqual({ value: 'xx_yy', label: 'xx_yy' });
  });

  it('leaves every other option alone', () => {
    expect(configPickerOptions(cfg({ name: 'ZM_WEB_TITLE', value: 'x' }), t)).toBeNull();
  });
});

describe('TypedConfigInput — pickers and the legacy variant', () => {
  it('turns ZM_WEB_HOMEVIEW into a select and writes the view name', async () => {
    const seen: string[] = [];
    render(<TypedConfigInput config={cfg({ name: 'ZM_WEB_HOMEVIEW', value: 'console' })} value="console" onChange={(v) => seen.push(v)} />);
    await userEvent.setup().selectOptions(screen.getByRole('combobox'), 'Montage Review');
    expect(seen).toEqual(['montagereview']);
  });

  it('draws three CSS choices as radios in the legacy variant', () => {
    render(
      <TypedConfigInput config={cfg({ name: 'ZM_CSS_DEFAULT', value: 'classic' })} value="classic" onChange={() => {}} variant="legacy" />,
    );
    const group = screen.getByRole('radiogroup');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(within(group).getByRole('radio', { name: 'classic' })).toBeChecked();
  });

  it('keeps a select for three choices in the modern variant', () => {
    render(<TypedConfigInput config={cfg({ name: 'ZM_CSS_DEFAULT', value: 'classic' })} value="classic" onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('draws a bare checkbox for a boolean in the legacy variant', () => {
    render(<TypedConfigInput id="b" config={cfg({ name: 'ZM_X', type: 'boolean' })} value="1" onChange={() => {}} variant="legacy" />);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.queryByText('enabled')).toBeNull();
  });

  it('shows and hides a secret on request', async () => {
    const user = userEvent.setup();
    render(<TypedConfigInput id="s" config={cfg({ name: 'ZM_AUTH_HASH_SECRET', private: 1 })} value="abc" onChange={() => {}} />);
    const input = document.getElementById('s')!;
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide value' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('offers no toggle on a disabled secret', () => {
    render(<TypedConfigInput config={cfg({ name: 'ZM_AUTH_HASH_SECRET', private: 1 })} value="" onChange={() => {}} disabled />);
    expect(screen.queryByRole('button', { name: 'Show value' })).toBeNull();
  });
});
