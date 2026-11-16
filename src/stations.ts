/**
 * 录音机收音机模式能收到的台：北京地区真实的调频频率 + 各台官方/公开的网络直播流。
 * 每个台按顺序试 src，前一个放不出来（或 8 秒还没出声）就换下一个。北京台先用台里自己的流，蜻蜓 FM 做备用。.mp3 直接给 <audio>；.m3u8 浏览器能原生放就原生放，否则用 hls.js（需要对方允许跨域）。
 * 2026-11 测过：北京台 rbc.cn 的 HLS 和蜻蜓 FM 的 mp3 都允许跨域；国际台 sk.cri.cn 允许本站；
 * 中央台 ngcdn*.cnr.cn 只允许 cctv 的域名，所以只有能原生放 HLS 的浏览器（Safari、iOS）收得到。
 */
export interface Station { mhz: number; name: string; short: string; src: string[] }

const rbc = (f: string) => `https://brtv-radiolive.rbc.cn/alive/${f}.m3u8`;
const qt = (id: number) => `https://lhttp.qingting.fm/live/${id}/64k.mp3`;

export const FM_MIN = 87.5, FM_MAX = 108;

export const STATIONS: Station[] = [
  { mhz: 87.6, name: '北京文艺广播', short: '文艺', src: [rbc('fm876'), qt(333)] },
  { mhz: 90.5, name: '中国国际广播电台 环球资讯', short: '环球资讯', src: ['https://sk.cri.cn/905.m3u8'] },
  { mhz: 96.6, name: '中央广播电视总台 经济之声', short: '经济之声', src: ['https://ngcdn002.cnr.cn/live/jjzs/index.m3u8'] },
  { mhz: 97.4, name: '北京音乐广播', short: '音乐', src: [rbc('fm974'), qt(332)] },
  { mhz: 100.6, name: '北京新闻广播', short: '新闻', src: [rbc('fm1006'), qt(339)] },
  { mhz: 103.9, name: '北京交通广播', short: '交通', src: [rbc('fm1039'), qt(336)] },
  { mhz: 106.1, name: '中央广播电视总台 中国之声', short: '中国之声', src: ['https://ngcdn001.cnr.cn/live/zgzs/index.m3u8'] },
  { mhz: 107.3, name: '北京城市广播', short: '城市', src: [rbc('fm1073'), qt(345)] },
];
