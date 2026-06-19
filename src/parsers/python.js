function parsePython(source, filePath = '') {
  try {
    const ast = parsePythonToEstree(source, filePath);
    if (ast) {
      ast.source = source;
      ast.language = 'python';
    }
    return ast;
  } catch (error) {
    console.warn(`⚠️  Python 解析失败 ${filePath}:`, error.message);
    return null;
  }
}

function parsePythonToEstree(source, filePath) {
  const lines = source.split('\n');
  const tokens = tokenizePython(source);
  const ast = buildAstFromTokens(tokens, lines, source);
  return ast;
}

function tokenizePython(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 0;
  
  const keywords = new Set([
    'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return',
    'import', 'from', 'as', 'try', 'except', 'finally', 'raise',
    'with', 'pass', 'break', 'continue', 'lambda', 'yield', 'async',
    'await', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None',
    'global', 'nonlocal', 'del', 'assert', 'print'
  ]);

  while (i < source.length) {
    const ch = source[i];
    
    if (ch === '\n') {
      line++;
      column = 0;
      i++;
      continue;
    }
    
    if (ch === ' ' || ch === '\t') {
      column++;
      i++;
      continue;
    }
    
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') {
        i++;
        column++;
      }
      continue;
    }
    
    const start = i;
    const startLine = line;
    const startColumn = column;
    
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let tripleQuote = false;
      
      if (source.substr(i, 3) === quote.repeat(3)) {
        tripleQuote = true;
        i += 3;
        column += 3;
      } else {
        i++;
        column++;
      }
      
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          column += 2;
          continue;
        }
        if (tripleQuote && source.substr(i, 3) === quote.repeat(3)) {
          i += 3;
          column += 3;
          break;
        }
        if (!tripleQuote && source[i] === quote) {
          i++;
          column++;
          break;
        }
        if (source[i] === '\n') {
          if (!tripleQuote) break;
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
      while (i < source.length && /[0-9.]/.test(source[i])) {
        i++;
        column++;
      }
      tokens.push({
        type: 'NumericLiteral',
        value: parseFloat(source.slice(start, i)),
        raw: source.slice(start, i),
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
    
    const operators = ['==', '!=', '<=', '>=', '->', '+=', '-=', '*=', '/=', '%=', '**', '//'];
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
  }
  
  return tokens;
}

function buildAstFromTokens(tokens, lines, source) {
  let pos = 0;
  const indentStack = [0];
  
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
  
  function parseBlock(expectedIndent) {
    const body = [];
    
    while (pos < tokens.length) {
      const token = peek();
      if (!token) break;
      
      const currentIndent = token.loc.start.column;
      
      if (currentIndent < expectedIndent) {
        break;
      }
      
      if (currentIndent > expectedIndent) {
        throw new Error(`缩进错误: 期望 ${expectedIndent}, 实际 ${currentIndent}`);
      }
      
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    
    return body;
  }
  
  function parseStatement() {
    const token = peek();
    if (!token) return null;
    
    if (token.type === 'Keyword') {
      switch (token.value) {
        case 'def':
          return parseFunctionDeclaration();
        case 'class':
          return parseClassDeclaration();
        case 'if':
          return parseIfStatement();
        case 'for':
          return parseForStatement();
        case 'while':
          return parseWhileStatement();
        case 'return':
          return parseReturnStatement();
        case 'import':
        case 'from':
          return parseImportDeclaration();
        case 'pass':
          consume();
          return {
            type: 'EmptyStatement',
            loc: token.loc,
            range: token.range
          };
        case 'break':
        case 'continue':
          const keyword = consume();
          return {
            type: keyword.value === 'break' ? 'BreakStatement' : 'ContinueStatement',
            loc: keyword.loc,
            range: keyword.range
          };
        case 'print':
          return parseExpressionStatement();
      }
    }
    
    return parseExpressionStatement();
  }
  
  function parseFunctionDeclaration() {
    const startToken = expect('def');
    const idToken = consume();
    
    expect('(');
    const params = [];
    
    while (peek() && peek().value !== ')') {
      if (peek().value === ',') {
        consume();
        continue;
      }
      if (peek().type === 'Identifier') {
        const param = consume();
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
    
    if (peek() && peek().value === '->') {
      consume();
      while (peek() && peek().value !== ':') {
        consume();
      }
    }
    
    expect(':');
    
    const bodyIndent = peek() ? peek().loc.start.column : 0;
    const body = parseBlock(bodyIndent);
    
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
  
  function parseClassDeclaration() {
    const startToken = expect('class');
    const idToken = consume();
    
    if (peek() && peek().value === '(') {
      consume();
      while (peek() && peek().value !== ')') {
        consume();
      }
      expect(')');
    }
    
    expect(':');
    
    const bodyIndent = peek() ? peek().loc.start.column : 0;
    const body = parseBlock(bodyIndent);
    
    return {
      type: 'ClassDeclaration',
      id: {
        type: 'Identifier',
        name: idToken.value,
        loc: idToken.loc,
        range: idToken.range
      },
      body: {
        type: 'ClassBody',
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
  
  function parseIfStatement() {
    const startToken = expect('if');
    const test = parseExpression();
    expect(':');
    
    const consequentIndent = peek() ? peek().loc.start.column : 0;
    const consequent = parseBlock(consequentIndent);
    
    let alternate = null;
    
    if (peek() && peek().value === 'else' && peek().loc.start.column === startToken.loc.start.column) {
      consume();
      if (peek() && peek().value === 'if') {
        alternate = parseIfStatement();
      } else {
        expect(':');
        const elseIndent = peek() ? peek().loc.start.column : 0;
        const elseBody = parseBlock(elseIndent);
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
    
    return {
      type: 'IfStatement',
      test,
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
    
    let left = parsePrimaryExpression();
    
    while (peek() && peek().value === ',') {
      consume();
      const next = parsePrimaryExpression();
      left = {
        type: 'SequenceExpression',
        expressions: [left, next],
        loc: {
          start: left.loc.start,
          end: next.loc.end
        }
      };
    }
    
    if (!peek() || peek().value !== 'in') {
      while (peek() && peek().value !== 'in' && peek().value !== ':') {
        consume();
      }
    }
    
    if (peek() && peek().value === 'in') {
      expect('in');
    }
    
    const right = parseExpression();
    
    if (peek() && peek().value === ':') {
      expect(':');
    } else {
      while (peek() && peek().value !== ':') {
        consume();
      }
      if (peek() && peek().value === ':') {
        expect(':');
      }
    }
    
    const bodyIndent = peek() ? peek().loc.start.column : 0;
    const body = parseBlock(bodyIndent);
    
    return {
      type: 'ForOfStatement',
      left,
      right,
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
  
  function parseWhileStatement() {
    const startToken = expect('while');
    const test = parseExpression();
    expect(':');
    
    const bodyIndent = peek() ? peek().loc.start.column : 0;
    const body = parseBlock(bodyIndent);
    
    return {
      type: 'WhileStatement',
      test,
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
  
  function parseReturnStatement() {
    const startToken = expect('return');
    let argument = null;
    
    if (peek() && peek().value !== '\n' && peek().type !== 'Keyword' && peek().loc.start.line === startToken.loc.start.line) {
      argument = parseExpression();
    }
    
    return {
      type: 'ReturnStatement',
      argument,
      loc: {
        start: startToken.loc.start,
        end: argument ? argument.loc.end : startToken.loc.end
      },
      range: [startToken.range[0], argument ? argument.range[1] : startToken.range[1]]
    };
  }
  
  function parseImportDeclaration() {
    const startToken = consume();
    const specifiers = [];
    
    if (startToken.value === 'from') {
      while (peek() && peek().value !== 'import') {
        consume();
      }
      expect('import');
    }
    
    while (peek() && peek().loc.start.line === startToken.loc.start.line && peek().value !== '\n') {
      if (peek().value === ',' || peek().value === '.') {
        consume();
        continue;
      }
      if (peek().type === 'Identifier') {
        const id = consume();
        specifiers.push({
          type: 'ImportSpecifier',
          imported: {
            type: 'Identifier',
            name: id.value,
            loc: id.loc,
            range: id.range
          }
        });
      } else {
        consume();
      }
    }
    
    return {
      type: 'ImportDeclaration',
      specifiers,
      loc: {
        start: startToken.loc.start,
        end: specifiers.length > 0 ? specifiers[specifiers.length - 1].imported.loc.end : startToken.loc.end
      },
      range: [startToken.range[0], specifiers.length > 0 ? specifiers[specifiers.length - 1].imported.range[1] : startToken.range[1]]
    };
  }
  
  function parseExpressionStatement() {
    const startToken = peek();
    const expression = parseExpression();
    
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
    
    const punctOps = ['+', '-', '*', '/', '%', '**', '//', '==', '!=', '<', '>', '<=', '>=', '|', '&', '^', '<<', '>>'];
    const kwOps = ['and', 'or', 'in', 'is'];
    
    while (peek() && (
      (peek().type === 'Punctuator' && punctOps.includes(peek().value)) ||
      (peek().type === 'Keyword' && kwOps.includes(peek().value))
    )) {
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
    if (peek() && ['not', '-', '+'].includes(peek().value)) {
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
  
  function parseComprehensionClauses() {
    const clauses = [];
    while (peek() && (peek().value === 'for' || peek().value === 'if')) {
      if (peek().value === 'for') {
        const forToken = consume();
        let target = parsePrimaryExpression();
        while (peek() && peek().value === ',') {
          consume();
          const next = parsePrimaryExpression();
          target = {
            type: 'SequenceExpression',
            expressions: [target, next],
            loc: { start: target.loc.start, end: next.loc.end }
          };
        }
        expect('in');
        const iter = parseExpression();
        clauses.push({
          type: 'ComprehensionFor',
          target,
          iter,
          loc: { start: forToken.loc.start, end: iter.loc.end },
          range: [forToken.range[0], iter.range[1]]
        });
      } else {
        const ifToken = consume();
        const test = parseExpression();
        clauses.push({
          type: 'ComprehensionIf',
          test,
          loc: { start: ifToken.loc.start, end: test.loc.end },
          range: [ifToken.range[0], test.range[1]]
        });
      }
    }
    return clauses;
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
    
    if (token.type === 'Keyword' && ['True', 'False', 'None'].includes(token.value)) {
      const lit = consume();
      return {
        type: 'Literal',
        value: token.value === 'True' ? true : token.value === 'False' ? false : null,
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
          consume();
          
          let start = null;
          let end = null;
          let step = null;
          let hasColon = false;
          
          if (peek() && peek().value !== ':' && peek().value !== ']') {
            start = parseExpression();
          }
          
          if (peek() && peek().value === ':') {
            consume();
            hasColon = true;
            
            if (peek() && peek().value !== ':' && peek().value !== ']') {
              end = parseExpression();
            }
            
            if (peek() && peek().value === ':') {
              consume();
              
              if (peek() && peek().value !== ']') {
                step = parseExpression();
              }
            }
          }
          
          if (!peek() || peek().value !== ']') {
            while (peek() && peek().value !== ']') {
              consume();
            }
          }
          
          if (peek() && peek().value === ']') {
            expect(']');
          }
          
          let property;
          if (hasColon) {
            const parts = [];
            if (start) parts.push(start);
            if (end) parts.push(end);
            if (step) parts.push(step);
            
            property = start || end || step || {
              type: 'NumericLiteral',
              value: 0,
              loc: token.loc,
              range: token.range
            };
          } else {
            property = start || {
              type: 'NumericLiteral',
              value: 0,
              loc: token.loc,
              range: token.range
            };
          }
          
          node = {
            type: 'MemberExpression',
            object: node,
            property: property,
            computed: true,
            loc: {
              start: node.loc.start,
              end: token.loc.end
            },
            range: [node.range[0], token.range[1]]
          };
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
        } else {
          break;
        }
      }
      
      return node;
    }
    
    if (token.value === '(') {
      consume();
      const expr = parseExpression();
      expect(')');
      return expr;
    }
    
    if (token.value === '[') {
      const openToken = consume();
      
      if (peek() && peek().value === ']') {
        const closeToken = consume();
        return {
          type: 'ArrayExpression',
          elements: [],
          loc: { start: openToken.loc.start, end: closeToken.loc.end },
          range: [openToken.range[0], closeToken.range[1]]
        };
      }
      
      const firstExpr = parseExpression();
      
      if (peek() && peek().value === 'for') {
        const clauses = parseComprehensionClauses();
        const closeToken = expect(']');
        return {
          type: 'ComprehensionExpression',
          kind: 'list',
          body: firstExpr,
          clauses,
          loc: {
            start: openToken.loc.start,
            end: closeToken.loc.end
          },
          range: [openToken.range[0], closeToken.range[1]]
        };
      }
      
      const elements = [firstExpr];
      while (peek() && peek().value !== ']') {
        if (peek().value === ',') {
          consume();
          if (peek() && peek().value === ']') break;
          continue;
        }
        elements.push(parseExpression());
      }
      const closeToken = expect(']');
      return {
        type: 'ArrayExpression',
        elements,
        loc: {
          start: openToken.loc.start,
          end: closeToken.loc.end
        },
        range: [openToken.range[0], closeToken.range[1]]
      };
    }
    
    if (token.value === '{') {
      const openBrace = consume();
      
      if (peek() && peek().value === '}') {
        const closeToken = expect('}');
        return {
          type: 'ObjectExpression',
          properties: [],
          loc: { start: openBrace.loc.start, end: closeToken.loc.end },
          range: [openBrace.range[0], closeToken.range[1]]
        };
      }
      
      const firstExpr = parseExpression();
      
      if (peek() && peek().value === ':') {
        expect(':');
        const firstValue = parseExpression();
        
        if (peek() && peek().value === 'for') {
          const clauses = parseComprehensionClauses();
          const closeToken = expect('}');
          return {
            type: 'ComprehensionExpression',
            kind: 'dict',
            key: firstExpr,
            value: firstValue,
            clauses,
            loc: { start: openBrace.loc.start, end: closeToken.loc.end },
            range: [openBrace.range[0], closeToken.range[1]]
          };
        }
        
        const properties = [{
          type: 'ObjectProperty',
          key: firstExpr,
          value: firstValue,
          loc: { start: firstExpr.loc.start, end: firstValue.loc.end }
        }];
        while (peek() && peek().value !== '}') {
          if (peek().value === ',') {
            consume();
            if (peek() && peek().value === '}') break;
            continue;
          }
          const key = parseExpression();
          expect(':');
          const value = parseExpression();
          properties.push({
            type: 'ObjectProperty',
            key,
            value,
            loc: { start: key.loc.start, end: value.loc.end }
          });
        }
        const closeToken = expect('}');
        return {
          type: 'ObjectExpression',
          properties,
          loc: { start: openBrace.loc.start, end: closeToken.loc.end },
          range: [openBrace.range[0], closeToken.range[1]]
        };
      }
      
      if (peek() && peek().value === 'for') {
        const clauses = parseComprehensionClauses();
        const closeToken = expect('}');
        return {
          type: 'ComprehensionExpression',
          kind: 'set',
          body: firstExpr,
          clauses,
          loc: { start: openBrace.loc.start, end: closeToken.loc.end },
          range: [openBrace.range[0], closeToken.range[1]]
        };
      }
      
      const elements = [firstExpr];
      while (peek() && peek().value !== '}') {
        if (peek().value === ',') {
          consume();
          if (peek() && peek().value === '}') break;
          continue;
        }
        elements.push(parseExpression());
      }
      const closeToken = expect('}');
      return {
        type: 'SetExpression',
        elements,
        loc: { start: openBrace.loc.start, end: closeToken.loc.end },
        range: [openBrace.range[0], closeToken.range[1]]
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
  parsePython,
  traverseAst
};
