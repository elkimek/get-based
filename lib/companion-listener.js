// @ts-check
/**
 * Restore a suspended listener, with a bounded port fallback and cleanup on
 * every completion path. The caller suspends its normal startup error handler.
 * @param {import('node:http').Server} server
 * @param {{host: string, port: number, lastPort: number, onPort: (port: number) => void}} options
 */
export function recoverCompanionListener(server, options) {
  return new Promise((resolve, reject) => {
    let port = options.port;
    const cleanup = () => {
      server.off('listening', ready);
      server.off('error', failed);
    };
    const ready = () => { cleanup(); resolve(); };
    /** @param {NodeJS.ErrnoException} error */
    const failed = error => {
      if (error.code === 'EADDRINUSE' && port < options.lastPort) {
        port += 1;
        attempt();
        return;
      }
      cleanup();
      reject(error);
    };
    const attempt = () => {
      options.onPort(port);
      try { server.listen(port, options.host); }
      catch (error) { failed(/** @type {NodeJS.ErrnoException} */ (error)); }
    };
    server.once('listening', ready);
    server.on('error', failed);
    attempt();
  });
}
