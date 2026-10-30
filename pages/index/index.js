Page({
  data: {
    tools: [
      { url: '/pages/tf/tf', icon: '∿', title: '时域响应', desc: '阶跃/脉冲/斜坡响应，超调量、调节时间等指标' },
      { url: '/pages/second/second', icon: 'ζ', title: '二阶系统', desc: '拖动 ζ、ωn，对比理论公式与仿真结果' },
      { url: '/pages/pid/pid', icon: 'PID', title: 'PID 仿真', desc: '实时调节 Kp、Ki、Kd，观察闭环响应与控制量' },
      { url: '/pages/bode/bode', icon: 'dB', title: '频域分析', desc: 'Bode 图、奈奎斯特图，幅值/相角裕度' },
      { url: '/pages/rlocus/rlocus', icon: '×', title: '根轨迹', desc: '渐近线、分离点、虚轴交点、稳定 K 范围' },
      { url: '/pages/routh/routh', icon: 'R', title: '劳斯判据', desc: '自动列劳斯表，处理首元为零和全零行' },
      { url: '/pages/design/design', icon: 'Gc', title: '校正设计', desc: '超前/滞后/滞后-超前校正自动设计，给出完整步骤与前后对比' },
      { url: '/pages/ss/ss', icon: 'ẋ', title: '状态空间', desc: '能控/能观性、PBH 检验、极点配置、状态观测器' }
    ]
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  onShareAppMessage() {
    return { title: '控制工程助手：自动控制原理计算与仿真', path: '/pages/index/index' }
  }
})
