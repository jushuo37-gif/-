// 生成浏览器预览页：把 utils/ 打包进单个 HTML，渲染各页面的图表，便于在电脑上检查绘图效果
// 用法：node tools/build-preview.js [输出文件，默认 preview.html]
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const out = path.resolve(process.argv[2] || path.join(root, 'preview.html'))
const dir = path.join(root, 'utils')
const mods = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.js'))
  .map(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8')
    return JSON.stringify('./' + f.replace(/\.js$/, '')) + ': function (module, exports, require) {\n' + src + '\n}'
  })

const loader = `
const __defs = {${mods.join(',\n')}};
const __cache = {};
function __req(name) {
  const key = './' + name.split('/').pop().replace(/\\.js$/, '');
  if (__cache[key]) return __cache[key].exports;
  const m = { exports: {} };
  __cache[key] = m;
  __defs[key](m, m.exports, __req);
  return m.exports;
}
`

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>控制工程助手 图表预览</title>
<style>
body { margin: 0; background: #f3f4f6; font: 14px sans-serif; color: #111827; }
.grid { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; }
.cell { background: #fff; border-radius: 8px; padding: 8px; }
.cell h3 { margin: 0 0 4px; font-size: 13px; color: #1e3a8a; }
canvas { display: block; }
pre { font-size: 11px; max-width: 360px; white-space: pre-wrap; margin: 4px 0 0; color: #374151; }
</style></head><body><div class="grid" id="g"></div>
<script>${loader}
const V = __req('views');
const chart = __req('chart');
function add(title, opts, info, w, h) {
  w = w || 360; h = h || 240;
  const cell = document.createElement('div'); cell.className = 'cell';
  const t = document.createElement('h3'); t.textContent = title; cell.appendChild(t);
  const c = document.createElement('canvas'); const dpr = window.devicePixelRatio || 1;
  c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); cell.appendChild(c);
  if (info) { const p = document.createElement('pre'); p.textContent = info; cell.appendChild(p); }
  document.getElementById('g').appendChild(cell);
  chart.draw(ctx, w, h, opts);
}
const fmtM = ms => (ms || []).map(m => m.label + '：' + m.value).join('\\n');
V.TF_PRESETS.slice(0, 3).forEach(p => {
  const r = V.analyzeTF(p);
  add('时域 ' + p.name, Object.assign({}, r.chart, { cursor: r.chart.series[0].x[200] }), fmtM(r.metrics));
});
let r = V.analyzeTF({ num: '1', den: 's+1', type: 'ramp' }); add('斜坡', r.chart, fmtM(r.metrics));
r = V.analyzeTF({ num: '-s+1', den: 's^2+2s+1', type: 'impulse' }); add('脉冲 非最小相位', r.chart);
r = V.analyzeSecond({ zeta: 0.4, wn: 2, compare: true }); add('二阶对比', r.chart); add('二阶极点', r.poleChart, '', 360, 200);
V.PID_PRESETS.slice(0, 2).forEach(p => {
  const r = V.analyzePID(Object.assign({ N: 100 }, p));
  add('PID ' + p.name, r.chartY, fmtM(r.metrics)); add('PID u ' + p.name, r.chartU, '', 360, 170);
});
r = V.analyzePID({ num: '1', den: '(s+1)^3', Kp: 20, Ki: 5, Kd: 0 }); add('PID 不稳定', r.chartY, r.stability);
V.BODE_PRESETS.forEach(p => {
  const r = V.analyzeBode(p);
  add('Bode 幅频 ' + p.name, r.chartMag, fmtM(r.metrics), 360, 210); add('Bode 相频 ' + p.name, r.chartPhase, '', 360, 210); add('Nyquist ' + p.name, r.chartNyquist, '', 360, 300);
});
V.RL_PRESETS.forEach(p => {
  const a = V.analyzeRlocus(p); const k = V.rlocusAtK(a.G, a.rl, p.K);
  add('根轨迹 ' + p.name, k.chart, fmtM(a.metrics) + '\\nK=' + p.K + ' 闭环极点：' + k.closedPoles, 360, 320);
});
V.DESIGN_PRESETS.forEach(p => {
  const r = V.analyzeDesign(p);
  const info = r.method + '  K = ' + r.K + '\\nGc = ' + r.gc.num + ' / ' + r.gc.den + '\\n' + r.steps.join('\\n') + '\\n' + r.rows.map(x => x.label + '：' + x.a + ' → ' + x.b).join('\\n');
  add('校正 幅频 ' + p.name, r.chartMag, info, 360, 230); add('校正 相频 ' + p.name, r.chartPhase, '', 360, 210); add('校正 阶跃 ' + p.name, r.chartStep, '', 360, 240);
});
V.SS_PRESETS.forEach(p => {
  const r = V.analyzeSS(p);
  const info = '特征值：' + r.eigs + '\\nrank Qc = ' + r.ctrb.rank + '，rank Qo = ' + r.obsv.rank + (r.K ? '\\nK = ' + r.K + '\\nNr = ' + r.Nr : '') + (r.L ? '\\nL = ' + r.L : '') + (r.notes.length ? '\\n' + r.notes.join('\\n') : '');
  add('状态空间 ' + p.name, r.chartY, info, 360, 240); if (r.chartE) add('估计误差 ' + p.name, r.chartE, '', 360, 200);
});
document.title = 'ready';
</script></body></html>`
fs.writeFileSync(out, html)
console.log('已生成 ' + out)
