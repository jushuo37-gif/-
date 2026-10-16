// 数值与表达式格式化

function fmt(x, digits) {
  digits = digits || 4
  if (x === null || x === undefined || Number.isNaN(x)) return '—'
  if (!isFinite(x)) return x > 0 ? '∞' : '-∞'
  if (Math.abs(x) < 1e-12) return '0'
  const ax = Math.abs(x)
  if (ax >= 1e5 || ax < 1e-3) {
    const s = x.toExponential(digits - 1)
    const parts = s.split('e')
    const mant = String(Number(parts[0]))
    return mant + 'e' + Number(parts[1])
  }
  return String(Number(x.toPrecision(digits)))
}

function fmtC(z, digits) {
  if (Math.abs(z.im) < 1e-12) return fmt(z.re, digits)
  const re = Math.abs(z.re) < 1e-12 ? '' : fmt(z.re, digits)
  const sign = z.im < 0 ? '-' : re ? '+' : ''
  return re + (re ? ' ' + sign + ' ' : sign) + 'j' + fmt(Math.abs(z.im), digits)
}

// 多项式 → 可读字符串
function polyStr(p, v) {
  v = v || 's'
  const n = p.length - 1
  const terms = []
  p.forEach((c, i) => {
    if (c === 0) return
    const pw = n - i
    const ac = Math.abs(c)
    let coef = fmt(ac)
    if (pw > 0 && Math.abs(ac - 1) < 1e-12) coef = ''
    const vs = pw === 0 ? '' : pw === 1 ? v : v + '^' + pw
    const body = coef + vs || '1'
    terms.push({ neg: c < 0, body })
  })
  if (terms.length === 0) return '0'
  return terms
    .map((t, i) => (i === 0 ? (t.neg ? '-' : '') + t.body : (t.neg ? ' - ' : ' + ') + t.body))
    .join('')
}

function rootsStr(rs) {
  if (!rs.length) return '无'
  return rs.map(r => fmtC(r, 4)).join('，')
}

module.exports = { fmt, fmtC, polyStr, rootsStr }
