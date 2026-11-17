"""
窗外菜园和稻田的作物：Poly Haven 没有扫描的稻子和蔬菜，这里用 bpy 按程序建模（叶片有弯垂、扭转、皱褶、中脉），
材质用「漫反射 + 透光」混合（逆光时叶缘透亮），再用和 render_impostors.py 一样的日出天空 + 逆光太阳渲成带透明底的照片。
真实感主要来自光照：Cycles 的软阴影、叶片互相遮挡、透光，比网页里的无光照顶点色真实得多。

另外渲一张俯视的水田细节贴图（一行行秧苗 + 田水），可以无缝平铺，给远处的大片稻田叠细节。

用法：python tools/render_crops.py <umhlanga_sunrise_1k.hdr> <输出目录>
输出：<名字>_<变体>.webp + 合进同目录 impostors.json；paddy_detail.webp（灰度细节，平均亮度 0.5）
"""
import sys, os, json, math, random
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image, ImageOps

hdr, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

bl = lambda x, y, z: Vector((x, -z, y))
SUN_TRAVEL = Vector((0.12, -0.24, 1.0)).normalized()
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdr)
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
mp.inputs['Rotation'].default_value = (0, 0, -2.32)
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
nt.links.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.4
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.76, 0.52); sun.angle = math.radians(2)
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so)
so.rotation_euler = bl(*SUN_TRAVEL).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co

# ---------------- 材质 ----------------
# 下面写颜色都按 sRGB（和网页、取色器里一样），进 Blender 之前转成线性；直接当线性值用会整体发白发灰
lin = lambda c: tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)
def leaf_material(name, base, tip, mid=None, rough=0.5, trans=0.3, bump=0.3, wrinkle=0.0, pivot=None, midw=0.12):
    """叶子：沿叶长从 base 渐变到 tip；mid 给了就是一条浅色中脉（沿叶宽方向 u=0.5）；trans 是透光的比例"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    n = m.node_tree.nodes; L = m.node_tree.links
    bsdf = n['Principled BSDF']; bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = 0.22  # 叶面的高光调低：默认值下皱叶映出一层天光，整片发白发蓝
    uv = n.new('ShaderNodeUVMap'); sep = n.new('ShaderNodeSeparateXYZ'); L.new(uv.outputs['UV'], sep.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB'); L.new(sep.outputs['Y'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (*lin(base), 1); ramp.color_ramp.elements[1].color = (*lin(tip), 1)
    if pivot is not None:  # 叶柄的浅色只占叶子根部一小段
        ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[1].position = pivot
        ramp.color_ramp.elements.new(min(0.99, pivot + 0.25)).color = (*lin(tip), 1)
    col = ramp.outputs['Color']
    noise = n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 18; noise.inputs['Detail'].default_value = 6
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 0.35
    L.new(col, mix.inputs['A']); L.new(noise.outputs['Color'], mix.inputs['B']); col = mix.outputs['Result']
    if mid:
        # 中脉：u 离 0.5 越近越接近 mid 的颜色
        sub = n.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = 0.5; L.new(sep.outputs['X'], sub.inputs[0])
        ab = n.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(sub.outputs[0], ab.inputs[0])
        r2 = n.new('ShaderNodeValToRGB'); L.new(ab.outputs[0], r2.inputs['Fac'])
        r2.color_ramp.elements[0].position = 0.0; r2.color_ramp.elements[0].color = (1, 1, 1, 1)
        r2.color_ramp.elements[1].position = midw; r2.color_ramp.elements[1].color = (0, 0, 0, 1)
        mx2 = n.new('ShaderNodeMix'); mx2.data_type = 'RGBA'; L.new(r2.outputs['Color'], mx2.inputs['Factor'])
        L.new(col, mx2.inputs['A']); mx2.inputs['B'].default_value = (*lin(mid), 1); col = mx2.outputs['Result']
    L.new(col, bsdf.inputs['Base Color'])
    if bump or wrinkle:
        bn = n.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = bump + wrinkle
        nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40 if not wrinkle else 9; nz.inputs['Detail'].default_value = 8
        L.new(nz.outputs['Fac'], bn.inputs['Height']); L.new(bn.outputs['Normal'], bsdf.inputs['Normal'])
    tr = n.new('ShaderNodeBsdfTranslucent'); L.new(col, tr.inputs['Color'])
    ms = n.new('ShaderNodeMixShader'); ms.inputs['Fac'].default_value = trans
    out_n = n['Material Output']
    L.new(bsdf.outputs['BSDF'], ms.inputs[1]); L.new(tr.outputs['BSDF'], ms.inputs[2]); L.new(ms.outputs['Shader'], out_n.inputs['Surface'])
    return m

def plain(name, color, rough=0.6):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*lin(color), 1); b.inputs['Roughness'].default_value = rough
    return m

# ---------------- 叶片几何 ----------------
def blade(bm, uvl, length, width, start, bend, az, origin=Vector((0, 0, 0)), segs=10, cols=4, profile=None, fold=0.15, twist=0.0, frill=0.0, wrinkle=0.0, rnd=None):
    """一片叶子：从 origin 出发，起始仰角 start（离竖直方向的弧度），沿长度再弯 bend；az 是朝向。
    profile(t) 给宽度比例；fold 让叶片沿中脉折成 V 形；frill 是叶缘的波浪（生菜）；wrinkle 是叶面的皱"""
    profile = profile or (lambda t: math.sin(math.pi * min(1, t * 1.15)) ** 0.7 * (1 - t * 0.3))
    rows, p, ang = [], origin.copy(), start
    ds = length / segs
    rot = Matrix.Rotation(az, 3, 'Z')
    for i in range(segs + 1):
        t = i / segs
        d = Vector((math.sin(ang), 0, math.cos(ang)))
        side = Vector((0, 1, 0))
        tw = twist * t
        w = width * profile(t)
        row = []
        for j in range(cols + 1):
            u = j / cols * 2 - 1
            off = side * (u * w / 2) * math.cos(tw)
            nrm = d.cross(side).normalized()
            z = -fold * abs(u) * w + frill * w * math.sin(t * 40 + u * 3) * abs(u) ** 2 + (wrinkle * w * math.sin(t * 23 + u * 9) * math.cos(u * 7 + t * 5) if wrinkle else 0)
            v = p + off + nrm * z
            row.append(bm.verts.new(origin + rot @ (v - origin)))
        rows.append(row)
        p = p + d * ds
        ang += bend / segs
    for i in range(segs):
        for j in range(cols):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            for k, (a, b) in enumerate([(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]):
                f.loops[k][uvl].uv = (b / cols, a / segs)
    return p

def new_obj(name, build, mat):
    me = bpy.data.meshes.new(name); bm = bmesh.new(); uvl = bm.loops.layers.uv.new()
    build(bm, uvl)
    bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.data.materials.append(mat)
    return ob

def grains(name, pts, mat, r=0.0035):
    """稻穗上的一粒粒谷子：一串小椭球"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    for p in pts:
        g = bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=r)
        bmesh.ops.scale(bm, vec=(1, 1, 1.9), verts=g['verts'])
        bmesh.ops.translate(bm, vec=p, verts=g['verts'])
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob); ob.data.materials.append(mat)
    return ob

# ---------------- 作物 ----------------
def rice(seed, golden):
    rnd = random.Random(seed)
    base, tip = ((0.24, 0.36, 0.12), (0.45, 0.56, 0.2)) if not golden else ((0.42, 0.45, 0.2), (0.74, 0.64, 0.3))
    lm = leaf_material('rice_leaf', base, tip, trans=0.2, rough=0.45)
    gm = plain('grain', (0.8, 0.66, 0.32) if golden else (0.55, 0.6, 0.3), 0.5)
    def build(bm, uvl):
        for b in range(48):
            az = rnd.random() * 6.28
            o = Vector(((rnd.random() - 0.5) * 0.06, (rnd.random() - 0.5) * 0.06, 0))
            blade(bm, uvl, 0.55 + rnd.random() * 0.35, 0.016, 0.04 + rnd.random() * 0.22, 0.3 + rnd.random() * 0.8, az, o, segs=8, cols=2, fold=0.3, profile=lambda t: 1 - t * 0.85)
    objs = [new_obj('rice', build, lm)]
    pts = []
    for k in range(7 if golden else 4):
        az = rnd.random() * 6.28; h = 0.62 + rnd.random() * 0.15; lean = 0.15 + rnd.random() * 0.2
        base_p = Vector((math.cos(az) * lean * 0.3, math.sin(az) * lean * 0.3, h))
        for i in range(22):
            t = i / 22
            droop = (t ** 1.6) * (0.25 if golden else 0.1)
            pts.append(base_p + Vector((math.cos(az) * (t * 0.16 + droop * 0.5), math.sin(az) * (t * 0.16 + droop * 0.5), -droop + t * 0.05)) + Vector(((rnd.random() - 0.5) * 0.02, (rnd.random() - 0.5) * 0.02, 0)))
    objs.append(grains('panicle', pts, gm))
    return objs

def cabbage(seed, kind):
    rnd = random.Random(seed)
    if kind == 'cabbage':
        lm = leaf_material('cab', (0.84, 0.88, 0.74), (0.2, 0.36, 0.12), mid=(0.82, 0.86, 0.72), trans=0.1, rough=0.6, wrinkle=0.6, pivot=0.15, midw=0.05)
        hm = leaf_material('cabin', (0.86, 0.9, 0.72), (0.55, 0.7, 0.32), mid=(0.9, 0.92, 0.82), trans=0.15, rough=0.5, wrinkle=0.5, pivot=0.3)
        def build(bm, uvl):
            n = 8 + rnd.randint(0, 3)
            for i in range(n):  # 外圈摊开的老叶
                blade(bm, uvl, 0.26 + rnd.random() * 0.08, 0.17, 0.75 + rnd.random() * 0.35, 0.7 + rnd.random() * 0.4, i / n * 6.28 + rnd.random() * 0.4, segs=10, cols=6, fold=0.12, wrinkle=0.05,
                      profile=lambda t: (0.35 + 0.65 * math.sin(math.pi * min(1, t * 1.05)) ** 0.6) * (1 - 0.15 * t))
        def heart(bm, uvl):  # 里圈半抱着的嫩叶：张开一点、叶尖外翻，不是一个光滑的花苞
            for i in range(7):
                blade(bm, uvl, 0.17 + rnd.random() * 0.04, 0.14, 0.25 + rnd.random() * 0.2, 0.25 + rnd.random() * 0.3, i / 7 * 6.28 + rnd.random() * 0.5, segs=8, cols=6, fold=0.2, wrinkle=0.08)
        return [new_obj(kind, build, lm), new_obj(kind + '_in', heart, hm)]
    else:  # 生菜：叶缘波浪，嫩绿偏黄
        lm = leaf_material('let', (0.72, 0.8, 0.42), (0.42, 0.6, 0.2), trans=0.25, rough=0.5, wrinkle=0.3, pivot=0.2)
        def build(bm, uvl):
            for ring, (n, st, bd) in enumerate([(9, 0.95, 0.5), (7, 0.55, 0.4), (5, 0.25, 0.2)]):
                for i in range(n):
                    blade(bm, uvl, 0.16 - ring * 0.02, 0.15 - ring * 0.02, st + rnd.random() * 0.2, bd, i / n * 6.28 + ring * 0.4 + rnd.random() * 0.3, segs=9, cols=6, fold=0.1, frill=0.12,
                          profile=lambda t: math.sin(math.pi * min(1, 0.15 + t * 0.95)) ** 0.5)
    return [new_obj(kind, build, lm)]

def scallion(seed):
    rnd = random.Random(seed)
    lm = leaf_material('sc', (0.92, 0.94, 0.88), (0.22, 0.42, 0.18), trans=0.2, rough=0.4, pivot=0.12)
    def build(bm, uvl):
        for i in range(14):
            az = rnd.random() * 6.28
            o = Vector(((rnd.random() - 0.5) * 0.04, (rnd.random() - 0.5) * 0.04, 0))
            blade(bm, uvl, 0.35 + rnd.random() * 0.18, 0.012, 0.05 + rnd.random() * 0.25, 0.2 + rnd.random() * 0.7, az, o, segs=8, cols=3, fold=0.45, profile=lambda t: 1 - t * 0.6)
    return [new_obj('scallion', build, lm)]

def corn(seed):
    rnd = random.Random(seed)
    lm = leaf_material('corn', (0.26, 0.4, 0.14), (0.48, 0.58, 0.26), mid=(0.72, 0.76, 0.58), trans=0.2, rough=0.5)
    sm = plain('stalk', (0.35, 0.45, 0.16), 0.5)
    tm = plain('tassel', (0.7, 0.6, 0.35), 0.7)
    h = 1.7 + rnd.random() * 0.3
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.022, depth=h, location=(0, 0, h / 2))
    stalk = bpy.context.object; stalk.data.materials.append(sm)
    def build(bm, uvl):
        for i in range(12):
            z = 0.15 + i / 12 * (h - 0.35)
            blade(bm, uvl, 0.8 + rnd.random() * 0.25, 0.1, 0.45 + rnd.random() * 0.3, 1.1 + rnd.random() * 0.5, i * 2.4 + rnd.random() * 0.4, Vector((0, 0, z)), segs=12, cols=4, fold=0.25,
                  profile=lambda t: (0.6 + 0.4 * math.sin(math.pi * min(1, t * 1.6))) * (1 - t ** 3))
    leaves = new_obj('corn', build, lm)
    pts = [Vector((math.cos(a) * 0.02 * t * 6, math.sin(a) * 0.02 * t * 6, h + 0.02 + t * 0.2 - (t * 0.35) ** 2)) for a in [i * 1.3 for i in range(6)] for t in [k / 10 for k in range(10)]]
    tassel = grains('tassel', pts, tm, 0.004)
    ears = []
    for k in range(2):
        a = rnd.random() * 6.28; z = h * (0.45 + k * 0.12)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.035, location=(math.cos(a) * 0.04, math.sin(a) * 0.04, z))
        e = bpy.context.object; e.scale = (1, 1, 3); e.rotation_euler = (math.cos(a + 1.57) * 0.4, math.sin(a + 1.57) * 0.4, 0)
        e.data.materials.append(leaf_material('husk', (0.5, 0.58, 0.28), (0.66, 0.66, 0.36), trans=0.2)); ears.append(e)
    return [stalk, leaves, tassel] + ears

# ---------------- 渲成照片 ----------------
meta_path = os.path.join(out, 'impostors.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
def shoot(name, objs, px, pitch_deg):
    pitch = math.radians(pitch_deg)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    # 有俯角时，画面里的高度 = 竖直高度 × cos + 前后进深 × sin
    w = hi.x - lo.x
    hv = (hi.z - lo.z) * math.cos(pitch) + (hi.y - lo.y) * math.sin(pitch)
    d = 20
    co.location = center + Vector((0, -d * math.cos(pitch), d * math.sin(pitch)))
    co.rotation_euler = (math.pi / 2 - pitch, 0, 0)
    cam.ortho_scale = max(w, hv) * 1.04; cam.clip_end = 100
    asp = w / hv
    if hv >= w: scene.render.resolution_y = px; scene.render.resolution_x = max(8, round(px * asp))
    else: scene.render.resolution_x = px; scene.render.resolution_y = max(8, round(px / asp))
    tmp = os.path.join(out, name + '.png'); scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    Image.open(tmp).convert('RGBA').save(os.path.join(out, name + '.webp'), 'WEBP', quality=86, method=6); os.remove(tmp)
    meta[name] = {'w': round(w * 1.04 if w >= hv else hv * 1.04 * asp, 3), 'h': round(hv * 1.04 if hv >= w else w * 1.04 / asp, 3)}
    print('rendered', name, meta[name])
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)

only = os.environ.get('ONLY', '')
jobs = [
    ('rice_green', lambda s: rice(s, False), 256, 8, 3), ('rice_golden', lambda s: rice(s, True), 256, 8, 3),
    ('cabbage', lambda s: cabbage(s, 'cabbage'), 256, 18, 3), ('lettuce', lambda s: cabbage(s, 'lettuce'), 224, 18, 3),
    ('scallion', scallion, 192, 14, 2), ('corn', corn, 384, 6, 2),
]
for name, fn, px, pitch, nvar in jobs:
    if only and name not in only.split(','): continue
    for v in range(nvar):
        shoot(f'{name}_{v}', fn(v * 17 + 3), px, pitch)

# ---------------- 俯视的水田细节贴图（无缝平铺） ----------------
if not only or 'paddy' in only:
    T = 2.0  # 一张贴图对应 2 米见方，秧苗行距 0.25 米
    water = bpy.data.materials.new('water'); water.use_nodes = True
    wb = water.node_tree.nodes['Principled BSDF']; wb.inputs['Base Color'].default_value = (*lin((0.3, 0.27, 0.22)), 1); wb.inputs['Roughness'].default_value = 0.08
    bpy.ops.mesh.primitive_plane_add(size=T * 1.5, location=(0, 0, 0)); pl = bpy.context.object; pl.data.materials.append(water)
    lm = leaf_material('paddy_leaf', (0.24, 0.36, 0.12), (0.45, 0.56, 0.2), trans=0.2)
    rnd = random.Random(7)
    def build(bm, uvl):
        n = int(T / 0.25)
        for i in range(-1, n + 1):
            for j in range(-1, n + 1):
                rr = random.Random((i % n) * 131 + (j % n))  # 按格子取模：贴图左右、上下接得上
                o = Vector((-T / 2 + (i + 0.5) * T / n + (rr.random() - 0.5) * 0.04, -T / 2 + (j + 0.5) * T / n + (rr.random() - 0.5) * 0.04, 0))
                for b in range(9):
                    blade(bm, uvl, 0.22 + rr.random() * 0.12, 0.008, 0.15 + rr.random() * 0.35, 0.4 + rr.random() * 0.8, rr.random() * 6.28, o, segs=5, cols=1, fold=0.0, profile=lambda t: 1 - t * 0.8)
    pad = new_obj('paddy', build, lm)
    co.location = (0, 0, 10); co.rotation_euler = (0, 0, 0); cam.ortho_scale = T
    scene.render.resolution_x = scene.render.resolution_y = 512; scene.render.film_transparent = False
    tmp = os.path.join(out, 'paddy.png'); scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = ImageOps.grayscale(Image.open(tmp).convert('RGB'))
    # 归一化成平均 0.5 的细节图：网页里乘 2 叠在田的底色上，平均不改变颜色
    import statistics
    mean = statistics.mean(im.getdata())
    im = im.point(lambda v: max(0, min(255, int(128 + (v - mean) * 1.1))))
    im.save(os.path.join(out, 'paddy_detail.webp'), 'WEBP', quality=88); os.remove(tmp)
    print('paddy detail', mean)

json.dump(meta, open(meta_path, 'w'), indent=1)
print('done')
