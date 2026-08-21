// @ts-check
// main.js — Thin entry point

import './app-extension-bootstrap.js';
import './app-feature-modules.js';
import { installShellActionDelegates } from './shell-actions.js';
import { startApp } from './startup-orchestrator.js';

installShellActionDelegates();
startApp();
