const chalk = require('chalk');
const path = require('path');
const { describeOp, createFixer } = require('./rules/fix-kit');

const SEVERITY_COLORS = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,
  hint: chalk.gray
};

const SEVERITY_ICONS = {
  error: '❌',
  warning: '⚠️ ',
  info: 'ℹ️ ',
  hint: '💡'
};

const RULE_CATEGORIES = {
  maintainability: '可维护性',
  complexity: '复杂度',
  style: '代码风格',
  performance: '性能',
  security: '安全',
  bestPractice: '最佳实践'
};

function printReport(result, config = {}) {
  const { issues, fileStats, scannedPath } = result;
  const format = config.format || 'table';

  switch (format) {
    case 'json':
      printJsonReport(result);
      break;
    case 'compact':
      printCompactReport(result);
      break;
    case 'table':
    default:
      printTableReport(result);
      break;
  }
}

function printTableReport(result) {
  const { issues, fileStats, scannedPath } = result;
  
  console.log('\n' + chalk.bold.cyan('='.repeat(80)));
  console.log(chalk.bold.cyan('  代码坏味道检测报告'));
  console.log(chalk.bold.cyan('='.repeat(80)));
  
  console.log('\n' + chalk.bold('📁 扫描路径: ') + chalk.gray(scannedPath));
  
  if (fileStats) {
    console.log(chalk.bold('📊 文件统计:'));
    console.log(`  总文件数: ${chalk.green(fileStats.total)}`);
    Object.entries(fileStats.byLanguage).forEach(([lang, count]) => {
      console.log(`  ${getLanguageIcon(lang)} ${lang}: ${chalk.green(count)}`);
    });
  }
  
  if (issues.length === 0) {
    console.log('\n' + chalk.bold.green('🎉 太棒了！没有发现代码坏味道！\n'));
    return;
  }
  
  const groupedByFile = groupBy(issues, 'filePath');
  const groupedByRule = groupBy(issues, 'rule');
  const groupedBySeverity = groupBy(issues, 'severity');
  
  console.log('\n' + chalk.bold('📈 问题统计:'));
  console.log(`  总问题数: ${chalk.red.bold(issues.length)}`);
  ['error', 'warning', 'info', 'hint'].forEach(sev => {
    const count = groupedBySeverity[sev] ? groupedBySeverity[sev].length : 0;
    if (count > 0) {
      const color = SEVERITY_COLORS[sev];
      console.log(`  ${SEVERITY_ICONS[sev]} ${sev === 'error' ? '错误' : sev === 'warning' ? '警告' : sev === 'info' ? '信息' : '提示'}: ${color.bold(count)}`);
    }
  });
  
  console.log('\n' + chalk.bold('📋 问题详情:'));
  console.log('-'.repeat(80));
  
  Object.entries(groupedByFile).forEach(([filePath, fileIssues], fileIndex) => {
    const relativePath = path.relative(process.cwd(), filePath);
    console.log('\n' + chalk.bold.magenta(`📄 ${relativePath}`));
    console.log(chalk.gray('-'.repeat(80)));
    
    fileIssues.forEach((issue, index) => {
      printIssueDetail(issue, index + 1);
    });
  });
  
  console.log('\n' + chalk.bold('📌 按规则统计:'));
  Object.entries(groupedByRule).forEach(([ruleName, ruleIssues]) => {
    console.log(`  ${chalk.cyan(ruleName)}: ${chalk.yellow(ruleIssues.length)} 处`);
  });
  
  printSummary(issues);
}

function printIssueDetail(issue, index) {
  const severityColor = SEVERITY_COLORS[issue.severity] || chalk.gray;
  const severityIcon = SEVERITY_ICONS[issue.severity] || '•';
  
  const location = issue.endLine && issue.endLine !== issue.line
    ? `L${issue.line}-L${issue.endLine}`
    : `L${issue.line}`;
  
  console.log(`\n  ${chalk.gray(`${index}.`)} ${severityColor.bold(`${severityIcon} [${issue.rule}]`)} ${chalk.white(issue.message)}`);
  console.log(`     ${chalk.gray('位置:')} ${chalk.cyan(`${location}:${issue.column || 0}`)}`);
  console.log(`     ${chalk.gray('语言:')} ${chalk.green(getLanguageIcon(issue.language))} ${issue.language}`);
  
  if (issue.source && issue.source.lines) {
    console.log(`     ${chalk.gray('代码片段:')}`);
    issue.source.lines.forEach(lineInfo => {
      const lineNum = String(lineInfo.line).padStart(4, ' ');
      const marker = lineInfo.isProblem ? '>' : ' ';
      const prefix = lineInfo.isProblem 
        ? chalk.red(`${marker} ${lineNum} │ `)
        : chalk.gray(`  ${lineNum} │ `);
      
      const content = lineInfo.isProblem 
        ? chalk.bgRed.black(lineInfo.content)
        : chalk.gray(lineInfo.content);
      
      console.log(`       ${prefix}${content}`);
    });
  }
  
  if (issue.details && issue.details.suggestion) {
    console.log(`     ${chalk.blue('💡 建议:')} ${issue.details.suggestion}`);
  }
  
  if (issue.fixable) {
    let fixDesc = '使用 --fix 参数自动修复';
    if (typeof issue.fix === 'function') {
      try {
        const ops = issue.fix(createFixer());
        const opsArr = Array.isArray(ops) ? ops : (ops ? [ops] : []);
        if (opsArr.length > 0) {
          const opsText = opsArr.map(describeOp).join('; ');
          fixDesc = opsText;
        }
      } catch (e) {
        fixDesc = `修复指令生成失败: ${e.message}`;
      }
    }
    console.log(`     ${chalk.green('🔧 可自动修复:')} ${chalk.gray(fixDesc)}`);
  }
}

function printCompactReport(result) {
  const { issues } = result;
  
  if (issues.length === 0) {
    console.log(chalk.green('✅ 没有发现问题'));
    return;
  }
  
  issues.forEach(issue => {
    const severityColor = SEVERITY_COLORS[issue.severity] || chalk.gray;
    const relativePath = path.relative(process.cwd(), issue.filePath);
    const location = issue.endLine && issue.endLine !== issue.line
      ? `${issue.line}-${issue.endLine}`
      : issue.line;
    
    console.log(
      `${severityColor(issue.severity)} ` +
      `${chalk.gray(relativePath)}:${chalk.cyan(location)} ` +
      `${chalk.magenta(issue.rule)} ` +
      `${issue.message}`
    );
  });
  
  console.log(`\n${chalk.red.bold(issues.length)} 个问题发现`);
}

function printJsonReport(result) {
  const jsonOutput = {
    scannedPath: result.scannedPath,
    fileStats: result.fileStats,
    totalIssues: result.issues.length,
    issues: result.issues.map(issue => ({
      rule: issue.rule,
      message: issue.message,
      severity: issue.severity,
      filePath: path.relative(process.cwd(), issue.filePath),
      language: issue.language,
      line: issue.line,
      endLine: issue.endLine,
      column: issue.column,
      fixable: issue.fixable,
      hasFix: typeof issue.fix === 'function',
      details: issue.details
    }))
  };
  
  console.log(JSON.stringify(jsonOutput, null, 2));
}

function printSummary(issues) {
  console.log('\n' + chalk.bold.cyan('='.repeat(80)));
  console.log(chalk.bold('📝 总结'));
  console.log(chalk.cyan('='.repeat(80)));
  
  const byFile = groupBy(issues, 'filePath');
  const fixableCount = issues.filter(i => i.fixable && typeof i.fix === 'function').length;
  
  console.log(`\n  涉及文件: ${chalk.yellow(Object.keys(byFile).length)} 个`);
  console.log(`  可自动修复: ${chalk.green(fixableCount)} 个问题`);
  console.log(`  需要手动修复: ${chalk.red(issues.length - fixableCount)} 个问题`);
  
  console.log('\n' + chalk.gray('提示: 使用 ') + chalk.cyan('--fix') + chalk.gray(' 参数可以自动修复部分问题。'));
  console.log(chalk.gray('      使用 ') + chalk.cyan('--rules <规则名>') + chalk.gray(' 可以只运行指定的规则。'));
  console.log(chalk.gray('      使用 ') + chalk.cyan('--format json') + chalk.gray(' 可以输出 JSON 格式报告。'));
  console.log('');
}

function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const groupKey = item[key];
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(item);
    return groups;
  }, {});
}

function getLanguageIcon(language) {
  const icons = {
    javascript: '📜',
    typescript: '🔷',
    python: '🐍',
    go: '🔵'
  };
  return icons[language] || '📄';
}

module.exports = {
  printReport,
  printTableReport,
  printCompactReport,
  printJsonReport
};
