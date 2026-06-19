const fs = require('fs');
const path = require('path');
const { analyzeProject, fixProject } = require('../src/index');
const { parseFile } = require('../src/parsers');
const { runRules } = require('../src/rules');
const {
  createFixer,
  applyFixesToSource,
  validateOp,
  describeOp
} = require('../src/rules/fix-kit');

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
        assert(typeof issue.fix === 'function', `可修复问题必须携带 fix 函数 (rule=${issue.rule})`);
      });
    });

  } catch (error) {
    console.log(chalk.red(`  ❌ 集成测试失败: ${error.message}`));
    failed++;
  }

  console.log(chalk.bold('\n📝 自动修复测试'));
  console.log(chalk.gray('-'.repeat(60)));

  test('FixOperation 构建器生成合法对象', () => {
    const fixer = createFixer();
    const replaceOp = fixer.replaceTextRange(5, 10, 'CONST');
    assert(replaceOp.type === 'replace', 'replaceTextRange 应产出 type=replace');
    assert(Array.isArray(replaceOp.range) && replaceOp.range.length === 2, 'replace 应带 range 数组');
    assert(replaceOp.text === 'CONST', 'replace 应带 text');

    const insertOp = fixer.insertAt(20, '\nconst X = 1;\n');
    assert(insertOp.type === 'insert', 'insertAt 应产出 type=insert');
    assert(typeof insertOp.offset === 'number', 'insert 应带 offset');
    assert(typeof insertOp.text === 'string', 'insert 应带 text');

    const fakeNode = { range: [30, 35] };
    const removeOp = fixer.remove(fakeNode);
    assert(removeOp.type === 'remove', 'remove 应产出 type=remove');
    assert(removeOp.range[0] === 30 && removeOp.range[1] === 35, 'remove 应使用 node.range');

    const afterOp = fixer.insertTextAfter(fakeNode, ' // 后置注释');
    assert(afterOp.type === 'insert' && afterOp.offset === 35, 'insertTextAfter 应使用 range[1]');

    const beforeOp = fixer.insertTextBefore(fakeNode, '// 前置注释\n');
    assert(beforeOp.type === 'insert' && beforeOp.offset === 30, 'insertTextBefore 应使用 range[0]');
  });

  test('FixOperation 校验器拒绝非法指令', () => {
    const fixer = createFixer();
    let threw = false;
    try { validateOp({ type: 'unknown' }); } catch (e) { threw = true; }
    assert(threw, '未知类型应被拒绝');

    threw = false;
    try { validateOp({ type: 'replace', range: [10, 5], text: 'x' }); } catch (e) { threw = true; }
    assert(threw, 'replace range 起始大于结束应被拒绝');

    threw = false;
    try { validateOp({ type: 'insert', offset: 'abc', text: 'x' }); } catch (e) { threw = true; }
    assert(threw, 'insert offset 非数字应被拒绝');

    threw = false;
    try { fixer.replaceTextRange('a', 5, 'x'); } catch (e) { threw = true; }
    assert(threw, 'replaceTextRange 参数类型错误应抛出');
  });

  test('applyFixesToSource 按偏移降序应用且检测重叠', () => {
    const source = '0123456789ABCDEFGHIJ';
    const fixer = createFixer();
    const ops = [
      fixer.replaceTextRange(0, 2, 'XX'),
      fixer.replaceTextRange(5, 7, 'YY')
    ];
    const result = applyFixesToSource(source, ops);
    assert(result === 'XX234YY789ABCDEFGHIJ', `降序应用后应得到预期文本，实际: ${result}`);

    const overlapOps = [
      fixer.replaceTextRange(0, 5, 'XXX'),
      fixer.replaceTextRange(3, 8, 'YYY')
    ];
    const overlapResult = applyFixesToSource(source, overlapOps);
    assert(overlapResult.includes('YYY') && !overlapResult.includes('XXX'), `默认模式应跳过重叠指令，实际: ${overlapResult}`);

    let threw = false;
    try { applyFixesToSource(source, overlapOps, { strict: true }); } catch (e) { threw = true; }
    assert(threw, '严格模式下重叠范围应抛出错误');
  });

  test('describeOp 生成可读描述', () => {
    const fixer = createFixer();
    const desc = describeOp(fixer.replaceTextRange(10, 15, 'CONST'));
    assert(desc.includes('replaceTextRange') && desc.includes('10') && desc.includes('15'), 'describeOp 应包含类型与范围');

    const insertDesc = describeOp(fixer.insertAt(0, 'const X = 1;'));
    assert(insertDesc.includes('insertAt') && insertDesc.includes('0'), 'describeOp 应描述 insert');

    const removeDesc = describeOp(fixer.remove({ range: [3, 6] }));
    assert(removeDesc.includes('remove'), 'describeOp 应描述 remove');
  });

  test('magic-number issue 的 fix 回调产出合法 FixOperation', () => {
    const code = `function calc() {\n  return 42;\n}`;
    const ast = parseFile(code, 'javascript', 'test.js');
    const issues = runRules(ast, code, 'javascript', 'test.js', {});
    const magicIssues = issues.filter(i => i.rule === 'magic-number' && i.fix);
    assert(magicIssues.length > 0, '魔法数字应携带 fix 回调');

    const fixer = createFixer();
    let hasReplace = false;
    let hasInsert = false;
    magicIssues.forEach(issue => {
      const ops = issue.fix(fixer);
      const opsArr = Array.isArray(ops) ? ops : [ops];
      opsArr.forEach(op => {
        validateOp(op);
        assert(op.type === 'replace' || op.type === 'insert', `魔法数字修复应为 replace 或 insert 类型，实际: ${op.type}`);
        if (op.type === 'replace') {
          assert(op.range[0] < op.range[1], 'range 合法');
          hasReplace = true;
        } else {
          hasInsert = true;
        }
      });
    });
    assert(hasReplace, '应至少有一个 replace 类型修复（替换魔法数字）');
    assert(hasInsert, '应至少有一个 insert 类型修复（插入常量声明）');
  });

  test('dead-code issue 的 fix 回调产出 remove 类型指令', () => {
    const code = `const unused = 42;\nconst used = unused + 1;\nconsole.log(used);\n`;
    const ast = parseFile(code, 'javascript', 'test.js');
    const issues = runRules(ast, code, 'javascript', 'test.js', {});
    const deadIssues = issues.filter(i => i.rule === 'dead-code' && i.fix);
    if (deadIssues.length > 0) {
      const fixer = createFixer();
      deadIssues.forEach(issue => {
        const ops = issue.fix(fixer);
        const opsArr = Array.isArray(ops) ? ops : [ops];
        opsArr.forEach(op => {
          validateOp(op);
          assert(op.type === 'remove' || op.type === 'replace', '死代码修复应为 remove 或 replace');
        });
      });
    }
  });

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
      
      const fixResults = await fixProject(testFile, {});
      assert(fixResults.length > 0, '应产生修复结果');

      const fixedContent = fs.readFileSync(testFile, 'utf-8');
      const hasConstantDecl = /const\s+\w+\s*=\s*100;/.test(fixedContent) || /const\s+\(/.test(fixedContent) || /\bPERCENT\b|\bMAGIC_/.test(fixedContent);
      assert(hasConstantDecl, `修复后应包含常量声明，实际内容: ${fixedContent.slice(0, 200)}`);
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
