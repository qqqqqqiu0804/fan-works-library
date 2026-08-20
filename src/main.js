import { createApp, h } from 'vue'
import App from './App.vue'
import './style.css'

// 统一线性图标（currentColor 描边，跟随文字颜色）。
// 用于替代 emoji/glyph 当图标——Impeccable 明确把 emoji 当图标列为反模式。
// 路径数据为源码内静态字符串（非用户输入），无 XSS 风险。
const ICON_PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  add: 'M12 5v14M5 12h14',
  batch: 'M12 3v10M8 9l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  user: 'M12 8.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0',
  key: 'M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm3-1 9 9m-3-3 2-2m-6-2 2-2',
  link: 'M9 15l6-6M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1',
  pen: 'M4 20l4-1L17.5 9.5a2 2 0 0 0-3-3L5 16Zm9.5-9.5 3 3',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
  close: 'M6 6l12 12M18 6 6 18',
  arrowLeft: 'M15 5l-7 7 7 7',
  arrowRight: 'M9 5l7 7-7 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v4M12 8h.01'
}

const Icon = {
  props: { name: { type: String, required: true } },
  render() {
    return h('svg', {
      class: 'icon',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true'
    }, [h('path', { d: ICON_PATHS[this.name] || '' })])
  }
}

createApp(App).component('Icon', Icon).mount('#app')
