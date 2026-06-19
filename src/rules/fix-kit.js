const OP_TYPES = new Set(['replace', 'insert', 'remove']);

function createFixer() {
  return {
    replaceTextRange(start, end, text) {
      if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') {
        throw new Error('replaceTextRange 参数非法: 需 (number, number, string)');
      }
      if (start > end) {
        throw new Error(`replaceTextRange 起始位置 ${start} 大于结束位置 ${end}`);
      }
      return { type: 'replace', range: [start, end], text };
    },

    replaceText(node, text) {
      const range = nodeRange(node);
      return { type: 'replace', range, text };
    },

    insertTextAfter(node, text) {
      const range = nodeRange(node);
      return { type: 'insert', offset: range[1], text };
    },

    insertTextBefore(node, text) {
      const range = nodeRange(node);
      return { type: 'insert', offset: range[0], text };
    },

    insertAt(offset, text) {
      if (typeof offset !== 'number' || typeof text !== 'string') {
        throw new Error('insertAt 参数非法: 需 (number, string)');
      }
      return { type: 'insert', offset, text };
    },

    remove(node) {
      const range = nodeRange(node);
      return { type: 'remove', range };
    }
  };
}

function nodeRange(node) {
  if (!node) throw new Error('节点为空，无法获取范围');
  if (Array.isArray(node.range) && node.range.length === 2) return node.range;
  if (node.start != null && node.end != null) return [node.start, node.end];
  throw new Error('节点缺少 range/start-end，无法生成修复指令');
}

function validateOp(op) {
  if (!op || !OP_TYPES.has(op.type)) {
    throw new Error(`非法的修复指令类型: ${op && op.type}`);
  }
  if (op.type === 'replace' || op.type === 'remove') {
    if (!Array.isArray(op.range) || op.range.length !== 2 ||
        typeof op.range[0] !== 'number' || typeof op.range[1] !== 'number') {
      throw new Error(`${op.type} 指令需要合法的 range: [start, end]`);
    }
    if (op.range[0] > op.range[1]) {
      throw new Error(`${op.type} 指令 range 起始大于结束: ${op.range[0]} > ${op.range[1]}`);
    }
    if (op.type === 'replace' && typeof op.text !== 'string') {
      throw new Error('replace 指令需要 string 类型的 text');
    }
  }
  if (op.type === 'insert') {
    if (typeof op.offset !== 'number' || typeof op.text !== 'string') {
      throw new Error('insert 指令需要合法的 offset(number) 与 text(string)');
    }
  }
  return true;
}

function normalizeOps(rawOps) {
  if (!rawOps) return [];
  const ops = Array.isArray(rawOps) ? rawOps : [rawOps];
  return ops.map(op => {
    validateOp(op);
    return op;
  });
}

function applyFixesToSource(source, ops, options = {}) {
  const strict = options.strict === true;
  const validOps = normalizeOps(ops).filter(op => op.type !== 'remove' || op.range[0] !== op.range[1]);

  const spans = validOps.map(op => {
    if (op.type === 'insert') return { start: op.offset, end: op.offset, text: op.text, type: 'insert' };
    if (op.type === 'replace') return { start: op.range[0], end: op.range[1], text: op.text, type: 'replace' };
    return { start: op.range[0], end: op.range[1], text: '', type: 'remove' };
  });

  spans.sort((a, b) => b.start - a.start || b.end - a.end);

  const applied = [];
  let minStart = Infinity;
  for (const span of spans) {
    if (span.end > minStart) {
      if (strict) {
        throw new Error(`修复指令范围重叠: [${span.start},${span.end}] 与已应用区间 (minStart=${minStart})`);
      }
      continue;
    }
    applied.push(span);
    minStart = span.start;
  }

  let result = source;
  for (const span of applied) {
    result = result.slice(0, span.start) + span.text + result.slice(span.end);
  }
  return result;
}

function describeOp(op) {
  if (op.type === 'replace') {
    return `replaceTextRange(${op.range[0]}, ${op.range[1]}, ${JSON.stringify(op.text)})`;
  }
  if (op.type === 'insert') {
    return `insertAt(${op.offset}, ${JSON.stringify(op.text)})`;
  }
  if (op.type === 'remove') {
    return `remove(${op.range[0]}, ${op.range[1]})`;
  }
  return JSON.stringify(op);
}

function getConstantInsertPosition(source, language) {
  const lines = source.split('\n');
  let insertEndLine = -1;
  let inMultiLineImport = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (language === 'python') {
      if (line.startsWith('import ') || line.startsWith('from ')) insertEndLine = i;
    } else if (language === 'javascript' || language === 'typescript') {
      if (line.startsWith('import ')) insertEndLine = i;
      if (line.includes('from ') && (line.endsWith(';') || line.endsWith('}'))) insertEndLine = i;
      if (line.startsWith('require(') || line.includes('require(')) insertEndLine = i;
    } else if (language === 'go') {
      if (line.startsWith('import ') && line.includes('(')) inMultiLineImport = true;
      if (inMultiLineImport && line === ')') { inMultiLineImport = false; insertEndLine = i; }
      if (line.startsWith('import ') && !line.includes('(')) insertEndLine = i;
      if (line.startsWith('package ')) insertEndLine = i;
    }
  }

  if (insertEndLine >= 0) {
    let pos = 0;
    for (let i = 0; i <= insertEndLine; i++) pos += lines[i].length + 1;
    return pos;
  }

  if (language === 'go') {
    const m = source.match(/^package\s+\w+\s*/);
    if (m) return m[0].length;
  }
  return 0;
}

function buildConstantDeclarations(constants, language) {
  const lines = [];
  switch (language) {
    case 'javascript':
    case 'typescript':
      constants.forEach(c => lines.push(`const ${c.name} = ${c.value};`));
      break;
    case 'python':
      constants.forEach(c => lines.push(`${c.name} = ${c.value}`));
      break;
    case 'go':
      if (constants.length > 0) {
        lines.push('const (');
        constants.forEach(c => lines.push(`\t${c.name} = ${c.value}`));
        lines.push(')');
      }
      break;
    default:
      constants.forEach(c => lines.push(`const ${c.name} = ${c.value};`));
  }
  return '\n' + lines.join('\n') + '\n\n';
}

module.exports = {
  createFixer,
  applyFixesToSource,
  validateOp,
  normalizeOps,
  describeOp,
  nodeRange,
  getConstantInsertPosition,
  buildConstantDeclarations
};
