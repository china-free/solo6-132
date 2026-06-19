const { parseJavaScript, parseTypeScript } = require('./javascript');
const { parsePython } = require('./python');
const { parseGo } = require('./go');

function parseFile(source, language, filePath = '') {
  let ast = null;
  switch (language) {
    case 'javascript':
      ast = parseJavaScript(source, filePath);
      break;
    case 'typescript':
      ast = parseTypeScript(source, filePath);
      break;
    case 'python':
      ast = parsePython(source, filePath);
      break;
    case 'go':
      ast = parseGo(source, filePath);
      break;
    default:
      throw new Error(`不支持的语言: ${language}`);
  }
  
  if (ast) {
    ast.language = language;
    ast.source = source;
  }
  
  return ast;
}

function getVisitorKeys(ast, language) {
  const keys = new Set();
  
  function traverse(node, path = []) {
    if (!node || typeof node !== 'object') return;
    
    if (node.type) {
      keys.add(node.type);
    }
    
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'parent' || key === 'source') continue;
      
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach((child, i) => {
          if (child && typeof child === 'object') {
            traverse(child, [...path, key, i]);
          }
        });
      } else if (value && typeof value === 'object') {
        traverse(value, [...path, key]);
      }
    }
  }
  
  traverse(ast);
  return Array.from(keys);
}

module.exports = {
  parseFile,
  getVisitorKeys
};
