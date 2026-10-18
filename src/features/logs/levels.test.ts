import { describe, expect, it } from 'vitest';
import { LOG_LEVEL_CODES, levelCodesParam, levelCodesToApi, parseLevelCodes } from './levels';

describe('log level codes', () => {
  it('lists every level legacy offers, in Logger::$codes order', () => {
    expect(LOG_LEVEL_CODES).toEqual(['DBG', 'INF', 'WAR', 'ERR', 'FAT', 'PNC', 'AUD', 'OFF']);
  });

  it('parses the URL list, drops unknown codes and keeps legacy order', () => {
    expect(parseLevelCodes('err,WAR,bogus,ERR')).toEqual(['WAR', 'ERR']);
    expect(parseLevelCodes('')).toEqual([]);
    expect(parseLevelCodes(undefined)).toEqual([]);
    expect(parseLevelCodes(3)).toEqual([]);
  });

  it('reads a numeric level, as older links carry it, as its code', () => {
    expect(parseLevelCodes(-2)).toEqual(['ERR']);
    expect(parseLevelCodes('-1,0,-5')).toEqual(['INF', 'WAR', 'AUD']);
    expect(parseLevelCodes('1,ERR')).toEqual(['DBG', 'ERR']);
  });

  it('writes the URL list in legacy order, or nothing for All', () => {
    expect(levelCodesParam(['PNC', 'DBG'])).toBe('DBG,PNC');
    expect(levelCodesParam([])).toBeUndefined();
  });

  it('maps codes onto ZoneMinder\'s inverted scale for the API', () => {
    expect(levelCodesToApi(['DBG', 'INF', 'WAR', 'ERR', 'FAT', 'PNC', 'AUD', 'OFF']))
      .toBe('1,0,-1,-2,-3,-4,-5,-6');
    expect(levelCodesToApi([])).toBeUndefined();
  });
});
