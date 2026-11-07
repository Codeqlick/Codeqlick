'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  pushSubscribeAction,
  pushUnsubscribeAction,
} from '@/app/[locale]/videochat/settings/actions';
import { isIosNotInstalled } from './pwa';

const SERVICE_WORKER = '/videochat-sw.js';

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
 * "Tell me when someone is there" for this device (Web Push; architecture 4.7): registers the
 * video chat's service worker, subscribes with the server's key and stores the subscription.
 */
export function PushToggle({ publicKey, locale }: { publicKey: string; locale: 'en' | 'es' }) {
  const t = useTranslations('Videochat.push');
  const [state, setState] = useState<State>('loading');
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
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER, { scope: '/' });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(publicKey),
        }));
      const json = subscription.toJSON();
      const result = await pushSubscribeAction({
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
        await pushUnsubscribeAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
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
      {state === 'on' ? (
        <Button type="button" variant="outline" onClick={disable} disabled={busy}>
          {busy ? t('working') : t('disable')}
        </Button>
      ) : null}
    </div>
  );
}
