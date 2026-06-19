function parseGo(source, filePath = '') {
  try {
    const ast = parseGoToEstree(source, filePath);
    if (ast) {
      ast.source = source;
      ast.language = 'go';
    }
    return ast;
  } catch (error) {
    console.warn(`⚠️  Go 解析失败 ${filePath}:`, error.message);
    return null;
  }
}

function parseGoToEstree(source, filePath) {
  const lines = source.split('\n');
  const tokens = tokenizeGo(source);
  const ast = buildAstFromTokens(tokens, lines, source);
  return ast;
}

function tokenizeGo(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 0;
  
  const keywords = new Set([
    'func', 'package', 'import', 'type', 'struct', 'interface',
    'if', 'else', 'for', 'range', 'return', 'var', 'const',
    'switch', 'case', 'default', 'break', 'continue', 'fallthrough',
    'go', 'defer', 'chan', 'select', 'map', 'slice',
    'true', 'false', 'nil', 'iota',
    'int', 'int8', 'int16', 'int32', 'int64',
    'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
    'float32', 'float64', 'complex64', 'complex128',
    'string', 'bool', 'byte', 'rune',
    'make', 'new', 'len', 'cap', 'append', 'copy', 'close',
    'delete', 'panic', 'recover', 'print', 'println'
  ]);

  while (i < source.length) {
    const ch = source[i];
    
    if (ch === '\n') {
      line++;
      column = 0;
      i++;
      continue;
    }
    
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      column++;
      i++;
      continue;
    }
    
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') {
        i++;
        column++;
      }
      continue;
    }
    
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      column += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          line++;
          column = 0;
        } else {
          column++;
        }
        i++;
      }
      i += 2;
      column += 2;
      continue;
    }
    
    const start = i;
    const startLine = line;
    const startColumn = column;
    
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      column++;
      
      while (i < source.length) {
        if (source[i] === '\\' && quote !== '`') {
          i += 2;
          column += 2;
          continue;
        }
        if (source[i] === quote) {
          i++;
          column++;
          break;
        }
        if (source[i] === '\n') {
          if (quote !== '`') break;
          line++;
          column = 0;
        }
        i++;
        column++;
      }
      
      tokens.push({
        type: 'StringLiteral',
        value: source.slice(start, i),
        loc: {
          start: { line: startLine, column: startColumn },
          end: { line, column }
        },
        range: [start, i]
      });
      continue;
    }
    
    if (/[0-9]/.test(ch)) {
      while (i < source.length && /[0-9.xXoObBeE+\-a-fA-F_]/.test(source[i])) {
        i++;
        column++;
      }
      const raw = source.slice(start, i);
      tokens.push({
        type: 'NumericLiteral',
        value: parseFloat(raw.replace(/_/g, '')),
        raw,
        loc: {
          start: { line: startLine, column: startColumn },
          end: { line, column }
        },
        range: [start, i]
      });
      continue;
    }
    
    if (/[a-zA-Z_]/.test(ch)) {
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        i++;
        column++;
      }
      const value = source.slice(start, i);
      tokens.push({
        type: keywords.has(value) ? 'Keyword' : 'Identifier',
        value,
        loc: {
          start: { line: startLine, column: startColumn },
          end: { line, column }
        },
        range: [start, i]
      });
      continue;
    }
    
    const operators = [
      ':=', '==', '!=', '<=', '>=', '->', '+=', '-=', '*=', '/=', '%=',
      '&=', '|=', '^=', '<<=', '>>=', '&^=',
      '&&', '||', '<<', '>>', '&^', '++', '--', '<-',
      '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '!', '=', ':'
    ];
    
    operators.sort((a, b) => b.length - a.length);
    
    let matched = false;
    for (const op of operators) {
      if (source.substr(i, op.length) === op) {
        tokens.push({
          type: 'Punctuator',
          value: op,
          loc: {
            start: { line: startLine, column: startColumn },
            end: { line, column: column + op.length }
          },
          range: [start, start + op.length]
        });
        i += op.length;
        column += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    
    const punctuators = ['(', ')', '{', '}', '[', ']', ';', ',', '.'];
    if (punctuators.includes(ch)) {
      tokens.push({
        type: 'Punctuator',
        value: ch,
        loc: {
          start: { line: startLine, column: startColumn },
          end: { line, column: column + 1 }
        },
        range: [start, start + 1]
      });
      i++;
      column++;
      continue;
    }
    
    i++;
    column++;
  }
  
  return tokens;
}

function buildAstFromTokens(tokens, lines, source) {
  let pos = 0;
  
  function peek(offset = 0) {
    return tokens[pos + offset];
  }
  
  function consume() {
    return tokens[pos++];
  }
  
  function expect(value) {
    const token = consume();
    if (!token || token.value !== value) {
      throw new Error(`期望 ${value}, 但得到 ${token ? token.value : 'EOF'}`);
    }
    return token;
  }
  
  function parseBlock() {
    if (!peek() || peek().value !== '{') {
      return [];
    }
    consume();
    const body = [];
    
    let braceCount = 1;
    while (peek() && braceCount > 0) {
      if (peek().value === '{') {
        braceCount++;
      } else if (peek().value === '}') {
        braceCount--;
        if (braceCount === 0) {
          break;
        }
      }
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    
    if (peek() && peek().value === '}') {
      consume();
    }
    return body;
  }
  
  function parseStatement() {
    const token = peek();
    if (!token) return null;
    
    if (token.type === 'Keyword') {
      switch (token.value) {
        case 'func':
          return parseFunctionDeclaration();
        case 'package':
          return parsePackageDeclaration();
        case 'import':
          return parseImportDeclaration();
        case 'type':
          return parseTypeDeclaration();
        case 'var':
        case 'const':
          return parseVariableDeclaration();
        case 'if':
          return parseIfStatement();
        case 'for':
          return parseForStatement();
        case 'return':
          return parseReturnStatement();
        case 'switch':
          return parseSwitchStatement();
        case 'select':
          return parseSelectStatement();
        case 'break':
        case 'continue':
        case 'fallthrough':
          const keyword = consume();
          if (peek() && peek().value === ';') consume();
          return {
            type: keyword.value === 'break' ? 'BreakStatement' : 
                  keyword.value === 'continue' ? 'ContinueStatement' : 'ContinueStatement',
            loc: keyword.loc,
            range: keyword.range
          };
        case 'defer':
        case 'go':
          const deferKw = consume();
          const expr = parseExpression();
          if (peek() && peek().value === ';') consume();
          return {
            type: 'ExpressionStatement',
            expression: {
              type: deferKw.value === 'defer' ? 'DeferExpression' : 'GoExpression',
              argument: expr,
              loc: {
                start: deferKw.loc.start,
                end: expr.loc.end
              },
              range: [deferKw.range[0], expr.range[1]]
            },
            loc: {
              start: deferKw.loc.start,
              end: expr.loc.end
            },
            range: [deferKw.range[0], expr.range[1]]
          };
      }
    }
    
    return parseExpressionStatement();
  }
  
  function parsePackageDeclaration() {
    const startToken = expect('package');
    const name = consume();
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'ExpressionStatement',
      expression: {
        type: 'PackageDeclaration',
        name: name.value,
        loc: {
          start: startToken.loc.start,
          end: name.loc.end
        },
        range: [startToken.range[0], name.range[1]]
      },
      loc: {
        start: startToken.loc.start,
        end: name.loc.end
      },
      range: [startToken.range[0], name.range[1]]
    };
  }
  
  function parseImportDeclaration() {
    const startToken = expect('import');
    
    if (peek() && peek().value === '(') {
      consume();
      while (peek() && peek().value !== ')') {
        if (peek().value === ';') consume();
        if (peek().type === 'StringLiteral') consume();
        else consume();
      }
      expect(')');
    } else {
      while (peek() && peek().value !== ';' && peek().loc.start.line === startToken.loc.start.line) {
        consume();
      }
    }
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'ImportDeclaration',
      specifiers: [],
      loc: startToken.loc,
      range: startToken.range
    };
  }
  
  function parseTypeDeclaration() {
    const startToken = expect('type');
    const name = consume();
    
    let nodeType = 'TypeAlias';
    let body = null;
    let endToken = name;
    
    if (peek() && peek().value === 'struct') {
      const structToken = consume();
      nodeType = 'StructDeclaration';
      const result = parseStructBody();
      body = result.fields;
      endToken = result.endToken;
    } else if (peek() && peek().value === 'interface') {
      const ifaceToken = consume();
      nodeType = 'InterfaceDeclaration';
      const result = parseInterfaceBody();
      body = result.methods;
      endToken = result.endToken;
    } else {
      while (peek() && peek().value !== ';' && peek().loc.start.line === startToken.loc.start.line) {
        consume();
      }
    }
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: nodeType,
      id: {
        type: 'Identifier',
        name: name.value,
        loc: name.loc,
        range: name.range
      },
      body,
      loc: {
        start: startToken.loc.start,
        end: endToken.loc.end
      },
      range: [startToken.range[0], endToken.range[1]]
    };
  }
  
  function parseStructBody() {
    const fields = [];
    let endToken = null;
    if (peek() && peek().value === '{') {
      const openBrace = consume();
      while (peek() && peek().value !== '}') {
        const fieldStart = peek();
        let names = [];
        if (peek() && peek().type === 'Identifier' && peek().value !== '{' && peek().value !== '}') {
          names.push(consume());
          while (peek() && peek().value === ',') {
            consume();
            if (peek() && peek().type === 'Identifier') names.push(consume());
          }
        }
        let fieldType = null;
        if (peek() && peek().value !== '`' && peek().value !== '}' && peek().loc.start.line === fieldStart.loc.start.line) {
          fieldType = parseTypeReference();
        }
        let tag = null;
        if (peek() && peek().type === 'StringLiteral') {
          tag = consume().value;
        }
        fields.push({
          type: 'FieldDeclaration',
          names: names.map(n => ({ type: 'Identifier', name: n.value, loc: n.loc, range: n.range })),
          fieldType,
          tag,
          loc: { start: fieldStart.loc.start, end: (tag ? peek(-1) : (fieldType ? fieldType : names[names.length-1])).loc.end }
        });
      }
      if (peek() && peek().value === '}') {
        endToken = consume();
      } else {
        endToken = openBrace;
      }
    }
    if (!endToken) endToken = peek(-1) || { loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, range: [0, 0] };
    return { fields, endToken };
  }
  
  function parseInterfaceBody() {
    const methods = [];
    let endToken = null;
    if (peek() && peek().value === '{') {
      const openBrace = consume();
      while (peek() && peek().value !== '}') {
        const methodStart = peek();
        let name = null;
        if (peek() && peek().type === 'Identifier') {
          name = consume();
        }
        let params = [];
        let results = [];
        if (peek() && peek().value === '(') {
          params = parseParameterList();
        }
        if (peek() && peek().value !== '}' && peek().loc.start.line === methodStart.loc.start.line) {
          results = parseResultList();
        }
        methods.push({
          type: 'MethodSignature',
          key: name ? { type: 'Identifier', name: name.value, loc: name.loc, range: name.range } : null,
          params,
          results,
          loc: { start: methodStart.loc.start, end: (peek(-1) || methodStart).loc.end }
        });
      }
      if (peek() && peek().value === '}') {
        endToken = consume();
      } else {
        endToken = openBrace;
      }
    }
    if (!endToken) endToken = peek(-1) || { loc: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }, range: [0, 0] };
    return { methods, endToken };
  }
  
  function parseTypeReference() {
    const startToken = peek();
    if (!startToken) return null;
    const isBracket = startToken.value === '[' && peek(1) && peek(1).value === ']';
    if (startToken.value === '*' || isBracket || startToken.value === 'chan' ||
        startToken.value === 'map' || startToken.value === 'func' || startToken.value === '<-' ||
        startToken.value === 'interface' || startToken.value === 'struct') {
      const kw = isBracket ? (consume(), consume()) : consume();
      const kwVal = isBracket ? '[]' : kw.value;
      let elementType = null;
      if (kwVal === '*') {
        elementType = parseTypeReference();
      } else if (kwVal === 'chan') {
        elementType = parseTypeReference();
      } else if (kwVal === '<-') {
        if (peek() && peek().value === 'chan') { consume(); elementType = parseTypeReference(); }
      } else if (kwVal === '[]') {
        elementType = parseTypeReference();
      } else if (kwVal === 'map') {
        if (peek() && peek().value === '[') { consume(); parseTypeReference(); if (peek() && peek().value === ']') consume(); }
        elementType = parseTypeReference();
      } else if (kwVal === 'func') {
        if (peek() && peek().value === '(') { parseParameterList(); }
        if (peek() && peek().value === '(') { parseParameterList(); }
      } else if (kwVal === 'interface' || kwVal === 'struct') {
        if (peek() && peek().value === '{') { parseBlock(); }
      }
      const lastTok = peek(-1) || kw;
      return {
        type: kwVal === '*' ? 'PointerType' : kwVal === 'chan' ? 'ChannelType' :
              kwVal === '[]' ? 'ArrayType' : kwVal === 'map' ? 'MapType' :
              kwVal === 'func' ? 'FunctionType' : 'TypeReference',
        elementType,
        loc: { start: startToken.loc.start, end: lastTok.loc.end },
        range: [startToken.range[0], lastTok.range[1]]
      };
    }
    const nameToken = consume();
    return {
      type: 'NamedType',
      name: nameToken.value,
      loc: nameToken.loc,
      range: nameToken.range
    };
  }
  
  function parseParameterList() {
    const params = [];
    if (!peek() || peek().value !== '(') return params;
    consume();
    while (peek() && peek().value !== ')') {
      if (peek().value === ',') { consume(); continue; }
      if (peek().value === '.') {
        while (peek() && peek().value !== ')') consume();
        break;
      }
      parseTypeReference();
      params.push({ type: 'Parameter' });
    }
    if (peek() && peek().value === ')') consume();
    return params;
  }
  
  function parseResultList() {
    if (peek() && peek().value === '(') {
      return parseParameterList();
    }
    return [parseTypeReference()].filter(Boolean);
  }
  
  function parseFunctionDeclaration() {
    const startToken = expect('func');
    
    let receiver = null;
    let idToken = null;
    let alreadyParsedParams = false;
    
    if (peek() && peek().value === '(') {
      const savePos = pos;
      const openParen = consume();
      let parenCount = 1;
      let hasIdentifierAfter = false;
      let tempPos = pos;
      
      while (tempPos < tokens.length && parenCount > 0) {
        if (tokens[tempPos].value === '(') parenCount++;
        else if (tokens[tempPos].value === ')') parenCount--;
        tempPos++;
      }
      
      if (tempPos < tokens.length && tokens[tempPos].type === 'Identifier') {
        hasIdentifierAfter = true;
      }
      
      if (hasIdentifierAfter) {
        while (peek() && peek().value !== ')') {
          consume();
        }
        expect(')');
        idToken = consume();
      } else {
        pos = savePos;
        idToken = { type: 'Identifier', value: 'anonymous', loc: startToken.loc, range: startToken.range };
      }
    } else if (peek() && peek().type === 'Identifier') {
      idToken = consume();
    } else {
      idToken = { type: 'Identifier', value: 'anonymous', loc: startToken.loc, range: startToken.range };
    }
    
    if (!alreadyParsedParams) {
      expect('(');
    }
    const params = [];
    
    while (peek() && peek().value !== ')') {
      if (peek().value === ',') {
        consume();
        continue;
      }
      if (peek().type === 'Identifier') {
        const param = consume();
        while (peek() && peek().value !== ',' && peek().value !== ')') {
          consume();
        }
        params.push({
          type: 'Identifier',
          name: param.value,
          loc: param.loc,
          range: param.range
        });
      } else {
        consume();
      }
    }
    
    expect(')');
    
    while (peek() && peek().value !== '{' && peek().value !== ';') {
      consume();
    }
    
    const body = parseBlock();
    
    if (peek() && peek().value === ';') consume();
    
    const endLoc = body.length > 0 
      ? body[body.length - 1].loc.end 
      : startToken.loc.end;
    const endRange = body.length > 0 
      ? body[body.length - 1].range[1] 
      : startToken.range[1];
    
    return {
      type: 'FunctionDeclaration',
      id: {
        type: 'Identifier',
        name: idToken.value,
        loc: idToken.loc,
        range: idToken.range
      },
      params,
      body: {
        type: 'BlockStatement',
        body,
        loc: {
          start: startToken.loc.start,
          end: endLoc
        },
        range: [startToken.range[0], endRange]
      },
      loc: {
        start: startToken.loc.start,
        end: endLoc
      },
      range: [startToken.range[0], endRange]
    };
  }
  
  function parseVariableDeclaration() {
    const startToken = consume();
    
    while (peek() && peek().value !== ';' && peek().loc.start.line === startToken.loc.start.line) {
      consume();
    }
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'VariableDeclaration',
      kind: startToken.value,
      declarations: [],
      loc: startToken.loc,
      range: startToken.range
    };
  }
  
  function parseIfStatement() {
    const startToken = expect('if');
    
    while (peek() && peek().value !== '{' && peek().value !== ';') {
      consume();
    }
    
    const consequent = parseBlock();
    
    let alternate = null;
    
    if (peek() && peek().value === 'else') {
      consume();
      if (peek() && peek().value === 'if') {
        alternate = parseIfStatement();
      } else {
        const elseBody = parseBlock();
        alternate = {
          type: 'BlockStatement',
          body: elseBody,
          loc: {
            start: startToken.loc.start,
            end: elseBody.length > 0 ? elseBody[elseBody.length - 1].loc.end : startToken.loc.end
          }
        };
      }
    }
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'IfStatement',
      test: { type: 'Literal', value: true, loc: startToken.loc },
      consequent: {
        type: 'BlockStatement',
        body: consequent,
        loc: {
          start: startToken.loc.start,
          end: consequent.length > 0 ? consequent[consequent.length - 1].loc.end : startToken.loc.end
        }
      },
      alternate,
      loc: {
        start: startToken.loc.start,
        end: alternate ? alternate.loc.end : (consequent.length > 0 ? consequent[consequent.length - 1].loc.end : startToken.loc.end)
      },
      range: [startToken.range[0], alternate ? alternate.range[1] : (consequent.length > 0 ? consequent[consequent.length - 1].range[1] : startToken.range[1])]
    };
  }
  
  function parseForStatement() {
    const startToken = expect('for');
    
    while (peek() && peek().value !== '{' && peek().value !== ';') {
      consume();
    }
    
    const body = parseBlock();
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'ForStatement',
      body: {
        type: 'BlockStatement',
        body,
        loc: {
          start: startToken.loc.start,
          end: body.length > 0 ? body[body.length - 1].loc.end : startToken.loc.end
        }
      },
      loc: {
        start: startToken.loc.start,
        end: body.length > 0 ? body[body.length - 1].loc.end : startToken.loc.end
      },
      range: [startToken.range[0], body.length > 0 ? body[body.length - 1].range[1] : startToken.range[1]]
    };
  }
  
  function parseSwitchStatement() {
    const startToken = expect('switch');
    
    while (peek() && peek().value !== '{') {
      consume();
    }
    
    expect('{');
    
    const cases = [];
    while (peek() && peek().value !== '}') {
      if (peek().value === 'case' || peek().value === 'default') {
        const caseKw = consume();
        while (peek() && peek().value !== ':') {
          consume();
        }
        expect(':');
        
        const caseBody = [];
        while (peek() && peek().value !== 'case' && peek().value !== 'default' && peek().value !== '}') {
          const stmt = parseStatement();
          if (stmt) caseBody.push(stmt);
        }
        
        cases.push({
          type: 'SwitchCase',
          test: caseKw.value === 'default' ? null : { type: 'Literal', value: true },
          consequent: caseBody,
          loc: {
            start: caseKw.loc.start,
            end: caseBody.length > 0 ? caseBody[caseBody.length - 1].loc.end : caseKw.loc.end
          }
        });
      } else {
        consume();
      }
    }
    
    expect('}');
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'SwitchStatement',
      discriminant: { type: 'Literal', value: true },
      cases,
      loc: {
        start: startToken.loc.start,
        end: startToken.loc.end
      },
      range: startToken.range
    };
  }
  
  function parseSelectStatement() {
    const startToken = expect('select');
    
    let openBrace = null;
    if (peek() && peek().value === '{') {
      openBrace = consume();
    }
    
    const cases = [];
    let endToken = openBrace || startToken;
    while (peek() && peek().value !== '}') {
      if (peek().value === 'case' || peek().value === 'default') {
        const caseKw = consume();
        let comm = null;
        if (caseKw.value === 'case') {
          comm = parseExpression();
        }
        if (peek() && peek().value === ':') consume();
        
        const caseBody = [];
        while (peek() && peek().value !== 'case' && peek().value !== 'default' && peek().value !== '}') {
          const stmt = parseStatement();
          if (stmt) caseBody.push(stmt);
        }
        
        cases.push({
          type: 'SelectCase',
          test: comm,
          consequent: caseBody,
          loc: {
            start: caseKw.loc.start,
            end: caseBody.length > 0 ? caseBody[caseBody.length - 1].loc.end : caseKw.loc.end
          }
        });
        endToken = cases[cases.length - 1];
      } else {
        consume();
      }
    }
    
    if (peek() && peek().value === '}') {
      endToken = consume();
    }
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'SelectStatement',
      cases,
      loc: {
        start: startToken.loc.start,
        end: endToken.loc.end
      },
      range: [startToken.range[0], endToken.range[1]]
    };
  }
  
  function parseReturnStatement() {
    const startToken = expect('return');
    const argument = [];
    
    while (peek() && peek().value !== ';' && peek().loc.start.line === startToken.loc.start.line) {
      argument.push(parseExpression());
    }
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'ReturnStatement',
      argument: argument.length === 1 ? argument[0] : argument,
      loc: {
        start: startToken.loc.start,
        end: argument.length > 0 ? argument[argument.length - 1].loc.end : startToken.loc.end
      },
      range: [startToken.range[0], argument.length > 0 ? argument[argument.length - 1].range[1] : startToken.range[1]]
    };
  }
  
  function parseExpressionStatement() {
    const startToken = peek();
    const expression = parseExpression();
    
    if (peek() && peek().value === ';') consume();
    
    return {
      type: 'ExpressionStatement',
      expression,
      loc: {
        start: startToken.loc.start,
        end: expression.loc.end
      },
      range: [startToken.range[0], expression.range[1]]
    };
  }
  
  function parseExpression() {
    return parseBinaryExpression();
  }
  
  function parseBinaryExpression() {
    let left = parseUnaryExpression();
    
    while (peek() && peek().type === 'Punctuator' && 
           ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '&', '|', '^', '<<', '>>', '&^', '<-'].includes(peek().value)) {
      const operator = consume();
      const right = parseUnaryExpression();
      
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        loc: {
          start: left.loc.start,
          end: right.loc.end
        },
        range: [left.range[0], right.range[1]]
      };
    }
    
    return left;
  }
  
  function parseUnaryExpression() {
    if (peek() && ['!', '-', '+', '*', '&', '<-'].includes(peek().value)) {
      const operator = consume();
      const argument = parseUnaryExpression();
      return {
        type: 'UnaryExpression',
        operator: operator.value,
        argument,
        loc: {
          start: operator.loc.start,
          end: argument.loc.end
        },
        range: [operator.range[0], argument.range[1]]
      };
    }
    return parsePrimaryExpression();
  }
  
  function parsePrimaryExpression() {
    const token = peek();
    if (!token) return null;
    
    if (token.type === 'NumericLiteral') {
      const lit = consume();
      return {
        type: 'NumericLiteral',
        value: lit.value,
        raw: lit.raw,
        loc: lit.loc,
        range: lit.range
      };
    }
    
    if (token.type === 'StringLiteral') {
      const lit = consume();
      return {
        type: 'StringLiteral',
        value: lit.value,
        loc: lit.loc,
        range: lit.range
      };
    }
    
    if (token.type === 'Keyword' && ['true', 'false', 'nil'].includes(token.value)) {
      const lit = consume();
      return {
        type: 'Literal',
        value: token.value === 'true' ? true : token.value === 'false' ? false : null,
        raw: token.value,
        loc: lit.loc,
        range: lit.range
      };
    }
    
    if (token.type === 'Identifier') {
      const id = consume();
      let node = {
        type: 'Identifier',
        name: id.value,
        loc: id.loc,
        range: id.range
      };
      
      while (peek()) {
        if (peek().value === '(') {
          consume();
          const args = [];
          while (peek() && peek().value !== ')') {
            if (peek().value === ',') {
              consume();
              continue;
            }
            args.push(parseExpression());
          }
          expect(')');
          node = {
            type: 'CallExpression',
            callee: node,
            arguments: args,
            loc: {
              start: node.loc.start,
              end: token.loc.end
            },
            range: [node.range[0], token.range[1]]
          };
        } else if (peek().value === '[') {
          const openBracket = consume();
          let low = null, high = null, hasColon = false;
          if (peek() && peek().value !== ':' && peek().value !== ']') {
            low = parseExpression();
          }
          if (peek() && peek().value === ':') {
            consume();
            hasColon = true;
            if (peek() && peek().value !== ':' && peek().value !== ']') {
              high = parseExpression();
            }
          }
          let closeToken = openBracket;
          if (peek() && peek().value === ']') {
            closeToken = consume();
          } else {
            while (peek() && peek().value !== ']') consume();
            if (peek() && peek().value === ']') closeToken = consume();
          }
          if (hasColon) {
            node = {
              type: 'SliceExpression',
              object: node,
              low,
              high,
              loc: {
                start: node.loc.start,
                end: closeToken.loc.end
              },
              range: [node.range[0], closeToken.range[1]]
            };
          } else {
            node = {
              type: 'MemberExpression',
              object: node,
              property: low || { type: 'Identifier', name: '' },
              computed: true,
              loc: {
                start: node.loc.start,
                end: closeToken.loc.end
              },
              range: [node.range[0], closeToken.range[1]]
            };
          }
        } else if (peek().value === '.') {
          consume();
          const prop = consume();
          node = {
            type: 'MemberExpression',
            object: node,
            property: {
              type: 'Identifier',
              name: prop.value,
              loc: prop.loc,
              range: prop.range
            },
            computed: false,
            loc: {
              start: node.loc.start,
              end: prop.loc.end
            },
            range: [node.range[0], prop.range[1]]
          };
        } else if (peek().value === ':=' || peek().value === '=') {
          consume();
          const value = parseExpression();
          node = {
            type: 'AssignmentExpression',
            operator: peek().value === ':=' ? ':=' : '=',
            left: node,
            right: value,
            loc: {
              start: node.loc.start,
              end: value.loc.end
            },
            range: [node.range[0], value.range[1]]
          };
        } else if (peek().value === '++' || peek().value === '--') {
          const op = consume();
          node = {
            type: 'UpdateExpression',
            operator: op.value,
            argument: node,
            prefix: false,
            loc: {
              start: node.loc.start,
              end: op.loc.end
            },
            range: [node.range[0], op.range[1]]
          };
        } else {
          break;
        }
      }
      
      return node;
    }
    
    if (token.value === '(') {
      consume();
      const expr = parseExpression();
      if (peek() && peek().value === ')') {
        expect(')');
      } else {
        while (peek() && peek().value !== ')') {
          consume();
        }
        if (peek() && peek().value === ')') {
          expect(')');
        }
      }
      return expr;
    }
    
    if (token.value === '[') {
      consume();
      const elements = [];
      while (peek() && peek().value !== ']') {
        if (peek().value === ',') {
          consume();
          continue;
        }
        elements.push(parseExpression());
      }
      expect(']');
      return {
        type: 'ArrayExpression',
        elements,
        loc: {
          start: token.loc.start,
          end: token.loc.end
        },
        range: [token.range[0], token.range[1]]
      };
    }
    
    return consume() || null;
  }
  
  const body = [];
  
  while (pos < tokens.length) {
    const stmt = parseStatement();
    if (stmt) body.push(stmt);
  }
  
  return {
    type: 'Program',
    body,
    sourceType: 'module',
    loc: {
      start: { line: 1, column: 0 },
      end: { line: lines.length, column: 0 }
    },
    range: [0, source.length],
    tokens,
    lines
  };
}

function traverseAst(ast, visitors) {
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    
    node.parent = parent;
    
    if (node.type && visitors[node.type]) {
      const visitor = visitors[node.type];
      if (typeof visitor === 'function') {
        visitor(node, parent);
      } else if (typeof visitor === 'object' && typeof visitor.enter === 'function') {
        visitor.enter(node, parent);
      }
    }
    
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'parent' || key === 'source' || key === 'tokens' || key === 'lines') continue;
      
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(child => walk(child, node));
      } else if (value && typeof value === 'object') {
        walk(value, node);
      }
    }
    
    if (node.type && visitors[node.type]) {
      const visitor = visitors[node.type];
      if (typeof visitor === 'object' && typeof visitor.exit === 'function') {
        visitor.exit(node, parent);
      }
    }
  }
  
  walk(ast, null);
}

module.exports = {
  parseGo,
  traverseAst
};
