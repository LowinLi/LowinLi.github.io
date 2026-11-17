"""
冰箱里的可乐罐和冰棍儿换成 Sketchfab 上的模型（CC-BY，见 CREDITS.md；从 Objaverse 的镜像下载的 glb）：
  - Simple Cola Can（aaa11e57…）：一个网格，Blender 里是 Z 朝上。
  - Ice Cream Bars（3ff7b700…）：一个网格里有两根巧克力脆皮冰棍——一根完整的、一根被咬了一口的，外加一个纸杯（扔掉）。

这里把它们摆正、按真实尺寸缩放、原点放在网页代码要的位置，贴图缩小转 webp，导出成网页直接用的 glb：
  cola.glb   罐底中心在原点，高 CAN_H（0.115 米）
  icebar.glb 两个物体 whole / bitten：冰棍宽度方向是 x，厚度 y，长度 z（导出成 glTF 后是 y 朝上）；
             原点在巧克力的下沿（棍子从这里往下伸），宽 POP_W（0.042 米）

用法：bvenv/bin/python tools/prep_fridge_models.py <cola.glb> <icebars.glb> <输出目录>
"""
import bpy, sys, math, os
import mathutils
from mathutils import Vector, Matrix

cola_src, bars_src, out = sys.argv[-3], sys.argv[-2], sys.argv[-1]
CAN_H, POP_W = 0.115, 0.042
os.makedirs(out, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def apply_all(objs):
    """把父子层级上的变换全部烤进顶点，去掉空物体"""
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = name; o.data.name = name
    return o


def shrink_images(maxpx):
    for im in bpy.data.images:
        if im.size[0] > maxpx: im.scale(maxpx, int(im.size[1] * maxpx / im.size[0]))


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format='GLB', export_image_format='WEBP',
                              export_image_quality=82, export_yup=True, export_apply=True, export_animations=False)


# ---------------- 可乐罐 ----------------
reset()
bpy.ops.import_scene.gltf(filepath=cola_src)
apply_all(meshes())
can = join(meshes(), 'cola')
vs = [v.co for v in can.data.vertices]
lo = Vector([min(v[i] for v in vs) for i in range(3)]); hi = Vector([max(v[i] for v in vs) for i in range(3)])
s = CAN_H / (hi.z - lo.z)
can.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector(((-(lo.x + hi.x) / 2), -(lo.y + hi.y) / 2, -lo.z))))
print('can radius', (hi.x - lo.x) / 2 * s)
shrink_images(1024)
export(os.path.join(out, 'cola.glb'), [can])

# ---------------- 冰棍 ----------------
reset()
bpy.ops.import_scene.gltf(filepath=bars_src)
apply_all(meshes())
bars = [o for o in meshes() if o.data.materials and o.data.materials[0].name == 'material']
for o in meshes():
    if o not in bars: bpy.data.objects.remove(o)   # 纸杯
bar = join(bars, 'bars')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = meshes()
cen = lambda o: sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
# 两根冰棍按 x 分开（一根在 x < 0.5，一根在右边）
groups = {'a': [p for p in parts if cen(p).x < 0.5], 'b': [p for p in parts if cen(p).x >= 0.5]}
result = []
for key, ps in groups.items():
    o = join(ps, key)
    pts = [v.co.copy() for v in o.data.vertices]
    c = sum(pts, Vector()) / len(pts)
    # 主成分：最长的方向是冰棍的长度方向，第二长的是宽度
    cov = [[sum((p[i] - c[i]) * (p[j] - c[j]) for p in pts) / len(pts) for j in range(3)] for i in range(3)]
    M = mathutils.Matrix(cov)
    # 幂迭代求两个主轴
    def power(M, skip=None):
        v = Vector((1, 0.3, 0.2)).normalized()
        for _ in range(200):
            w = M @ v
            if skip is not None: w -= skip * w.dot(skip)
            v = w.normalized()
        return v
    u = power(M); w = power(M, u); t = u.cross(w)
    proj = lambda p: Vector(((p - c).dot(w), (p - c).dot(t), (p - c).dot(u)))
    loc = [proj(p) for p in pts]
    # 哪头是棍子：两头各取 15% 长度，宽度窄的那头
    zs = [p.z for p in loc]; z0, z1 = min(zs), max(zs); L = z1 - z0
    wid = lambda a, b: max([abs(p.x) for p in loc if a <= p.z <= b] or [0])
    if wid(z0, z0 + L * 0.15) > wid(z1 - L * 0.15, z1):
        u = -u; t = -t; loc = [proj(p) for p in pts]; zs = [p.z for p in loc]; z0, z1 = min(zs), max(zs)
    # 巧克力的下沿：从下往上，宽度第一次超过最大宽度一半的位置
    full = max(abs(p.x) for p in loc)
    bins = 60; base = z0
    for i in range(bins):
        a = z0 + L * i / bins
        if wid(a, a + L / bins) > full * 0.5: base = a; break
    xs = [p.x for p in loc]; xc = (min(xs) + max(xs)) / 2
    ys = [p.y for p in loc]; yc = (min(ys) + max(ys)) / 2
    R = Matrix((w, t, u)).to_4x4()                  # 行是新的 x/y/z 轴
    s = POP_W / (max(xs) - min(xs))
    o.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(Vector((-xc, -yc, -base))) @ R @ Matrix.Translation(-c))
    o.data.update()
    top = max(v.co.z for v in o.data.vertices); bot = min(v.co.z for v in o.data.vertices)
    print('bar', key, 'top', round(top, 4), 'stick', round(bot, 4), 'thick', round((max(ys) - min(ys)) * s, 4))
    o.name = o.data.name = {'a': 'whole', 'b': 'bitten'}[key]   # 预览确认过：左边那根是完整的
    result.append(o)
shrink_images(512)
export(os.path.join(out, 'icebar.glb'), result)
