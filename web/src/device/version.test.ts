import { describe, expect, it } from 'vitest';
import { compareVersions, firmwareOutdated, LATEST_FIRMWARE } from './version';

describe('firmware version', () => {
  it('compares numerically', () => {
    expect(compareVersions('0.2.0', '0.10.0')).toBe(-1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.3.0+abc1234', '0.3.0')).toBe(0);
    expect(compareVersions('1.2.3', '1.2.2')).toBe(1);
  });
  it('flags only older boards', () => {
    expect(firmwareOutdated('0.1.9', '0.2.0')).toBe(true);
    expect(firmwareOutdated('0.2.0', '0.2.0')).toBe(false);
    expect(firmwareOutdated('0.3.0', '0.2.0')).toBe(false);
    expect(firmwareOutdated(undefined, '0.2.0')).toBe(false);
  });
  it('is injected from app.h', () => {
    expect(LATEST_FIRMWARE).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
