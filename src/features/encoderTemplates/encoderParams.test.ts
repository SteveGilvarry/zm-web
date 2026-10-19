import { describe, expect, it } from 'vitest';
import { makeEncoderTemplate } from '@/test/fixtures/optionsAdmin';
import { ENCODERS, lintParams, orderTemplates, paramsSummary, parseParams } from './encoderParams';

describe('encoderParams', () => {
  it('offers legacy encoders in legacy order', () => {
    expect(ENCODERS).toEqual(['libx264', 'libx265', 'h264_nvenc', 'hevc_nvenc', 'h264_vaapi', 'hevc_vaapi']);
  });

  it('parseParams splits on newline, comma and #, on the first =, trimmed', () => {
    expect(parseParams('preset=fast, crf = 23#x264-params=a=1:b=2\nnoequals\n=empty')).toEqual([
      { key: 'preset', value: 'fast' },
      { key: 'crf', value: '23' },
      { key: 'x264-params', value: 'a=1:b=2' },
    ]);
    expect(parseParams('')).toEqual([]);
    expect(parseParams(null)).toEqual([]);
  });

  it('lintParams lists unknown keys once, in order; unknown encoders get no opinion', () => {
    const parsed = parseParams('preset=fast\nbogus=1\ncq=2\nbogus=3');
    expect(lintParams(parsed, 'libx264')).toEqual(['bogus', 'cq']);
    expect(lintParams(parsed, 'h264_nvenc')).toEqual(['bogus']);
    expect(lintParams(parsed, 'av1_qsv')).toEqual([]);
    // Prototype names are not keys.
    expect(lintParams(parseParams('constructor=1'), 'libx264')).toEqual(['constructor']);
  });

  it('paramsSummary cuts at 60 characters with an ellipsis, title one pair per line', () => {
    const short = paramsSummary('preset=fast\ncrf=23');
    expect(short).toEqual({ short: 'preset=fast crf=23', full: 'preset=fast\ncrf=23' });
    const long = paramsSummary(Array.from({ length: 10 }, (_, i) => `key${i}=value${i}`).join('\n'));
    expect(Array.from(long.short)).toHaveLength(60);
    expect(long.short.endsWith('…')).toBe(true);
  });

  it('orderTemplates: known encoders in fixed order, others after in first-seen order, then by name', () => {
    const rows = [
      makeEncoderTemplate({ id: 1, encoder: 'hevc_vaapi', name: 'B' }),
      makeEncoderTemplate({ id: 2, encoder: 'zz_custom', name: 'A' }),
      makeEncoderTemplate({ id: 3, encoder: 'libx264', name: 'Low CPU' }),
      makeEncoderTemplate({ id: 4, encoder: 'libx264', name: 'Archival' }),
      makeEncoderTemplate({ id: 5, encoder: 'aa_custom', name: 'A' }),
    ];
    expect(orderTemplates(rows).map((r) => r.id)).toEqual([4, 3, 1, 2, 5]);
  });
});
