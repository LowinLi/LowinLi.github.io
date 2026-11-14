export interface Track { id: string; title: string; note: string; color: string }

/** 留声机旁的唱片。音乐由 src/scene/music.ts 实时合成，没有音频文件。 */
export const TRACKS: Track[] = [
  { id: 'dawn', title: '晨光', note: '钢琴琶音', color: '#e9a25a' },
  { id: 'tide', title: '潮汐', note: '氛围长音', color: '#4f93ad' },
  { id: 'guqin', title: '古韵', note: '五声拨弦', color: '#8f3a2c' },
];
