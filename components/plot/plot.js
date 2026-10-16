// 绘图组件：页面通过 selectComponent('#id').render(opts) 传入图表配置
const chart = require('../../utils/chart')

function pixelRatio() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio
  } catch (e) {}
  return wx.getSystemInfoSync().pixelRatio
}

Component({
  properties: {
    height: { type: Number, value: 240 }
  },

  lifetimes: {
    ready() {
      this.init()
    }
  },

  methods: {
    init() {
      this.createSelectorQuery()
        .select('#cv')
        .fields({ node: true, size: true })
        .exec(res => {
          const r = res && res[0]
          if (!r || !r.node) return
          const canvas = r.node
          const dpr = pixelRatio()
          canvas.width = r.width * dpr
          canvas.height = r.height * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)
          this.ctx = ctx
          this.w = r.width
          this.h = r.height
          if (this.opts) this.paint()
        })
    },

    // 外部调用：绘制新的图表
    render(opts, keepCursor) {
      this.opts = opts
      if (!keepCursor) this.cursor = null
      if (this.ctx) this.paint()
    },

    clear() {
      this.opts = null
      if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h)
    },

    paint() {
      const o = Object.assign({}, this.opts)
      if (o.cursorEnabled && this.cursor !== null && this.cursor !== undefined) o.cursor = this.cursor
      this.ctx.clearRect(0, 0, this.w, this.h)
      this.geom = chart.draw(this.ctx, this.w, this.h, o)
    },

    // 点按/拖动显示读数
    onTouch(e) {
      if (!this.opts || !this.opts.cursorEnabled || !this.geom) return
      const t = e.touches && e.touches[0]
      if (!t) return
      const p = this.geom.plot
      if (t.x < p.l || t.x > p.l + p.w) return
      this.cursor = this.geom.toDataX(t.x)
      this.paint()
    }
  }
})
