/**
 * 老黄历撕页日历的一页：数据（公历、农历、干支、宜忌……）+ 画在 canvas 上的版式。
 * 3D 桌上的日历（objects/calendar.ts）和点开后的大图（Scene.astro）共用这一份。
 * 农历相关的数据用 lunar-javascript（MIT）现算，按需加载；没加载完时只画公历日期和星期。
 */

export interface DayInfo {
  date: Date;
  red: boolean;            // 周末或法定假日（调休上班的周末不算）用红色印
  week: string;            // 星期一
  weekEn: string;          // MONDAY
  festival: string;        // 节日 / 节气，竖排在左边
  holiday: string;         // 「国庆节 · 休」之类
  lunar?: {
    yearGz: string; zodiac: string; month: string; day: string; big: boolean; // 农历 丙午年 十月 初八 大
    monthGz: string; dayGz: string; timeGz?: string;
    gan: string; zhi: string; ganWx: string; zhiWx: string;
    nayin: string; xiu: string; xiuLuck: string; zhixing: string;
    tianshen: string; tianshenLuck: string;
    yi: string[]; ji: string[]; jishen: string[]; xiongsha: string[];
    xi: string; gui: string; cai: string;
    chong: string; chongXiao: string; sha: string; tai: string;
    times: { zhi: string; luck: string }[];
    xingzuo: string;
    nextJieqi: string; nextJieqiDay: string; nextJieqiDate: string;
    pengzu: string;
  };
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const GAN_WX: Record<string, string> = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_XIAO: Record<string, string> = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' };
const ZHI_WX: Record<string, string> = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 不需要农历库就能算的部分 */
export function basicInfo(d: Date): DayInfo {
  const w = d.getDay();
  return { date: d, red: w === 0 || w === 6, week: '星期' + WEEK[w], weekEn: WEEK_EN[w], festival: '', holiday: '' };
}

type Lib = typeof import('lunar-javascript');
let lib: Promise<Lib> | null = null;
export const loadLunar = () => (lib ??= import('lunar-javascript').then((m) => (m.default?.Solar ? m.default : m) as Lib));

export function fullInfo(L: Lib, d: Date): DayInfo {
  const info = basicInfo(d);
  const s = L.Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const l = s.getLunar();
  const hol = L.HolidayUtil.getHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (hol) {
    info.holiday = `${hol.getName()} · ${hol.isWork() ? '调休上班' : '休'}`;
    info.red = !hol.isWork();
  }
  const jq = l.getJieQi();
  info.festival = [...l.getFestivals(), ...s.getFestivals(), jq, ...s.getOtherFestivals()].filter(Boolean)[0] ?? '';
  const next = l.getNextJieQi(false);
  const nextSolar = next.getSolar();
  const nextLunar = nextSolar.getLunar();
  const dayGz = l.getDayInGanZhi();
  info.lunar = {
    yearGz: l.getYearInGanZhi(), zodiac: l.getYearShengXiao(), month: l.getMonthInChinese(), day: l.getDayInChinese(),
    big: L.LunarMonth.fromYm(l.getYear(), l.getMonth()).getDayCount() === 30,
    monthGz: l.getMonthInGanZhi(), dayGz,
    gan: dayGz[0], zhi: dayGz[1], ganWx: GAN_WX[dayGz[0]], zhiWx: ZHI_WX[dayGz[1]],
    nayin: l.getDayNaYin(), xiu: l.getXiu(), xiuLuck: l.getXiuLuck(), zhixing: l.getZhiXing(),
    tianshen: l.getDayTianShen(), tianshenLuck: l.getDayTianShenLuck(),
    yi: l.getDayYi(), ji: l.getDayJi(), jishen: l.getDayJiShen(), xiongsha: l.getDayXiongSha(),
    xi: l.getDayPositionXiDesc(), gui: l.getDayPositionYangGuiDesc(), cai: l.getDayPositionCaiDesc(),
    chong: l.getDayChongDesc(), chongXiao: l.getDayChongShengXiao(), sha: l.getDaySha(), tai: l.getDayPositionTai(),
    times: l.getTimes().slice(0, 12).map((t: any) => ({ zhi: t.getZhi(), luck: t.getTianShenLuck() })),
    xingzuo: s.getXingZuo(),
    nextJieqi: next.getName(), nextJieqiDay: nextLunar.getDayInChinese(), nextJieqiDate: `${nextSolar.getMonth()}月${nextSolar.getDay()}日`,
    pengzu: `${l.getPengZuGan()} ${l.getPengZuZhi()}`,
  };
  return info;
}

// ---------------- 版式 ----------------
const SERIF = '"Songti SC","Noto Serif CJK SC","Source Han Serif SC","SimSun",serif';
const SANS = '"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
const HEAVY = '"Helvetica Neue","Arial Black","Arial",sans-serif';
export const PAGE_W = 600, PAGE_H = 840;
export const PAPER = '#f6f0e3';

/** 竖排一列字 */
function vtext(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, gap = 1.12) {
  [...s].forEach((ch, i) => g.fillText(ch, x, y + i * size * gap));
}
/** 一行字，放不下就横向压扁 */
function fit(g: CanvasRenderingContext2D, s: string, x: number, y: number, maxW: number) {
  const w = g.measureText(s).width;
  if (w <= maxW) { g.fillText(s, x, y); return; }
  g.save(); g.translate(x, y); g.scale(maxW / w, 1); g.fillText(s, 0, 0); g.restore();
}
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 8) {
  g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke();
}
/** 圆角竖条里的一个字标签（宜、忌、吉神方位……） */
function tag(g: CanvasRenderingContext2D, s: string, x: number, y: number, ink: string, size = 22) {
  const h = [...s].length * size * 1.08 + 14;
  g.lineWidth = 2; g.strokeStyle = ink; g.beginPath(); g.roundRect(x - size / 2 - 6, y - 4, size + 12, h, size / 2 + 6); g.stroke();
  g.fillStyle = ink; g.font = `bold ${size}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'top';
  vtext(g, s, x, y + 4, size, 1.08);
}

/** 在 g 上画一整页。w×h 应保持 600:840 的比例 */
export function drawPage(g: CanvasRenderingContext2D, w: number, h: number, info: DayInfo) {
  const d = info.date, L = info.lunar;
  const ink = info.red ? '#c42b20' : '#0b7a3e';
  g.save();
  g.scale(w / PAGE_W, h / PAGE_H);
  // 纸：米白，带一点纤维颗粒和透过来的下一页的淡影
  g.fillStyle = PAPER; g.fillRect(0, 0, PAGE_W, PAGE_H);
  let seed = d.getDate() * 977;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(120,100,70,${r() * 0.06})`; g.fillRect(r() * PAGE_W, r() * PAGE_H, 1 + r() * 2, 1 + r()); }
  g.fillStyle = ink; g.strokeStyle = ink;

  // 页眉：年月
  g.font = `bold 22px ${SANS}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(`${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, 24, 26);
  g.textAlign = 'right'; g.font = `bold 20px ${HEAVY}`;
  g.fillText(`${MONTH_EN[d.getMonth()]} ${d.getFullYear()}`, PAGE_W - 24, 26);
  if (L) { g.textAlign = 'center'; g.font = `bold 22px ${SERIF}`; g.fillText(`${L.yearGz}年 · ${L.zodiac}`, PAGE_W / 2, 26); }
  g.fillRect(20, 44, PAGE_W - 40, 3);

  // 大号日期：外圈描边、里面一道白线、再填实——和撕页日历上的双线大字一样
  const num = String(d.getDate());
  g.save();
  g.translate(PAGE_W / 2 + 4, 385);
  g.scale(num.length > 1 ? 0.8 : 1, 1);
  g.font = `900 400px ${HEAVY}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = 16; g.strokeText(num, 0, 0);
  g.lineWidth = 6; g.strokeStyle = PAPER; g.strokeText(num, 0, 0);
  g.fillText(num, 0, 0);
  g.restore();
  g.strokeStyle = ink;

  // 左边竖排：节日 / 节气（没有就印「黄历」）
  g.font = `bold 26px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'top';
  const fest = info.festival || (L ? `${L.month}月${L.day}` : '');
  vtext(g, fest.slice(0, 7), 46, 90, 26);
  if (info.holiday) { g.font = `bold 18px ${SANS}`; g.lineWidth = 2; box(g, 18, 330, 58, 30, 15); fit(g, info.holiday.split(' · ')[1], 47, 335, 50); }
  // 右边：本日 + 天神
  if (L) {
    g.font = `bold 24px ${SANS}`; g.fillText('本日', PAGE_W - 48, 92);
    g.fillRect(PAGE_W - 76, 124, 56, 2); g.fillRect(PAGE_W - 76, 129, 56, 2);
    g.lineWidth = 2; box(g, PAGE_W - 70, 142, 44, 150, 4);
    g.font = `bold 26px ${SANS}`;
    vtext(g, `${L.tianshen}${L.tianshenLuck === '吉' ? '吉' : '凶'}日`.slice(0, 4), PAGE_W - 48, 150, 26, 1.3);
    g.font = `bold 20px ${SANS}`;
    g.beginPath(); g.ellipse(PAGE_W - 48, 336, 30, 18, 0, 0, 7); g.stroke();
    g.textBaseline = 'middle'; g.fillText(`${L.zhixing}日`, PAGE_W - 48, 337);
  }

  // 一条横幅：三句吉语
  g.fillRect(20, 400, PAGE_W - 40, 3);
  g.font = `bold 21px ${SANS}`; g.textBaseline = 'middle';
  if (L) {
    const good = (k: string) => L.yi.includes(k);
    g.textAlign = 'left'; g.fillText(good('嫁娶') ? '嫁娶大吉' : good('出行') ? '出行大吉' : good('祭祀') ? '祭祀吉日' : '诸事平平', 28, 422);
    g.textAlign = 'center'; g.fillText(good('开市') ? '开市吉日' : good('入宅') ? '入宅吉日' : good('动土') ? '动土吉日' : `${L.xiu}宿${L.xiuLuck}`, PAGE_W / 2, 422);
    g.textAlign = 'right'; g.fillText(L.tianshenLuck === '吉' ? '黄道吉日' : '黑道日', PAGE_W - 28, 422);
  }
  // 农历 + 星期 的大方框
  const by = 442, bh = 104;
  g.lineWidth = 3; g.strokeRect(20, by, PAGE_W - 40, bh);
  g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(108, by); g.lineTo(108, by + bh); g.moveTo(PAGE_W - 108, by); g.lineTo(PAGE_W - 108, by + bh); g.moveTo(PAGE_W / 2 + 18, by); g.lineTo(PAGE_W / 2 + 18, by + bh); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 46px ${SANS}`;
  if (L) fit(g, `${L.day}日`, 210, by + 40, 180);
  fit(g, info.week, PAGE_W / 2 + 115, by + 40, 170);
  g.font = `bold 17px ${SANS}`;
  if (L) fit(g, `农历${L.yearGz}年${L.month}月${L.big ? '大' : '小'}`, 210, by + 84, 190);
  g.font = `bold 20px ${HEAVY}`; g.fillText(info.weekEn.split('').join(' '), PAGE_W / 2 + 115, by + 84);
  if (L) {
    g.font = `bold 20px ${SANS}`; g.fillText(L.xingzuo, 64, by + 36); g.fillText('座', 64, by + 64);
    g.font = `bold 18px ${SANS}`; fit(g, L.nextJieqiDay, PAGE_W - 64, by + 34, 76); g.font = `bold 24px ${SANS}`; g.fillText(L.nextJieqi, PAGE_W - 64, by + 68);
  }

  // 下半部分三栏
  const gy = by + bh + 6, gh = 230;
  g.lineWidth = 3; g.strokeRect(20, gy, PAGE_W - 40, gh);
  g.lineWidth = 1.5;
  const c1 = 214, c2 = 386;
  g.beginPath(); g.moveTo(c1, gy); g.lineTo(c1, gy + gh); g.moveTo(c2, gy); g.lineTo(c2, gy + gh); g.stroke();
  if (L) {
    // 左栏：宜、冲煞
    tag(g, '宜', 44, gy + 14, ink);
    g.font = `bold 24px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    L.yi.slice(0, 6).forEach((s, i) => fit(g, s, 72 + (i % 2) * 70, gy + 12 + Math.floor(i / 2) * 34, 64));
    g.beginPath(); g.moveTo(20, gy + 120); g.lineTo(c1, gy + 120); g.stroke();
    tag(g, '冲煞', 44, gy + 130, ink, 18);
    g.font = `bold 22px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    fit(g, `${ZHI_XIAO[L.zhi]}日冲${L.chongXiao}`, 72, gy + 132, 130); fit(g, `煞${L.sha}方`, 72, gy + 162, 134); fit(g, `冲${L.chong.replace(/[()]/g, '').slice(0, 2)}日`, 72, gy + 192, 130);
    // 中栏：干支、纳音、星宿、十二神
    const rows: [string, string, string][] = [['天干', L.gan, `属${L.ganWx}`], ['地支', L.zhi, `属${L.zhiWx}`], ['纳音', L.nayin.slice(-1), L.nayin.slice(0, 2)], ['廿八宿', L.xiu, `宿${L.xiuLuck}`], ['十二神', L.zhixing, '日']];
    rows.forEach(([k, v, t], i) => {
      const y = gy + 10 + i * 30;
      g.font = `bold 16px ${SANS}`; g.textAlign = 'left'; g.fillText(k, c1 + 8, y + 6);
      g.font = `bold 26px ${SANS}`; g.textAlign = 'center'; fit(g, v.slice(0, 1), (c1 + c2) / 2 + 6, y + 1, 30);
      g.font = `bold 16px ${SANS}`; g.textAlign = 'right'; g.fillText(t, c2 - 8, y + 6);
    });
    g.beginPath(); g.moveTo(c1, gy + 162); g.lineTo(c2, gy + 162); g.stroke();
    // 生肖：年肖印成一个圆章
    g.beginPath(); g.arc((c1 + c2) / 2, gy + 196, 26, 0, 7); g.lineWidth = 3; g.stroke(); g.lineWidth = 1.5;
    g.font = `bold 30px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(L.zodiac, (c1 + c2) / 2, gy + 197);
    // 右栏：忌、吉神方位、时辰吉凶
    tag(g, '忌', c2 + 22, gy + 14, ink);
    g.font = `bold 24px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'top';
    L.ji.slice(0, 4).forEach((s, i) => fit(g, s, c2 + 48 + (i % 2) * 70, gy + 12 + Math.floor(i / 2) * 34, 64));
    g.beginPath(); g.moveTo(c2, gy + 84); g.lineTo(PAGE_W - 20, gy + 84); g.stroke();
    g.font = `bold 19px ${SANS}`;
    [`喜神${L.xi}`, `贵神${L.gui}`, `财神${L.cai}`].forEach((s, i) => fit(g, s, c2 + 12, gy + 92 + i * 24, 170));
    g.beginPath(); g.moveTo(c2, gy + 168); g.lineTo(PAGE_W - 20, gy + 168); g.stroke();
    g.textAlign = 'center';
    const cw = (PAGE_W - 20 - c2 - 8) / 12;
    L.times.forEach((t, i) => {
      const x = c2 + 4 + cw * (i + 0.5);
      g.font = `bold 15px ${SANS}`; g.fillText(t.zhi, x, gy + 176);
      g.font = `bold 15px ${SANS}`; g.fillText(t.luck, x, gy + 200);
    });
  }
  // 页脚：胎神、彭祖百忌、下一个节气
  g.font = `16px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'middle';
  if (L) {
    fit(g, `今日胎神：${L.tai}　彭祖百忌：${L.pengzu}`, 24, gy + gh + 22, PAGE_W - 48);
    fit(g, `${L.monthGz}月 ${L.dayGz}日　下一个节气：${L.nextJieqi}（${L.nextJieqiDate}）`, 24, gy + gh + 46, PAGE_W - 48);
  } else {
    g.fillText('农历载入中…', 24, gy + gh + 22);
  }
  g.restore();
}
