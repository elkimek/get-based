import ts from 'typescript-api';

function parse(source: string) {
  const file = ts.createSourceFile('contract.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  return diagnostics.length ? undefined : file;
}
function body(file: ts.SourceFile | undefined, name: string) {
  return file?.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name)?.body;
}
function shape(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return shape(node.expression);
  if (ts.isPropertyAccessExpression(node)) return ['member', shape(node.expression), node.name.text];
  if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) return ['member', shape(node.expression), node.argumentExpression.text];
  if (ts.isIdentifier(node) || ts.isLiteralExpression(node)) return [node.kind, node.text];
  const children: unknown[] = [];
  ts.forEachChild(node, child => { children.push(shape(child)); });
  return [node.kind, children];
}
function matches(left: ts.Node | undefined, right: ts.Node | undefined) {
  return !!left && !!right && JSON.stringify(shape(left)) === JSON.stringify(shape(right));
}
function variable(source: string, name: string, key: string) {
  return body(parse(source), name)?.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === key);
}

/** Require the variable in the named function's body, outside conditional blocks. */
export function sourceFunctionHasVariable(source: string, name: string, key: string) {
  return !!variable(source, name, key);
}
export function sourceFunctionHasInitializer(source: string, name: string, key: string, expression: string) {
  const statement = parse(`const expected = ${expression};`)?.statements[0];
  const expected = statement && ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.initializer : undefined;
  return matches(variable(source, name, key)?.initializer, expected);
}

/** Match a direct or final statement; optionally expand a known, synchronous forwarding helper. */
export function sourceFunctionHasStatement(
  source: string, name: string, statement: string, position: 'direct' | 'last' = 'direct', helpers: readonly string[] = [],
) {
  const file = parse(source), scope = body(file, name), expected = parse(statement)?.statements[0];
  if (!file || !scope || !expected) return false;
  const statements = scope.statements.flatMap(node => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression) || !ts.isIdentifier(node.expression.expression)) return [node];
    const call = node.expression;
    const calledName = (call.expression as ts.Identifier).text;
    if (!helpers.includes(calledName)) return [node];
    const helper = file.statements.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === calledName);
    if (!helper?.body || helper.modifiers?.some(item => item.kind === ts.SyntaxKind.AsyncKeyword)
      || helper.parameters.length !== call.arguments.length || helper.parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken)
      || call.arguments.some(argument => !ts.isIdentifier(argument) && !ts.isLiteralExpression(argument))) return [node];
    const parameterNames = new Set(helper.parameters.map(parameter => (parameter.name as ts.Identifier).text));
    let shadowed = false;
    const checkBindings = (item: ts.Node) => {
      if ((ts.isVariableDeclaration(item) || ts.isParameter(item)) && ts.isIdentifier(item.name) && parameterNames.has(item.name.text)) shadowed = true;
      ts.forEachChild(item, checkBindings);
    };
    checkBindings(helper.body);
    if (shadowed) return [node];
    const parameters = new Map(helper.parameters.map((parameter, index) => [(parameter.name as ts.Identifier).text, call.arguments[index]!]));
    const result = ts.transform(helper.body, [context => {
      const visit = (item: ts.Node): ts.VisitResult<ts.Node> => ts.isIdentifier(item) && parameters.has(item.text)
        && !(ts.isPropertyAccessExpression(item.parent) && item.parent.name === item)
        && !(ts.isPropertyAssignment(item.parent) && item.parent.name === item)
        ? parameters.get(item.text)! : ts.visitEachChild(item, visit, context);
      return node => ts.visitNode(node, visit) as ts.Block;
    }]);
    const expanded = [...result.transformed[0]!.statements];
    result.dispose();
    return expanded;
  });
  return position === 'last' ? matches(statements.at(-1), expected) : statements.some(node => matches(node, expected));
}

/** Match a direct catch-body statement and its bound error in the named function. */
export function sourceFunctionHasCatchStatement(source: string, name: string, parameter: string, statement: string) {
  const scope = body(parse(source), name), expected = parse(statement)?.statements[0];
  if (!scope || !expected) return false;
  return scope.statements.some(node => ts.isTryStatement(node)
    && node.catchClause?.variableDeclaration && ts.isIdentifier(node.catchClause.variableDeclaration.name)
    && node.catchClause.variableDeclaration.name.text === parameter
    && node.catchClause.block.statements.some(item => matches(item, expected)));
}

/** Recognize imported serializers; unknown namespaces conservatively match every family. */
export function sourceCallsNamespacedActionAttributes(source: string, namespace: string) {
  const file = parse(source);
  if (!file) return false;
  const names = new Set(file.statements.flatMap(node => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)
      || node.moduleSpecifier.text !== './action-attributes.js' || node.importClause?.isTypeOnly) return [];
    const bindings = node.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) ? bindings.elements
      .filter(binding => !binding.isTypeOnly && (binding.propertyName?.text || binding.name.text) === 'actionAttributes')
      .map(binding => binding.name.text) : [];
  }));
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      const namespaces = node.arguments.length > 3 ? [node.arguments[0], node.arguments[3]] : [node.arguments[0]];
      if (namespaces.some(value => !value || !ts.isStringLiteral(value) || value.text === namespace)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
