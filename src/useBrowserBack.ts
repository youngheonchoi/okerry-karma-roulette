import { useEffect, useRef } from 'react';

const marker = 'karma-roulette-navigation';

/** History contains only a navigation marker, never answers or session snapshots. */
export function useBrowserBack(enabled: boolean, onBack: () => void) {
  const latest = useRef({ enabled, onBack });
  latest.current = { enabled, onBack };

  useEffect(() => {
    function handleBack() {
      if (!latest.current.enabled) return;
      // Restore the app boundary before handling the action. Cancelling a dialog
      // or waiting for a spin leaves both the session and the boundary intact.
      history.pushState({ [marker]: true }, '');
      latest.current.onBack();
    }
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, []);

  useEffect(() => {
    if (enabled && !history.state?.[marker]) {
      history.pushState({ [marker]: true }, '');
    } else if (!enabled && history.state?.[marker]) {
      // At mode selection the browser's normal exit behavior is available again.
      // Clear synchronously: StrictMode can run this effect twice on reload,
      // while history.back() completes asynchronously. Traverse only once.
      const cleared = { ...history.state };
      delete cleared[marker];
      history.replaceState(cleared, '');
      history.back();
    }
  }, [enabled]);
}
