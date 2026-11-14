import { describe, expect, it } from 'vitest';
import { describeUserAgent, deviceKey } from './user-agent.js';

const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';

describe('describeUserAgent', () => {
  it('names the browser and system of common user agents', () => {
    expect(describeUserAgent(MAC_SAFARI)).toEqual({ browser: 'Safari', os: 'macOS' });
    expect(describeUserAgent(WINDOWS_EDGE)).toEqual({ browser: 'Edge', os: 'Windows' });
    expect(describeUserAgent(IPHONE_CHROME)).toEqual({ browser: 'Chrome', os: 'iOS' });
    expect(describeUserAgent(LINUX_FIREFOX)).toEqual({ browser: 'Firefox', os: 'Linux' });
  });

  it('says nothing it cannot tell', () => {
    expect(describeUserAgent(null)).toEqual({});
    expect(describeUserAgent(undefined)).toEqual({});
    expect(describeUserAgent('curl/8.7.1')).toEqual({ browser: undefined, os: undefined });
  });
});

describe('deviceKey', () => {
  it('ignores versions', () => {
    expect(deviceKey(LINUX_FIREFOX)).toBe(deviceKey(LINUX_FIREFOX.replaceAll('140.0', '141.0')));
    expect(deviceKey(LINUX_FIREFOX)).toBe('Firefox|Linux');
  });

  it('tells browsers and systems apart', () => {
    expect(deviceKey(MAC_SAFARI)).not.toBe(deviceKey(IPHONE_CHROME));
    expect(deviceKey(WINDOWS_EDGE)).not.toBe(deviceKey(WINDOWS_EDGE.replace(' Edg/140.0', '')));
  });

  it('keeps what it can tell when only one part is known', () => {
    expect(deviceKey('SomeApp/1.0 (Android 15)')).toBe('?|Android');
  });

  it('is null when neither can be told', () => {
    expect(deviceKey(null)).toBeNull();
    expect(deviceKey('')).toBeNull();
    expect(deviceKey('node')).toBeNull();
    expect(deviceKey('curl/8.7.1')).toBeNull();
  });
});
