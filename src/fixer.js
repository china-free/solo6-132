const fs = require('fs');
const path = require('path');
const {
  createFixer,
  applyFixesToSource,
  validateOp,
  describeOp
} = require('./rules/fix-kit');

function getLanguageFromExtension(ext) {
  const map = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.go': 'go'
  };
  return map[ext.toLowerCase()] || 'javascript';
}

function collectFixOps(issue, fixer) {
  if (typeof issue.fix !== 'function') return [];
  let ops;
  try {
    ops = issue.fix(fixer);
  } catch (e) {
    console.warn(`⚠️  规则 ${issue.rule} 的 fix 回调抛出异常: ${e.message}`);
    return [];
  }
  if (!ops) return [];
  return Array.isArray(ops) ? ops : [ops];
}

function applyFixes(issues, config = {}) {
  const fixableIssues = issues.filter(issue => issue.fixable && typeof issue.fix === 'function');

  const fixesByFile = {};
  fixableIssues.forEach(issue => {
    if (!fixesByFile[issue.filePath]) fixesByFile[issue.filePath] = [];
    fixesByFile[issue.filePath].push(issue);
  });

  const results = [];

  Object.entries(fixesByFile).forEach(([filePath, fileIssues]) => {
    const result = applyFixesToFile(filePath, fileIssues);
    if (result) results.push(result);
  });

  return results;
}

function applyFixesToFile(filePath, issues) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    console.warn(`⚠️  无法读取文件 ${filePath}: ${e.message}`);
    return null;
  }

  const ext = path.extname(filePath);
  const language = getLanguageFromExtension(ext);
  const fixer = createFixer();

  const allOps = [];
  const opDescriptions = [];
  let appliedIssueCount = 0;

  issues.forEach(issue => {
    const ops = collectFixOps(issue, fixer);
    if (ops.length === 0) return;

    try {
      ops.forEach(op => {
        validateOp(op);
        allOps.push(op);
      });
      opDescriptions.push({
        rule: issue.rule,
        message: issue.message,
        line: issue.line,
        ops: ops.map(describeOp)
      });
      appliedIssueCount++;
    } catch (e) {
      console.warn(`⚠️  跳过非法修复指令 (${issue.rule} @ ${filePath}:${issue.line}): ${e.message}`);
    }
  });

  if (allOps.length === 0) return null;

  let newContent;
  try {
    newContent = applyFixesToSource(source, allOps);
  } catch (e) {
    console.warn(`⚠️  应用修复指令失败 (${filePath}): ${e.message}`);
    return null;
  }

  if (newContent === source) return null;

  return {
    file: filePath,
    language,
    oldContent: source,
    newContent,
    issues,
    fixOperations: opDescriptions,
    opsCount: allOps.length,
    issuesFixed: appliedIssueCount
  };
}

module.exports = {
  applyFixes,
  applyFixesToFile,
  collectFixOps
};
