import * as ts from 'typescript/unstable/ast';
import { withParsedSource, withParsedSources } from '../../scripts/native-typescript-ast.js';

function parse(file: ts.SourceFile | undefined) {
  // The original guard rejected parser errors, while the SDK diagnostic list
  // also includes grammar-only TypeScript syntax checks for JavaScript files.
  return file && !(file.flags & ts.NodeFlags.ThisNodeOrAnySubNodesHasError) ? file : undefined;
}
function isFunctionLike(node: ts.Node) {
  return ts.isFunctionLikeDeclaration(node) || ts.isMethodSignatureDeclaration(node) || ts.isCallSignatureDeclaration(node)
    || ts.isJSDocSignature(node) || ts.isConstructSignatureDeclaration(node) || ts.isIndexSignatureDeclaration(node)
    || ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node);
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
  node.forEachChild(child => { children.push(shape(child)); });
  const metadata = ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ? node.operator
    : ts.isVariableDeclarationList(node)
      ? node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using | ts.NodeFlags.AwaitUsing) : undefined;
  return [node.kind, metadata, children];
}
function matches(left: ts.Node | undefined, right: ts.Node | undefined) {
  return !!left && !!right && JSON.stringify(shape(left)) === JSON.stringify(shape(right));
}
function variable(file: ts.SourceFile | undefined, name: string, key: string) {
  return body(file, name)?.statements.flatMap(statement => ts.isVariableStatement(statement)
    ? [...statement.declarationList.declarations] : []).find(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === key);
}

/** Require the variable in the named function's body, outside conditional blocks. */
export function sourceFunctionHasVariable(source: string, name: string, key: string) {
  return withParsedSource(source, 'contract.js', file => {
    return !!variable(parse(file), name, key);
  });
}
export function sourceFunctionHasInitializer(source: string, name: string, key: string, expression: string) {
  return withParsedSources(new Map([['contract.js', source], ['expected.js', `const expected = ${expression};`]]), files => {
    const statement = parse(files.get('expected.js'))?.statements[0];
    const expected = statement && ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.initializer : undefined;
    return matches(variable(parse(files.get('contract.js')), name, key)?.initializer, expected);
  });
}

/** Match a direct or final statement; optionally expand a known, synchronous forwarding helper. */
export function sourceFunctionHasStatement(
  source: string, name: string, statement: string, position: 'direct' | 'last' = 'direct', helpers: readonly string[] = [],
) {
  return withParsedSources(new Map([['contract.js', source], ['expected.js', statement]]), files => {
    const file = parse(files.get('contract.js')), scope = body(file, name), expected = parse(files.get('expected.js'))?.statements[0];
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
        if ((ts.isVariableDeclaration(item) || ts.isParameterDeclaration(item)) && ts.isIdentifier(item.name) && parameterNames.has(item.name.text)) shadowed = true;
        item.forEachChild(checkBindings);
      };
      checkBindings(helper.body);
      if (shadowed) return [node];
      const parameters = new Map(helper.parameters.map((parameter, index) => [(parameter.name as ts.Identifier).text, call.arguments[index]!]));
      const visit: ts.Visitor = item => ts.isIdentifier(item) && parameters.has(item.text)
        && !(ts.isPropertyAccessExpression(item.parent) && item.parent.name === item)
        && !(ts.isPropertyAssignment(item.parent) && item.parent.name === item)
        ? parameters.get(item.text)! : ts.visitEachChild(item, visit);
      const expanded = ts.visitNode(helper.body, visit, ts.isBlock);
      return [...expanded.statements];
    });
    return position === 'last' ? matches(statements.at(-1), expected) : statements.some(node => matches(node, expected));
  });
}

/** Match a direct catch-body statement and its bound error in the named function. */
export function sourceFunctionHasCatchStatement(source: string, name: string, parameter: string, statement: string) {
  return withParsedSources(new Map([['contract.js', source], ['expected.js', statement]]), files => {
    const scope = body(parse(files.get('contract.js')), name), expected = parse(files.get('expected.js'))?.statements[0];
    if (!scope || !expected) return false;
    return scope.statements.some(node => ts.isTryStatement(node)
      && node.catchClause?.variableDeclaration && ts.isIdentifier(node.catchClause.variableDeclaration.name)
      && node.catchClause.variableDeclaration.name.text === parameter
      && node.catchClause.block.statements.some(item => matches(item, expected)));
  });
}

/** Recognize imported serializers; unknown namespaces conservatively match every family. */
export function sourceCallsNamespacedActionAttributes(source: string, namespace: string) {
  return withParsedSource(source, 'contract.js', parsed => {
    const file = parse(parsed);
    if (!file) return false;
    const names = new Set(file.statements.flatMap(node => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)
        || node.moduleSpecifier.text !== './action-attributes.js' || node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return [];
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
      node.forEachChild(visit);
    };
    visit(file);
    return found;
  });
}

/** Match a synchronous listener's bound callback statement inside its owning function. */
export function sourceFunctionHasEventListenerStatement(
  source: string, name: string, receiver: string, event: string, parameter: string, statement: string,
) {
  return withParsedSources(new Map([['contract.js', source], ['expected.js', statement]]), files => {
    const scope = body(parse(files.get('contract.js')), name), expected = parse(files.get('expected.js'))?.statements[0];
    if (!scope || !expected) return false;
    let found = false;
    const visit = (node: ts.Node) => {
      if (isFunctionLike(node)) return;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === receiver
        && node.expression.name.text === 'addEventListener') {
        const [type, callback] = node.arguments;
        if (type && ts.isStringLiteral(type) && type.text === event && callback
          && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)
          && !callback.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)
          && callback.parameters.length === 1 && callback.parameters[0]
          && ts.isIdentifier(callback.parameters[0].name) && callback.parameters[0].name.text === parameter
          && !callback.parameters[0].initializer && !callback.parameters[0].dotDotDotToken
          && callback.body.statements.some(item => matches(item, expected))) found = true;
      }
      node.forEachChild(visit);
    };
    visit(scope);
    return found;
  });
}
