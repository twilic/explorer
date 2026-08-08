import { useEffect, useState } from 'react';
import { init } from '@twilic/core/advanced';

import { ExplorePage } from './ExplorePage.js';
import { ExplorerLayout } from './ExplorerLayout.js';

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await init({ prefer: 'wasm' });
        if (cancelled) {
          return;
        }
        setStatus('ready');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ExplorerLayout status={status} errorMessage={errorMessage}>
      <ExplorePage ready={status === 'ready'} />
    </ExplorerLayout>
  );
}
