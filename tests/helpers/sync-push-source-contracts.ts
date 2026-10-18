import * as ts from 'typescript/unstable/ast';
import { withParsedSource } from '../../scripts/native-typescript-ast.js';

function descendants<Node extends ts.Node>(root: ts.Node, match: (node: ts.Node) => node is Node): Node[] {
  const found: Node[] = [];
  function visit(node: ts.Node) { if (match(node)) found.push(node); node.forEachChild(visit); }
  visit(root);
  return found;
}

/** Inspect compiled push scopes and ordering independently of compiler formatting. */
export function syncPushSourceContracts(source: string) {
  return withParsedSource(source, 'sync-push.js', file => {
    const push = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'pushProfile');
    if (!push) return { commitTracksBytes: false, plansBeforeProfileUpdate: false };
    const variables = descendants(push, ts.isVariableDeclaration);
    const complete = variables.find(node => node.name.getText(file) === 'onComplete')?.initializer;
    const committed = complete && ts.isArrowFunction(complete)
      ? descendants(complete.body, ts.isTemplateExpression).find(node => node.head.text.startsWith('Push committed ')) : undefined;
    const tracked = complete && ts.isArrowFunction(complete)
      ? descendants(complete.body, ts.isCallExpression).some(call => call.expression.getText(file) === 'trackPushBytes'
        && committed && committed.getStart(file) < call.getStart(file) && call.arguments.length === 1 && call.arguments[0]!.getText(file).replace(/\s/g, '') === "(dataJson||'').length") : false;
    const plan = variables.find(node => ts.isObjectBindingPattern(node.name)
      && node.name.elements.map(element => element.name!.getText(file)).join(',') === 'deltaPlans,deltaOpCount'
      && node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression)
      && node.initializer.expression.expression.getText(file) === 'planProfileDeltas'
      && node.initializer.expression.arguments.map(arg => arg.getText(file)).join(',') === 'profileId,outboundData');
    const updates = descendants(push, ts.isCallExpression).filter(call => call.expression.getText(file) === 'evolu.update'
      && call.arguments[0] && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === 'profileData');
    return { commitTracksBytes: tracked,
      plansBeforeProfileUpdate: !!plan && updates.length > 0 && updates.every(update => plan.getStart(file) < update.getStart(file)) };
  });
}

/** Inspect the actual chat debounce scope and its retry owner, without source-length windows. */
export function syncChatSaveSourceContracts(source: string) {
  return withParsedSource(source, 'sync-save-hooks-core.js', file => {
    const functions = descendants(file, ts.isFunctionDeclaration);
    const chats = functions.filter(node => node.name?.text === 'onChatSaved');
    const schedulers = functions.filter(node => node.name?.text === 'scheduleProfilePush');
    const empty = {latestDataBeforeRetry: false, noOneShotPush: false, retryWhileSyncing: false};
    if (chats.length !== 1 || schedulers.length !== 1) return empty;
    const chat = chats[0]!, scheduler = schedulers[0]!;
    const text = (node: ts.Node) => node.getText(file).replace(/\s/g, '');
    const calls = descendants(chat, ts.isCallExpression);
    const timers = calls.filter(call => ts.isIdentifier(call.expression) && call.expression.text === 'setTimeout');
    const timer = timers.length === 1 ? timers[0] : undefined;
    const callback = timer?.arguments[0];
    const timerBody = callback && ts.isArrowFunction(callback) ? callback.body : undefined;
    const latest = timerBody ? descendants(timerBody, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name) && node.name.text === 'latest') : undefined;
    const read = latest?.initializer && ts.isAwaitExpression(latest.initializer) ? latest.initializer.expression : undefined;
    const scheduled = timerBody ? descendants(timerBody, ts.isCallExpression).filter(call => ts.isIdentifier(call.expression) && call.expression.text === 'scheduleProfilePush') : [];
    const latestDataBeforeRetry = !!timerBody && !!latest && !!read && ts.isCallExpression(read)
      && ts.isIdentifier(read.expression) && read.expression.text === 'readProfileImportedData'
      && read.arguments.length === 2 && text(read.arguments[0]!) === 'profileId' && text(read.arguments[1]!) === 'data'
      && scheduled.length === 1 && scheduled[0]!.arguments.length === 2
      && text(scheduled[0]!.arguments[0]!) === 'profileId' && text(scheduled[0]!.arguments[1]!) === 'latest'
      && latest.getStart(file) < scheduled[0]!.getStart(file)
      && timer!.arguments.length === 2 && text(timer!.arguments[1]!) === '10000';
    const noOneShotPush = !calls.some(call => text(call.expression) === '(0,syncSaveHooksDeps.pushProfile)' || text(call.expression) === 'syncSaveHooksDeps.pushProfile');
    const syncing = descendants(scheduler, ts.isIfStatement).find(node => text(node.expression) === '!(0,syncSaveHooksDeps.isEvoluReady)()||(0,syncSaveHooksDeps.isSyncing)()');
    const attempts = syncing ? descendants(syncing.thenStatement, ts.isIfStatement).find(node => text(node.expression) === 'attempt<60') : undefined;
    const retries = attempts ? descendants(attempts.thenStatement, ts.isCallExpression).filter(call => ts.isIdentifier(call.expression) && call.expression.text === 'setTimeout') : [];
    const retry = retries.length === 1 ? retries[0] : undefined;
    const retryCallback = retry?.arguments[0];
    const retryCalls = retryCallback && ts.isArrowFunction(retryCallback) ? descendants(retryCallback.body, ts.isCallExpression) : [];
    const recursive = retryCalls.filter(call => ts.isIdentifier(call.expression) && call.expression.text === 'scheduleProfilePush');
    const retryWhileSyncing = !!retry && retry.arguments.length === 2 && text(retry.arguments[1]!) === '1000'
      && recursive.length === 1 && recursive[0]!.arguments.length === 3
      && recursive[0]!.arguments.map(text).join(',') === 'profileId,data,attempt+1';
    return {latestDataBeforeRetry, noOneShotPush, retryWhileSyncing};
  });
}

/** Verify the current live goals-view sync refresh owner, including its stale-view boundary. */
export function syncHealthGoalsSourceContracts(source: string) {
  return withParsedSource(source, 'context-health-goals-view.js', file => {
    const text = (node: ts.Node) => node.getText(file).replace(/\s/g, '');
    const functions = file.statements.filter(ts.isFunctionDeclaration);
    const currents = functions.filter(node => node.name?.text === 'current');
    const refreshes = functions.filter(node => node.name?.text === 'refresh');
    if (currents.length !== 1 || refreshes.length !== 1) return false;
    const current = currents[0]!, refresh = refreshes[0]!;
    if (!current.body || !refresh.body) return false;
    const currentBody = current.body.statements;
    const refreshBody = refresh.body.statements;
    const currentReturn = currentBody[0];
    const currentGuard = currentBody.length === 1 && !!currentReturn && ts.isReturnStatement(currentReturn)
      && currentReturn.expression && text(currentReturn.expression) === "view===owned&&owned.root.isConnected&&owned.overlay.classList.contains('show')&&owned.session.current()";
    const refreshGuard = refreshBody.length === 4
      && text(refreshBody[0]!) === 'if(!current(owned))return;'
      && text(refreshBody[1]!) === 'owned.observed=structuredClone(state.importedData.healthGoals);'
      && text(refreshBody[2]!) === 'owned.component.refresh(owned.observed);'
      && text(refreshBody[3]!) === 'flushSync();';
    const registrations = descendants(file, ts.isCallExpression).filter(call =>
      text(call.expression) === 'globalThis.addEventListener' && call.arguments[0]
      && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === 'labcharts-sync-applied');
    const callback = registrations.length === 1 ? registrations[0]!.arguments[1] : undefined;
    return !!currentGuard && refreshGuard && !!callback && ts.isArrowFunction(callback)
      && text(callback.body) === '{if(view)refresh(view);}';
  });
}
