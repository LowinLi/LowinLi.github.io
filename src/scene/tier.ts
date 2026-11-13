export type Tier = 'high' | 'mid' | 'low';

/**
 * 设备分档。规则改动必须同步 CLAUDE.md 的「降级档位」表。
 * 支持 URL 覆盖：?tier=high|mid|low，方便截图和 QA。
 */
export function detectTier(): Tier {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'high' || forced === 'mid' || forced === 'low') return forced;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'low';

  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2') ?? c.getContext('webgl');
  } catch { /* noop */ }
  if (!gl) return 'low';

  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  if (/swiftshader|llvmpipe|software|basic render/.test(renderer)) return 'low';

  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mem <= 2 || cores <= 2) return 'low';

  const weakGpu = /mali-[gt]?[0-7]\d|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]\d\d/.test(renderer);
  if (weakGpu || mem <= 4) return 'mid';
  return 'high';
}
