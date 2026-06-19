module.exports = {
  meta: {
    name: 'deep-nesting',
    description: '检测过深的嵌套语句',
    category: 'complexity',
    severity: 'warning',
    fixable: false,
    supportedLanguages: ['javascript', 'typescript', 'python', 'go'],
    schema: [
      {
        type: 'integer',
        name: 'maxNesting',
        default: 5,
        description: '最大嵌套层级阈值'
      }
    ]
  },

  create(context) {
    const maxNesting = context.config.maxNesting || 5;
    const language = context.language;
    let nestingLevel = 0;
    const reportedNodes = new Set();

    const nestingTypes = [
      'IfStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'SwitchStatement',
      'TryStatement',
      'CatchClause',
      'BlockStatement'
    ];

    function isNestingType(node) {
      return nestingTypes.includes(node.type);
    }

    function enterNesting(node) {
      if (isNestingType(node)) {
        nestingLevel++;
        
        if (nestingLevel > maxNesting && !reportedNodes.has(node)) {
          reportedNodes.add(node);
          
          const nestingDesc = getNestingDescription(node);
          context.report({
            rule: 'deep-nesting',
            message: `嵌套层级过深 (${nestingLevel} 层，最大允许 ${maxNesting} 层)`,
            line: node.loc.start.line,
            endLine: node.loc.end.line,
            column: node.loc.start.column,
            severity: 'warning',
            fixable: false,
            details: {
              nestingLevel,
              maxNesting,
              nodeType: nestingDesc,
              suggestion: '考虑使用提前返回、卫语句或提取函数来降低嵌套层级'
            }
          });
        }
      }
    }

    function exitNesting(node) {
      if (isNestingType(node)) {
        nestingLevel--;
      }
    }

    function getNestingDescription(node) {
      const typeMap = {
        'IfStatement': 'if 语句',
        'ForStatement': 'for 循环',
        'ForInStatement': 'for...in 循环',
        'ForOfStatement': 'for...of 循环',
        'WhileStatement': 'while 循环',
        'DoWhileStatement': 'do...while 循环',
        'SwitchStatement': 'switch 语句',
        'TryStatement': 'try 语句',
        'CatchClause': 'catch 子句',
        'BlockStatement': '代码块'
      };
      return typeMap[node.type] || node.type;
    }

    const visitors = {};

    nestingTypes.forEach(type => {
      visitors[type] = {
        enter: enterNesting,
        exit: exitNesting
      };
    });

    return visitors;
  }
};
