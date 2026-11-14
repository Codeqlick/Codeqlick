/** A deploy hook's token is its credential (architecture 4.13, decision 51): logs never hold it. */
const HOOK_PATH = /(\/v1\/cloud\/hooks\/)([^/?#\s]+)/g;

/**
 * Hides the token in a request path or URL: `/v1/cloud/hooks/cqd_<first 8>…`. Anything else is
 * returned as it came.
 */
export function redactHookPath(value: string): string {
  return value.replace(HOOK_PATH, (_match, head: string, token: string) => {
    return `${head}${token.slice(0, 12)}…`;
  });
}
