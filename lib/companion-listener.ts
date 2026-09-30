import type { EventEmitter } from 'node:events';

interface CompanionListenerServer extends Pick<EventEmitter, 'off' | 'once' | 'on'> {
  listen: (port: number, host: string) => unknown;
}

export interface CompanionListenerRecovery {
  host: string;
  port: number;
  lastPort: number;
  onPort: (port: number) => void;
}

/** Restore a suspended listener with bounded port fallback and cleanup. */
export function recoverCompanionListener(
  server: CompanionListenerServer, options: CompanionListenerRecovery,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let port = options.port;
    const cleanup = () => {
      server.off('listening', ready);
      server.off('error', failed);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' && port < options.lastPort) {
        port += 1;
        attempt();
        return;
      }
      cleanup();
      reject(error);
    };
    const attempt = () => {
      try {
        options.onPort(port);
        server.listen(port, options.host);
      }
      catch (error) { failed(error as NodeJS.ErrnoException); }
    };
    server.once('listening', ready);
    server.on('error', failed);
    attempt();
  });
}
