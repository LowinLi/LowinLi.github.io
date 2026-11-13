/** 极简补间：每帧调用 update(dt)，避免为几个动画引入 GSAP */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export class Tween {
  private t = 0;
  done = false;
  constructor(
    private dur: number,
    private apply: (k: number) => void,
    private onDone?: () => void,
    private ease = easeInOut,
  ) {}
  update(dt: number) {
    if (this.done) return;
    this.t = Math.min(1, this.t + dt / this.dur);
    this.apply(this.ease(this.t));
    if (this.t >= 1) { this.done = true; this.onDone?.(); }
  }
}

export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
