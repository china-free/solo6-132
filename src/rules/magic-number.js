const {
  getConstantInsertPosition,
  buildConstantDeclarations,
  nodeRange
} = require('./fix-kit');

module.exports = {
  meta: {
    name: 'magic-number',
    description: '检测硬编码的魔法数字',
    category: 'maintainability',
    severity: 'warning',
    fixable: true,
    supportedLanguages: ['javascript', 'typescript', 'python', 'go']
  },

  create(context) {
    const language = context.language;
    const source = context.getSource();

    const allowedNumbers = new Set([
      0, 1, 2, -1, -2,
      0.0, 0.5, 1.0, 1.5, 2.0,
      10, 100, 1000,
      0o0, 0o1, 0o7, 0o10,
      0x0, 0x1, 0xf, 0xff, 0xfff, 0xffff,
      0b0, 0b1, 0b10, 0b111
    ]);

    const numberNames = {
      3: 'THREE',
      4: 'FOUR',
      5: 'FIVE',
      6: 'SIX',
      7: 'SEVEN',
      8: 'EIGHT',
      9: 'NINE',
      10: 'TEN',
      12: 'TWELVE',
      24: 'HOURS_IN_DAY',
      30: 'THIRTY',
      60: 'SECONDS_IN_MINUTE',
      100: 'PERCENT',
      365: 'DAYS_IN_YEAR',
      1000: 'THOUSAND',
      1024: 'KB',
      1048576: 'MB'
    };

    const usedConstantNames = new Set();
    const constantsToDeclare = new Map();
    let magicCount = 0;

    function isAllowedNumber(value) {
      if (allowedNumbers.has(value)) return true;
      if (value === Math.PI || value === Math.E) return true;
      if (typeof value === 'number' && !isFinite(value)) return true;
      return false;
    }

    function isInAllowedContext(node, parent) {
      if (!parent) return false;

      if (parent.type === 'VariableDeclarator' && parent.init === node) {
        if (parent.id && parent.id.type === 'Identifier') {
          const name = parent.id.name.toUpperCase();
          if (name.includes('CONST') || name.includes('MAGIC') || name.includes('NUMBER')) {
            return true;
          }
        }
      }

      if (parent.type === 'Property' && parent.key === node) return true;
      if (parent.type === 'ObjectProperty' && parent.key === node) return true;
      if (parent.type === 'MemberExpression' && parent.property === node && parent.computed) return true;

      if (parent.type === 'CallExpression' && parent.arguments.includes(node)) {
        if (parent.callee && parent.callee.name) {
          const name = parent.callee.name.toLowerCase();
          if (name.includes('assert') || name.includes('test') || name.includes('debug')) {
            return true;
          }
        }
      }

      return false;
    }

    function isUnaryNegative(node, parent) {
      if (parent && parent.type === 'UnaryExpression' && parent.operator === '-') {
        return true;
      }
      return false;
    }

    function getConstantName(value) {
      if (numberNames[value]) {
        return numberNames[value];
      }
      const absValue = Math.abs(value);
      const suffix = value < 0 ? '_NEGATIVE' : '';

      if (Number.isInteger(absValue)) {
        return `MAGIC_${absValue}${suffix}`;
      } else {
        const strValue = absValue.toString().replace('.', '_');
        return `MAGIC_${strValue}${suffix}`;
      }
    }

    function allocateConstantName(value, raw) {
      if (constantsToDeclare.has(raw)) {
        return constantsToDeclare.get(raw).name;
      }
      let baseName = getConstantName(value);
      let name = baseName;
      let counter = 1;
      while (usedConstantNames.has(name)) {
        name = `${baseName}_${counter}`;
        counter++;
      }
      usedConstantNames.add(name);
      constantsToDeclare.set(raw, { name, value, raw });
      return name;
    }

    function checkNumericLiteral(node, parent) {
      if (!node.loc) return;
      const range = nodeRange(node);
      if (!range) return;

      let value = node.value;
      const raw = node.raw || (node.extra && node.extra.raw) || source.slice(range[0], range[1]);

      if (isAllowedNumber(value)) return;
      if (isInAllowedContext(node, parent)) return;

      magicCount++;
      const constantName = allocateConstantName(value, raw);

      context.report({
        rule: 'magic-number',
        message: `发现魔法数字: ${raw}`,
        line: node.loc.start.line,
        endLine: node.loc.end ? node.loc.end.line : node.loc.start.line,
        column: node.loc.start.column,
        endColumn: node.loc.end ? node.loc.end.column : node.loc.start.column + raw.length,
        severity: 'warning',
        fixable: true,
        value: value,
        raw: raw,
        fix: (fixer) => fixer.replaceTextRange(range[0], range[1], constantName),
        details: {
          value,
          raw,
          suggestedConstantName: constantName,
          suggestion: `考虑将 ${raw} 提取为命名常量，例如: const ${constantName} = ${raw};`,
          range: range
        }
      });
    }

    const visitors = {};

    if (language === 'javascript' || language === 'typescript') {
      visitors.NumericLiteral = (node, parent) => {
        checkNumericLiteral(node, parent);
      };
    } else if (language === 'python' || language === 'go') {
      visitors.NumericLiteral = (node, parent) => {
        checkNumericLiteral(node, parent);
      };
    }

    function finalize(ctx) {
      if (constantsToDeclare.size === 0) return;

      const insertPos = getConstantInsertPosition(source, language);
      const constants = Array.from(constantsToDeclare.values()).map(c => ({ name: c.name, value: c.raw }));
      const declaration = buildConstantDeclarations(constants, language);

      const insertLine = source.slice(0, insertPos).split('\n').length;

      ctx.report({
        rule: 'magic-number',
        message: `发现 ${constants.length} 个魔法数字，已自动提取为命名常量`,
        line: insertLine,
        endLine: insertLine,
        column: 0,
        severity: 'info',
        fixable: true,
        fix: (fixer) => fixer.insertAt(insertPos, declaration),
        details: {
          kind: 'constant-declaration',
          constants: constants.map(c => c.name),
          count: magicCount
        }
      });
    }

    return { visitors, finalize };
  }
};
