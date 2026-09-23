import type { ReactNode } from 'react';
import { Banner } from '@cloudflare/kumo/components/banner';
import { Text } from '@cloudflare/kumo/components/text';
import { WarningCircleIcon } from '@phosphor-icons/react';

export interface ExplorerLayoutProps {
  status: 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  children: ReactNode;
}

export function ExplorerLayout({ status, errorMessage, children }: ExplorerLayoutProps) {
  return (
    <div className="bg-kumo-base relative h-dvh w-full overflow-hidden">
      {children}

      {status === 'error' && (
        <div className="absolute bottom-4 left-4 z-20 max-w-md">
          <Banner
            icon={<WarningCircleIcon weight="fill" />}
            variant="error"
            title="Initialization failed"
            description={
              <>
                {errorMessage}
                <br />
                <Text variant="mono-secondary" as="span">
                  Build ../twilic/runtimes/javascript with bun run build:wasm && bun run build:ts
                </Text>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
