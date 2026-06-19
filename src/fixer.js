const fs = require('fs');
const path = require('path');

function applyFixes(issues, config = {}) {
  const fixableIssues = issues.filter(issue => issue.fixable && issue.rule === 'magic-number');
  
  const fixesByFile = {};
  
  fixableIssues.forEach(issue => {
    if (!fixesByFile[issue.filePath]) {
      fixesByFile[issue.filePath] = [];
    }
    fixesByFile[issue.filePath].push(issue);
  });
  
  const results = [];
  
  Object.entries(fixesByFile).forEach(([filePath, fileIssues]) => {
    const fixResult = fixMagicNumbers(filePath, fileIssues, config);
    if (fixResult) {
      results.push(fixResult);
    }
  });
  
  return results;
}

function fixMagicNumbers(filePath, issues, config) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const language = getLanguageFromExtension(ext);
  
  const uniqueValues = new Map();
  
  issues.forEach(issue => {
    const value = issue.details?.value;
    const raw = issue.details?.raw;
    if (value !== undefined && raw !== undefined) {
      if (!uniqueValues.has(raw)) {
        uniqueValues.set(raw, {
          value,
          raw,
          suggestedName: issue.details?.suggestedConstantName || generateConstantName(value)
        });
      }
    }
  });
  
  if (uniqueValues.size === 0) return null;
  
  let newContent = source;
  const usedNames = new Set();
  const constantsToAdd = [];
  
  uniqueValues.forEach((info, raw) => {
    let constName = info.suggestedName;
    
    let counter = 1;
    while (usedNames.has(constName)) {
      constName = `${info.suggestedName}_${counter}`;
      counter++;
    }
    usedNames.add(constName);
    
    info.actualName = constName;
    
    const regex = createNumberRegex(raw);
    
    let match;
    const matches = [];
    while ((match = regex.exec(newContent)) !== null) {
      const beforeChar = match.index > 0 ? newContent[match.index - 1] : '';
      const afterChar = match.index + match[0].length < newContent.length 
        ? newContent[match.index + match[0].length] 
        : '';
      
      if (!isPartOfIdentifier(beforeChar) && !isPartOfIdentifier(afterChar)) {
        matches.push({
          index: match.index,
          length: match[0].length,
          raw: match[0]
        });
      }
    }
    
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      newContent = newContent.slice(0, m.index) + constName + newContent.slice(m.index + m.length);
    }
    
    constantsToAdd.push({
      name: constName,
      value: info.raw
    });
  });
  
  const constantDeclarations = generateConstantDeclarations(constantsToAdd, language);
  
  const insertPosition = findInsertPosition(newContent, language);
  
  if (insertPosition >= 0) {
    newContent = newContent.slice(0, insertPosition) + constantDeclarations + newContent.slice(insertPosition);
  }
  
  return {
    file: filePath,
    oldContent: source,
    newContent,
    issues,
    constantsAdded: constantsToAdd
  };
}

function getLanguageFromExtension(ext) {
  const map = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.go': 'go'
  };
  return map[ext] || 'javascript';
}

function generateConstantName(value) {
  const absValue = Math.abs(value);
  const suffix = value < 0 ? '_NEGATIVE' : '';
  
  if (Number.isInteger(absValue)) {
    return `MAGIC_${absValue}${suffix}`;
  } else {
    const strValue = absValue.toString().replace('.', '_');
    return `MAGIC_${strValue}${suffix}`;
  }
}

function createNumberRegex(raw) {
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, 'g');
}

function isPartOfIdentifier(char) {
  return /[a-zA-Z0-9_$]/.test(char);
}

function generateConstantDeclarations(constants, language) {
  const lines = [];
  
  switch (language) {
    case 'javascript':
    case 'typescript':
      constants.forEach(c => {
        lines.push(`const ${c.name} = ${c.value};`);
      });
      break;
      
    case 'python':
      constants.forEach(c => {
        lines.push(`${c.name} = ${c.value}`);
      });
      break;
      
    case 'go':
      if (constants.length > 0) {
        lines.push('const (');
        constants.forEach(c => {
          lines.push(`\t${c.name} = ${c.value}`);
        });
        lines.push(')');
      }
      break;
      
    default:
      constants.forEach(c => {
        lines.push(`const ${c.name} = ${c.value};`);
      });
  }
  
  return '\n' + lines.join('\n') + '\n\n';
}

function findInsertPosition(content, language) {
  const lines = content.split('\n');
  
  let importEndLine = -1;
  let inMultiLineImport = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (language === 'python') {
      if (line.startsWith('import ') || line.startsWith('from ')) {
        importEndLine = i;
      }
    } else if (language === 'javascript' || language === 'typescript') {
      if (line.startsWith('import ') || line.startsWith('const {') && line.includes('from ')) {
        importEndLine = i;
      }
      if (line.includes('from ') && line.endsWith(';')) {
        importEndLine = i;
      }
    } else if (language === 'go') {
      if (line.startsWith('import ') && line.includes('(')) {
        inMultiLineImport = true;
      }
      if (inMultiLineImport && line === ')') {
        inMultiLineImport = false;
        importEndLine = i;
      }
      if (line.startsWith('import ') && !line.includes('(')) {
        importEndLine = i;
      }
      if (line.startsWith('package ')) {
        importEndLine = i;
      }
    }
  }
  
  if (importEndLine >= 0) {
    let pos = 0;
    for (let i = 0; i <= importEndLine; i++) {
      pos += lines[i].length + 1;
    }
    return pos;
  }
  
  if (language === 'go') {
    const packageMatch = content.match(/^package\s+\w+\s*/);
    if (packageMatch) {
      return packageMatch[0].length;
    }
  }
  
  return 0;
}

module.exports = {
  applyFixes,
  fixMagicNumbers
};
