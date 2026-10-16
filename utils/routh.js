// 劳斯（Routh）稳定判据

const P = require('./poly')

function routh(polyIn) {
  const p = P.trim(polyIn)
  const n = p.length - 1
  const notes = []
  if (n < 1) throw new Error('特征多项式至少为 1 阶')
  if (p[0] < 0) {
    notes.push('首项系数为负，已整体乘以 -1（不影响根的分布）')
  }
  const a = p[0] < 0 ? p.map(v => -v) : p.slice()
  const width = Math.floor(n / 2) + 1
  const scale = P.maxAbs(a)
  const tol = 1e-10 * scale
  const rows = []
  const flags = [] // 每行的标记：'' | 'eps' | 'aux'
  const r0 = new Array(width).fill(0)
  const r1 = new Array(width).fill(0)
  for (let i = 0; i <= n; i++) {
    if (i % 2 === 0) r0[i / 2] = a[i]
    else r1[(i - 1) / 2] = a[i]
  }
  rows.push(r0, r1)
  flags.push('', '')
  const eps = 1e-6 * scale
  const auxPolys = []
  const epsCells = {}

  for (let i = 1; i <= n; i++) {
    const row = rows[i]
    if (row.every(v => Math.abs(v) <= tol)) {
      // 全零行：用上一行构造辅助多项式并求导替换
      const order = n - (i - 1)
      const prev = rows[i - 1]
      const aux = new Array(order + 1).fill(0)
      for (let k = 0; 2 * k <= order; k++) aux[2 * k] = prev[k]
      auxPolys.push({ order, poly: aux, roots: P.roots(aux) })
      for (let k = 0; k < width; k++) row[k] = 2 * k <= order ? prev[k] * (order - 2 * k) : 0
      flags[i] = 'aux'
      notes.push('s^' + (n - i) + ' 行全为零：用辅助多项式 A(s) 的导数系数代替，系统存在关于原点对称的根')
    }
    if (Math.abs(row[0]) <= tol) {
      row[0] = eps
      epsCells[i] = true
      flags[i] = flags[i] || 'eps'
      notes.push('s^' + (n - i) + ' 行首元素为零：以小正数 ε 代替继续计算')
    }
    if (i < n) {
      const prev = rows[i - 1]
      const next = new Array(width).fill(0)
      for (let j = 0; j < width - 1; j++) {
        const v = (row[0] * prev[j + 1] - prev[0] * row[j + 1]) / row[0]
        next[j] = Math.abs(v) <= tol ? 0 : v
      }
      rows.push(next)
      flags.push('')
    }
  }

  const first = rows.map(r => r[0])
  let changes = 0
  for (let i = 1; i < first.length; i++) {
    if (first[i] * first[i - 1] < 0) changes++
  }
  let axisRoots = 0
  auxPolys.forEach(ap => {
    ap.roots.forEach(r => {
      if (Math.abs(r.re) < 1e-6 * Math.max(1, Math.hypot(r.re, r.im))) axisRoots++
    })
  })
  const allRoots = P.roots(a)
  let verdict
  if (changes > 0) verdict = 'unstable'
  else if (auxPolys.length > 0 || Object.keys(epsCells).length > 0) verdict = axisRoots > 0 ? 'marginal' : 'stable'
  else verdict = 'stable'
  // 缺项或系数变号的必要条件提示
  const hasNonPos = a.some(v => v <= 0)
  if (hasNonPos) notes.unshift('系数中存在零或负值，不满足稳定的必要条件（所有系数同号且不缺项）')
  return {
    n,
    rows,
    flags,
    epsCells,
    firstColumn: first,
    signChanges: changes,
    rhpCount: changes,
    axisRoots,
    auxPolys,
    verdict,
    notes,
    roots: allRoots
  }
}

module.exports = { routh }
