const { traverseAst: traverseJS } = require('../parsers/javascript');
const { traverseAst: traversePy } = require('../parsers/python');
const { traverseAst: traverseGo } = require('../parsers/go');

const longFunctionRule = require('./long-function');
const deepNestingRule = require('./deep-nesting');
const deadCodeRule = require('./dead-code');
const magicNumberRule = require('./magic-number');

const DEFAULT_RULES = [
  longFunctionRule,
  deepNestingRule,
  deadCodeRule,
  magicNumberRule
];

class RuleEngine {
  constructor(config = {}) {
    this.rules = [];
    this.config = config;
  }

  registerRule(rule) {
    if (typeof rule === 'function') {
      this.rules.push(rule);
    } else if (rule && rule.meta && rule.create) {
      this.rules.push(rule);
    } else {
      throw new Error('无效的规则定义');
    }
  }

  loadRules(ruleNames = null) {
    const rulesToLoad = ruleNames 
      ? DEFAULT_RULES.filter(r => ruleNames.includes(r.meta.name))
      : DEFAULT_RULES;
    
    rulesToLoad.forEach(rule => this.registerRule(rule));
  }

  run(ast, source, language, filePath, config = {}) {
    const issues = [];
    const context = {
      source,
      language,
      filePath,
      config: { ...this.config, ...config },
      report: (issue) => {
        issues.push({
          ...issue,
          filePath,
          language,
          source: this.getSourceSnippet(source, issue.line, issue.endLine || issue.line)
        });
      },
      getSourceSnippet: (line, endLine) => this.getSourceSnippet(source, line, endLine)
    };

    const traverse = this.getTraverser(language);
    
    let astToTraverse = ast;
    if ((language === 'javascript' || language === 'typescript') && ast.type === 'File' && ast.program) {
      astToTraverse = ast.program;
    }

    this.rules.forEach(rule => {
      if (rule.meta && rule.create) {
        if (rule.meta.supportedLanguages && !rule.meta.supportedLanguages.includes(language)) {
          return;
        }
        const visitors = rule.create(context);
        if (traverse && visitors) {
          try {
            traverse(astToTraverse, visitors);
          } catch (e) {
            console.warn(`⚠️  遍历 AST 时出错: ${e.message}`);
          }
        }
      } else if (typeof rule === 'function') {
        const result = rule(ast, source, language, context);
        if (Array.isArray(result)) {
          issues.push(...result);
        }
      }
    });

    return issues;
  }

  getTraverser(language) {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return traverseJS;
      case 'python':
        return traversePy;
      case 'go':
        return traverseGo;
      default:
        return null;
    }
  }

  getSourceSnippet(source, startLine, endLine = startLine, contextLines = 2) {
    const lines = source.split('\n');
    const actualStart = Math.max(1, startLine - contextLines);
    const actualEnd = Math.min(lines.length, endLine + contextLines);
    
    return {
      lines: lines.slice(actualStart - 1, actualEnd).map((content, i) => ({
        line: actualStart + i,
        content,
        isProblem: actualStart + i >= startLine && actualStart + i <= endLine
      })),
      startLine: actualStart,
      endLine: actualEnd,
      problemStart: startLine,
      problemEnd: endLine
    };
  }

}

function runRules(ast, source, language, filePath, config = {}) {
  const engine = new RuleEngine(config);
  engine.loadRules(config.rules);
  return engine.run(ast, source, language, filePath, config);
}

function registerRule(rule) {
  DEFAULT_RULES.push(rule);
}

module.exports = {
  RuleEngine,
  runRules,
  registerRule,
  DEFAULT_RULES
};
