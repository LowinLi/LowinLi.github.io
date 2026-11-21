# 素材出处

`public/assets/` 下的实拍素材大部分来自 [Poly Haven](https://polyhaven.com)，动物和箩筐里的菜来自 Quaternius 和 Kenney，授权都是 **CC0**（可商用，无需署名）。冰箱里的可乐罐和雪糕是例外：CC BY 4.0，要署名（见下表）。这里记录出处，方便以后更新或替换。

| 文件 | 素材 | 用在哪里 | 处理 |
| --- | --- | --- | --- |
| `sky/sunrise_window.jpg`、`sky/sunrise_pano.jpg` | HDRI「Umhlanga Sunrise」 | 窗外的天空、室内环境反射 | 从 8K 色调映射图裁出太阳左右各约 60° 的一块；另缩一张 1024×512 的全景 |
| `tex/walnut_veneer_*` | 贴图「Walnut Veneer」 | 书桌台面、留声机木箱（运行时调深） | 1K，颜色图 + 法线图，重新压缩 |
| `tex/large_grey_tiles_*` | 贴图「Large Grey Tiles」 | 地面的青砖 | 同上 |
| `models/potted_plant_02/` | 模型「Potted Plant 02」 | 桌面左侧的盆栽（缩到 0.4 倍） | 1K 贴图重新压缩 |
| `models/potted_plant_04/` | 模型「Potted Plant 04」 | 显示器旁的小盆栽（缩到 0.62 倍） | 同上 |
| `models/chinese_armchair/` | 模型「Chinese Armchair」 | 书桌前的圈椅（缩到 0.72 倍） | 同上 |
| `models/chinese_console_table/` | 模型「Chinese Console Table」 | 左墙边的条案 | 同上 |
| `models/chinese_tea_table/` | 模型「Chinese Tea Table」 | 右后方的茶几 | 同上 |
| `models/chinese_stool/` | 模型「Chinese Stool」 | 茶几旁的两只凳子 | 贴图缩到 512 |
| `models/tea_set_01/` | 模型「Tea Set 01」 | 茶几上的茶具 | 贴图缩到 512 |
| `models/vintage_grandfather_clock_01/` | 模型「Vintage Grandfather Clock 01」 | 窗边的落地座钟（指针走真实时间；钟摆是另加的） | 1K 贴图重新压缩 |
| `models/antique_ceramic_vase_01/` | 模型「Antique Ceramic Vase 01」 | 条案上的青花瓷瓶 | 贴图缩到 512 |
| `models/ceramic_vase_01/` | 模型「Ceramic Vase 01」 | 条案上的小瓷瓶 | 贴图缩到 512 |
| `models/animals/cat.glb`、`dog.glb` | Quaternius「Animal Pack Vol.2」（[OpenGameArt](https://opengameart.org/content/animated-animales-low-poly)，CC0） | 菜园里走过的猫和狗 | .blend 转 glb，运行时重新上色 |
| `models/animals/cow.glb` | Quaternius「Farm Animals」（[OpenGameArt](https://opengameart.org/content/lowpoly-animated-farm-animal-pack)，CC0） | 稻田里的水牛、牛棚里的两头黄牛 | 同上 |
| `models/animals/pig.glb`、`sheep.glb` | 同一个 Quaternius「Farm Animals」包（CC0） | 猪圈里的猪、羊圈里的羊 | 包里的 FBX 用 three 的 FBXLoader 读进来、三角形按材质排好（不然导出成几十个小网格），再用 GLTFExporter 导成 glb；运行时重新上色 |
| `impostors/*.webp` | Poly Haven 模型「Island Tree 02」「Tree Small 02」「Shrub 02」「Shrub 04」「Grass Medium 01」「Weed Plant 02」（[polyhaven.com](https://polyhaven.com/models)，CC0） | 窗外的树、竹丛、灌木、草丛（公告板） | 在 Blender 里用日出天空渲成带透明底的照片，见 `tools/render_impostors.py` |
| `outdoor/*.jpg` | Poly Haven 贴图「Farm Soil」「Stony Dirt Path」「Plastered Wall」「Grey Roof Tiles」「Old Stone Wall」「Reed Roof 04」「Rough Linen」「Denim Fabric」（[polyhaven.com](https://polyhaven.com/textures)，CC0） | 菜园的泥土和菜畦、土路、农舍的墙和瓦、墙裙、踏脚石和井台、草垛、稻草人和农人的衣服 | 缩到 512–1024 |
| `models/fridge/cola.glb` | Sketchfab 模型「[Simple Cola Can](https://sketchfab.com/3d-models/aaa11e57064848268d701a3586792d0d)」，作者 Blender3D，**CC BY 4.0（需署名）** | 冰箱里的可乐罐 | 从 Objaverse 的镜像下载；摆正、缩到真实尺寸（高 11.5 cm），贴图缩到 1024 转 webp，见 `tools/prep_fridge_models.py`。罐子上的商标属于其所有者 |
| `models/fridge/icebar.glb` | Sketchfab 模型「[Ice Cream Bars](https://sketchfab.com/3d-models/3ff7b700266448668023b196645f583f)」，作者 ArbitraryCanary，**CC BY 4.0（需署名）** | 冰箱里的巧克力脆皮雪糕（完整的一根、咬过一口的一根） | 去掉纸杯、两根分开摆正，宽 4.2 cm，贴图缩到 512，同上 |
| `sounds/animals.mp3`、`animals.json` | 录音：Wikimedia Commons「[Medium rooster crowing](https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg)」「[Small rooster crowing](https://commons.wikimedia.org/wiki/File:Small_rooster_crowing.ogg)」「[Hen announcing shes lain an egg](https://commons.wikimedia.org/wiki/File:Hen_announcing_shes_lain_an_egg.ogg)」（alys，公有领域）、「[Meow of a pleading cat](https://commons.wikimedia.org/wiki/File:Meow_of_a_pleading_cat.oga)」（Heismark，公有领域）；OpenGameArt「[Dog barking mono](https://opengameart.org/content/dog-barking-mono)」（haeldb，CC0）、「[Meow](https://opengameart.org/content/meow)」（ignasd，CC0）、「[Cat Purr & Meow](https://opengameart.org/content/cat-purr-meow)」（kerzoven，CC0）、「[Squeaky Rat](https://opengameart.org/content/squeaky-rat)」（Iwan 'qubodup' Gabovitch，CC0）、「[Crickets Ambient Noise - loopable](https://opengameart.org/content/crickets-ambient-noise-loopable)」（Wolfgang_ / Ted Kerr，CC0）；Wikimedia Commons「[Strix aluco male](https://commons.wikimedia.org/wiki/File:Strix_aluco_male.oga)」（灰林鸮，Vianney Bajart，**CC BY-SA 4.0**——因此这个声音精灵文件整体按 CC BY-SA 4.0 提供）；Wikimedia Commons「[Mudchute cow 1](https://commons.wikimedia.org/wiki/File:Mudchute_cow_1.ogg)」「[Mudchute pig 2](https://commons.wikimedia.org/wiki/File:Mudchute_pig_2.ogg)」「[Mudchute pig 3](https://commons.wikimedia.org/wiki/File:Mudchute_pig_3.ogg)」（Secretlondon，伦敦 Mudchute 城市农场的录音，**CC BY-SA 3.0**）；OpenGameArt「[Sheep Baa](https://opengameart.org/content/sheep-baa)」（AntumDeluge，CC0） | 看窗外时的鸡叫、公鸡打鸣、狗叫、猫叫；夜里的猫头鹰、老鼠，白天的蛐蛐；圈里的牛哞、猪哼、羊咩（猪被抓时的尖叫是合成的） | 剪成一声声的片段、统一响度，拼成一个 mp3 声音精灵，见 `tools/build_animal_sounds.py` |
| `light/*.jpg` | 用上面那张 HDRI 当天光，在 Blender 里烘焙的光照贴图 | 地面和三面墙的光影 | 见 `tools/bake_lighting.py` |

图集里的稻丛、白菜、生菜、葱、玉米和 `outdoor/paddy_detail.webp` 是自己在 Blender 里按程序建模渲的（`tools/render_crops.py`），没有外部素材。

其余所有东西（窗外的向日葵、冰箱和咖啡机的音效、篱笆、房子的形状、远山、鸡、蝴蝶、鸟，木格窗、竹帘、字画，书桌、录音机和磁带、咖啡机和拿铁、咖啡豆袋、书、显示器、键盘、虎尾兰，音乐等）都是代码生成的，没有外部素材。

## 用到的开源库（运行时按需加载）

| 库 | 授权 | 用在哪里 |
| --- | --- | --- |
| [lunar-javascript](https://github.com/6tail/lunar-javascript) | MIT | 桌上黄历的农历、干支、宜忌、冲煞、吉神方位、节气、法定假日 |
| [hls.js](https://github.com/video-dev/hls.js)（精简版） | Apache-2.0 | 收音机播放 HLS 直播流 |

收音机放的是各电台公开的网络直播流，版权归各电台所有，本站不存储、不转发。
