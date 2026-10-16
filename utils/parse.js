// 多项式输入解析
// 支持两种写法：
//   1) 系数列表（降幂）："1 3 2" 或 "1,3,2"
//   2) 关于 s 的表达式："s^2+3s+2"、"(s+1)(s+2)"、"10*(0.5s+1)"、"s(s+1)^2"

const P = require('./poly')

function normalize(str) {
  return String(str || '')
    .replace(/[，、；;]/g, ',')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[－—−]/g, '-')
    .replace(/＋/g, '+')
    .replace(/[×＊·]/g, '*')
    .replace(/／/g, '/')
    .replace(/＾/g, '^')
    .replace(/[Ｓｓ]/g, 's')
    .replace(/S/g, 's')
    .trim()
}

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))
    if (m) {
      tokens.push({ t: 'num', v: parseFloat(m[0]) })
      i += m[0].length
      continue
    }
    if (ch === 's') {
      tokens.push({ t: 's' })
      i++
      continue
    }
    if ('+-*/^()'.indexOf(ch) >= 0) {
      tokens.push({ t: ch })
      i++
      continue
    }
    throw new Error('无法识别的字符 “' + ch + '”')
  }
  return tokens
}

function parseExpression(src) {
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function expr() {
    let left = term()
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t
      const right = term()
      left = op === '+' ? P.add(left, right) : P.sub(left, right)
    }
    return left
  }

  function term() {
    let left = unary()
    for (;;) {
      const tk = peek()
      if (!tk) break
      if (tk.t === '*') {
        next()
        left = P.mul(left, unary())
      } else if (tk.t === '/') {
        next()
        const d = unary()
        if (P.degree(d) > 0) throw new Error('只支持除以常数，传递函数请分别填写分子与分母')
        const k = P.trim(d)[0]
        if (k === 0) throw new Error('除数不能为 0')
        left = P.scale(left, 1 / k)
      } else if (tk.t === 'num' || tk.t === 's' || tk.t === '(') {
        // 隐式乘法：2s、s(s+1)、(s+1)(s+2)
        left = P.mul(left, unary())
      } else {
        break
      }
    }
    return left
  }

  function unary() {
    const tk = peek()
    if (tk && tk.t === '-') {
      next()
      return P.scale(unary(), -1)
    }
    if (tk && tk.t === '+') {
      next()
      return unary()
    }
    return power()
  }

  function power() {
    const base = primary()
    if (peek() && peek().t === '^') {
      next()
      const e = next()
      if (!e || e.t !== 'num' || !Number.isInteger(e.v) || e.v < 0 || e.v > 30) {
        throw new Error('幂次必须是 0~30 的整数')
      }
      return P.pow(base, e.v)
    }
    return base
  }

  function primary() {
    const tk = next()
    if (!tk) throw new Error('表达式不完整')
    if (tk.t === 'num') return [tk.v]
    if (tk.t === 's') return [1, 0]
    if (tk.t === '(') {
      const v = expr()
      const close = next()
      if (!close || close.t !== ')') throw new Error('括号不匹配')
      return v
    }
    throw new Error('表达式有误，位置附近出现 “' + tk.t + '”')
  }

  const result = expr()
  if (pos < tokens.length) throw new Error('表达式有误，多余的 “' + tokens[pos].t + '”')
  return P.trim(result)
}

function parsePoly(str) {
  const src = normalize(str)
  if (!src) throw new Error('多项式不能为空')
  let p
  if (/s/.test(src)) {
    p = parseExpression(src)
  } else if (/^[-+]?(\d|\.\d)[\d.eE+\-]*([\s,]+[-+]?(\d|\.\d)[\d.eE+\-]*)*$/.test(src)) {
    p = src.split(/[\s,]+/).filter(Boolean).map(Number)
    if (p.some(v => !isFinite(v))) throw new Error('系数中含有非法数字')
    p = P.trim(p)
  } else {
    p = parseExpression(src)
  }
  if (p.every(v => v === 0)) throw new Error('多项式不能全为 0')
  return p
}

module.exports = { parsePoly, normalize }
