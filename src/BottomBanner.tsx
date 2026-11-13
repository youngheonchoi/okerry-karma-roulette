import { useEffect, useRef, useState } from 'react';
import { TossAds, isMinVersionSupported } from '@apps-in-toss/web-framework';

const adGroupId = (!import.meta.env.DEV && import.meta.env.VITE_TOSS_BANNER_AD_GROUP_ID?.trim()) || 'ait-ad-test-banner-id';
const banner = TossAds;
let initialization: Promise<void> | undefined;

export function BottomBanner() {
  const slot = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = slot.current;
    if (!target || !banner.initialize.isSupported() || !banner.attachBanner.isSupported() ||
      !isMinVersionSupported({ android: '5.241.0', ios: '5.241.0' })) return;

    let active = true;
    let attachment: ReturnType<typeof banner.attachBanner> | undefined;
    initialization ??= new Promise<void>((resolve, reject) => {
      banner.initialize({ callbacks: { onInitialized: resolve, onInitializationFailed: reject } });
    });
    const updateVisibility = (value: boolean) => { if (active) setVisible(value); };
    void initialization.then(() => {
      if (!active) return;
      attachment = banner.attachBanner(adGroupId, target, {
        theme: 'light',
        variant: 'expanded',
        callbacks: {
          onAdRendered: () => updateVisibility(true),
          onNoFill: () => updateVisibility(false),
          onAdFailedToRender: () => updateVisibility(false),
        },
      });
    }).catch(() => updateVisibility(false));
    return () => { active = false; attachment?.destroy(); };
  }, []);

  useEffect(() => {
    const element = footer.current;
    const shell = element?.parentElement;
    if (!visible || !element || !shell) return;
    const measure = () => shell.style.setProperty('--banner-offset', `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--banner-offset');
    };
  }, [visible]);

  return <aside ref={footer} className="bottom-banner" data-visible={visible} aria-hidden={!visible} aria-label="광고">
    <div ref={slot} className="bottom-banner-slot" />
  </aside>;
}
