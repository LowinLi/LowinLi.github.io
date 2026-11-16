// hls.js 的精简版（不含字幕、DRM）没有单独的类型声明，和完整版共用
declare module 'hls.js/light' {
  export { default } from 'hls.js';
}
