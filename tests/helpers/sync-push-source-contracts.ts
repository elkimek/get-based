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
    if (!push) return { commitTracksBytes: false, plansBeforeProfileUpdate: false, commitOwnsDeltas: false, successOwnedByComplete: false };
    const variables = descendants(push, ts.isVariableDeclaration);
    const complete = variables.find(node => node.name.getText(file) === 'onComplete')?.initializer;
    const success = descendants(push, ts.isCallExpression).filter(call => call.expression.getText(file) === 'finish'
      && call.arguments.length === 1 && call.arguments[0]!.getText(file).replace(/\s/g, '') === '{ok:true}');
    const successOwnedByComplete = success.length === 1 && !!complete && ts.isArrowFunction(complete)
      && complete.getStart(file) < success[0]!.getStart(file) && success[0]!.getEnd() < complete.getEnd();
    const committed = complete && ts.isArrowFunction(complete)
      ? descendants(complete.body, ts.isTemplateExpression).find(node => node.head.text.startsWith('Push committed ')) : undefined;
    const tracked = complete && ts.isArrowFunction(complete)
      ? descendants(complete.body, ts.isCallExpression).some(call => call.expression.getText(file) === 'trackPushBytes'
        && committed && committed.getStart(file) < call.getStart(file) && call.arguments.length === 1 && call.arguments[0]!.getText(file).replace(/\s/g, '') === "(dataJson||'').length") : false;
    const plan = variables.find(node => ts.isObjectBindingPattern(node.name)
      && node.name.elements.map(element => element.name!.getText(file)).join(',') === 'deltaPlans,dataDeltaOpCount,planningErrors'
      && node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression)
      && node.initializer.expression.expression.getText(file) === 'planProfileDeltas'
      && node.initializer.expression.arguments.length === 3
      && node.initializer.expression.arguments.slice(0, 2).map(arg => arg.getText(file)).join(',') === 'profileId,outboundData'
      && node.initializer.expression.arguments[2]!.getText(file).replace(/\s/g, '') === '{forceScalars:opts.completeSnapshot===true}');
    const updates = descendants(push, ts.isCallExpression).filter(call => call.expression.getText(file) === 'evolu.update'
      && call.arguments[0] && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === 'profileData');
    const applied = descendants(push, ts.isCallExpression).filter(call => call.expression.getText(file) === 'applyCommittedDeltas');
    const owned = !!complete && ts.isArrowFunction(complete) && applied.length === 1
      && applied[0]!.getStart(file) > complete.body.getStart(file) && applied[0]!.getEnd() < complete.body.getEnd();
    return { commitTracksBytes: tracked, commitOwnsDeltas: owned, successOwnedByComplete,
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


/** Both actual queue callback owners read/decode fail-closed and write encrypted. */
export function syncPullEncryptionSourceContract(source: string): boolean {
  return withParsedSource(source, 'sync-pull-merge.js', file => {
    const text=(node:ts.Node)=>node.getText(file).replace(/\s/g,'');
    const named=(name:string)=>file.statements.filter(ts.isFunctionDeclaration).filter(node=>node.name?.text===name);
    const queued=(name:string)=>{
      const functions=named(name),body=functions[0]?.body;
      if(functions.length!==1||!body||body.statements.length!==1)return undefined;
      const statement=body.statements[0]!;
      if(!ts.isReturnStatement(statement)||!statement.expression||!ts.isCallExpression(statement.expression))return undefined;
      const call=statement.expression,callback=call.arguments[1];
      return text(call.expression)==='queueProfileDataWrite'&&call.arguments.length===2&&text(call.arguments[0]!)==='profileId'
        &&callback&&ts.isArrowFunction(callback)&&ts.isBlock(callback.body)?callback.body:undefined;
    };
    const variable=(body:ts.Block,name:string)=>{
      const variables=body.statements.filter(ts.isVariableStatement).flatMap(statement=>[...statement.declarationList.declarations])
        .filter(node=>ts.isIdentifier(node.name)&&node.name.text===name);
      return variables.length===1?variables[0]:undefined;
    };
    const capture=queued('captureSyncPullBaseline'),persist=queued('persistPulledImportedData');
    if(!capture||!persist)return false;
    const read=(body:ts.Block,name:string)=>{
      const value=variable(body,name)?.initializer;
      return value&&ts.isAwaitExpression(value)&&ts.isCallExpression(value.expression)?value.expression:undefined;
    };
    const first=read(capture,'rawStored'),second=read(persist,'raw'),all=descendants(file,ts.isCallExpression);
    const guarded=(call:ts.CallExpression)=>text(call.expression)==='encryptedGetItem'&&call.arguments.length===2&&text(call.arguments[1]!)==='{throwOnDecryptError:true}';
    if(!first||!second||!guarded(first)||!guarded(second)||all.filter(call=>text(call.expression)==='encryptedGetItem').length!==2)return false;
    const importedKey=(node:ts.Node)=>ts.isCallExpression(node)&&text(node.expression)==='profileStorageKey'
      &&node.arguments.length===2&&text(node.arguments[0]!)==='profileId'&&ts.isStringLiteral(node.arguments[1]!)&&node.arguments[1]!.text==='imported';
    if(!importedKey(first.arguments[0]!)||text(second.arguments[0]!)!=='localKey')return false;
    const mergers=named('mergePulledImportedData'),writer=named('persistPulledImportedData')[0]!;
    if(mergers.length!==1||!mergers[0]!.body||writer.parameters.length!==4||text(writer.parameters[0]!.name)!=='localKey'||text(writer.parameters[1]!.name)!=='profileId')return false;
    const localKey=variable(mergers[0]!.body,'localKey')?.initializer;
    if(!localKey||!importedKey(localKey))return false;
    const returns=capture.statements.filter(ts.isReturnStatement),returned=returns[0]?.expression;
    if(returns.length!==1||!returned||!ts.isObjectLiteralExpression(returned))return false;
    const stored=returned.properties.filter(ts.isPropertyAssignment).filter(property=>text(property.name)==='stored');
    const latest=variable(persist,'latest')?.initializer;
    if(stored.length!==1||text(stored[0]!.initializer)!=='rawStored?JSON.parse(rawStored):null'||!latest||text(latest)!=='raw?JSON.parse(raw):null')return false;
    const writes=persist.statements.filter(ts.isExpressionStatement).map(statement=>statement.expression)
      .filter(ts.isAwaitExpression).map(node=>node.expression).filter(ts.isCallExpression).filter(call=>text(call.expression)==='encryptedSetItem');
    return writes.length===1&&all.filter(call=>text(call.expression)==='encryptedSetItem').length===1
      &&writes[0]!.arguments.length===2&&text(writes[0]!.arguments[0]!)==='localKey'
      &&text(writes[0]!.arguments[1]!)==='JSON.stringify(committed)'&&second.getStart(file)<writes[0]!.getStart(file);
  });
}

/** Require the actual post-commit snapshot write to remain guarded by successful row application. */
export function syncCommittedDeltaSourceContracts(source: string) {
 return withParsedSource(source, 'sync-push-deltas.js', file => {
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'applyCommittedDeltas');
  if (!fn) return {snapshotsGuarded: false};
  const text = (node: ts.Node) => node.getText(file).replace(/\s/g, '');
  const snapshots = descendants(file, ts.isCallExpression).filter(call => text(call.expression) === '_writeDeltaSnapshot');
  const applies = descendants(fn, ts.isVariableDeclaration).filter(node => text(node.name) === 'allOk' && node.initializer && text(node.initializer) === '_applyArrayDelta(arrayName,plan)');
  const guards = descendants(fn, ts.isIfStatement).filter(node => text(node.expression) === 'allOk');
  const write = snapshots[0], apply = applies[0], guard = guards[0];
  return {snapshotsGuarded: snapshots.length === 1 && applies.length === 1 && guards.length === 1 && !!write && !!apply && !!guard
   && apply.getStart(file) < guard.getStart(file) && guard.thenStatement.getStart(file) < write.getStart(file) && write.getEnd() < guard.thenStatement.getEnd()
   && write.arguments.map(text).join(',') === 'profileId,arrayName,plan.next,plan.plannedAt'};
 });
}
