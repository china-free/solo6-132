#!/usr/bin/env node

const { Command } = require('commander');
const path = require('path');
const { analyzeProject, fixProject } = require('../src/index');
const { printReport } = require('../src/reporter');

const program = new Command();

program
  .name('smell')
  .description('基于 AST 的多语言脏代码检测与坏味道重构 CLI 工具')
  .version('1.0.0');

program
  .argument('<path>', '要扫描的文件或目录路径')
  .option('-f, --fix', '自动修复可修复的坏味道')
  .option('-r, --rules <rules>', '指定要运行的规则，用逗号分隔', '')
  .option('--max-lines <number>', '函数最大行数阈值', '50')
  .option('--max-nesting <number>', '最大嵌套层级阈值', '5')
  .option('--ignore <patterns>', '忽略的文件模式，用逗号分隔', '')
  .option('--format <format>', '输出格式: table, json, compact', 'table')
  .action(async (targetPath, options) => {
    try {
      const absolutePath = path.resolve(targetPath);
      const config = {
        rules: options.rules ? options.rules.split(',').map(r => r.trim()) : null,
        maxLines: parseInt(options.maxLines, 10),
        maxNesting: parseInt(options.maxNesting, 10),
        ignorePatterns: options.ignore ? options.ignore.split(',').map(p => p.trim()) : [],
        format: options.format,
        fix: options.fix
      };

      if (options.fix) {
        console.log('\n🔧 正在分析并自动修复代码坏味道...\n');
        const result = await fixProject(absolutePath, config);
        printReport(result, config);
        console.log(`\n✅ 自动修复完成！共修复 ${result.fixedCount} 个问题（涉及 ${result.fixedFiles || 0} 个文件）。`);
      } else {
        console.log('\n🔍 正在扫描代码坏味道...\n');
        const result = await analyzeProject(absolutePath, config);
        printReport(result, config);
        
        if (result.issues.length > 0) {
          console.log(`\n💡 提示: 使用 --fix 参数可以自动修复部分问题（如魔法数字提取）`);
        }
      }
    } catch (error) {
      console.error('\n❌ 运行出错:', error.message);
      process.exit(1);
    }
  });

program.parse();
