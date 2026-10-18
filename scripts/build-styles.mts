#!/usr/bin/env node
import { factorLightSetupStyles } from './light-setup-owned-recipes.mjs';
import { assertNoLightSetupAtomicConsumers } from './light-setup-source-qualification.mjs';
import { lightSetupUtilityRecipes } from './style-recipes/light-setup.mjs';
import {compileInlineThemeStyles} from './inline-theme-style-ownership.mjs';
import {withInlineThemeStyleSnapshot} from './inline-theme-style-snapshot.mjs';
import {compileSharedThemeStyles} from './shared-theme-style-ownership.mjs';
import {compileRemainingFeatureStyles} from './remaining-feature-style-ownership.mjs';
import {compileContextEditorStyles} from './context-modal-style-ownership.mjs';
// Compile scoped Tailwind styles at the established lazy stylesheet URLs.
import { execFileSync } from 'node:child_process';
import {buildInlineStyleMaps} from './build-inline-style-maps.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { restoreFeedbackNoticeRule } from './feedback-native-rule.mjs';
import { compile } from '@tailwindcss/node';
import { compileCategoryViewsNativeStyles } from './category-views-native-styles.mjs';
import { compileStartupBannerStyles } from './startup-banner-style-ownership.mjs';
import { compileMarkerDetailCompleteStyles } from './marker-detail-complete-style-ownership.mjs';
import {compilePIIReviewStyles} from './pii-review-style-ownership.mjs';
import {compileEMFComparisonStyles} from './emf-comparison-style-ownership.mjs';
import { compileDnaManualStyles } from './dna-manual-style-ownership.mjs';
import {compileWearablePresentationStyles} from './wearable-presentation-style-ownership.mjs';
import { compileModalPresentationStyles } from './modal-presentation-style-ownership.mjs';
import { compileDashboardWelcomeStyles } from './dashboard-welcome-style-ownership.mjs';
import {compileDashboardLabMarkerWidgetStyles, compileDashboardLabMarkerDataStyles} from './dashboard-lab-markers-style-ownership.mjs';
import {compileSupplementProfileStyles} from './supplement-form-style-ownership.mjs';
import {compileSettingsChatLayoutStyles} from './settings-chat-layout-style-ownership.mjs';
import {compileLightLayoutStyles,type LightLayoutLane} from './light-layout-style-ownership.mjs';
const lightLayoutFiles:Readonly<Record<string,LightLayoutLane>>={
    'light-conditions-now.base.css':'conditions','light-devices.base.css':'devices','light-env.base.css':'environment',
    'light-setup.base.css':'setup','light-sun.base.css':'page','light-tools.base.css':'tools',
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'css/settings.css');
interface UtilityEntry {
    name: string;
    minify: boolean;
}
interface StyleOptions {
    outputPath?: string;
    check?: boolean;
}
async function compileStyles(baseName: string, utilityName: string | readonly UtilityEntry[], outputPath: string, check: boolean, label: string): Promise<void> {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'getbased-styles-'));
    try {
        const entries = typeof utilityName === 'string' ? [{ name: utilityName, minify: true }] : utilityName;
        const utilities: string[] = [];
        for (const [index, entry] of entries.entries()) {
            const compiled = path.join(directory, `utilities-${index}.css`);
            const args = [path.join(ROOT, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
                '--input', path.join(ROOT, 'css', entry.name), '--output', compiled];
            if (entry.minify) args.push('--minify');
            execFileSync(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
            let utilityCSS = await fs.readFile(compiled, 'utf8');
            if (entry.name === 'feedback-entry.tailwind.css') {
                if (entry.minify)
                    throw new Error('Feedback native rule restoration requires unminified output');
                const recipeSource = await fs.readFile(path.join(ROOT, 'css/feedback.tailwind.css'), 'utf8');
                utilityCSS = restoreFeedbackNoticeRule(utilityCSS, recipeSource);
            }
            utilities.push(utilityCSS.trimEnd());
        }
        const basePath = path.join(ROOT, 'css', baseName);
        const baseInput = await fs.readFile(basePath, 'utf8');
        const lane = baseName === 'app-shell.base.css' ? 'app-shell' : baseName === 'redesign-shell.base.css' ? 'redesign-shell' : null;
        const lightLayoutLane=lightLayoutFiles[baseName];
        const remainingLane = baseName === 'import.base.css' ? 'import' : baseName === 'nutrition.base.css' ? 'nutrition' : baseName === 'recommendations.base.css' ? 'recommendations' : null;
        const base = remainingLane ? (await compileRemainingFeatureStyles(remainingLane,baseInput,basePath,ROOT)).css : lightLayoutLane ? (await compileLightLayoutStyles(lightLayoutLane,baseInput,basePath,ROOT)).css
            : baseName === 'settings.base.css' ? (await compileSettingsChatLayoutStyles('settings',baseInput,basePath,ROOT)).css
            : baseName === 'chat-panel-open.base.css' ? (await compileSettingsChatLayoutStyles('chat-open',baseInput,basePath,ROOT)).css
            : baseName === 'modal-shared.base.css'
            ? (await compileModalPresentationStyles(baseInput, basePath, ROOT)).css
            : baseName === 'data-protection.base.css' ? (await compilePIIReviewStyles(baseInput, basePath, ROOT)).css
            : baseName === 'dashboard-widgets.base.css' ? (await compileDashboardLabMarkerWidgetStyles(baseInput, basePath, ROOT)).css
            : baseName === 'context-editor.base.css' ? (await compileContextEditorStyles(baseInput, basePath, ROOT)).css
            : baseName === 'context-profile.base.css' ? (await compileSupplementProfileStyles(baseInput, basePath, ROOT)).css
            : lane ? (await compileStartupBannerStyles(lane, baseInput, basePath, ROOT)).css : baseInput;
        const combinedSource = `/* Generated by npm run styles:build; edit ${baseName} or ${entries.map(entry => entry.name).join(', ')}. */\n`
            + base.trimEnd() + '\n\n' + utilities.join('\n\n') + '\n';
        let source = combinedSource;
        if (baseName === 'light-setup.base.css') {
            await assertNoLightSetupAtomicConsumers(ROOT);
            source = factorLightSetupStyles(combinedSource, lightSetupUtilityRecipes).css;
        }
        if (check) {
            const existing = await fs.readFile(outputPath, 'utf8');
            if (existing !== source)
                throw new Error(`${label} CSS is stale; run npm run styles:build`);
        }
        else
            await fs.writeFile(outputPath, source);
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}
export async function buildStyles({ outputPath = OUTPUT, check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('settings.base.css', [
        { name: 'settings-display.tailwind.css', minify: true },
        { name: 'tweaks-settings-entry.tailwind.css', minify: false },
    ], outputPath, check, 'Settings');
}
export async function buildProtectionStyles({ outputPath = path.join(ROOT, 'css/data-protection.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('data-protection.base.css', 'data-protection.tailwind.css', outputPath, check, 'Data protection');
}
export async function buildChatStyles({ outputPath = path.join(ROOT, 'css/chat-panel-open.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('chat-panel-open.base.css', 'chat-navigation.tailwind.css', outputPath, check, 'Chat');
}
export async function buildLightSetupStyles({ outputPath = path.join(ROOT, 'css/light-setup.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('light-setup.base.css', 'light-setup.tailwind.css', outputPath, check, 'Light setup');
}
export async function buildAppShellStyles({ outputPath = path.join(ROOT, 'css/app-shell.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('app-shell.base.css', [
        { name: 'tour.tailwind.css', minify: true },
        { name: 'profile-button-app-shell.tailwind.css', minify: false },
    ], outputPath, check, 'App shell');
}
export async function buildRedesignShellStyles({ outputPath = path.join(ROOT, 'css/redesign-shell.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('redesign-shell.base.css', [
        { name: 'redesign-shell.tailwind.css', minify: false },
        { name: 'profile-button-redesign.tailwind.css', minify: false },
    ], outputPath, check, 'Redesign shell');
}
export async function buildChatRedesignStyles({ outputPath = path.join(ROOT, 'css/chat-redesign-open.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/chat-redesign-open.base.css');
    const input = await fs.readFile(inputPath, 'utf8');
    const {css} = await compileStartupBannerStyles('chat-redesign', input, inputPath, ROOT);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== css) throw new Error('Chat redesign CSS is stale; run npm run styles:build');
    } else await fs.writeFile(outputPath, css);
}
export async function buildModalStyles({ outputPath = path.join(ROOT, 'css/modal-shared.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('modal-shared.base.css', [
        { name: 'report-builder.tailwind.css', minify: true },
        { name: 'feedback-entry.tailwind.css', minify: false },
        { name: 'changelog-entry.tailwind.css', minify: false },
        { name: 'sync-rotation.tailwind.css', minify: false },
    ], outputPath, check, 'Shared modals');
}
export async function buildRecommendationStyles({ outputPath = path.join(ROOT, 'css/recommendations.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('recommendations.base.css', 'recommendation-cards.tailwind.css', outputPath, check, 'Recommendations');
}
export async function buildCycleStyles({ outputPath = path.join(ROOT, 'css/cycle.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('cycle.base.css', 'cycle-import.tailwind.css', outputPath, check, 'Cycle');
}
export async function buildImportStyles({ outputPath = path.join(ROOT, 'css/import.css'), check = false }: StyleOptions = {}): Promise<void> {
    await compileStyles('import.base.css', 'import-marker-map.tailwind.css', outputPath, check, 'Import');
}
export async function buildClientListStyles({ outputPath = path.join(ROOT, 'css/client-list.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/client-list.tailwind.css');
    const input = await fs.readFile(inputPath, 'utf8');
    const compiled = await compile(input, {
        base: ROOT,
        from: inputPath,
        polyfills: 0, // Tailwind Polyfills.None = 0; preserve native CSS values.
        onDependency: dependency => {
            if (!path.isAbsolute(dependency))
                throw new Error('Client List CSS dependency must be absolute');
        },
    });
    const source = compiled.build([]);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== source)
            throw new Error('Client List CSS is stale; run npm run styles:build');
    }
    else
        await fs.writeFile(outputPath, source);
}
export async function buildCategoryViewsStyles({ outputPath = path.join(ROOT, 'css/category-views.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/category-views.tailwind.css');
    const input = await fs.readFile(inputPath, 'utf8');
    const { css } = await compileCategoryViewsNativeStyles(input, inputPath, ROOT);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== css)
            throw new Error('Category views CSS is stale; run npm run styles:build');
    }
    else await fs.writeFile(outputPath, css);
}

export async function buildMarkerDetailStyles({ outputPath = path.join(ROOT, 'css/marker-detail-modal.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/marker-detail-modal.base.css');
    const input = await fs.readFile(inputPath, 'utf8');
    const {css} = await compileMarkerDetailCompleteStyles(input, inputPath, ROOT);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== css)
            throw new Error('Marker detail CSS is stale; run npm run styles:build');
    } else await fs.writeFile(outputPath, css);
}

export async function buildDashboardWelcomeStyles({check = false}: StyleOptions = {}): Promise<void> {
    for (const [lane, name] of [['welcome', 'dashboard-welcome'], ['greeting', 'dashboard-core']] as const) {
        const inputPath = path.join(ROOT, 'css', name + '.base.css');
        const input = await fs.readFile(inputPath, 'utf8');
        const {css} = await compileDashboardWelcomeStyles(lane, input, inputPath, ROOT);
        const outputPath = path.join(ROOT, 'css', name + '.css');
        if (check) {
            if (await fs.readFile(outputPath, 'utf8') !== css) throw new Error(name + ' CSS is stale');
        } else await fs.writeFile(outputPath, css);
    }
}

export async function buildDashboardDataStyles({outputPath=path.join(ROOT,'css/dashboard-data.css'),check=false}:StyleOptions={}):Promise<void>{
    const inputPath=path.join(ROOT,'css/dashboard-data.base.css');
    const {css}=await compileDashboardLabMarkerDataStyles(await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
    if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw new Error('Dashboard data CSS is stale; run npm run styles:build');}
    else await fs.writeFile(outputPath,css);
}

export async function buildWearableStyles({outputPath=path.join(ROOT,'css/wearables.css'),check=false}:StyleOptions={}):Promise<void>{
    const inputPath=path.join(ROOT,'css/wearables.base.css');
    const {css}=await compileWearablePresentationStyles(await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
    if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw new Error('Wearable CSS is stale; run npm run styles:build');}
    else await fs.writeFile(outputPath,css);
}

export async function buildGeneticsStyles({ outputPath = path.join(ROOT, 'css/genetics.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/genetics.base.css');
    const input = await fs.readFile(inputPath, 'utf8');
    const {css} = await compileDnaManualStyles(input, inputPath, ROOT);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== css)
            throw new Error('Genetics CSS is stale; run npm run styles:build');
    } else await fs.writeFile(outputPath, css);
}

export async function buildEMFInterpretationStyles({outputPath=path.join(ROOT,'css/emf.css'),check=false}:StyleOptions={}):Promise<void>{
    const inputPath=path.join(ROOT,'css/emf.base.css');
    const {css}=await compileEMFComparisonStyles(await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
    if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw new Error('EMF CSS is stale; run npm run styles:build');}
    else await fs.writeFile(outputPath,css);
}

/** Compile only the Mobile dashboard's scoped recipes; no reset or global utility layer. */
export async function buildMobileDashboardStyles({ outputPath = path.join(ROOT, 'css/mobile-dashboard.css'), check = false }: StyleOptions = {}): Promise<void> {
    const inputPath = path.join(ROOT, 'css/mobile-dashboard.base.css');
    const compiled = await compile(await fs.readFile(inputPath, 'utf8'), {
        base: path.dirname(inputPath), from: inputPath, polyfills: 0, onDependency: () => {},
    });
    const css = compiled.build([]);
    if (check) {
        if (await fs.readFile(outputPath, 'utf8') !== css) throw new Error('Mobile dashboard CSS is stale; run npm run styles:build');
    } else await fs.writeFile(outputPath, css);
}

/** Keep the existing lazy Chat URLs while compiling their complete scoped layout. */
export async function buildChatLayoutStyles({check=false}:StyleOptions={}):Promise<void>{
    for(const[lane,inputName,outputName]of [
        ["chat-actions", "css/chat-actions.base.css", "css/chat-actions.css"],
        ["chat-composer", "css/chat-composer.base.css", "css/chat-composer.css"],
        ["chat-messages", "css/chat-messages.base.css", "css/chat-messages.css"],
        ["chat-mobile", "css/chat-mobile.base.css", "css/chat-mobile.css"],
        ["chat-onboarding", "css/chat-onboarding.base.css", "css/chat-onboarding.css"],
        ["chat-closed", "css/chat-panel.base.css", "css/chat-panel.css"],
        ["chat-redesign", "css/chat-redesign.base.css", "css/chat-redesign.css"],
        ["chat-responsive", "css/chat-responsive.base.css", "css/chat-responsive.css"]
    ] as const){
        const inputPath=path.join(ROOT,inputName),outputPath=path.join(ROOT,outputName);
        const {css}=await compileSettingsChatLayoutStyles(lane,await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
        if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw new Error(outputName+' CSS is stale; run npm run styles:build');}
        else await fs.writeFile(outputPath,css);
    }
}

export async function buildFoundationStyles({outputPath=path.join(ROOT,'styles.css'),check=false}:StyleOptions={}):Promise<void>{
    const inputPath=path.join(ROOT,'css/foundation.base.css');
    const {css}=await compileSharedThemeStyles('foundation',await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
    if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw Error('Foundation CSS is stale; run npm run styles:build');}
    else await fs.writeFile(outputPath,css);
}
export async function buildExtraThemeStyles({outputPath=path.join(ROOT,'themes-extra.css'),check=false}:StyleOptions={}):Promise<void>{
    const inputPath=path.join(ROOT,'css/themes-extra.base.css');
    const {css}=await compileSharedThemeStyles('themes-extra',await fs.readFile(inputPath,'utf8'),inputPath,ROOT);
    if(check){if(await fs.readFile(outputPath,'utf8')!==css)throw Error('Extra theme CSS is stale; run npm run styles:build');}
    else await fs.writeFile(outputPath,css);
}

export async function buildInlineThemeStyles({outputPath=path.join(ROOT,'index.html'),check=false}:StyleOptions={}):Promise<void>{
    const compile=async(lane:'startup-layout'|'shared-theme-modes')=>{
        const inputPath=path.join(ROOT,'css',lane+'.base.css');
        return(await compileInlineThemeStyles(lane,await fs.readFile(inputPath,'utf8'),inputPath,ROOT)).css;
    };
    const [critical,modes]=await Promise.all([compile('startup-layout'),compile('shared-theme-modes')]);
    const index=await fs.readFile(outputPath,'utf8'),output=withInlineThemeStyleSnapshot(index,critical,modes);
    if(check){if(output!==index)throw Error('Inline theme CSS is stale; run npm run styles:build');}
    else if(output!==index)await fs.writeFile(outputPath,output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes('--check');
    await buildInlineStyleMaps(ROOT,undefined,check);
    await buildInlineThemeStyles({check});
    await buildFoundationStyles({check});
    await buildExtraThemeStyles({check});
    await buildChatLayoutStyles({ check });
    await buildMobileDashboardStyles({ check });
    await buildAppShellStyles({ check });
    await buildRedesignShellStyles({ check });
    await buildModalStyles({ check });
    await buildMarkerDetailStyles({ check });
    await buildGeneticsStyles({ check });
    await buildEMFInterpretationStyles({ check });
    await buildWearableStyles({ check });
    await buildImportStyles({ check });
    await buildCycleStyles({ check });
    await buildRecommendationStyles({ check });
    await buildStyles({ check });
    await buildProtectionStyles({ check });
    await buildChatStyles({ check });
    await buildChatRedesignStyles({ check });
    await buildLightSetupStyles({ check });
    await buildClientListStyles({ check });
    await buildCategoryViewsStyles({ check });
    await buildDashboardWelcomeStyles({ check });
    await buildDashboardDataStyles({ check });
    await compileStyles('light-conditions-now.base.css', 'light-conditions-now.tailwind.css', path.join(ROOT, 'css/light-conditions-now.css'), check, 'Light conditions');
    await compileStyles('dashboard-widgets.base.css', 'biology-scores.tailwind.css', path.join(ROOT, 'css/dashboard-widgets.css'), check, 'Dashboard widgets');
    await compileStyles('light-tools.base.css', 'light-tools.tailwind.css', path.join(ROOT, 'css/light-tools.css'), check, 'Light tools');
    await compileStyles('light-env.base.css', 'light-env.tailwind.css', path.join(ROOT, 'css/light-env.css'), check, 'Light environment');
    await compileStyles('light-devices.base.css', 'light-devices.tailwind.css', path.join(ROOT, 'css/light-devices.css'), check, 'Light device library');
    await compileStyles('light-sun.base.css', 'light-page.tailwind.css', path.join(ROOT, 'css/light-sun.css'), check, 'Light page');
    await compileStyles('nutrition.base.css', 'nutrition.tailwind.css', path.join(ROOT, 'css/nutrition.css'), check, 'Nutrition');
    await compileStyles('context-editor.base.css', 'context-editor.tailwind.css', path.join(ROOT, 'css/context-editor.css'), check, 'Context editor');
    await compileStyles('context-profile.base.css', 'context-catalog.tailwind.css', path.join(ROOT, 'css/context-profile.css'), check, 'Context catalog');
}
