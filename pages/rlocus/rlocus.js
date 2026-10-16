const V = require('../../utils/views')
const base = require('../../utils/page')
const throttle = require('../../utils/throttle')
const F = require('../../utils/format')

Page(
  Object.assign({}, base, {
    data: {
      presets: V.RL_PRESETS,
      num: '1',
      den: 's(s+1)(s+2)',
      kmax: '',
      K: 2,
      kSlider: 500,
      error: '',
      res: null,
      atK: null
    },

    onLoad() {
      this.updateLive = throttle(this.updateK, 50)
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ num: p.num, den: p.den, K: p.K, kmax: '' })
      this.run()
    },

    run() {
      try {
        const r = V.analyzeRlocus({ num: this.data.num, den: this.data.den, kmax: this.data.kmax })
        this.model = r
        this.setData({
          res: { metrics: r.metrics, tf: r.tf },
          error: '',
          kSlider: this.kToSlider(this.data.K)
        })
        this.updateK()
      } catch (e) {
        this.showError(e)
      }
    },

    // 滑条 0~1000 对数映射到 K
    kToSlider(K) {
      const m = this.model
      if (!m || !(K > 0)) return 0
      const v = ((Math.log10(K) - m.kLo) / (m.kHi - m.kLo)) * 1000
      return Math.max(0, Math.min(1000, Math.round(v)))
    },

    sliderToK(v) {
      const m = this.model
      if (v <= 0) return 0
      return Number(Math.pow(10, m.kLo + (m.kHi - m.kLo) * (v / 1000)).toPrecision(4))
    },

    onSlide(e) {
      if (!this.model) return
      this.setData({ K: this.sliderToK(e.detail.value) })
      this.updateLive()
    },

    onKInput(e) {
      const v = Number(e.detail.value)
      if (e.detail.value === '' || !isFinite(v) || v < 0) return
      this.setData({ K: v, kSlider: this.kToSlider(v) })
      this.updateK()
    },

    updateK() {
      if (!this.model) return
      const a = V.rlocusAtK(this.model.G, this.model.rl, this.data.K)
      this.setData({ atK: { closedPoles: a.closedPoles, stability: a.stability, stabilityClass: a.stabilityClass, K: F.fmt(this.data.K) } })
      this.plot('rl', a.chart)
    }
  })
)
