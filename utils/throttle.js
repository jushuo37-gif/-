// 简单节流：拖动滑条时限制重算频率
module.exports = function throttle(fn, wait) {
  let last = 0
  let timer = null
  return function () {
    const args = arguments
    const ctx = this
    const now = Date.now()
    const remain = wait - (now - last)
    if (remain <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      last = now
      fn.apply(ctx, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(ctx, args)
      }, remain)
    }
  }
}
