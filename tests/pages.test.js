// 页面冒烟测试：模拟小程序运行时，加载每个页面并执行主要交互
const path = require('path')
const fs = require('fs')
const assert = require('assert')

const root = path.join(__dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))

let failed = 0
const plots = []

function makeComponentInstance() {
  return {
    render(opts) {
      plots.push(opts)
      // 用记录型的假 ctx 跑一次真实绘图，确保不抛异常
      require('../utils/chart').draw(fakeCtx(), 360, 240, opts)
    },
    clear() {}
  }
}

function fakeCtx() {
  const noop = () => {}
  return new Proxy(
    {},
    {
      get(t, k) {
        if (k === 'measureText') return s => ({ width: String(s).length * 6 })
        if (k in t) return t[k]
        return noop
      },
      set(t, k, v) {
        t[k] = v
        return true
      }
    }
  )
}

global.wx = {
  navigateTo() {},
  getWindowInfo: () => ({ pixelRatio: 2 }),
  getSystemInfoSync: () => ({ pixelRatio: 2 })
}
global.getApp = () => ({ globalData: {} })
global.App = () => {}
global.Component = () => {}

function setByPath(obj, p, v) {
  const keys = p.replace(/\[(\d+)\]/g, '.$1').split('.')
  let o = obj
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]]
  o[keys[keys.length - 1]] = v
}

function loadPage(route) {
  let def
  global.Page = d => {
    def = d
  }
  const file = path.join(root, route + '.js')
  delete require.cache[require.resolve(file)]
  require(file)
  const page = Object.assign({}, def)
  page.data = JSON.parse(JSON.stringify(def.data || {}))
  page.setData = function (obj) {
    Object.keys(obj).forEach(k => setByPath(this.data, k, obj[k]))
  }
  page.selectComponent = () => makeComponentInstance()
  return page
}

function ev(dataset, value) {
  return { currentTarget: { dataset: dataset || {} }, detail: { value } }
}

function check(name, fn) {
  try {
    fn()
    console.log('  ✓ ' + name)
  } catch (e) {
    failed++
    console.log('  ✗ ' + name + '\n    ' + e.stack.split('\n').slice(0, 4).join('\n    '))
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  console.log('页面文件')
  app.pages.forEach(p => {
    check(p + ' 文件齐全', () => {
      ;['.js', '.wxml', '.wxss', '.json'].forEach(ext => assert.ok(fs.existsSync(path.join(root, p + ext)), '缺少 ' + p + ext))
    })
  })

  console.log('WXML 标签配对')
  const wxmlFiles = app.pages.map(p => p + '.wxml').concat(['components/plot/plot.wxml', 'templates/common.wxml'])
  wxmlFiles.forEach(f => {
    check(f, () => {
      const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
      const stack = []
      const re = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
      let m
      while ((m = re.exec(src))) {
        const [, close, tag, attrs, self] = m
        if (self || tag === 'import' || tag === 'input') continue
        if (close) {
          const top = stack.pop()
          assert.strictEqual(top, tag, f + '：</' + tag + '> 与 <' + top + '> 不匹配')
        } else stack.push(tag)
        ;(attrs.match(/\{\{/g) || []).length === (attrs.match(/\}\}/g) || []).length || assert.fail(f + '：{{ }} 不配对 ' + attrs)
      }
      assert.deepStrictEqual(stack, [], f + '：未闭合 ' + stack.join(','))
    })
  })

  console.log('页面交互')
  const run = (route, steps) =>
    check(route, () => {
      const pg = loadPage(route)
      if (pg.onLoad) pg.onLoad({})
      if (pg.onReady) pg.onReady()
      assert.ok(!pg.data.error, '初始错误：' + pg.data.error)
      steps && steps(pg)
    })

  run('pages/index/index', pg => pg.go(ev({ url: '/pages/tf/tf' })))
  run('pages/tf/tf', pg => {
    assert.ok(pg.data.res && pg.data.res.metrics.length > 0)
    pg.data.presets.forEach((_, i) => {
      pg.applyPreset(ev({ index: i }))
      assert.ok(!pg.data.error, pg.data.error)
      ;['step', 'impulse', 'ramp'].forEach(t => {
        pg.setType(ev({ key: t }))
        assert.ok(!pg.data.error, pg.data.error)
      })
    })
    pg.onInput(ev({ key: 'den' }, 's^2+'))
    pg.run()
    assert.ok(pg.data.error, '非法输入应提示错误')
    pg.onInput(ev({ key: 'den' }, 's+1'))
    pg.run()
    assert.ok(!pg.data.error)
  })
  run('pages/second/second', pg => {
    ;[0, 20, 50, 70, 100, 200].forEach(v => {
      pg.onZeta(ev({}, v))
    })
    pg.onCompare(ev({}, true))
    pg.onWnInput(ev({}, '5'))
    pg.onZetaInput(ev({}, '0'))
    assert.ok(!pg.data.error, pg.data.error)
    assert.strictEqual(pg.data.res.type, '无阻尼')
  })
  run('pages/pid/pid', pg => {
    pg.data.presets.forEach((_, i) => {
      pg.applyPreset(ev({ index: i }))
      assert.ok(!pg.data.error, pg.data.error)
    })
    pg.onSlide(ev({ index: 0 }, 200))
    pg.onGainInput(ev({ index: 0 }, '80'))
    assert.strictEqual(pg.data.gains[0].value, 80)
    assert.ok(pg.data.gains[0].max >= 80)
    pg.onGainInput(ev({ index: 1 }, '0'))
    pg.onGainInput(ev({ index: 2 }, '0'))
    assert.ok(!pg.data.error, pg.data.error)
  })
  run('pages/bode/bode', pg => {
    pg.data.presets.forEach((_, i) => {
      pg.applyPreset(ev({ index: i }))
      assert.ok(!pg.data.error, pg.data.error)
    })
    pg.onInput(ev({ key: 'wmin' }, '10'))
    pg.onInput(ev({ key: 'wmax' }, '1'))
    pg.run()
    assert.ok(pg.data.error)
  })
  run('pages/rlocus/rlocus', pg => {
    pg.data.presets.forEach((_, i) => {
      pg.applyPreset(ev({ index: i }))
      assert.ok(!pg.data.error, pg.data.error)
      pg.onSlide(ev({}, 1000))
      pg.onSlide(ev({}, 0))
      pg.onKInput(ev({}, '6'))
    })
  })
  run('pages/routh/routh', pg => {
    pg.data.presets.forEach((_, i) => {
      pg.applyPreset(ev({ index: i }))
      assert.ok(!pg.data.error, pg.data.error)
    })
    pg.onInput(ev({ key: 'poly' }, '5'))
    pg.run()
    assert.ok(pg.data.error)
  })

  await sleep(150) // 等节流定时器
  check('图表均已绘制', () => assert.ok(plots.length > 50))
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
  process.exit(failed ? 1 : 0)
})()
