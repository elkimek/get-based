import { renderHTML as renderBody } from './components/LegalFirstLaunchBody.svelte.html.js';
import { renderHTML as renderBoot } from './components/LegalFirstLaunchBoot.svelte.html.js';
import { projectFirstLaunchLegal, projectFirstLaunchLegalBoot } from './legal-first-launch-view.js';
import type { DeploymentOperator } from './deployment-policy.js';

export function renderFirstLaunchLegal(policy: DeploymentOperator, update = false): string {
 return renderBody({view: projectFirstLaunchLegal(policy, update)});
}
export function renderFirstLaunchLegalBoot(): string {
 return renderBoot({view: projectFirstLaunchLegalBoot()});
}
