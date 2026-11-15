# 素材出处

`public/assets/` 下的实拍素材全部来自 [Poly Haven](https://polyhaven.com)，授权为 **CC0**（可商用，无需署名）。这里记录出处，方便以后更新或替换。

| 文件 | 素材 | 用在哪里 | 处理 |
| --- | --- | --- | --- |
| `sky/sunrise_window.jpg`、`sky/sunrise_pano.jpg` | HDRI「Umhlanga Sunrise」 | 窗外的天空、海面反射、室内环境反射 | 从 8K 色调映射图裁出太阳左右各约 60° 的一块；另缩一张 1024×512 的全景 |
| `tex/oak_veneer_01_*` | 贴图「Oak Veneer 01」 | 书桌台面 | 1K，颜色图 + 法线图，重新压缩 |
| `tex/wood_floor_*` | 贴图「Wood Floor」 | 地板 | 同上 |
| `tex/plastered_wall_04_*` | 贴图「Plastered Wall 04」 | 墙面（运行时提亮、调暖） | 同上 |
| `tex/walnut_veneer_*` | 贴图「Walnut Veneer」 | 留声机木箱（运行时调深） | 同上 |
| `models/potted_plant_02/` | 模型「Potted Plant 02」 | 桌面左侧的盆栽（缩到 0.4 倍） | 1K 贴图重新压缩 |
| `models/potted_plant_04/` | 模型「Potted Plant 04」 | 显示器旁的小盆栽（缩到 0.62 倍） | 1K 贴图重新压缩 |
| `models/modern_arm_chair_01/` | 模型「Modern Arm Chair 01」 | 书桌前的椅子 | 1K 贴图重新压缩 |
| `models/modern_wooden_cabinet/` | 模型「Modern Wooden Cabinet」 | 左墙边的边柜（缩到 0.8 倍） | 同上 |
| `models/mid_century_lounge_chair/` | 模型「Mid Century Lounge Chair」 | 右后方的休闲椅 | 同上 |
| `models/desk_lamp_arm_01/` | 模型「Desk Lamp Arm 01」 | 边柜上的台灯 | 同上 |
| `models/wall_clock/` | 模型「Wall Clock」 | 左墙上的挂钟（指针走真实时间） | 贴图缩到 512 |
| `models/ceramic_vase_01/` | 模型「Ceramic Vase 01」 | 边柜上的花瓶 | 贴图缩到 512 |
| `models/standing_picture_frame_01/`、`_02/` | 模型「Standing Picture Frame 01 / 02」 | 边柜上的相框 | 贴图缩到 512 |
| `models/hanging_picture_frame_01/` | 模型「Hanging Picture Frame 01」 | 左墙上的挂画 | 贴图缩到 512 |
| `light/*.jpg` | 用上面那张 HDRI 当天光，在 Blender 里烘焙的光照贴图 | 地板、地毯和三面墙的光影 | 见 `tools/bake_lighting.py` |

其余所有东西（海面、书桌、留声机、书、显示器、键盘、虎尾兰、落地灯、海鸥、帆船、音乐等）都是代码生成的，没有外部素材。
