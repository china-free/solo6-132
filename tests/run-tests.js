const fs = require('fs');
const path = require('path');
const { analyzeProject, fixProject } = require('../src/index');
const { parseFile } = require('../src/parsers');
const { runRules } = require('../src/rules');

const chalk = require('chalk');

const TEST_DIR = path.join(__dirname, 'samples');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(chalk.green(`  ✅ ${name}`));
    passed++;
  } catch (error) {
    console.log(chalk.red(`  ❌ ${name}`));
    console.log(chalk.red(`     Error: ${error.message}`));
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runAllTests() {
  console.log(chalk.bold.cyan('\n' + '='.repeat(60)));
  console.log(chalk.bold.cyan('  代码坏味道检测工具 - 测试套件'));
  console.log(chalk.bold.cyan('='.repeat(60)));

  console.log(chalk.bold('\n📝 解析器测试'));
  console.log(chalk.gray('-'.repeat(60)));

  test('JavaScript 解析器能正常工作', () => {
    const source = `function add(a, b) { return a + b; }`;
    const ast = parseFile(source, 'javascript', 'test.js');
    assert(ast !== null, 'AST 不应为 null');
    assert(ast.type === 'File' || ast.type === 'Program', '根节点应为 File 或 Program');
    assert(ast.language === 'javascript', '语言标记正确');
  });

  test('TypeScript 解析器能正常工作', () => {
    const source = `function add(a: number, b: number): number { return a + b; }`;
    const ast = parseFile(source, 'typescript', 'test.ts');
    assert(ast !== null, 'AST 不应为 null');
    assert(ast.type === 'File' || ast.type === 'Program', '根节点应为 File 或 Program');
  });

  test('Python 解析器能正常工作', () => {
    const source = `def add(a, b):\n    return a + b`;
    const ast = parseFile(source, 'python', 'test.py');
    assert(ast !== null, 'AST 不应为 null');
    assert(ast.type === 'Program', '根节点应为 Program');
  });

  test('Go 解析器能正常工作', () => {
    const source = `package main\n\nfunc add(a, b int) int { return a + b }`;
    const ast = parseFile(source, 'go', 'test.go');
    assert(ast !== null, 'AST 不应为 null');
    assert(ast.type === 'Program', '根节点应为 Program');
  });

  console.log(chalk.bold('\n📝 规则检测测试'));
  console.log(chalk.gray('-'.repeat(60)));

  test('long-function 规则能检测过长函数', () => {
    let longFunction = 'function veryLongFunction() {\n';
    for (let i = 0; i < 60; i++) {
      longFunction += `  console.log(${i});\n`;
    }
    longFunction += '}';
    
    const ast = parseFile(longFunction, 'javascript', 'test.js');
    const issues = runRules(ast, longFunction, 'javascript', 'test.js', { maxLines: 50 });
    
    const longFunctionIssues = issues.filter(i => i.rule === 'long-function');
    assert(longFunctionIssues.length > 0, '应检测到过长函数');
    assert(longFunctionIssues[0].details.lineCount > 50, '行数统计正确');
  });

  test('deep-nesting 规则能检测深层嵌套', () => {
    const nestedCode = `
function nested() {
  if (true) {
    if (true) {
      if (true) {
        if (true) {
          if (true) {
            if (true) {
              console.log('deep');
            }
          }
        }
      }
    }
  }
}`;
    
    const ast = parseFile(nestedCode, 'javascript', 'test.js');
    const issues = runRules(ast, nestedCode, 'javascript', 'test.js', { maxNesting: 5 });
    
    const nestingIssues = issues.filter(i => i.rule === 'deep-nesting');
    assert(nestingIssues.length > 0, '应检测到深层嵌套');
    assert(nestingIssues[0].details.nestingLevel > 5, '嵌套层级统计正确');
  });

  test('magic-number 规则能检测魔法数字', () => {
    const code = `
function calc() {
  const price = 100 * 0.85;
  const tax = price * 0.13;
  return price + tax + 15;
}`;
    
    const ast = parseFile(code, 'javascript', 'test.js');
    const issues = runRules(ast, code, 'javascript', 'test.js', {});
    
    const magicIssues = issues.filter(i => i.rule === 'magic-number');
    assert(magicIssues.length > 0, '应检测到魔法数字');
    assert(magicIssues[0].fixable === true, '魔法数字应可修复');
    assert(magicIssues[0].details.suggestedConstantName, '应提供建议的常量名');
  });

  test('magic-number 规则忽略允许的数字', () => {
    const code = `
function calc() {
  const x = 0;
  const y = 1;
  const z = 2;
  return x + y + z;
}`;
    
    const ast = parseFile(code, 'javascript', 'test.js');
    const issues = runRules(ast, code, 'javascript', 'test.js', {});
    
    const magicIssues = issues.filter(i => i.rule === 'magic-number');
    assert(magicIssues.length === 0, '0, 1, 2 等常用数字不应被检测为魔法数字');
  });

  test('dead-code 规则能检测未使用变量', () => {
    const code = `
const used = 1;
const unused = 42;
function usedFunc() { return used; }
function unusedFunc() { return 0; }
console.log(usedFunc());
`;
    
    const ast = parseFile(code, 'javascript', 'test.js');
    const issues = runRules(ast, code, 'javascript', 'test.js', {});
    
    const deadIssues = issues.filter(i => i.rule === 'dead-code');
    assert(deadIssues.length >= 2, '应检测到未使用的变量和函数');
  });

  console.log(chalk.bold('\n📝 集成测试 - 扫描测试样本'));
  console.log(chalk.gray('-'.repeat(60)));

  try {
    const result = await analyzeProject(TEST_DIR, {
      maxLines: 50,
      maxNesting: 5
    });
    
    test('能扫描多个文件', () => {
      assert(result.fileStats.total > 0, `应扫描到文件，实际: ${result.fileStats.total}`);
      assert(result.fileStats.byLanguage.javascript > 0, '应包含 JavaScript 文件');
      assert(result.fileStats.byLanguage.python > 0, '应包含 Python 文件');
      assert(result.fileStats.byLanguage.go > 0, '应包含 Go 文件');
    });

    test('能检测到问题', () => {
      assert(result.issues.length > 0, `应检测到问题，实际: ${result.issues.length}`);
    });

    test('问题包含正确的文件路径', () => {
      const jsIssues = result.issues.filter(i => i.filePath.includes('.js'));
      assert(jsIssues.length > 0, 'JavaScript 文件应有问题');
      
      jsIssues.forEach(issue => {
        assert(issue.source && issue.source.lines, '问题应包含代码片段');
        assert(issue.line > 0, '问题应有行号');
        assert(issue.rule, '问题应有规则名');
      });
    });

    test('问题包含正确的语言标识', () => {
      const languages = new Set(result.issues.map(i => i.language));
      assert(languages.has('javascript'), '应包含 JavaScript 问题');
      assert(languages.has('python'), '应包含 Python 问题');
      assert(languages.has('go'), '应包含 Go 问题');
    });

    test('问题按规则分类', () => {
      const ruleTypes = new Set(result.issues.map(i => i.rule));
      assert(ruleTypes.has('long-function'), '应包含 long-function 规则');
      assert(ruleTypes.has('deep-nesting'), '应包含 deep-nesting 规则');
      assert(ruleTypes.has('magic-number'), '应包含 magic-number 规则');
    });

    test('可修复问题有正确标记', () => {
      const fixableIssues = result.issues.filter(i => i.fixable);
      assert(fixableIssues.length > 0, '应有可修复的问题');
      fixableIssues.forEach(issue => {
        assert(issue.rule === 'magic-number', '只有 magic-number 问题可修复');
      });
    });

  } catch (error) {
    console.log(chalk.red(`  ❌ 集成测试失败: ${error.message}`));
    failed++;
  }

  console.log(chalk.bold('\n📝 自动修复测试'));
  console.log(chalk.gray('-'.repeat(60)));

  test('自动修复能提取魔法数字为常量', async () => {
    const testFile = path.join(TEST_DIR, 'fix-test.js');
    const testCode = `function calc() {
  const price = 100 * 0.85;
  const tax = price * 0.13;
  return price + tax + 15;
}

module.exports = { calc };
`;
    
    fs.writeFileSync(testFile, testCode, 'utf-8');
    
    try {
      const result = await analyzeProject(testFile, {});
      const magicIssues = result.issues.filter(i => i.rule === 'magic-number');
      
      const fixableCount = result.issues.filter(i => i.fixable).length;
      assert(fixableCount > 0, '应有可修复的魔法数字');
      
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  });

  console.log(chalk.bold('\n📊 测试结果'));
  console.log(chalk.gray('='.repeat(60)));
  console.log(chalk.green(`  通过: ${passed}`));
  console.log(chalk.red(`  失败: ${failed}`));
  console.log(chalk.cyan(`  总计: ${passed + failed}`));
  
  if (failed > 0) {
    console.log(chalk.red.bold('\n❌ 部分测试失败，请检查代码。'));
    process.exit(1);
  } else {
    console.log(chalk.green.bold('\n🎉 所有测试通过！'));
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error(chalk.red('测试运行出错:'), error);
  process.exit(1);
});
