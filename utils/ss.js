// 状态空间（单输入单输出）：能控性/能观性（秩判据 + PBH 检验）、传递函数、
// Ackermann 极点配置、全维状态观测器、带观测器的闭环仿真

const P = require('./poly')
const C = require('./complex')
const L = require('./linalg')
const ctl = require('./control')
const { normalize } = require('./parse')

// ---------- 解析 ----------

// "0 1; -2 -3" 或多行；行内用空格/逗号分隔
function parseMatrix(str, name) {
  // normalize 会把分号换成逗号，所以先按行切开
  const rows = String(str || '')
    .split(/[;；\n]/)
    .map(r => normalize(r))
    .filter(Boolean)
    .map(r => r.split(/[\s,]+/).filter(Boolean).map(Number))
  if (!rows.length) throw new Error(name + '不能为空')
  rows.forEach(r => {
    if (r.some(v => !isFinite(v))) throw new Error(name + '中含有非法数字')
    if (r.length !== rows[0].length) throw new Error(name + '各行元素个数不一致')
  })
  return rows
}

function parseVector(str, name, n) {
  const m = parseMatrix(str, name)
  const v = m.length === 1 ? m[0] : m[0].length === 1 ? m.map(r => r[0]) : null
  if (!v) throw new Error(name + '应为向量')
  if (v.length !== n) throw new Error(name + '应有 ' + n + ' 个元素（与 A 的阶数一致），实际 ' + v.length + ' 个')
  return v
}

const NUM = '(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+-]?\\d+)?'
const RE_CPLX = new RegExp('^([+-]?' + NUM + ')([±+-])(' + NUM + ')?\\*?j$', 'i')
const RE_IMAG = new RegExp('^(±|[+-]?)(' + NUM + ')?\\*?j$', 'i')

// 期望极点："-2, -1±2j, -3+j" 等；只写了一半的共轭复根自动补全
function parsePoles(str, name, n) {
  const src = normalize(str)
    .replace(/\+-|-\+/g, '±')
    .replace(/[iｊＪJ]/g, 'j')
    .replace(/\s*([±])\s*/g, '$1')
    .replace(/(\d)\s*([+-])\s*(?=(?:\d|\.)[\d.]*\s*\*?j|j)/g, '$1$2')
    .replace(/j\s*(\d+\.?\d*|\.\d+)/g, '$1j')
  const tokens = src.split(/[\s,;]+/).filter(Boolean)
  if (!tokens.length) throw new Error(name + '不能为空')
  const out = []
  tokens.forEach(tk => {
    let m = RE_CPLX.exec(tk)
    if (m) {
      const re = Number(m[1])
      const im = m[3] === undefined ? 1 : Number(m[3])
      if (m[2] === '±') out.push(C.c(re, im), C.c(re, -im))
      else out.push(C.c(re, m[2] === '-' ? -im : im))
      return
    }
    m = RE_IMAG.exec(tk)
    if (m) {
      const im = m[2] === undefined ? 1 : Number(m[2])
      if (m[1] === '±') out.push(C.c(0, im), C.c(0, -im))
      else out.push(C.c(0, m[1] === '-' ? -im : im))
      return
    }
    const v = Number(tk)
    if (!isFinite(v)) throw new Error(name + '中无法识别 “' + tk + '”')
    out.push(C.c(v, 0))
  })
  // 补全共轭
  const used = out.map(() => false)
  const res = []
  out.forEach((p, i) => {
    if (used[i]) return
    used[i] = true
    res.push(p)
    if (p.im === 0) return
    const j = out.findIndex((q, k) => !used[k] && Math.abs(q.re - p.re) < 1e-12 && Math.abs(q.im + p.im) < 1e-12)
    if (j >= 0) used[j] = true
    res.push(C.c(p.re, -p.im))
  })
  if (res.length !== n) throw new Error(name + '应有 ' + n + ' 个（复数极点按共轭对计 2 个），实际 ' + res.length + ' 个')
  return res
}

// ---------- 线性代数 ----------

const toC = M => M.map(r => r.map(v => (typeof v === 'number' ? C.c(v, 0) : v)))

// 复矩阵的秩（部分主元高斯消元）；先把各列归一化，避免 A^k 量级差异影响判定
function rank(Min, tol) {
  tol = tol || 1e-9
  const M = toC(Min).map(r => r.slice())
  const rows = M.length
  const cols = M[0].length
  for (let j = 0; j < cols; j++) {
    let nrm = 0
    for (let i = 0; i < rows; i++) nrm = Math.max(nrm, C.abs(M[i][j]))
    if (nrm > 0) for (let i = 0; i < rows; i++) M[i][j] = C.scale(M[i][j], 1 / nrm)
  }
  let r = 0
  for (let j = 0; j < cols && r < rows; j++) {
    let piv = r
    for (let i = r + 1; i < rows; i++) if (C.abs(M[i][j]) > C.abs(M[piv][j])) piv = i
    if (C.abs(M[piv][j]) <= tol) continue
    ;[M[r], M[piv]] = [M[piv], M[r]]
    for (let i = r + 1; i < rows; i++) {
      const f = C.div(M[i][j], M[r][j])
      for (let k = j; k < cols; k++) M[i][k] = C.sub(M[i][k], C.mul(f, M[r][k]))
    }
    r++
  }
  return r
}

// 解 M x = b（实数，部分主元）
function solve(Min, bIn) {
  const n = Min.length
  const M = Min.map((r, i) => r.concat([bIn[i]]))
  let scale = 0
  Min.forEach(r => r.forEach(v => (scale = Math.max(scale, Math.abs(v)))))
  for (let j = 0; j < n; j++) {
    let piv = j
    for (let i = j + 1; i < n; i++) if (Math.abs(M[i][j]) > Math.abs(M[piv][j])) piv = i
    if (Math.abs(M[piv][j]) <= 1e-13 * scale) throw new Error('矩阵奇异')
    ;[M[j], M[piv]] = [M[piv], M[j]]
    for (let i = 0; i < n; i++) {
      if (i === j) continue
      const f = M[i][j] / M[j][j]
      if (f !== 0) for (let k = j; k <= n; k++) M[i][k] -= f * M[j][k]
    }
  }
  return M.map((r, i) => r[n] / r[i])
}

const transpose = M => M[0].map((_, j) => M.map(r => r[j]))
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)

// 矩阵多项式 φ(A) = A^n + c1 A^(n-1) + ... + cn I（Horner）
function polyMat(p, A) {
  const n = A.length
  let R = L.zeros(n, n)
  p.forEach(c => {
    R = L.matMul(R, A)
    for (let i = 0; i < n; i++) R[i][i] += c
  })
  return R
}

// Faddeev–LeVerrier：同时得到特征多项式与 adj(sI − A)
function leverrier(A) {
  const n = A.length
  let N = L.identity(n)
  const c = [1]
  const Ns = [N]
  for (let k = 1; k <= n; k++) {
    const AN = L.matMul(A, N)
    let tr = 0
    for (let i = 0; i < n; i++) tr += AN[i][i]
    const ck = -tr / k
    c.push(ck)
    if (k < n) {
      N = AN.map((r, i) => r.map((v, j) => v + (i === j ? ck : 0)))
      Ns.push(N)
    }
  }
  return { charPoly: c, adj: Ns }
}

// G(s) = C (sI − A)^-1 B + D
function ssToTF(sys) {
  const { charPoly, adj } = leverrier(sys.A)
  const num = adj.map(N => dot(sys.C, L.matVec(N, sys.B)))
  return { num: P.add([0].concat(num), P.scale(charPoly, sys.D)), den: charPoly }
}

function ctrbMatrix(A, B) {
  const cols = [B]
  for (let k = 1; k < A.length; k++) cols.push(L.matVec(A, cols[k - 1]))
  return transpose(cols)
}

function obsvMatrix(A, Cv) {
  const rows = [Cv]
  const At = transpose(A)
  for (let k = 1; k < A.length; k++) rows.push(L.matVec(At, rows[k - 1]))
  return rows
}

function distinct(rs) {
  const out = []
  rs.forEach(r => {
    if (!out.some(q => C.abs(C.sub(q, r)) < 1e-6 * Math.max(1, C.abs(r)))) out.push(r)
  })
  return out
}

// PBH 检验：rank[λI − A, B] < n 的特征值是不能控模态；rank[λI − A; C] < n 的是不能观模态
function pbh(A, B, Cv, eigs) {
  const n = A.length
  const sIA = lam => A.map((r, i) => r.map((v, j) => C.sub(i === j ? lam : C.c(0, 0), C.c(v, 0))))
  const unc = []
  const uno = []
  distinct(eigs).forEach(lam => {
    const M = sIA(lam)
    if (rank(M.map((r, i) => r.concat([C.c(B[i], 0)])), 1e-6) < n) unc.push(lam)
    if (rank(M.concat([Cv.map(v => C.c(v, 0))]), 1e-6) < n) uno.push(lam)
  })
  return { uncontrollable: unc, unobservable: uno }
}

// Ackermann：K = [0 … 0 1] Qc^-1 φ(A)
function acker(A, B, poles) {
  const n = A.length
  const Qc = ctrbMatrix(A, B)
  const en = new Array(n).fill(0)
  en[n - 1] = 1
  const w = solve(transpose(Qc), en)
  const phi = polyMat(P.fromRoots(poles), A)
  return transpose(phi).map(col => dot(w, col))
}

// 观测器：L = φ(A) Qo^-1 [0 … 0 1]^T
function observerGain(A, Cv, poles) {
  const n = A.length
  const en = new Array(n).fill(0)
  en[n - 1] = 1
  const v = solve(obsvMatrix(A, Cv), en)
  return L.matVec(polyMat(P.fromRoots(poles), A), v)
}

function eig(A) {
  return P.roots(leverrier(A).charPoly)
}

// 状态空间仿真（零阶保持精确离散化），返回输出与状态轨迹
function simulate(sys, u, dt, x0) {
  const n = sys.A.length
  const d = ctl.discretize({ A: sys.A, B: sys.B, n }, dt)
  let x = x0 ? x0.slice() : new Array(n).fill(0)
  const y = []
  const xs = []
  for (let k = 0; k < u.length; k++) {
    xs.push(x)
    y.push(dot(sys.C, x) + sys.D * u[k])
    const xn = L.matVec(d.Phi, x)
    for (let i = 0; i < n; i++) xn[i] += d.Gam[i] * u[k]
    x = xn
  }
  return { y, x: xs }
}

module.exports = {
  parseMatrix,
  parseVector,
  parsePoles,
  rank,
  solve,
  transpose,
  leverrier,
  ssToTF,
  ctrbMatrix,
  obsvMatrix,
  pbh,
  acker,
  observerGain,
  eig,
  simulate,
  polyMat
}
