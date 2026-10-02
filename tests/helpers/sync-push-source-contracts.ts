import ts from 'typescript-api';

function descendants<Node extends ts.Node>(root: ts.Node, match: (node: ts.Node) => node is Node): Node[] {
  const found: Node[] = [];
  function visit(node: ts.Node) { if (match(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(root);
  return found;
}

/** Inspect compiled push scopes and ordering independently of compiler formatting. */
export function syncPushSourceContracts(source: string) {
  const file = ts.createSourceFile('sync-push.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
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
    && node.name.elements.map(element => element.name.getText(file)).join(',') === 'deltaPlans,deltaOpCount'
    && node.initializer && ts.isAwaitExpression(node.initializer) && ts.isCallExpression(node.initializer.expression)
    && node.initializer.expression.expression.getText(file) === 'planProfileDeltas'
    && node.initializer.expression.arguments.map(arg => arg.getText(file)).join(',') === 'profileId,outboundData');
  const updates = descendants(push, ts.isCallExpression).filter(call => call.expression.getText(file) === 'evolu.update'
    && call.arguments[0] && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === 'profileData');
  return { commitTracksBytes: tracked,
    plansBeforeProfileUpdate: !!plan && updates.length > 0 && updates.every(update => plan.getStart(file) < update.getStart(file)) };
}
