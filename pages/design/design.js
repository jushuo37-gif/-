const V = require('../../utils/views')
const base = require('../../utils/page')

Page(
  Object.assign({}, base, {
    data: {
      presets: V.DESIGN_PRESETS,
      methods: V.DESIGN_METHODS,
      num: '1',
      den: 's(s+1)',
      ec: '10',
      pm: '45',
      wc: '',
      method: 'auto',
      error: '',
      res: null
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ num: p.num, den: p.den, ec: p.ec, pm: p.pm, wc: p.wc, method: p.method })
      this.run()
    },

    setMethod(e) {
      this.setData({ method: e.currentTarget.dataset.key })
      this.run()
    },

    run() {
      try {
        const d = this.data
        const r = V.analyzeDesign({ num: d.num, den: d.den, ec: d.ec, pm: d.pm, wc: d.wc, method: d.method })
        const charts = { mag: r.chartMag, phase: r.chartPhase, step: r.chartStep }
        delete r.chartMag
        delete r.chartPhase
        delete r.chartStep
        this.setData({ res: r, error: '' })
        this.plot('mag', charts.mag)
        this.plot('phase', charts.phase)
        this.plot('step', charts.step)
      } catch (e) {
        this.setData({ res: null })
        this.showError(e)
      }
    }
  })
)
