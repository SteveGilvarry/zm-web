import { describe, expect, it } from 'vitest';
import { applyTemplateParams, mergeParams, parseParams, serializeParams, unknownParamKeys } from './encoderParams';

describe('encoder parameter text (monitor-encoder-templates.js)', () => {
  it('parses on newline, comma and #, trims, and drops pairs without a key', () => {
    expect(parseParams(' crf = 23 ,preset=fast\n#tune=zerolatency\nnoequals\n=empty\nx264-params=a=b')).toEqual([
      { key: 'crf', value: '23' },
      { key: 'preset', value: 'fast' },
      { key: 'tune', value: 'zerolatency' },
      { key: 'x264-params', value: 'a=b' },
    ]);
    expect(parseParams(null)).toEqual([]);
  });

  it('merges: shared keys keep their place with the template value, new keys go last', () => {
    const merged = mergeParams(parseParams('crf=30\nmine=1'), parseParams('preset=slow\ncrf=20'));
    expect(serializeParams(merged)).toBe('crf=20\nmine=1\npreset=slow');
  });

  it('Apply writes into an empty box as the template lines', () => {
    expect(applyTemplateParams('', 'preset=fast\ncrf=23')).toBe('preset=fast\ncrf=23');
    expect(applyTemplateParams(null, 'preset=fast')).toBe('preset=fast');
  });

  it('lints keys the encoder ignores, once each; unknown encoders get no lint', () => {
    expect(unknownParamKeys('crf=23\nbogus=1\nbogus=2\ncq=4', 'libx264')).toEqual(['bogus', 'cq']);
    expect(unknownParamKeys('anything=1', 'libsvtav1')).toEqual([]);
    expect(unknownParamKeys('constructor=1', 'h264_vaapi')).toEqual(['constructor']);
  });
});
