// 复数运算（{ re, im } 形式）

function c(re, im) {
  return { re: re, im: im || 0 }
}

function add(a, b) {
  return c(a.re + b.re, a.im + b.im)
}

function sub(a, b) {
  return c(a.re - b.re, a.im - b.im)
}

function mul(a, b) {
  return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
}

function div(a, b) {
  const d = b.re * b.re + b.im * b.im
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d)
}

function scale(a, k) {
  return c(a.re * k, a.im * k)
}

function abs(a) {
  return Math.hypot(a.re, a.im)
}

function arg(a) {
  return Math.atan2(a.im, a.re)
}

module.exports = { c, add, sub, mul, div, scale, abs, arg }
