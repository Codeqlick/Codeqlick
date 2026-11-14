/**
 * Browser and operating system named in a User-Agent string, as far as they can be told.
 * Same rules as the website's `lib/user-agent.ts`, which names the devices in the sessions list.
 */
export type DeviceDescription = { browser?: string; os?: string };

// Order matters: Edge and Opera also say Chrome, Chrome also says Safari.
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  if (!userAgent) return {};
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1],
    os: SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1],
  };
}

/**
 * A key that is the same for two agents of the same browser on the same system (versions
 * aside), or `null` when neither can be told.
 */
export function deviceKey(userAgent: string | null | undefined): string | null {
  const { browser, os } = describeUserAgent(userAgent);
  if (!browser && !os) return null;
  return `${browser ?? '?'}|${os ?? '?'}`;
}
