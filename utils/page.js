// 页面通用方法：输入绑定、预设、错误提示
module.exports = {
  // <input data-key="num" bindinput="onInput" />
  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
  },

  showError(e) {
    this.setData({ error: (e && e.message) || String(e) })
  },

  clearError() {
    if (this.data.error) this.setData({ error: '' })
  },

  plot(id, opts, keepCursor) {
    const c = this.selectComponent('#' + id)
    if (!c) return
    if (opts) c.render(opts, keepCursor)
    else c.clear()
  }
}
