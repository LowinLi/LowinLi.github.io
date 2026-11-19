import * as THREE from 'three';
import { SUN_DIR } from './layout';

/**
 * 一天里的时刻（用户要的：「外面的景色随着真实的时间变化，也可以点钟表修改时间；晚上是黑天，只能看到月亮」）。
 *
 * - 默认跟着访客电脑上的真实时间走；点座钟拨到别的时刻后，记一个和真实时间的差（offset），之后照样往前走。
 * - 太阳按北京的纬度（40°N）和今天的日期算高度和方位，日出日落的时间随季节变（冬天七点多才亮、五点就黑）。
 *   为了让日出永远出现在远山的豁口里（窗外的构图），方位按「相对今天日出方位」换算：日出 = SUN_DIR，往南转是往右（+x）。
 *   所以上午太阳从窗外左前方慢慢升高、移到右边，下午转到屋子后面，傍晚窗外是被夕阳照着的粉色天空。
 * - 月亮：位置固定在窗外偏右的天上（夜里坐在桌前就能看到），月相按真实日期算。
 *
 * 状态是模块里的单例：`sky.ts`（OBJECTS 里第一个）每帧调用 `updateSky(dt)`，其余物件在自己的 frame 里读 `SKY`。
 * 外部改时间走 bus：`time:set {h}`（拨到今天的 h 点）/ `time:real`（回到真实时间），由 runtime 转给这里。
 */

const LAT = THREE.MathUtils.degToRad(40);
const NOON = 12.0; // 北京（116.4°E）的真太阳时正午约在 12:00 前后
const RIGHT = new THREE.Vector3(-SUN_DIR.z, 0, SUN_DIR.x).normalize(); // 日出方向往右转 90°

let offset = 0;
/** 显示的时刻（小时，0–24）：拨时间时不是一下跳过去，而是快速转过去 */
let shown = -1;

const wrap = (h: number) => ((h % 24) + 24) % 24;
export const virtualNow = () => new Date(Date.now() + offset);
const hoursOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3.6e6;
/** 拨到今天的 h 点（之后照样随真实时间往前走） */
export function setHours(h: number) {
  const d = new Date(); offset = (wrap(h) - hoursOf(d)) * 3.6e6;
}
export function toReal() { offset = 0; }
/** 按今天的日出日落拨：日出后一刻钟 / 正午 / 日落前一刻 / 晚上十点 */
export function setPreset(at: string) {
  const dec = declination(new Date()), rise = sunriseHour(dec);
  setHours(at === 'sunrise' ? rise + 0.25 : at === 'noon' ? NOON : at === 'sunset' ? 2 * NOON - rise - 0.3 : 22);
}
export const isReal = () => Math.abs(offset) < 30e3;
/** 在表盘上拨指针：往前（正）或往后拨 dh 小时，显示的时刻立刻跟上（指针跟手） */
export function nudge(dh: number) {
  offset += dh * 3.6e6;
  offset -= 864e5 * Math.round(offset / 864e5); // 差值保持在 ±12 小时以内：拨过零点还是「今天」
  if (shown >= 0) shown = wrap(shown + dh);
}

function declination(d: Date) {
  const start = new Date(d.getFullYear(), 0, 0), n = (d.getTime() - start.getTime()) / 864e5;
  return THREE.MathUtils.degToRad(23.44) * Math.sin((2 * Math.PI * (284 + n)) / 365);
}
/** 太阳高度角和方位角（方位从正北顺时针，弧度） */
function sunAt(h: number, dec: number) {
  const H = THREE.MathUtils.degToRad(15 * (h - NOON));
  const sinEl = Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(H);
  const el = Math.asin(sinEl);
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(LAT)) / (Math.cos(el) * Math.cos(LAT));
  let az = Math.acos(THREE.MathUtils.clamp(cosAz, -1, 1));
  if (H > 0) az = 2 * Math.PI - az;
  return { el, az };
}
/** 日出时刻（太阳中心过地平线） */
function sunriseHour(dec: number) {
  const ha = Math.acos(THREE.MathUtils.clamp(-Math.tan(LAT) * Math.tan(dec), -1, 1));
  return NOON - THREE.MathUtils.radToDeg(ha) / 15;
}
/** 月龄（0 新月 → 0.5 满月 → 1） */
function moonAge(d: Date) {
  const jd = d.getTime() / 864e5 + 2440587.5;
  return (((jd - 2451550.1) / 29.530588853) % 1 + 1) % 1;
}

const ss = THREE.MathUtils.smoothstep;
const deg = THREE.MathUtils.degToRad;

export const SKY = {
  hours: 6.5,
  /** 太阳方向（单位向量，指向太阳）、高度角 */
  sunDir: SUN_DIR.clone(), sunEl: 0,
  /** 白天程度 0–1（民用晨昏蒙影里渐变） */
  day: 1,
  /** 夜里程度 0–1 */
  night: 0,
  /** 日出日落前后的暖色程度 0–1 */
  gold: 1,
  /** 早上：太阳在窗外前方、还低，阳光能从窗户斜照进屋（地板上的光斑、桌上的阳光） */
  sunIn: 1,
  /** 宫灯亮度 0–1（天暗了就点上） */
  lamp: 0,
  /** 0 = 早上，1 = 傍晚（暖色的天按这个分朝霞 / 晚霞） */
  evening: 0,
  /** 天空用清晨实拍照片的程度（太阳升高或到了下午就换成程序天空）；照片里的太阳固定在 SUN_DIR */
  morning: 1,
  moonDir: new THREE.Vector3(), moonAge: 0.5,
  /** 屋外无光照材质的整体色调（白天 1，傍晚偏暖，夜里很暗的蓝） */
  tint: new THREE.Color(1, 1, 1),
  /** 每次明显变化加 1：环境贴图这类贵的东西据此重算 */
  version: 0,
};

/** 屋外无光照材质共用的 uniform（同一个对象，改一处全部生效） */
export const DAY_TINT = { value: SKY.tint };
const NIGHT_TINT = new THREE.Color(0.075, 0.095, 0.17), DUSK_TINT = new THREE.Color(1.0, 0.72, 0.6), NOON_TINT = new THREE.Color(1.06, 1.06, 1.04);
const MORN_TINT = new THREE.Color(1, 0.96, 0.92);
let lastKey = '';

export function updateSky(dt: number) {
  const now = virtualNow(), target = hoursOf(now);
  if (shown < 0 || dt <= 0) shown = target;
  else {
    let diff = target - shown; diff -= 24 * Math.round(diff / 24);
    shown = Math.abs(diff) < 0.002 ? target : wrap(shown + diff * Math.min(1, dt * 2.5));
  }
  const h = shown, dec = declination(now);
  const { el, az } = sunAt(h, dec), rise = sunAt(sunriseHour(dec), dec).az;
  const rel = az - rise;
  SKY.hours = h; SKY.sunEl = el;
  SKY.sunDir.copy(SUN_DIR).multiplyScalar(Math.cos(rel)).addScaledVector(RIGHT, Math.sin(rel)).setY(0).normalize()
    .multiplyScalar(Math.cos(el)).setY(Math.sin(el));
  const s = Math.sin(el);
  SKY.day = ss(s, -0.1, 0.06);
  SKY.night = 1 - ss(s, -0.2, -0.03);
  SKY.gold = Math.exp(-((el / deg(8)) ** 2)) * ss(s, -0.16, -0.02);
  SKY.evening = h > NOON ? 1 : 0;
  SKY.sunIn = ss(el, deg(-0.5), deg(4)) * Math.max(0, Math.cos(rel)) ** 2 * (1 - ss(el, deg(22), deg(42)));
  SKY.lamp = 1 - ss(SKY.day, 0.3, 0.85);
  SKY.morning = (1 - SKY.evening) * ss(SKY.gold, 0.15, 0.6);
  // 月亮：窗外偏右、仰角 9° 的天上（坐在桌前从窗户里看得到，远山挡不住）
  const ma = deg(16), me = deg(9);
  SKY.moonDir.copy(SUN_DIR).multiplyScalar(Math.cos(ma)).addScaledVector(RIGHT, Math.sin(ma)).normalize().multiplyScalar(Math.cos(me)).setY(Math.sin(me));
  SKY.moonAge = moonAge(now);
  // 屋外色调：夜（月光蓝）→ 晨昏（早上照片本来就是日出光，偏暖只给傍晚）→ 正午（略亮）
  SKY.tint.copy(NIGHT_TINT).lerp(SKY.evening ? DUSK_TINT : MORN_TINT, SKY.day);
  SKY.tint.lerp(NOON_TINT, SKY.day * (1 - SKY.gold) * ss(el, deg(6), deg(30)));
  const key = `${SKY.day.toFixed(2)}|${SKY.gold.toFixed(2)}|${SKY.evening}|${(el * 10).toFixed(0)}`;
  if (key !== lastKey) { lastKey = key; SKY.version++; }
}

/**
 * 给屋外的无光照材质（MeshBasic / 以自发光为主的 Lambert）乘上一天里的色调：夜里压暗成月光的蓝，傍晚偏暖。
 * 接在材质原来的 onBeforeCompile 后面，所以和 outdoorMaterial、animalDetail 的着色器改动不冲突。
 */
export function applyDayTint<T extends THREE.Material>(m: T): T {
  if (m.userData.dayTint) return m;
  m.userData.dayTint = true;
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uDayTint = DAY_TINT;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uDayTint;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= uDayTint;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => prevKey() + '-day';
  m.needsUpdate = true;
  return m;
}

/** 0–24 的小时数 → 「下午 3:20」这种写法 */
export function formatHours(h: number) {
  const hh = Math.floor(wrap(h)), mm = Math.floor((wrap(h) - hh) * 60);
  const part = hh < 5 ? '凌晨' : hh < 8 ? '清晨' : hh < 11 ? '上午' : hh < 13 ? '中午' : hh < 17 ? '下午' : hh < 19 ? '傍晚' : '晚上';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${part} ${h12}:${String(mm).padStart(2, '0')}`;
}
