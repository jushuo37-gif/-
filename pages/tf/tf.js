const V = require('../../utils/views')
const base = require('../../utils/page')

Page(
  Object.assign({}, base, {
    data: {
      presets: V.TF_PRESETS,
      num: '4',
      den: 's^2+1.2s+4',
      tEnd: '',
      type: 'step',
      types: [
        { key: 'step', name: '阶跃' },
        { key: 'impulse', name: '脉冲' },
        { key: 'ramp', name: '斜坡' }
      ],
      error: '',
      res: null
    },

    onReady() {
      this.run()
    },

    applyPreset(e) {
      const p = this.data.presets[e.currentTarget.dataset.index]
      this.setData({ num: p.num, den: p.den, tEnd: '' })
      this.run()
    },

    setType(e) {
      this.setData({ type: e.currentTarget.dataset.key })
      this.run()
    },

    run() {
      try {
        const r = V.analyzeTF({ num: this.data.num, den: this.data.den, tEnd: this.data.tEnd, type: this.data.type })
        const chart = r.chart
        delete r.chart
        this.setData({ res: r, error: '' })
        this.plot('chart', chart)
      } catch (e) {
        this.showError(e)
      }
    }
  })
)
