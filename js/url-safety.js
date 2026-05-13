// Shared SSRF-style validation for user-supplied URLs that the browser
// will fetch directly (mint URLs, Routstr nodes, self-host UV data, etc.).
//
// Blocks loopback / RFC1918 / link-local / cloud-metadata literals across
// both IPv4 and IPv6 (including 4-mapped, 4-embedded, hex-encoded forms).
// Hostnames still go through DNS at fetch time and can resolve to private
// IPs — `requireHttps: true` forces TLS so a rebound host fails cert
// validation before any bearer or token leaves the device.
//
// Default is strict: https-only, no localhost, no RFC1918. Callers that
// legitimately need a local target (lens external-server, Ollama custom
// provider) pass { allowLocalhost: true } and accept that risk explicitly.

export function isValidExternalUrl(raw, { requireHttps = true, allowLocalhost = false } = {}) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (requireHttps && u.protocol !== 'https:') return false;

  const rawHost = u.hostname.toLowerCase();
  const host = (rawHost.startsWith('[') && rawHost.endsWith(']')) ? rawHost.slice(1, -1) : rawHost;

  if (!allowLocalhost) {
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (host === '0.0.0.0') return false;
    if (host.endsWith('.local') || host.endsWith('.localhost')) return false;
  }
  if (host === '168.63.129.16') return false;                   // Azure metadata (always blocked)

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const octets = ipv4.slice(1, 5);
    for (const o of octets) {
      if (o.length > 1 && o[0] === '0') return false;            // leading-zero octal trick
      if (+o > 255) return false;
    }
    const o = octets.map(Number);
    if (!allowLocalhost && o[0] === 127) return false;          // 127.0.0.0/8
    if (!allowLocalhost && o[0] === 0) return false;            // 0.0.0.0/8
    if (o[0] === 10) return false;                              // 10.0.0.0/8
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return false; // 172.16.0.0/12
    if (o[0] === 192 && o[1] === 168) return false;             // 192.168.0.0/16
    if (o[0] === 169 && o[1] === 254) return false;             // link-local (incl. 169.254.169.254)
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return false; // CGN 100.64.0.0/10
    if (o[0] >= 224) return false;                              // multicast / reserved
  }

  if (host.includes(':')) {
    if (host === '::' || host === '0:0:0:0:0:0:0:0') return false;
    if (/^fc[0-9a-f]{2}:/.test(host) || /^fd[0-9a-f]{2}:/.test(host)) return false; // fc00::/7 ULA
    if (/^fe[89ab][0-9a-f]:/.test(host)) return false;          // fe80::/10 link-local

    const v4Embed = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Embed) return isValidExternalUrl(`${u.protocol}//${v4Embed[1]}${u.pathname || ''}`, { requireHttps, allowLocalhost });

    if (host.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 = `::ffff:HHHH:HHHH` — exactly two colon-separated
      // 16-bit hex groups. Parse each group independently. Earlier draft
      // concatenated the raw hex and left-padded — when leading zeros were
      // omitted (e.g. `c0a8:101` instead of `c0a8:0101`), the byte boundaries
      // mis-aligned and `::ffff:c0a8:101` mis-parsed as `12.10.129.1` instead
      // of `192.168.1.1`, bypassing the RFC-1918 block (Greptile P1 PR #193).
      const tail = host.slice(7);
      const groups = tail.split(':');
      if (groups.length === 2 && groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) {
        const g0 = parseInt(groups[0], 16);
        const g1 = parseInt(groups[1], 16);
        const a = (g0 >> 8) & 0xff;
        const b = g0 & 0xff;
        const c = (g1 >> 8) & 0xff;
        const d = g1 & 0xff;
        return isValidExternalUrl(`${u.protocol}//${a}.${b}.${c}.${d}${u.pathname || ''}`, { requireHttps, allowLocalhost });
      }
    }
    if (!/^[23][0-9a-f]{3}:/.test(host)) return false;          // only globally-routable IPv6
  }

  return true;
}
