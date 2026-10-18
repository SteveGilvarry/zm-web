/**
 * `validateZoneForm` — legacy's `validateForm` (`zone.js:16-70`). Each rule
 * is pinned on its own, then the chains are checked to stop where legacy's
 * `else if` stops them.
 */
import { describe, expect, it } from 'vitest';
import { clampFilterSize, clampUnsignedByte, validateZoneForm, type ZoneFormValues } from './zoneValidation';

const t = ((key: string) => key) as unknown as Parameters<typeof validateZoneForm>[1];

/** A Blobs zone that passes every rule, like the shipped "Best, high sensitivity" preset. */
const VALID: ZoneFormValues = {
  type: 'Active',
  checkMethod: 'Blobs',
  alarmRgb: { r: '255', g: '0', b: '0' },
  minPixelThreshold: '25', maxPixelThreshold: '',
  filterX: '3', filterY: '3',
  minAlarmPixels: '100', maxAlarmPixels: '',
  minFilterPixels: '80', maxFilterPixels: '',
  minBlobPixels: '60', maxBlobPixels: '',
  minBlobs: '1', maxBlobs: '',
  selfIntersecting: false,
};

const check = (patch: Partial<ZoneFormValues>) => validateZoneForm({ ...VALID, ...patch }, t);

describe('validateZoneForm', () => {
  it('passes a complete Blobs zone', () => {
    expect(check({})).toEqual([]);
  });

  it('refuses a self-intersecting polygon, even on an Inactive zone', () => {
    expect(check({ selfIntersecting: true })).toEqual(['Polygon edges must not intersect']);
    expect(check({ type: 'Inactive', selfIntersecting: true })).toEqual(['Polygon edges must not intersect']);
  });

  it('checks nothing else for Inactive and Privacy zones', () => {
    const empty = { minPixelThreshold: '', minAlarmPixels: '', alarmRgb: { r: '', g: '', b: '' } };
    expect(check({ type: 'Inactive', ...empty })).toEqual([]);
    expect(check({ type: 'Privacy', ...empty })).toEqual([]);
  });

  it('wants all three alarm colour channels, but 0 is a value', () => {
    expect(check({ alarmRgb: { r: '255', g: '', b: '0' } })).toEqual(['You must set an alarm RGB colour']);
    expect(check({ alarmRgb: { r: '0', g: '0', b: '0' } })).toEqual([]);
  });

  it('checks the colour on a Preclusive zone too, where the boxes are disabled', () => {
    expect(check({ type: 'Preclusive', alarmRgb: { r: '', g: '', b: '' } })).toContain('You must set an alarm RGB colour');
  });

  it('wants a minimum pixel threshold above 0 and below the maximum', () => {
    expect(check({ minPixelThreshold: '' })).toEqual(['You must specify a minimum pixel threshold']);
    expect(check({ minPixelThreshold: '0' })).toEqual(['You must specify a minimum pixel threshold']);
    expect(check({ minPixelThreshold: '40', maxPixelThreshold: '40' }))
      .toEqual(['Minimum pixel threshold should be less than maximum']);
    expect(check({ minPixelThreshold: '40', maxPixelThreshold: '41' })).toEqual([]);
    // A maximum of 0 means no maximum.
    expect(check({ minPixelThreshold: '40', maxPixelThreshold: '0' })).toEqual([]);
  });

  it('wants a filter size only once the method filters', () => {
    expect(check({ filterX: '' })).toEqual(['You must specify a filter width and height']);
    expect(check({ checkMethod: 'FilteredPixels', filterY: '' })).toEqual(['You must specify a filter width and height']);
    expect(check({ checkMethod: 'AlarmedPixels', filterX: '', filterY: '' })).toEqual([]);
  });

  it('wants a minimum alarmed area above 0 and below the maximum', () => {
    expect(check({ minAlarmPixels: '' })).toContain('You must specify the minimum alarm pixel count');
    expect(check({ minAlarmPixels: '0', checkMethod: 'AlarmedPixels' }))
      .toEqual(['You must specify the minimum alarm pixel count']);
    expect(check({ maxAlarmPixels: '100' })).toEqual(['Minimum alarm area should be less than maximum']);
    expect(check({ maxAlarmPixels: '100.5' })).toEqual([]);
  });

  it('compares areas as decimals, so percent values work', () => {
    expect(check({
      minAlarmPixels: '0.5', minFilterPixels: '0.35', minBlobPixels: '0.3',
    })).toEqual([]);
  });

  it('wants the filtered minimum above 0, below its maximum, and no larger than the alarmed minimum', () => {
    expect(check({ minFilterPixels: '' })).toContain('You must specify the minimum filter pixel count');
    expect(check({ minFilterPixels: '80', maxFilterPixels: '80' }))
      .toEqual(['Minimum filter area should be less than maximum']);
    expect(check({ minFilterPixels: '120', minBlobPixels: '60' }))
      .toEqual(['Minimum filter area should be less than or equal to minimum alarm area']);
    expect(check({ minFilterPixels: '100' })).toEqual([]);
  });

  it('skips the filter and blob rules for AlarmedPixels', () => {
    expect(check({
      checkMethod: 'AlarmedPixels',
      minFilterPixels: '', minBlobPixels: '', minBlobs: '',
    })).toEqual([]);
  });

  it('skips the blob rules for FilteredPixels', () => {
    expect(check({ checkMethod: 'FilteredPixels', minBlobPixels: '', minBlobs: '' })).toEqual([]);
  });

  it('wants the blob minimum above 0, below its maximum, and no larger than the filtered minimum', () => {
    expect(check({ minBlobPixels: '' })).toEqual(['You must specify the minimum blob pixel count']);
    expect(check({ minBlobPixels: '60', maxBlobPixels: '50' }))
      .toEqual(['Minimum blob area should be less than maximum']);
    expect(check({ minBlobPixels: '90' }))
      .toEqual(['Minimum blob area should be less than or equal to minimum filter area']);
  });

  it('wants a blob count above 0 and below the maximum', () => {
    expect(check({ minBlobs: '' })).toEqual(['You must specify the minimum blob count']);
    expect(check({ minBlobs: '0' })).toEqual(['You must specify the minimum blob count']);
    expect(check({ minBlobs: '3', maxBlobs: '2' })).toEqual(['Minimum blobs should be less than maximum']);
    expect(check({ minBlobs: '1', maxBlobs: '2' })).toEqual([]);
  });

  it('stops each chain at its first failure, as legacy\'s else-if does', () => {
    // An unset filtered minimum is reported, and the ≤ alarmed check that
    // would follow it is not.
    expect(check({ minFilterPixels: '', maxFilterPixels: '' }))
      .toEqual(['You must specify the minimum filter pixel count']);
  });

  it('reports every failing chain at once, in legacy\'s order', () => {
    expect(validateZoneForm({
      ...VALID,
      alarmRgb: { r: '', g: '0', b: '0' },
      minPixelThreshold: '',
      filterX: '',
      minAlarmPixels: '',
      minFilterPixels: '',
      minBlobPixels: '',
      minBlobs: '',
      selfIntersecting: true,
    }, t)).toEqual([
      'Polygon edges must not intersect',
      'You must set an alarm RGB colour',
      'You must specify a minimum pixel threshold',
      'You must specify a filter width and height',
      'You must specify the minimum alarm pixel count',
      'You must specify the minimum filter pixel count',
      'You must specify the minimum blob pixel count',
      'You must specify the minimum blob count',
    ]);
  });
});

describe('the input clamps', () => {
  it('keeps a pixel threshold or colour channel within 0–255', () => {
    expect(clampUnsignedByte('300')).toBe('255');
    expect(clampUnsignedByte('-4')).toBe('0');
    expect(clampUnsignedByte('40')).toBe('40');
    expect(clampUnsignedByte('')).toBe('');
  });

  it('makes the filter size odd and 3–15, as limitFilter does', () => {
    expect(clampFilterSize('4')).toBe('3');
    expect(clampFilterSize('6')).toBe('5');
    expect(clampFilterSize('1')).toBe('3');
    expect(clampFilterSize('99')).toBe('15');
    expect(clampFilterSize('7')).toBe('7');
    expect(clampFilterSize('')).toBe('');
    expect(clampFilterSize('x')).toBe('');
  });
});
