const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const t = require('@babel/types');

function parseJavaScript(source, filePath = '') {
  try {
    const ast = parser.parse(source, {
      sourceType: 'module',
      loc: true,
      range: true,
      tokens: true,
      comment: true,
      sourceFilename: filePath,
      plugins: [
        'jsx',
        'asyncGenerators',
        'bigInt',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'functionBind',
        'functionSent',
        'importMeta',
        'logicalAssignment',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'partialApplication',
        'throwExpressions',
        'topLevelAwait'
      ]
    });
    
    return ast;
  } catch (error) {
    console.warn(`⚠️  JavaScript 解析失败 ${filePath}:`, error.message);
    return null;
  }
}

function parseTypeScript(source, filePath = '') {
  try {
    const ast = parser.parse(source, {
      sourceType: 'module',
      loc: true,
      range: true,
      tokens: true,
      comment: true,
      sourceFilename: filePath,
      plugins: [
        'jsx',
        'typescript',
        'asyncGenerators',
        'bigInt',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'decorators-legacy',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'functionBind',
        'importMeta',
        'logicalAssignment',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'throwExpressions',
        'topLevelAwait'
      ]
    });
    
    return ast;
  } catch (error) {
    console.warn(`⚠️  TypeScript 解析失败 ${filePath}:`, error.message);
    return null;
  }
}

function traverseAst(ast, visitors) {
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    
    node.parent = parent;
    
    if (node.type && visitors[node.type]) {
      const visitor = visitors[node.type];
      if (typeof visitor === 'function') {
        visitor(node, parent);
      } else if (typeof visitor === 'object' && typeof visitor.enter === 'function') {
        visitor.enter(node, parent);
      }
    }
    
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'parent' || key === 'source' || key === 'tokens' || key === 'lines' || key === 'comments') continue;
      
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(child => walk(child, node));
      } else if (value && typeof value === 'object') {
        walk(value, node);
      }
    }
    
    if (node.type && visitors[node.type]) {
      const visitor = visitors[node.type];
      if (typeof visitor === 'object' && typeof visitor.exit === 'function') {
        visitor.exit(node, parent);
      }
    }
  }
  
  walk(ast, null);
}

function generateCode(ast, source = '') {
  const result = generate(ast, {
    sourceMaps: false,
    retainLines: true,
    compact: false
  }, source);
  return result.code;
}

module.exports = {
  parseJavaScript,
  parseTypeScript,
  traverseAst,
  generateCode,
  types: t
};
