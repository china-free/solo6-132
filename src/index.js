const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { parseFile } = require('./parsers');
const { runRules } = require('./rules');
const { applyFixes } = require('./fixer');

const SUPPORTED_EXTENSIONS = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.go': 'go'
};

async function analyzeProject(targetPath, config = {}) {
  const files = await collectFiles(targetPath, config.ignorePatterns || []);
  const allIssues = [];
  const fileStats = {
    total: files.length,
    byLanguage: {}
  };

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const language = SUPPORTED_EXTENSIONS[ext];
    
    if (!language) continue;

    fileStats.byLanguage[language] = (fileStats.byLanguage[language] || 0) + 1;

    try {
      const source = fs.readFileSync(file, 'utf-8');
      const ast = parseFile(source, language, file);
      
      if (ast) {
        const issues = runRules(ast, source, language, file, config);
        allIssues.push(...issues);
      }
    } catch (error) {
      console.warn(`⚠️  解析文件失败 ${file}:`, error.message);
    }
  }

  return {
    issues: allIssues,
    fileStats,
    scannedPath: targetPath,
    fixedCount: 0
  };
}

async function fixProject(targetPath, config = {}) {
  const result = await analyzeProject(targetPath, config);
  const fixes = applyFixes(result.issues, config);

  let totalIssuesFixed = 0;
  for (const fix of fixes) {
    try {
      fs.writeFileSync(fix.file, fix.newContent, 'utf-8');
      totalIssuesFixed += fix.issuesFixed || 0;
    } catch (error) {
      console.warn(`⚠️  写入文件失败 ${fix.file}:`, error.message);
    }
  }

  result.fixedCount = totalIssuesFixed;
  result.fixedFiles = fixes.length;
  return result;
}

async function collectFiles(targetPath, ignorePatterns = []) {
  const stats = fs.statSync(targetPath);
  
  if (stats.isFile()) {
    const ext = path.extname(targetPath).toLowerCase();
    return SUPPORTED_EXTENSIONS[ext] ? [targetPath] : [];
  }

  const patterns = Object.keys(SUPPORTED_EXTENSIONS).map(ext => `**/*${ext}`);
  const defaultIgnore = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/venv/**',
    '**/__pycache__/**',
    '**/vendor/**'
  ];

  const allIgnore = [...defaultIgnore, ...ignorePatterns];

  const files = await glob(patterns, {
    cwd: targetPath,
    absolute: true,
    ignore: allIgnore,
    nodir: true
  });

  return files;
}

module.exports = {
  analyzeProject,
  fixProject,
  collectFiles
};
