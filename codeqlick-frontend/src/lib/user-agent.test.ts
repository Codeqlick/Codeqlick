import { describe, expect, it } from 'vitest';
import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it('names the browser and system of common user agents', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toEqual({ browser: 'Safari', os: 'macOS' });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows' });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ browser: 'Chrome', os: 'iOS' });
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'),
    ).toEqual({ browser: 'Firefox', os: 'Linux' });
  });

  it('says nothing it cannot tell', () => {
    expect(describeUserAgent(null)).toEqual({});
    expect(describeUserAgent('curl/8.7.1')).toEqual({ browser: undefined, os: undefined });
  });
});
