"""
用 Blender (Cycles) 给房间的墙和地板烘焙全局光照贴图。

为什么：实时渲染里墙和地板只有「直射光 + 均匀环境光」，看起来是平的。
这里按房间的真实尺寸搭一个等比场景，让天光从窗户进来、阳光打在地板上再弹到墙面，
把结果烘成四张光照贴图（地板、窗墙、左墙、右墙），运行时直接贴上去。

用法（需要 pip install bpy numpy pillow，以及一张天空 HDR）：
    python tools/bake_lighting.py <sky.hdr> <输出目录> [--preview preview.png] [--samples 300]

坐标和尺寸必须和 src/scene/layout.ts、room.ts、furniture.ts 保持一致。改了房间或大件家具的位置，就要重新烘焙。
uv 的投影方式也要和 room.ts 里的 LIGHTMAP_UV 一致。
"""
import sys, math, argparse
import bpy, numpy as np
from mathutils import Vector
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('hdr'); ap.add_argument('out')
ap.add_argument('--preview'); ap.add_argument('--samples', type=int, default=300)
# 天空图绕竖直轴的旋转：-2.32 时照片里的太阳和 SUN_DIR 对齐（用 --preview --inside 目视确认过）
ap.add_argument('--sky-rot', type=float, default=-2.32)
# 天光强度：物理上真实的比例下房间会很暗，而运行时桌面物件的环境光是按「明亮的清晨」调的，这里把天光提到和它一致
ap.add_argument('--sky-strength', type=float, default=5.0)
ap.add_argument('--inside', action='store_true', help='预览时从屋内朝窗外看')
args = ap.parse_args(sys.argv[1:])

# ---- 和 layout.ts 一致的尺寸（three 的坐标系：y 向上，-z 朝窗外）----
FLOOR_Y, TOP = -0.75, 2.9
WALL_Z, RX, RZ, TH = -1.15, 3.2, 4.6, 0.2
WIN = dict(x0=-1.3, x1=1.3, y0=0.14, y1=1.85)
SUN_TRAVEL = Vector((0.12, -0.24, 1.0)).normalized()  # 光线前进方向 = -SUN_LIGHT_DIR
RANGE = 3.0  # 贴图里 1.0 对应的亮度；runtime 的 lightMapIntensity 要乘回去

bl = lambda x, y, z: Vector((x, -z, y))  # three → Blender（z 向上）

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = args.samples
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 5
scene.cycles.sample_clamp_indirect = 6  # 压掉天空图里太阳造成的噪点
scene.render.threads_mode = 'AUTO'

def material(name, color, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    return m

def add_mesh(name, verts, faces, mat, uvs=None, want_normal=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if want_normal is not None:  # 保证面朝向房间里面
        for p in me.polygons:
            if p.normal.dot(want_normal) < 0: p.flip()
        me.update()
    if uvs is not None:
        layer = me.uv_layers.new(name='lightmap')
        for loop in me.loops: layer.data[loop.index].uv = uvs[loop.vertex_index]
    ob = bpy.data.objects.new(name, me); ob.data.materials.append(mat)
    scene.collection.objects.link(ob)
    return ob

def box(name, center, size, mat, rot_y=0.0):
    """three 坐标系里的盒子：center=(x,y,z)，size=(sx,sy,sz)，绕 y 轴转 rot_y"""
    cx, cy, cz = center; sx, sy, sz = (s / 2 for s in size)
    c, s = math.cos(rot_y), math.sin(rot_y)
    vs = []
    for dx in (-sx, sx):
        for dy in (-sy, sy):
            for dz in (-sz, sz):
                vs.append(bl(cx + dx * c + dz * s, cy + dy, cz - dx * s + dz * c))
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return add_mesh(name, vs, faces, mat)

H = TOP - FLOOR_Y
X0, X1 = -(RX + TH), RX + TH           # 地板和窗墙的横向范围
Z0, Z1 = WALL_Z - TH, RZ               # 地板的纵深范围
m_wall = material('wall', (0.74, 0.71, 0.66))
m_floor = material('floor', (0.42, 0.43, 0.44), 0.6)  # 灰色方砖
m_wood = material('wood', (0.3, 0.16, 0.1), 0.5)  # 深色实木
m_dark = material('dark', (0.06, 0.06, 0.07), 0.4)
m_cloth = material('cloth', (0.85, 0.82, 0.76))
m_mid = material('mid', (0.3, 0.3, 0.32))
m_green = material('green', (0.12, 0.3, 0.16))
m_brass = material('brass', (0.6, 0.42, 0.14), 0.3)

# ---- 四个烘焙目标：uv 是平面投影，和 room.ts 的 LIGHTMAP_UV 一致 ----
targets = {}
uvf = lambda x, z: ((x - X0) / (X1 - X0), (z - Z0) / (Z1 - Z0))
c = [(X0, Z0), (X1, Z0), (X1, Z1), (X0, Z1)]
targets['floor'] = (add_mesh('floor', [bl(x, FLOOR_Y, z) for x, z in c], [(0, 1, 2, 3)], m_floor, [uvf(x, z) for x, z in c], Vector((0, 0, 1))), (768, 672))

uvb = lambda x, y: ((x - X0) / (X1 - X0), (y - FLOOR_Y) / H)
xs, ys = [X0, WIN['x0'], WIN['x1'], X1], [FLOOR_Y, WIN['y0'], WIN['y1'], TOP]
verts, uvs, faces = [], [], []
for j, y in enumerate(ys):
    for i, x in enumerate(xs): verts.append(bl(x, y, WALL_Z)); uvs.append(uvb(x, y))
for j in range(3):
    for i in range(3):
        if i == 1 and j == 1: continue  # 窗洞
        a = j * 4 + i; faces.append((a, a + 1, a + 5, a + 4))
targets['wall_back'] = (add_mesh('wall_back', verts, faces, m_wall, uvs, bl(0, 0, 1)), (768, 416))

uvs_side = lambda z, y: ((z - Z0) / (Z1 - Z0), (y - FLOOR_Y) / H)
for name, x, n in (('wall_left', -RX, bl(1, 0, 0)), ('wall_right', RX, bl(-1, 0, 0))):
    c = [(Z0, FLOOR_Y), (Z1, FLOOR_Y), (Z1, TOP), (Z0, TOP)]
    targets[name] = (add_mesh(name, [bl(x, y, z) for z, y in c], [(0, 1, 2, 3)], m_wall, [uvs_side(z, y) for z, y in c], n), (640, 400))

# ---- 不烘焙、只参与光照的部分：天花板、朝镜头那面墙（运行时是敞开的）、窗洞的厚度 ----
add_mesh('ceiling', [bl(X0, TOP, Z0), bl(X1, TOP, Z0), bl(X1, TOP, Z1), bl(X0, TOP, Z1)], [(0, 1, 2, 3)], m_wall)
add_mesh('front', [bl(X0, FLOOR_Y, Z1), bl(X1, FLOOR_Y, Z1), bl(X1, TOP, Z1), bl(X0, TOP, Z1)], [(0, 1, 2, 3)], m_wall)
wy, wh, ww = (WIN['y0'] + WIN['y1']) / 2, WIN['y1'] - WIN['y0'], WIN['x1'] - WIN['x0']
box('reveal_l', (WIN['x0'] - 0.01, wy, WALL_Z - TH / 2), (0.02, wh, TH), m_wall)
box('reveal_r', (WIN['x1'] + 0.01, wy, WALL_Z - TH / 2), (0.02, wh, TH), m_wall)
box('reveal_t', (0, WIN['y1'] + 0.01, WALL_Z - TH / 2), (ww, 0.02, TH), m_wall)
box('sill', (0, WIN['y0'] - 0.0175, WALL_Z - 0.02), (ww + 0.16, 0.035, 0.3), m_wood)
# 木格窗：外框、两根竖框、上面的横披（格子用一排细条近似）
fz = WALL_Z - 0.11
for y in (WIN['y1'] - 0.03, WIN['y0'] + 0.03): box('frame_h', (0, y, fz), (ww, 0.06, 0.08), m_wood)
for x in (WIN['x0'] + 0.03, WIN['x1'] - 0.03, -ww / 6, ww / 6): box('frame_v', (x, wy, fz), (0.065, wh, 0.08), m_wood)
ty0 = WIN['y1'] - 0.06 - 0.36
box('transom_rail', (0, ty0, fz), (ww, 0.045, 0.06), m_wood)
for i in range(1, 18): box('transom_bar', (WIN['x0'] + ww * i / 18, ty0 + 0.19, fz), (0.02, 0.36, 0.03), m_wood)
box('transom_mid', (0, ty0 + 0.19, fz), (ww, 0.02, 0.03), m_wood)
# 卷起来的竹帘
box('blind', (0, WIN['y1'] + 0.03, WALL_Z + 0.05), (ww + 0.1, 0.1, 0.1), m_cloth)
# 屋外的地面：菜园和稻田把偏绿的光反弹进来
add_mesh('ground', [bl(-200, -0.95, -400), bl(200, -0.95, -400), bl(200, -0.95, WALL_Z - TH), bl(-200, -0.95, WALL_Z - TH)], [(0, 1, 2, 3)], material('ground', (0.22, 0.3, 0.12)))

# ---- 家具和桌面物件的遮挡体（位置和 desk.ts / furniture.ts 一致，形状取近似）----
box('desk_top', (0, -0.02, 0), (2.3, 0.04, 1.0), m_wood)
for x in (-1.05, 1.05):
    for z in (-0.42, 0.42): box('desk_leg', (x, (FLOOR_Y - 0.04) / 2, z), (0.06, -FLOOR_Y - 0.04, 0.06), m_wood)
    box('desk_apron', (x, -0.085, 0), (0.035, 0.09, 0.84), m_wood)
box('monitor', (0, 0.37, -0.205), (0.66, 0.39, 0.02), m_dark)
box('monitor_stand', (0, 0.17, -0.26), (0.075, 0.34, 0.012), m_mid)
box('books', (-0.63, 0.115, -0.27), (0.52, 0.23, 0.17), m_mid)
box('gramophone', (0.8, 0.07, -0.2), (0.36, 0.14, 0.36), m_wood)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.17, location=bl(0.72, 0.6, -0.1)); bpy.context.object.data.materials.append(m_brass)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=bl(-1.03, 0.24, 0.33)); bpy.context.object.data.materials.append(m_green)
box('plant_floor_pot', (1.72, FLOOR_Y + 0.31, -0.5), (0.36, 0.3, 0.36), m_cloth)
box('plant_floor_leaves', (1.72, FLOOR_Y + 0.9, -0.5), (0.3, 0.8, 0.3), m_green)
# 圈椅（斜着推开）
box('chair_seat', (0.62, FLOOR_Y + 0.36, 1.42), (0.44, 0.05, 0.42), m_wood, -0.55)
box('chair_back', (0.62 + 0.2 * math.sin(-0.55), FLOOR_Y + 0.75, 1.42 + 0.2 * math.cos(-0.55)), (0.42, 0.75, 0.04), m_wood, -0.55)
for dx in (-0.2, 0.2):
    for dz in (-0.19, 0.19): box('chair_leg', (0.62 + dx, FLOOR_Y + 0.17, 1.42 + dz), (0.04, 0.34, 0.04), m_wood)
# 左墙边的条案和上面的瓷瓶
box('console_top', (-2.99, FLOOR_Y + 0.63, 1.3), (0.34, 0.06, 1.72), m_wood)
for dz in (-0.75, 0.75): box('console_leg', (-2.99, FLOOR_Y + 0.3, 1.3 + dz), (0.3, 0.6, 0.08), m_wood)
box('vase', (-2.99, FLOOR_Y + 0.88, 0.8), (0.24, 0.44, 0.24), m_cloth)
# 右后方的茶几和两只凳子
box('tea_table', (2.3, FLOOR_Y + 0.25, 2.7), (0.84, 0.5, 0.84), m_wood, 0.3)
box('stool_a', (1.45, FLOOR_Y + 0.31, 2.5), (0.5, 0.62, 0.6), m_wood, 0.4)
box('stool_b', (2.5, FLOOR_Y + 0.31, 3.55), (0.5, 0.62, 0.6), m_wood, -0.5)
# 窗边的落地座钟
box('clock', (-2.15, FLOOR_Y + 1.1, WALL_Z + 0.32), (0.6, 2.19, 0.42), m_wood)

# ---- 光：实拍天空做环境光，加一盏和实时渲染方向一致的太阳 ----
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(args.hdr)
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
mp.inputs['Rotation'].default_value = (0, 0, args.sky_rot)
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
nt.links.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = args.sky_strength
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; sun.color = (1.0, 0.72, 0.46); sun.angle = math.radians(1.5)
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so)
so.rotation_euler = bl(*SUN_TRAVEL).to_track_quat('-Z', 'Y').to_euler()

if args.preview:
    cam = bpy.data.cameras.new('cam'); cam.lens = 22; co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
    eye, aim = (bl(0, 0.9, 2.6), bl(0, 0.8, -1.15)) if args.inside else (bl(2.6, 1.9, 4.2), bl(0, 0.2, 0.3))
    co.location = eye
    co.rotation_euler = (aim - eye).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co
    scene.render.resolution_x, scene.render.resolution_y = 720, 450
    scene.cycles.samples = 64; scene.cycles.use_denoising = False
    scene.view_settings.view_transform = 'Standard'
    scene.render.filepath = args.preview
    # 预览时前墙和天花板只对相机隐形，仍然挡光（否则天光会从敞开的一面灌进来）
    bpy.data.objects['front'].visible_camera = False
    bpy.data.objects['ceiling'].visible_camera = False
    bpy.ops.render.render(write_still=True)
    print('preview written', args.preview)
    sys.exit(0)

# ---- 烘焙：漫反射的直接光 + 间接光，不乘表面颜色 ----
scene.cycles.bake_type = 'DIFFUSE'
bset = scene.render.bake
bset.use_pass_direct = True; bset.use_pass_indirect = True; bset.use_pass_color = False
bset.margin = 6
def blur(a, sigma=1.3):
    """轻微的高斯模糊，抹掉残余噪点（光照本来就是低频的）"""
    r = int(sigma * 3); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    for ax in (0, 1):
        pad = [(r, r) if i == ax else (0, 0) for i in range(3)]
        a = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), ax, np.pad(a, pad, mode='edge'))
    return a
srgb = lambda v: np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(np.maximum(v, 1e-9), 1 / 2.4) - 0.055)
for name, (ob, (w, h)) in targets.items():
    img = bpy.data.images.new(name, w, h, float_buffer=True)
    mat = ob.data.materials[0].copy(); ob.data.materials[0] = mat
    node = mat.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='DIFFUSE')
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    print(name, 'p50 %.3f p90 %.3f p99 %.3f max %.3f' % tuple(np.percentile(px, q) for q in (50, 90, 99, 100)))
    # 墙面的光照变化很平缓，平滑得狠一些才能去掉采样噪点；地板要保留光斑和家具脚下阴影的边缘
    out = (np.clip(srgb(np.clip(blur(px, 2.2 if name == 'floor' else 6.0) / RANGE, 0, 1)), 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out).save(f'{args.out}/{name}.jpg', quality=88, optimize=True)
print('done')
