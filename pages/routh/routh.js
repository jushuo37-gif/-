const V = require('../../utils/views')
const base = require('../../utils/page')

Page(
  Object.assign({}, base, {
    data: {
      presets: V.ROUTH_PRESETS,
      poly: 's^4+2s^3+3s^2+4s+5',
      error: '',
      res: null
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ poly: p.poly })
      this.run()
    },

    run() {
      try {
        this.setData({ res: V.analyzeRouth({ poly: this.data.poly }), error: '' })
      } catch (e) {
        this.showError(e)
      }
    }
  })
)
