const V = require('../../utils/views')
const base = require('../../utils/page')

Page(
  Object.assign({}, base, {
    data: {
      presets: V.BODE_PRESETS,
      num: '2',
      den: 's(s+1)(s+2)',
      wmin: '',
      wmax: '',
      error: '',
      res: null
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ num: p.num, den: p.den, wmin: '', wmax: '' })
      this.run()
    },

    run() {
      try {
        const r = V.analyzeBode({ num: this.data.num, den: this.data.den, wmin: this.data.wmin, wmax: this.data.wmax })
        const charts = { mag: r.chartMag, phase: r.chartPhase, nyq: r.chartNyquist }
        delete r.chartMag
        delete r.chartPhase
        delete r.chartNyquist
        this.setData({ res: r, error: '' })
        this.plot('mag', charts.mag)
        this.plot('phase', charts.phase)
        this.plot('nyq', charts.nyq)
      } catch (e) {
        this.showError(e)
      }
    }
  })
)
