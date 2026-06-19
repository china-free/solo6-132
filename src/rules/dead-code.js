module.exports = {
  meta: {
    name: 'dead-code',
    description: '检测未使用的死代码块',
    category: 'maintainability',
    severity: 'warning',
    fixable: true,
    supportedLanguages: ['javascript', 'typescript', 'python', 'go']
  },

  create(context) {
    const language = context.language;
    const { nodeRange } = require('./fix-kit');
    const declaredVariables = new Map();
    const usedVariables = new Set();
    const declaredFunctions = new Map();
    const usedFunctions = new Set();

    function addDeclaredVariable(node, name) {
      if (!declaredVariables.has(name)) declaredVariables.set(name, []);
      declaredVariables.get(name).push(node);
    }

    function addUsedVariable(name) {
      usedVariables.add(name);
    }

    function addDeclaredFunction(node, name) {
      if (!declaredFunctions.has(name)) declaredFunctions.set(name, []);
      declaredFunctions.get(name).push(node);
    }

    function addUsedFunction(name) {
      usedFunctions.add(name);
    }

    function buildRemoveFix(node, source) {
      const range = nodeRange(node);
      if (!range) return null;
      let start = range[0];
      let end = range[1];
      while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--;
      while (end < source.length && source[end] !== '\n') end++;
      if (end < source.length) end++;
      return (fixer) => fixer.replaceTextRange(start, end, '');
    }

    function reportDead(ctx, kind, name, node) {
      const fix = buildRemoveFix(node, ctx.getSource());
      ctx.report({
        rule: 'dead-code',
        message: `${kind === 'variable' ? '变量' : '函数'} "${name}" 已声明但未使用`,
        line: node.loc.start.line,
        endLine: node.loc.end ? node.loc.end.line : node.loc.start.line,
        column: node.loc.start.column,
        severity: 'warning',
        fixable: !!fix,
        fix: fix || undefined,
        details: {
          kind,
          name,
          suggestion: '考虑删除未使用的声明或检查是否有拼写错误'
        }
      });
    }

    function checkUnusedAtEnd(ctx) {
      for (const [name, nodes] of declaredVariables) {
        if (!usedVariables.has(name)) {
          nodes.forEach(node => reportDead(ctx, 'variable', name, node));
        }
      }

      for (const [name, nodes] of declaredFunctions) {
        if (!usedFunctions.has(name) && !usedVariables.has(name)) {
          nodes.forEach(node => reportDead(ctx, 'function', name, node));
        }
      }
    }

    const visitors = {};

    if (language === 'javascript' || language === 'typescript') {
      visitors.VariableDeclarator = (node) => {
        if (node.id && node.id.name) addDeclaredVariable(node, node.id.name);
      };

      visitors.Identifier = (node, parent) => {
        if (parent && (
          parent.type === 'MemberExpression' && parent.property === node && !parent.computed ||
          parent.type === 'VariableDeclarator' && parent.id === node ||
          parent.type === 'FunctionDeclaration' && parent.id === node ||
          parent.type === 'ClassDeclaration' && parent.id === node ||
          (parent.type === 'Property' || parent.type === 'ObjectProperty') && parent.key === node && !parent.computed && !parent.shorthand
        )) {
          return;
        }
        if (node.name) addUsedVariable(node.name);
      };

      visitors.FunctionDeclaration = (node) => {
        if (node.id && node.id.name) addDeclaredFunction(node, node.id.name);
      };

      visitors.CallExpression = (node) => {
        if (node.callee && node.callee.name) {
          addUsedFunction(node.callee.name);
          addUsedVariable(node.callee.name);
        } else if (node.callee && node.callee.type === 'MemberExpression' && node.callee.property && node.callee.property.name) {
          addUsedFunction(node.callee.property.name);
        }
      };
    } else if (language === 'python' || language === 'go') {
      visitors.VariableDeclaration = (node) => {
        if (node.declarations) {
          node.declarations.forEach(decl => {
            if (decl.id && decl.id.name) addDeclaredVariable(decl, decl.id.name);
          });
        }
      };

      visitors.Identifier = (node, parent) => {
        if (parent && (
          parent.type === 'VariableDeclarator' && parent.id === node ||
          parent.type === 'FunctionDeclaration' && parent.id === node ||
          (parent.type === 'Property' || parent.type === 'ObjectProperty') && parent.key === node && !parent.computed && !parent.shorthand
        )) {
          return;
        }
        if (node.name) addUsedVariable(node.name);
      };

      visitors.FunctionDeclaration = (node) => {
        if (node.id && node.id.name) addDeclaredFunction(node, node.id.name);
      };

      visitors.CallExpression = (node) => {
        if (node.callee && node.callee.name) {
          addUsedFunction(node.callee.name);
          addUsedVariable(node.callee.name);
        } else if (node.callee && node.callee.type === 'MemberExpression' && node.callee.property && node.callee.property.name) {
          addUsedFunction(node.callee.property.name);
        }
      };
    }

    return { visitors, finalize: checkUnusedAtEnd };
  }
};
