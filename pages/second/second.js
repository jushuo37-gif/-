const V = require('../../utils/views')
const base = require('../../utils/page')
const throttle = require('../../utils/throttle')

Page(
  Object.assign({}, base, {
    data: {
      zeta: 0.5,
      wn: 2,
      compare: false,
      error: '',
      res: null
    },

    onLoad() {
      this.runLive = throttle(this.run, 60)
    },

    onReady() {
      this.run()
    },

    onZeta(e) {
      this.setData({ zeta: e.detail.value / 100 })
      this.runLive()
    },

    onWn(e) {
      this.setData({ wn: e.detail.value / 10 })
      this.runLive()
    },

    onZetaInput(e) {
      const v = Number(e.detail.value)
      if (isFinite(v) && v >= 0 && e.detail.value !== '') {
        this.setData({ zeta: v })
        this.run()
      }
    },

    onWnInput(e) {
      const v = Number(e.detail.value)
      if (isFinite(v) && v > 0) {
        this.setData({ wn: v })
        this.run()
      }
    },

    onCompare(e) {
      this.setData({ compare: e.detail.value })
      this.run()
    },

    run() {
      try {
        const r = V.analyzeSecond({ zeta: this.data.zeta, wn: this.data.wn, compare: this.data.compare })
        const chart = r.chart
        const poleChart = r.poleChart
        delete r.chart
        delete r.poleChart
        this.setData({ res: r, error: '' })
        this.plot('chart', chart, true)
        this.plot('poles', poleChart)
      } catch (e) {
        this.showError(e)
      }
    }
  })
)
