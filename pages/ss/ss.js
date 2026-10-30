const V = require('../../utils/views')
const base = require('../../utils/page')

const p0 = V.SS_PRESETS[0]

Page(
  Object.assign({}, base, {
    data: {
      presets: V.SS_PRESETS,
      A: p0.A,
      B: p0.B,
      C: p0.C,
      D: p0.D,
      poles: p0.poles,
      obs: p0.obs,
      x0: p0.x0,
      tEnd: '',
      error: '',
      res: null
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ A: p.A, B: p.B, C: p.C, D: p.D, poles: p.poles, obs: p.obs, x0: p.x0, tEnd: '' })
      this.run()
    },

    run() {
      try {
        const d = this.data
        const r = V.analyzeSS({ A: d.A, B: d.B, C: d.C, D: d.D, poles: d.poles, obs: d.obs, x0: d.x0, tEnd: d.tEnd })
        const cy = r.chartY
        const ce = r.chartE
        delete r.chartY
        delete r.chartE
        this.setData({ res: r, error: '' })
        this.plot('cy', cy)
        this.plot('ce', ce)
      } catch (e) {
        this.setData({ res: null })
        this.showError(e)
      }
    }
  })
)
