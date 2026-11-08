'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  peakAlertsAction,
  pushSubscribeAction,
  pushUnsubscribeAction,
} from '@/app/[locale]/videochat/settings/actions';
import { isIosNotInstalled } from './pwa';

type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: 'en' | 'es';
};

type State = 'loading' | 'unsupported' | 'ios' | 'denied' | 'off' | 'on';

/** VAPID keys come base64url-encoded; pushManager.subscribe wants the raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Notifications on this device (Web Push): registers the app's service worker, subscribes with
 * the server's key and stores the subscription. The video chat's by default ("someone is there",
 * architecture 4.7); Swipe passes its own worker, actions and texts (4.10).
 */
export function PushToggle({
  publicKey,
  locale,
  serviceWorker = '/videochat-sw.js',
  namespace = 'Videochat.push',
  subscribe = pushSubscribeAction,
  unsubscribe = pushUnsubscribeAction,
  peakAlerts,
}: {
  publicKey: string;
  locale: 'en' | 'es';
  serviceWorker?: string;
  namespace?: 'Videochat.push' | 'Swipe.push';
  subscribe?: (input: Subscription) => Promise<{ ok: boolean }>;
  unsubscribe?: (endpoint: string) => Promise<{ ok: boolean }>;
  /** Video chat only: the account asked for peak time alerts (the switch shows when given). */
  peakAlerts?: boolean;
}) {
  const t = useTranslations(namespace);
  const tv = useTranslations('Videochat.push');
  const [state, setState] = useState<State>('loading');
  const [peak, setPeak] = useState(peakAlerts ?? false);
  const [peakBusy, setPeakBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let next: State;
      if (!supported()) next = isIosNotInstalled() ? 'ios' : 'unsupported';
      else if (Notification.permission === 'denied') next = 'denied';
      else {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        next = subscription ? 'on' : 'off';
      }
      if (!cancelled) setState(next);
    })().catch(() => {
      if (!cancelled) setState('unsupported');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const registration = await navigator.serviceWorker.register(serviceWorker, { scope: '/' });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const json = subscription.toJSON();
      const result = await subscribe({
        endpoint: json.endpoint ?? subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
        locale,
      });
      if (!result.ok) {
        await subscription.unsubscribe();
        setError(true);
        return;
      }
      setState('on');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(false);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function togglePeak(on: boolean) {
    setPeakBusy(true);
    setError(false);
    const result = await peakAlertsAction(on).catch(() => ({ ok: false }));
    if (result.ok) setPeak(on);
    else setError(true);
    setPeakBusy(false);
  }

  if (state === 'loading') return null;
  return (
    <div>
      {state === 'on' ? <p>{t('on')}</p> : null}
      {state === 'unsupported' ? <p>{t('unsupported')}</p> : null}
      {state === 'ios' ? <p>{t('iosInstall')}</p> : null}
      {state === 'denied' ? <p>{t('denied')}</p> : null}
      {error ? <Alert tone="error">{t('error')}</Alert> : null}
      {state === 'off' ? (
        <Button type="button" variant="primary" onClick={enable} disabled={busy}>
          {busy ? t('working') : t('enable')}
        </Button>
      ) : null}
      {state === 'on' && peakAlerts !== undefined ? (
        <p>
          <label>
            <input
              type="checkbox"
              checked={peak}
              disabled={peakBusy}
              onChange={(event) => void togglePeak(event.target.checked)}
            />{' '}
            {tv('peak')}
          </label>
          <br />
          <small>{tv('peakHint')}</small>
        </p>
      ) : null}
      {state === 'on' ? (
        <Button type="button" variant="outline" onClick={disable} disabled={busy}>
          {busy ? t('working') : t('disable')}
        </Button>
      ) : null}
    </div>
  );
}
