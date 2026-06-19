const { traverseAst: traverseJS } = require('../parsers/javascript');
const { traverseAst: traversePy } = require('../parsers/python');
const { traverseAst: traverseGo } = require('../parsers/go');
const { createFixer } = require('./fix-kit');

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

const REQUIRED_ISSUE_FIELDS = ['rule', 'message', 'line'];

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
    const engine = this;
    const fixer = createFixer();

    const context = {
      source,
      language,
      filePath,
      config: { ...this.config, ...config },
      report(issue) {
        const validated = engine.validateIssue(issue, language, filePath);
        if (validated.fix && typeof validated.fix === 'function') {
          validated.fixable = true;
        }
        issues.push(validated);
      },
      getSource() { return source; },
      nodeRange(node) {
        if (Array.isArray(node.range) && node.range.length === 2) return node.range;
        if (node.start != null && node.end != null) return [node.start, node.end];
        return null;
      },
      getSourceSnippet: (line, endLine) => engine.getSourceSnippet(source, line, endLine),
      createFixer: () => createFixer()
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
        const created = rule.create(context);
        const visitors = created && created.visitors ? created.visitors : created;
        const finalize = created && typeof created.finalize === 'function' ? created.finalize : null;

        if (traverse && visitors) {
          try {
            traverse(astToTraverse, visitors);
          } catch (e) {
            console.warn(`⚠️  遍历 AST 时出错: ${e.message}`);
          }
        }
        if (finalize) {
          try {
            finalize(context);
          } catch (e) {
            console.warn(`⚠️  规则 finalize 出错 (${rule.meta.name}): ${e.message}`);
          }
        }
      } else if (typeof rule === 'function') {
        const result = rule(ast, source, language, context);
        if (Array.isArray(result)) {
          issues.push(...result.map(i => this.validateIssue(i, language, filePath)));
        }
      }
    });

    issues.forEach(issue => {
      if (!issue.source) {
        issue.source = this.getSourceSnippet(source, issue.line, issue.endLine || issue.line);
      }
    });

    return issues;
  }

  validateIssue(issue, language, filePath) {
    if (!issue || typeof issue !== 'object') {
      throw new Error('context.report 需要一个 issue 对象');
    }
    for (const field of REQUIRED_ISSUE_FIELDS) {
      if (issue[field] === undefined || issue[field] === null) {
        throw new Error(`issue 缺少必填字段: ${field}`);
      }
    }
    return {
      ...issue,
      filePath,
      language,
      fixable: issue.fixable === undefined ? (typeof issue.fix === 'function') : issue.fixable
    };
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
