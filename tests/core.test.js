// 核心算法单元测试：node tests/core.test.js
const assert = require('assert')
const P = require('../utils/poly')
const { parsePoly } = require('../utils/parse')
const ctl = require('../utils/control')
const { routh } = require('../utils/routh')
const { rootLocus } = require('../utils/rlocus')
const F = require('../utils/format')
const D = require('../utils/design')
const S = require('../utils/ss')

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    failed++
    console.log('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e))
  }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，实际 ${a}`)
const sortRe = rs => rs.map(r => r.re).sort((a, b) => a - b)

console.log('解析')
test('系数列表', () => assert.deepStrictEqual(parsePoly('1 3 2'), [1, 3, 2]))
test('中文逗号', () => assert.deepStrictEqual(parsePoly('1，3，2'), [1, 3, 2]))
test('表达式', () => assert.deepStrictEqual(parsePoly('s^2+3s+2'), [1, 3, 2]))
test('因式乘积', () => assert.deepStrictEqual(parsePoly('(s+1)(s+2)'), [1, 3, 2]))
test('s(s+1)^2', () => assert.deepStrictEqual(parsePoly('s(s+1)^2'), [1, 2, 1, 0]))
test('常数倍与小数', () => assert.deepStrictEqual(parsePoly('10*(0.5s+1)'), [5, 10]))
test('负号', () => assert.deepStrictEqual(parsePoly('-s^2+4'), [-1, 0, 4]))
test('科学计数', () => assert.deepStrictEqual(parsePoly('1e-3 1'), [0.001, 1]))
test('单个常数', () => assert.deepStrictEqual(parsePoly('5'), [5]))
test('大写 S', () => assert.deepStrictEqual(parsePoly('S+1'), [1, 1]))
test('非法输入报错', () => assert.throws(() => parsePoly('s+x')))
test('括号不匹配报错', () => assert.throws(() => parsePoly('(s+1')))

console.log('多项式求根')
test('二次实根', () => assert.deepStrictEqual(sortRe(P.roots([1, 3, 2])), [-2, -1]))
test('三次', () => {
  const r = sortRe(P.roots([1, 6, 11, 6]))
  ;[-3, -2, -1].forEach((v, i) => near(r[i], v, 1e-9))
})
test('复根', () => {
  const r = P.roots([1, 2, 5])
  near(r[0].re, -1, 1e-12)
  near(Math.abs(r[0].im), 2, 1e-12)
})
test('高阶随机多项式回代', () => {
  const rs = [-1, -2.5, 0.3, -4].map(v => ({ re: v, im: 0 })).concat([{ re: -0.5, im: 3 }, { re: -0.5, im: -3 }])
  const p = P.fromRoots(rs)
  P.roots(p).forEach(r => {
    const v = P.evalComplex(p, r)
    assert.ok(Math.hypot(v.re, v.im) < 1e-8)
  })
})
test('零根', () => {
  const r = P.roots([1, 1, 0, 0])
  assert.strictEqual(r.filter(x => x.re === 0 && x.im === 0).length, 2)
})

console.log('时域响应')
test('一阶阶跃 1/(s+1)', () => {
  const G = ctl.makeTF([1], [1, 1])
  const r = ctl.step(G, 5, 501)
  near(r.y[100], 1 - Math.exp(-1), 1e-9)
  near(r.y[500], 1 - Math.exp(-5), 1e-9)
})
test('二阶欠阻尼指标与理论一致', () => {
  const zeta = 0.5
  const wn = 2
  const G = ctl.makeTF([wn * wn], [1, 2 * zeta * wn, wn * wn])
  const r = ctl.step(G, 10, 4001)
  const info = ctl.stepInfo(r.t, r.y, ctl.dcGain(G))
  const wd = wn * Math.sqrt(1 - zeta * zeta)
  near(info.overshoot, 100 * Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)), 0.05)
  near(info.peakTime, Math.PI / wd, 0.01)
  assert.ok(info.settlingTime > 3 && info.settlingTime < 4.5)
})
test('正则系统（含直通项）', () => {
  const G = ctl.makeTF([1, 2], [1, 1]) // (s+2)/(s+1) = 1 + 1/(s+1)
  const r = ctl.step(G, 3, 301)
  near(r.y[0], 1, 1e-12)
  near(r.y[300], 2 - Math.exp(-3), 1e-9)
})
test('非正则报错', () => assert.throws(() => ctl.makeTF([1, 0, 0], [1, 1])))
test('脉冲响应 1/(s+1) = e^-t', () => {
  const r = ctl.impulse(ctl.makeTF([1], [1, 1]), 2, 201)
  near(r.y[100], Math.exp(-1), 1e-9)
})
test('斜坡响应 1/(s+1)', () => {
  const r = ctl.ramp(ctl.makeTF([1], [1, 1]), 4, 401)
  near(r.y[400], 4 - 1 + Math.exp(-4), 1e-9)
})
test('稳定性判别', () => {
  assert.strictEqual(ctl.stability(P.roots([1, 2, 1])), 'stable')
  assert.strictEqual(ctl.stability(P.roots([1, 0, 1])), 'marginal')
  assert.strictEqual(ctl.stability(P.roots([1, -1])), 'unstable')
  assert.strictEqual(ctl.stability(P.roots([1, 0, 0])), 'unstable')
})
test('自动仿真时长合理', () => {
  const T = ctl.autoTime(ctl.makeTF([1], [1, 1]))
  assert.ok(T >= 5 && T <= 10)
})

console.log('PID')
test('PI 消除稳态误差', () => {
  const G = ctl.makeTF([1], [1, 3, 2])
  const loop = ctl.pidLoop(G, 2, 1, 0)
  const r = ctl.step(loop.T, 40, 2001)
  near(r.y[2000], 1, 1e-3)
  assert.strictEqual(ctl.stability(ctl.poles(loop.T)), 'stable')
})
test('纯 P 控制稳态误差 = 1/(1+Kp·K)', () => {
  const G = ctl.makeTF([1], [1, 1])
  const loop = ctl.pidLoop(G, 4, 0, 0)
  near(ctl.dcGain(loop.T), 4 / 5, 1e-12)
})
test('PID 控制量初值', () => {
  const G = ctl.makeTF([1], [1, 1])
  const loop = ctl.pidLoop(G, 2, 1, 0.1, 50)
  const r = ctl.step(loop.U, 1, 101)
  near(r.y[0], 2 + 0.1 * 50, 1e-9) // Kp + Kd·N
})

console.log('频域')
test('一阶 Bode 转折频率 -3dB / -45°', () => {
  const G = ctl.makeTF([1], [1, 1])
  const bd = ctl.bode(G, 1, 1, 1)
  near(bd.mag[0], -3.0103, 1e-3)
  near(bd.phase[0], -45, 1e-9)
})
test('积分环节相位 -90°', () => {
  const bd = ctl.bode(ctl.makeTF([1], [1, 0]), 0.1, 10, 50)
  bd.phase.forEach(p => near(p, -90, 1e-9))
})
test('裕度：K/(s(s+1)(s+2))，K=2', () => {
  const G = ctl.makeTF([2], P.mul(P.mul([1, 0], [1, 1]), [1, 2]))
  const bd = ctl.bode(G, 0.01, 100, 3000)
  const m = ctl.margins(G, bd)
  // 相位穿越频率 √2，GM = 20log10(6/2)
  near(m.gm.w, Math.SQRT2, 2e-3)
  near(m.gm.gm, 20 * Math.log10(3), 0.02)
  assert.ok(m.pm.pm > 25 && m.pm.pm < 40)
})
test('裕度：K=6 临界稳定', () => {
  const G = ctl.makeTF([6], P.mul(P.mul([1, 0], [1, 1]), [1, 2]))
  const m = ctl.margins(G, ctl.bode(G, 0.01, 100, 3000))
  near(m.gm.gm, 0, 0.02)
  near(m.pm.pm, 0, 0.5)
})
test('相位展开连续（右半平面复极点）', () => {
  const G = ctl.makeTF([1], [1, -0.2, 4])
  const bd = ctl.bode(G, 0.1, 100, 2000)
  for (let i = 1; i < bd.phase.length; i++) assert.ok(Math.abs(bd.phase[i] - bd.phase[i - 1]) < 30)
})

console.log('劳斯判据')
test('稳定三阶', () => {
  const r = routh([1, 6, 11, 6])
  assert.strictEqual(r.signChanges, 0)
  assert.strictEqual(r.verdict, 'stable')
})
test('不稳定：s^3+s^2+2s+8 有两个右半平面根', () => {
  const r = routh([1, 1, 2, 8])
  assert.strictEqual(r.signChanges, 2)
  assert.strictEqual(r.verdict, 'unstable')
})
test('首元素为零（ε 法）：s^4+s^3+2s^2+2s+3', () => {
  const r = routh([1, 1, 2, 2, 3])
  assert.strictEqual(r.signChanges, 2)
})
test('全零行（辅助多项式）：s^3+2s^2+s+2', () => {
  const r = routh([1, 2, 1, 2])
  assert.strictEqual(r.auxPolys.length, 1)
  assert.strictEqual(r.signChanges, 0)
  assert.strictEqual(r.verdict, 'marginal')
})
test('全零行：s^5+2s^4+24s^3+48s^2-25s-50', () => {
  const r = routh([1, 2, 24, 48, -25, -50])
  assert.strictEqual(r.auxPolys.length, 1)
  assert.strictEqual(r.signChanges, 1)
})

console.log('根轨迹')
test('K/(s(s+1)(s+2))：渐近线、分离点、临界增益', () => {
  const G = ctl.makeTF([1], P.mul(P.mul([1, 0], [1, 1]), [1, 2]))
  const rl = rootLocus(G)
  near(rl.centroid, -1, 1e-9)
  assert.deepStrictEqual(rl.asymAngles, [60, 180, 300])
  assert.strictEqual(rl.breakaway.length, 1)
  near(rl.breakaway[0].s, -1 + 1 / Math.sqrt(3), 1e-6)
  assert.strictEqual(rl.crossings.length, 1)
  near(rl.crossings[0].K, 6, 1e-4)
  near(rl.crossings[0].w, Math.SQRT2, 1e-4)
  near(rl.intervals[0][0], 0, 0)
  near(rl.intervals[0][1], 6, 1e-4)
  assert.strictEqual(rl.branches.length, 3)
})
test('出射角：1/(s^2+2s+2)', () => {
  const G = ctl.makeTF([1], [1, 2, 2])
  const rl = rootLocus(G)
  const d = rl.departure.find(x => x.at.im > 0)
  near(d.angle, 90, 1e-6)
})
test('分支连续（无跳变）', () => {
  const G = ctl.makeTF([1, 3], P.mul([1, 0], [1, 2, 2]))
  const rl = rootLocus(G)
  rl.branches.forEach(b => {
    for (let i = 1; i < b.length; i++) {
      const d = Math.hypot(b[i].re - b[i - 1].re, b[i].im - b[i - 1].im)
      assert.ok(d < 0.1 * Math.max(rl.R, Math.hypot(b[i - 1].re, b[i - 1].im)) + 1e-9, '跳变 ' + d)
    }
  })
})

console.log('校正设计')
const marginsOf = G => ctl.margins(G, ctl.bode(G, null, null, 2000))
const designCase = (num, den, K, opts) => {
  const r = D.design(ctl.makeTF(P.scale(num, K), den), opts)
  return { r, mg: r.Lc ? marginsOf(r.Lc) : null }
}
test('超前：10/(s(s+1))，γ ≥ 45°', () => {
  const { r, mg } = designCase([1], [1, 1, 0], 10, { pm: 45 })
  assert.strictEqual(r.method, 'lead')
  near(mg.pm.pm, 45, 0.05)
  near(mg.pm.w, r.lead.wc, 1e-3 * r.lead.wc, 'ωc = ωm')
  // 超前环节在 ωm 处的相角等于 φm，幅值等于 √a
  const g = ctl.freqResp(r.Gc, r.lead.wc)
  near(Math.atan2(g.im, g.re) * 180 / Math.PI, r.lead.phim, 1e-9)
  near(Math.hypot(g.re, g.im), Math.sqrt(r.lead.a), 1e-9)
})
test('滞后：5/(s(s+1)(0.5s+1))，γ ≥ 40°（超前不可行时自动改用滞后）', () => {
  const { r, mg } = designCase([1], P.mul([1, 1, 0], [0.5, 1]), 5, { pm: 40 })
  assert.strictEqual(r.method, 'lag')
  assert.ok(!r.tried[0].ok)
  near(mg.pm.pm, 40, 0.05)
  assert.ok(r.lag.b < 1 && r.lag.b > 0)
  near(r.lag.wz, r.lag.wc / D.LAG_RATIO, 1e-12)
  near(ctl.dcGain(r.Gc), 1, 1e-12, '滞后校正不改变静态增益')
})
test('滞后-超前：20/(s(s+1)(s+2))，γ ≥ 50°，ωc 取 ωg = √2', () => {
  const { r, mg } = designCase([1], P.mul([1, 1, 0], [1, 2]), 20, { pm: 50, method: 'laglead' })
  assert.strictEqual(r.method, 'laglead')
  near(r.wc, Math.SQRT2, 1e-6)
  near(mg.pm.pm, 50, 0.05)
  near(mg.pm.w, Math.SQRT2, 1e-4)
  assert.strictEqual(ctl.stability(ctl.poles(ctl.feedback(r.Lc))), 'stable')
})
test('Ⅱ 型对象无相位穿越时滞后-超前仍可设计', () => {
  const { r, mg } = designCase([1], P.mul([1, 0, 0], [0.1, 1]), 10, { pm: 35 })
  assert.strictEqual(r.method, 'laglead')
  near(mg.pm.pm, 35, 0.05)
})
test('指定 ωc', () => {
  const { r, mg } = designCase([1], P.mul([1, 0], P.mul([0.1, 1], [0.001, 1])), 1000, { pm: 45, wc: 165 })
  assert.ok(r.ok)
  near(mg.pm.w, 165, 0.05)
  assert.ok(mg.pm.pm >= 44.5)
})
test('已满足要求时无需校正', () => {
  const { r } = designCase([1], [1, 1, 0], 1, { pm: 45 })
  assert.strictEqual(r.method, 'none')
})
test('误差系数与型别', () => {
  const tg = D.typeAndGain(ctl.makeTF([2], P.mul([1, 0, 0], [1, 4])))
  assert.strictEqual(tg.nu, 2)
  near(tg.k0, 0.5, 1e-12)
})

console.log('状态空间')
const pendA = [[0, 1, 0, 0], [20.601, 0, 0, 0], [0, 0, 0, 1], [-0.4905, 0, 0, 0]]
const pendB = [0, -1, 0, 0.5]
const eigOf = M => S.eig(M).sort((a, b) => a.re - b.re || a.im - b.im)
test('矩阵与极点解析', () => {
  assert.deepStrictEqual(S.parseMatrix('0 1; -2 -3', 'A'), [[0, 1], [-2, -3]])
  assert.deepStrictEqual(S.parseMatrix('0，1\n-2，-3', 'A'), [[0, 1], [-2, -3]])
  assert.deepStrictEqual(S.parseVector('0; 1', 'B', 2), [0, 1])
  assert.deepStrictEqual(S.parsePoles('-1±2j, -3', 'p', 3), [{ re: -1, im: 2 }, { re: -1, im: -2 }, { re: -3, im: 0 }])
  assert.strictEqual(S.parsePoles('-1 + j2', 'p', 2)[1].im, -2, '共轭自动补全')
  assert.throws(() => S.parsePoles('-1, -2', 'p', 3))
  assert.throws(() => S.parseMatrix('1 2; 3', 'A'))
})
test('传递函数（Faddeev–LeVerrier）', () => {
  const tf = S.ssToTF({ A: [[0, 1, 0], [0, 0, 1], [-6, -11, -6]], B: [0, 0, 1], C: [10, 1, 0], D: 2 })
  assert.deepStrictEqual(tf.den, [1, 6, 11, 6])
  ;[2, 12, 23, 22].forEach((v, i) => near(tf.num[i], v, 1e-9))
})
test('能控/能观秩判据与 PBH', () => {
  const A = [[-1, 0], [0, -2]]
  assert.strictEqual(S.rank(S.ctrbMatrix(A, [1, 0])), 1)
  assert.strictEqual(S.rank(S.obsvMatrix(A, [1, 1])), 2)
  const m = S.pbh(A, [1, 0], [1, 1], S.eig(A))
  assert.strictEqual(m.uncontrollable.length, 1)
  near(m.uncontrollable[0].re, -2, 1e-12)
  assert.strictEqual(m.unobservable.length, 0)
  assert.strictEqual(S.rank(S.ctrbMatrix(pendA, pendB)), 4)
})
test('Ackermann：倒立摆（Ogata 例题 K = [−298.15, −60.70, −163.09, −73.39]）', () => {
  const ps = S.parsePoles('-2±3.464j, -10, -10', 'p', 4)
  const K = S.acker(pendA, pendB, ps)
  ;[-298.15, -60.697, -163.09, -73.393].forEach((v, i) => near(K[i], v, 0.01))
  const Acl = pendA.map((r, i) => r.map((v, j) => v - pendB[i] * K[j]))
  const e = eigOf(Acl)
  near(e[0].re, -10, 1e-5)
  near(e[3].re, -2, 1e-9)
  near(Math.abs(e[3].im), 3.464, 1e-9)
})
test('观测器极点', () => {
  const A = [[0, 1, 0], [0, 0, 1], [-6, -11, -6]]
  const Cv = [1, 0, 0]
  const Lg = S.observerGain(A, Cv, [-15, -16, -17].map(v => ({ re: v, im: 0 })))
  const e = eigOf(A.map((r, i) => r.map((v, j) => v - Lg[i] * Cv[j])))
  ;[-17, -16, -15].forEach((v, i) => near(e[i].re, v, 1e-6))
})
test('状态空间仿真与传递函数仿真一致', () => {
  const sys = { A: [[0, 1], [-4, -1.2]], B: [0, 4], C: [1, 0], D: 0 }
  const u = new Array(501).fill(1)
  const y1 = S.simulate(sys, u, 0.02).y
  const y2 = ctl.step(ctl.makeTF([4], [1, 1.2, 4]), 10, 501).y
  y1.forEach((v, i) => near(v, y2[i], 1e-9))
})

console.log('格式化')
test('fmt', () => {
  assert.strictEqual(F.fmt(1.23456), '1.235')
  assert.strictEqual(F.fmt(Infinity), '∞')
  assert.strictEqual(F.fmt(0.0001234), '1.234e-4')
})
test('polyStr', () => {
  assert.strictEqual(F.polyStr([1, 3, 2]), 's^2 + 3s + 2')
  assert.strictEqual(F.polyStr([-1, 0, 4]), '-s^2 + 4')
  assert.strictEqual(F.polyStr([1]), '1')
})
test('fmtC', () => assert.strictEqual(F.fmtC({ re: -1, im: -2 }), '-1 - j2'))

console.log(`\n${passed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
