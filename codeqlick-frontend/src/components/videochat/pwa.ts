/** Browser checks for the installable video chat (client side only). */

/** Running as an installed app (home screen), not in a browser tab. */
export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** iPhone or iPad in a browser tab: it installs through Share → Add to Home Screen, and only the
 * installed app gets notifications (iOS 16.4+). */
export function isIosNotInstalled(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !isInstalled();
}
