const V = require('../../utils/views')
const base = require('../../utils/page')
const throttle = require('../../utils/throttle')
const ctl = require('../../utils/control')

function niceMax(v, cur) {
  return v > cur ? ctl.niceCeil(v * 1.5) : cur
}

Page(
  Object.assign({}, base, {
    data: {
      presets: V.PID_PRESETS,
      num: '1',
      den: '(s+1)(s+2)',
      tEnd: '',
      N: '100',
      gains: [
        { key: 'Kp', value: 5, max: 20 },
        { key: 'Ki', value: 3, max: 10 },
        { key: 'Kd', value: 0.5, max: 5 }
      ],
      error: '',
      res: null
    },

    onLoad() {
      this.runLive = throttle(() => this.run(true), 60)
    },

    onReady() {
      this.run(false)
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      const gains = this.data.gains.map(g => {
        const v = p[g.key]
        return { key: g.key, value: v, max: niceMax(v, { Kp: 20, Ki: 10, Kd: 5 }[g.key]) }
      })
      this.setData({ num: p.num, den: p.den, tEnd: '', gains })
      this.run(false)
    },

    // 滑条值按 max 的 1/200 步进
    onSlide(e) {
      const i = e.currentTarget.dataset.index
      const g = this.data.gains[i]
      const v = Number(((e.detail.value / 200) * g.max).toPrecision(4))
      this.setData({ ['gains[' + i + '].value']: v })
      this.runLive()
    },

    onGainInput(e) {
      const i = e.currentTarget.dataset.index
      const raw = e.detail.value
      const v = Number(raw)
      if (raw === '' || !isFinite(v)) return
      const g = this.data.gains[i]
      this.setData({ ['gains[' + i + '].value']: v, ['gains[' + i + '].max']: niceMax(Math.abs(v), g.max) })
      this.run(true)
    },

    reset() {
      this.run(false)
    },

    // live = true 时沿用当前仿真时长，避免拖动时坐标跳动
    run(live) {
      const g = {}
      this.data.gains.forEach(x => {
        g[x.key] = x.value
      })
      const tEnd = this.data.tEnd || (live && this.fixedT) || ''
      try {
        const r = V.analyzePID({ num: this.data.num, den: this.data.den, Kp: g.Kp, Ki: g.Ki, Kd: g.Kd, N: this.data.N, tEnd })
        if (!live || !this.fixedT) this.fixedT = r.tEnd
        const cy = r.chartY
        const cu = r.chartU
        delete r.chartY
        delete r.chartU
        this.setData({ res: r, error: '' })
        this.plot('cy', cy, live)
        this.plot('cu', cu, live)
      } catch (e) {
        this.showError(e)
      }
    }
  })
)
