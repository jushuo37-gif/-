// 核心算法单元测试：node tests/core.test.js
const assert = require('assert')
const P = require('../utils/poly')
const { parsePoly } = require('../utils/parse')
const ctl = require('../utils/control')
const { routh } = require('../utils/routh')
const { rootLocus } = require('../utils/rlocus')
const F = require('../utils/format')

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
