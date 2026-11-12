// main.js — Thin entry point

import './app-extension-bootstrap.js';
import './schema.js';
import './constants.js';
import './utils.js';
import './legal-consent.js';
import './health-data-loader.js';
import './light-sun-loader.js';
import './app-navigation-loader.js';
import './feedback.js';
import './tour.js';
import './touch-tooltip.js';
import './navigation-views.js';
import './app-shell-hooks.js';
import './light-env-shell-hooks.js';
import { installShellActionDelegates } from './shell-actions.js';
import { startApp } from './startup-orchestrator.js';
import { ensureAppShell } from './app-shell-component.js';
import { watchHostedTransitionCutoff } from './hosted-transition-monitor.js';
import { showHostedRecoveryCutoff } from './hosted-transition-notice.js';

ensureAppShell();
installShellActionDelegates();
let cutoffStarted = false;
watchHostedTransitionCutoff(() => {cutoffStarted = true; void showHostedRecoveryCutoff();});
if (!cutoffStarted) startApp();
