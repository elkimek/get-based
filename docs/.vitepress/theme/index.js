import DefaultTheme from 'vitepress/theme'
import './custom.css'
import { onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vitepress'

export default {
  extends: DefaultTheme,
  setup() {
    const route = useRoute()
    // VitePress prepends /docs/ base to relative paths, so the config
    // uses a placeholder URL. This rewrites it client-side based on the
    // current host:
    //   - localhost/127.0.0.1: → /app  (dev-server routes /app to index.html)
    //   - getbased.health (landing site): → /app  (Vercel routes /app to index.html)
    //   - app.getbased.health (app subdomain hosting docs): → /  (app is at root)
    //   - anywhere else: → https://app.getbased.health  (canonical absolute)
    const fixAppLinks = () => {
      nextTick(() => {
        const host = (typeof window !== 'undefined' && window.location.hostname) || ''
        let target
        if (host === 'localhost' || host === '127.0.0.1' || host === '') {
          target = '/app'
        } else if (host === 'app.getbased.health') {
          target = '/'
        } else if (host === 'getbased.health' || host.endsWith('.getbased.health')) {
          target = '/app'
        } else {
          target = 'https://app.getbased.health'
        }
        document.querySelectorAll('a[href*="getbased.health/app"]').forEach(a => {
          a.href = target
        })
      })
    }
    onMounted(fixAppLinks)
    watch(() => route.path, fixAppLinks)
  }
}
