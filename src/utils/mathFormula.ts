/**
 * Safe Math Formula Evaluator for Household Ledger Amount Inputs.
 * Supports +, -, *, /, ×, ÷, x, X, (, ), decimal points, Korean units (만, 천),
 * full-width characters (＋, －, ＊, ／), and thousand-separator commas.
 * Uses recursive descent parsing with operator precedence. No eval() or Function().
 */

export interface MathFormulaResult {
  value: number | null;
  isValid: boolean;
  error?: string;
  formatted?: string;
}

type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MULTIPLY' | 'DIVIDE' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: number;
}

/**
 * Checks if a string contains arithmetic formula operators.
 */
export function containsFormula(str: string): boolean {
  if (!str) return false;
  // Match +, -, *, /, ×, ÷, (, )
  return /[+\-*\/×÷()]/.test(str);
}

/**
 * Sanitizes and normalizes typing input in real-time.
 * Converts full-width symbols, x/X multiplication, and Korean units.
 * Never strips operators so users can type math expressions freely!
 */
export function sanitizeFormulaInput(input: string): string {
  if (!input) return '';
  return input
    // Full-width symbols to ASCII standard
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/＊/g, '*')
    .replace(/／/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    // x or X used as multiplication (e.g., "3000x3" -> "3000 * 3", "3000 x 3" -> "3000 * 3")
    .replace(/([0-9\)])\s*[xX]\s*([0-9\(])/g, '$1 * $2')
    .replace(/([0-9\)])\s*[xX]\s*$/g, '$1 * ')
    // Korean units (만 -> 0000, 천 -> 000)
    .replace(/([0-9]+)\s*만/g, '$10000')
    .replace(/([0-9]+)\s*천/g, '$1000')
    // Remove anything that is not digit, math operator, parentheses, dot, comma, or space
    .replace(/[^0-9+\-*\/().,\s]/g, '');
}

/**
 * Normalizes arithmetic formula string for parser tokenization.
 */
export function normalizeFormula(input: string): string {
  return input
    .replace(/,/g, '') // remove commas
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/＊/g, '*')
    .replace(/／/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/([0-9\)])\s*[xX]\s*([0-9\(])/g, '$1 * $2')
    .replace(/([0-9\)])\s*[xX]\s*$/g, '$1 * ')
    .replace(/([0-9]+)\s*만/g, '$10000')
    .replace(/([0-9]+)\s*천/g, '$1000')
    .replace(/원/g, '')
    .trim();
}

/**
 * Tokenizes a sanitized mathematical string.
 */
function tokenize(input: string): { tokens: Token[]; error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: 0 });
      i++;
    } else if (ch === '-') {
      tokens.push({ type: 'MINUS', value: 0 });
      i++;
    } else if (ch === '*') {
      tokens.push({ type: 'MULTIPLY', value: 0 });
      i++;
    } else if (ch === '/') {
      tokens.push({ type: 'DIVIDE', value: 0 });
      i++;
    } else if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: 0 });
      i++;
    } else if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: 0 });
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let hasDot = false;
      while (i < len && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') {
          if (hasDot) return { tokens: [], error: '소수점이 중복되었습니다.' };
          hasDot = true;
        }
        numStr += input[i];
        i++;
      }
      const numVal = parseFloat(numStr);
      if (isNaN(numVal)) {
        return { tokens: [], error: '잘못된 숫자 형식입니다.' };
      }
      tokens.push({ type: 'NUMBER', value: numVal });
    } else {
      return { tokens: [], error: `알 수 없는 문자 '${ch}'가 포함되어 있습니다.` };
    }
  }

  tokens.push({ type: 'EOF', value: 0 });
  return { tokens };
}

/**
 * Recursive descent parser for arithmetic expressions:
 * Expression -> Term ((+ | -) Term)*
 * Term       -> Factor ((* | /) Factor)*
 * Factor     -> (+ | -)? Primary
 * Primary    -> NUMBER | ( Expression )
 */
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: 0 };
  }

  private consume(expected?: TokenType): Token {
    const token = this.current();
    if (expected && token.type !== expected) {
      throw new Error(`예상치 못한 기호입니다. (발견: ${token.type})`);
    }
    this.pos++;
    return token;
  }

  public parse(): number {
    if (this.current().type === 'EOF') {
      throw new Error('수식을 입력해 주세요.');
    }
    const result = this.expression();
    if (this.current().type !== 'EOF') {
      throw new Error('완성되지 않은 수식입니다.');
    }
    return result;
  }

  private expression(): number {
    let result = this.term();

    while (this.current().type === 'PLUS' || this.current().type === 'MINUS') {
      const op = this.consume().type;
      const right = this.term();
      if (op === 'PLUS') {
        result += right;
      } else {
        result -= right;
      }
    }

    return result;
  }

  private term(): number {
    let result = this.factor();

    while (this.current().type === 'MULTIPLY' || this.current().type === 'DIVIDE') {
      const op = this.consume().type;
      const right = this.factor();
      if (op === 'MULTIPLY') {
        result *= right;
      } else {
        if (right === 0) {
          throw new Error('0으로 나눌 수 없습니다.');
        }
        result /= right;
      }
    }

    return result;
  }

  private factor(): number {
    // Unary plus or minus
    if (this.current().type === 'PLUS') {
      this.consume('PLUS');
      return this.factor();
    }
    if (this.current().type === 'MINUS') {
      this.consume('MINUS');
      return -this.factor();
    }
    return this.primary();
  }

  private primary(): number {
    const token = this.current();

    if (token.type === 'NUMBER') {
      this.consume('NUMBER');
      return token.value;
    }

    if (token.type === 'LPAREN') {
      this.consume('LPAREN');
      const val = this.expression();
      if (this.current().type !== 'RPAREN') {
        throw new Error('닫는 괄호 ) 가 누락되었습니다.');
      }
      this.consume('RPAREN');
      return val;
    }

    throw new Error('숫자나 괄호가 와야 할 위치입니다.');
  }
}

/**
 * Safely evaluates a math formula string and returns calculation result.
 */
export function evaluateMathFormula(rawInput: string): MathFormulaResult {
  if (!rawInput || !rawInput.trim()) {
    return { value: null, isValid: false };
  }

  const clean = normalizeFormula(rawInput);
  if (!clean) {
    return { value: null, isValid: false };
  }

  // If there are no operators, check if it's a simple number
  if (!containsFormula(clean)) {
    const num = parseFloat(clean);
    if (isNaN(num)) {
      return { value: null, isValid: false, error: '유효한 숫자가 아닙니다.' };
    }
    const intVal = Math.round(num);
    return {
      value: intVal,
      isValid: true,
      formatted: intVal.toLocaleString('ko-KR'),
    };
  }

  const { tokens, error: tokenError } = tokenize(clean);
  if (tokenError) {
    return { value: null, isValid: false, error: tokenError };
  }

  try {
    const parser = new Parser(tokens);
    const rawResult = parser.parse();

    if (!isFinite(rawResult) || isNaN(rawResult)) {
      return { value: null, isValid: false, error: '계산 결과가 유효하지 않습니다.' };
    }

    const rounded = Math.round(rawResult);
    return {
      value: rounded,
      isValid: true,
      formatted: rounded.toLocaleString('ko-KR'),
    };
  } catch (err: any) {
    return {
      value: null,
      isValid: false,
      error: err?.message || '수식을 확인해 주세요.',
    };
  }
}
