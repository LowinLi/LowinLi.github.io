"""
把 Poly Haven 的扫描植物（树、灌木、草丛、杂草）渲成带透明底的「照片」，给窗外的公告板（impostor）用。

窗外的东西只会从屋里、隔着窗、在有限的角度里看到，所以一棵几百万面的扫描树，可以换成一张始终朝着镜头的照片：
画面上几乎一样，三角形只有两个。光照用和屋里烘焙一样的日出天空 + 太阳方向（清晨逆光），颜色就能和场景对上。

用法（需要 pip install bpy pillow）：
  python tools/render_impostors.py <umhlanga_sunrise_1k.hdr> <模型目录> <输出目录>
模型目录里每个子目录是一个 Poly Haven 的 glTF（1k），例如 models/island_tree_02/island_tree_02_1k.gltf。
输出：<名字>_<变体>.webp（带透明）和 impostors.json（每张图对应的实际宽高，单位米）。
"""
import sys, os, json, math, glob
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)  # 从空场景开始：默认场景里那个立方体会把相机罩住
from mathutils import Vector
from PIL import Image

hdr, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)

# 要渲的东西：名字 → (图片高度像素, 变体)。变体是数字就是「整个模型绕竖轴转多少度」，
# 是字符串就是「套装里的哪一个」（Poly Haven 的草、杂草、小树苗是好几株并排放在一个文件里的）
ASSETS = {
    'island_tree_02': (640, [0, 140]),
    'tree_small_02': (640, [0, 120]),
    'shrub_02': (384, ['shrub_02_a', 'shrub_02_b', 'shrub_02_c', 'shrub_02_d']),
    'shrub_04': (256, [0]),
    'grass_medium_01': (256, ['large_a', 'large_b', 'large_c', 'mid_a', 'tall_a', 'tall_b']),
    'grass_bermuda_01': (128, ['seedling_a', 'seedling_d', 'medium_f']),
    'weed_plant_02': (160, ['_a_', '_b_', '_c_']),
    'nettle_plant': (160, ['tall_a', 'tall_b', 'medium_a']),
}

bl = lambda x, y, z: Vector((x, -z, y))           # three.js（y 朝上）→ Blender（z 朝上）
SUN_TRAVEL = Vector((0.12, -0.24, 1.0)).normalized()  # 和 bake_lighting.py 一样：光朝屋里（+z）斜照下来，屋外的东西是逆光

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'   # 直接输出 sRGB，网页里当普通贴图用
scene.view_settings.exposure = float(os.environ.get('EXPOSURE', '0'))
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'

world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
nt = world.node_tree; bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(hdr)
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
mp.inputs['Rotation'].default_value = (0, 0, -2.32)
nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
nt.links.new(env.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = float(os.environ.get('SKY', '1.4'))
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.color = (1.0, 0.76, 0.52); sun.angle = math.radians(2)
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so)
so.rotation_euler = bl(*SUN_TRAVEL).to_track_quat('-Z', 'Y').to_euler()

cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co); scene.camera = co
PITCH = math.radians(4)  # 屋里的人比地面高一点，略微往下看

meta = {}
only = os.environ.get('ONLY', '').split(',') if os.environ.get('ONLY') else None
for name, (px, yaws) in ASSETS.items():
    if only and name not in only: continue
    files = glob.glob(os.path.join(src, name, '*.gltf'))
    if not files:
        print('skip', name); continue
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=files[0])
    objs = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name + '_root', None); scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None: o.parent = root
    meshes = [o for o in objs if o.type == 'MESH']
    for vi, var in enumerate(yaws):
        if isinstance(var, str):
            shown = [o for o in meshes if var in o.name]
            root.rotation_euler = (0, 0, 0)
        else:
            shown = meshes
            root.rotation_euler = (0, 0, math.radians(var))
        for o in meshes: o.hide_render = o not in shown
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in shown for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        w, h = hi.x - lo.x, hi.z - lo.z
        center = (lo + hi) / 2
        # 相机在 Blender 的 -y 方向（three 里的 +z，屋子那边），朝 +y 看
        d = max(hi.y - lo.y, w, h) * 3
        co.location = Vector((center.x, center.y - d * math.cos(PITCH), center.z + d * math.sin(PITCH)))
        co.rotation_euler = (math.pi / 2 - PITCH, 0, 0)
        cam.ortho_scale = max(w, h) * 1.04
        cam.clip_end = d * 4
        aspect = w / h
        scene.render.resolution_y = px if h >= w else round(px / aspect)
        scene.render.resolution_x = round(scene.render.resolution_y * aspect) if h >= w else px
        tmp = os.path.join(out, f'{name}_{vi}.png')
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        # 存成带透明的 webp；记下实际宽高（米）和地面在图里的位置，网页里按这个摆
        im = Image.open(tmp).convert('RGBA')
        im.save(os.path.join(out, f'{name}_{vi}.webp'), 'WEBP', quality=86, method=6)
        if not os.environ.get('KEEP'): os.remove(tmp)
        sw = cam.ortho_scale * (1 if w >= h else aspect) / (1.0 if w >= h else 1)
        meta[f'{name}_{vi}'] = {'w': round(w * 1.04 if w >= h else h * 1.04 * aspect, 3), 'h': round(h * 1.04 if h >= w else w * 1.04 / aspect, 3)}
        print('rendered', name, vi, meta[f'{name}_{vi}'])
    for o in objs + [root]: bpy.data.objects.remove(o, do_unlink=True)

json.dump(meta, open(os.path.join(out, 'impostors.json'), 'w'), indent=1)
print('done')
