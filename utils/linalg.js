// 小规模稠密矩阵运算（用于状态空间离散化）

function zeros(n, m) {
  const r = []
  for (let i = 0; i < n; i++) r.push(new Array(m).fill(0))
  return r
}

function identity(n) {
  const r = zeros(n, n)
  for (let i = 0; i < n; i++) r[i][i] = 1
  return r
}

function matMul(A, B) {
  const n = A.length
  const m = B[0].length
  const k = B.length
  const r = zeros(n, m)
  for (let i = 0; i < n; i++) {
    for (let l = 0; l < k; l++) {
      const a = A[i][l]
      if (a === 0) continue
      for (let j = 0; j < m; j++) r[i][j] += a * B[l][j]
    }
  }
  return r
}

function matAdd(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]))
}

function matScale(A, k) {
  return A.map(row => row.map(v => v * k))
}

function norm1(A) {
  let m = 0
  for (let j = 0; j < A[0].length; j++) {
    let s = 0
    for (let i = 0; i < A.length; i++) s += Math.abs(A[i][j])
    m = Math.max(m, s)
  }
  return m
}

// 矩阵指数：缩放与平方 + Taylor 级数
function expm(A) {
  const n = A.length
  const nrm = norm1(A)
  let s = 0
  if (nrm > 0.5) s = Math.max(0, Math.ceil(Math.log2(nrm / 0.5)))
  const As = matScale(A, Math.pow(2, -s))
  let result = identity(n)
  let term = identity(n)
  for (let k = 1; k <= 20; k++) {
    term = matScale(matMul(term, As), 1 / k)
    result = matAdd(result, term)
    if (norm1(term) < 1e-18 * norm1(result)) break
  }
  for (let i = 0; i < s; i++) result = matMul(result, result)
  return result
}

function matVec(A, x) {
  return A.map(row => {
    let s = 0
    for (let j = 0; j < row.length; j++) s += row[j] * x[j]
    return s
  })
}

module.exports = { zeros, identity, matMul, matAdd, matScale, expm, matVec, norm1 }
