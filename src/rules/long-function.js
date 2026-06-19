module.exports = {
  meta: {
    name: 'long-function',
    description: '检测过长的函数',
    category: 'maintainability',
    severity: 'warning',
    fixable: false,
    supportedLanguages: ['javascript', 'typescript', 'python', 'go'],
    schema: [
      {
        type: 'integer',
        name: 'maxLines',
        default: 50,
        description: '函数最大行数阈值'
      }
    ]
  },

  create(context) {
    const maxLines = context.config.maxLines || 50;
    const language = context.language;

    function countLines(node) {
      if (!node.loc) return 0;
      return node.loc.end.line - node.loc.start.line + 1;
    }

    function checkFunction(node) {
      const lineCount = countLines(node);
      
      if (lineCount > maxLines) {
        const functionName = node.id ? node.id.name : 'anonymous';
        context.report({
          rule: 'long-function',
          message: `函数 "${functionName}" 有 ${lineCount} 行，超过了最大允许的 ${maxLines} 行`,
          line: node.loc.start.line,
          endLine: node.loc.end.line,
          column: node.loc.start.column,
          severity: 'warning',
          fixable: false,
          details: {
            functionName,
            lineCount,
            maxLines,
            suggestion: '考虑将函数拆分成更小的、职责单一的函数'
          }
        });
      }
    }

    const visitors = {};

    if (language === 'javascript' || language === 'typescript') {
      visitors.FunctionDeclaration = checkFunction;
      visitors.FunctionExpression = checkFunction;
      visitors.ArrowFunctionExpression = checkFunction;
      visitors.ClassMethod = (node) => {
        if (node.body && node.body.type === 'BlockStatement') {
          checkFunction(node.body);
        }
      };
      visitors.ClassProperty = () => {};
      visitors.ClassPrivateMethod = () => {};
    } else if (language === 'python' || language === 'go') {
      visitors.FunctionDeclaration = checkFunction;
    }

    return visitors;
  }
};
