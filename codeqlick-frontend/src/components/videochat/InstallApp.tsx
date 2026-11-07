'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/Button';
import { isInstalled, isIosNotInstalled } from './pwa';

/** Chrome's install prompt event (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const noSubscribe = () => () => {};

/**
 * "Install the app" (architecture 4.7): the browser's own prompt where it offers one, the Share →
 * Add to Home Screen steps on iPhone, nothing when already installed or not installable.
 */
export function InstallApp({ className }: { className?: string }) {
  const t = useTranslations('Videochat.install');
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  // iPhone in a browser tab; false on the server so hydration matches.
  const ios = useSyncExternalStore(noSubscribe, isIosNotInstalled, () => false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === 'accepted') setInstalled(true);
  }

  if (!prompt && !ios && !installed) return null;
  return (
    <section className={className}>
      <h2>{t('title')}</h2>
      {installed ? (
        <p>{t('installed')}</p>
      ) : (
        <>
          <p>{t('lead')}</p>
          {prompt ? (
            <Button type="button" variant="primary" onClick={install}>
              {t('button')}
            </Button>
          ) : (
            <p>{t('iosSteps')}</p>
          )}
        </>
      )}
    </section>
  );
}
