<svelte:options runes={true} preserveWhitespace={true} /><script lang="ts">
 import {componentStaticStyles} from '../component-inline-style-map.generated.js';
  import AppHeader from './AppHeader.svelte';
  import AppFooter from './AppFooter.svelte';
  import ChatShell from './ChatShell.svelte';
  import DashboardWelcome from './DashboardWelcome.svelte';
  import {projectDashboardWelcomeView} from '../dashboard-welcome-presentation.js';
  // The router owns the main/sidebar/modal host contents after the initial paint.
  // This passive Welcome never subscribes to domain state or rerenders those hosts.
  const startupWelcome = {...projectDashboardWelcomeView({ready: false, paused: false, reminder: null}), prerendered: true};
</script>  <a href="#main-content" class="skip-link">Skip to main content</a>
  <AppHeader />

  <div class="layout">
    <div class="sidebar-backdrop" id="sidebar-backdrop" data-shell-action="close-mobile-sidebar"></div>
    <nav class="sidebar" id="sidebar-nav"></nav>
    <main class="main" id="main-content">
      <DashboardWelcome view={startupWelcome} />
    </main>
  </div>

  <AppFooter />

  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" id="detail-modal" role="dialog" aria-modal="true" aria-label="Marker Detail"></div>
  </div>

  <div class="modal-overlay" id="import-modal-overlay">
    <div class="modal" id="import-modal" role="dialog" aria-modal="true" aria-label="Import Lab Results"></div>
  </div>

  <div class="modal-overlay" id="settings-modal-overlay">
    <div class="modal" id="settings-modal" role="dialog" aria-modal="true" aria-label="Settings"></div>
  </div>

  <div class="modal-overlay" id="feedback-modal-overlay">
    <div class="modal" id="feedback-modal" role="dialog" aria-modal="true" aria-label="Send Feedback"></div>
  </div>


  <div class="modal-overlay" id="changelog-modal-overlay">
    <div class="modal" id="changelog-modal" role="dialog" aria-modal="true" aria-label="What's New" style={componentStaticStyles.dialogMaximumWidth}></div>
  </div>

  <div class="modal-overlay" id="client-list-overlay">
    <div class="modal client-list-modal" id="client-list-modal" role="dialog" aria-modal="true" aria-label="Clients"></div>
  </div>

  <ChatShell />

  <input type="file" id="pdf-input" aria-label="Import PDF or data file" accept=".pdf,.json,.cluedata,.txt,.csv,.xlsx,.xml,.zip,.jpg,.jpeg,.png,.webp,application/xml,text/xml,application/zip" style={componentStaticStyles.hidden} multiple>
  <div class="notification-container" id="notification-container" aria-live="polite" role="status"></div>

