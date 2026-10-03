// @ts-check
// main.js — Thin entry point

import './app-extension-bootstrap.js';
import './schema.js';
import './constants.js';
import './utils.js';
import './legal-consent.js';
import './health-data-loader.js';
import './light-sun-loader.js';
import './feedback.js';
import './tour.js';
import './touch-tooltip.js';
import './views.js';
import './app-shell-hooks.js';
import './light-env-shell-hooks.js';
import { installShellActionDelegates } from './shell-actions.js';
import { startApp } from './startup-orchestrator.js';

installShellActionDelegates();
startApp();
