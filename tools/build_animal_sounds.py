"""
窗外动物叫声的录音：从几段实录里剪出一声声的片段，统一响度，拼成一个「声音精灵」文件（一个 mp3 + 一份 json 记每段的起止），
网页里只请求一次（第一次走到窗前时才下载），用 WebAudio 按偏移播放。出处和授权见 CREDITS.md：

  rooster_medium / rooster_small  Wikimedia Commons「Medium rooster crowing.ogg」「Small rooster crowing.ogg」，alys，公有领域
  hen_egg                         Wikimedia Commons「Hen announcing shes lain an egg.ogg」，alys，公有领域
  dog_barking_mono                OpenGameArt「Dog barking mono」，haeldb，CC0
  Meow                            OpenGameArt「Meow」，ignasd，CC0
  cat_softmew / cat_mewfood       OpenGameArt「Cat Purr & Meow」，kerzoven，CC0
  pleading                        Wikimedia Commons「Meow of a pleading cat.oga」，Heismark，公有领域

用法：python tools/build_animal_sounds.py <原始录音所在目录> public/assets/sounds
（需要系统 ffmpeg 和 numpy）
"""
import sys, os, json, subprocess
import numpy as np

src, out = sys.argv[1], sys.argv[2]
SR = 32000
FILES = {
    'rooster_medium': 'Medium_rooster_crowing.ogg', 'rooster_small': 'Small_rooster_crowing.ogg',
    'hen_egg': 'Hen_announcing_shes_lain_an_egg.ogg', 'dog': 'dog_barking_mono.wav',
    'meow': 'Meow.ogg', 'softmew': 'cat_softmew.wav', 'mewfood': 'cat_mewfood.wav', 'pleading': 'Meow_of_a_pleading_cat.oga',
}
# 种类 → [(文件, 开始秒, 结束秒)]；起止是看频谱图定的
CLIPS = {
    'crow': [('rooster_medium', 2.80, 6.10), ('rooster_small', 2.55, 4.55)],
    'cluck': [('hen_egg', 0.00, 2.05), ('hen_egg', 2.05, 4.15), ('hen_egg', 4.25, 7.70)],
    'bark': [('dog', 0.00, 0.44), ('dog', 0.52, 0.94), ('dog', 1.16, 1.60), ('dog', 1.70, 2.04)],
    'meow': [('meow', 0.03, 0.46), ('softmew', 0.35, 1.25), ('softmew', 1.28, 2.16), ('mewfood', 0.52, 1.10),
             ('pleading', 0.15, 1.75), ('pleading', 3.95, 5.05), ('pleading', 6.95, 8.10)],
}
GAP = 0.35  # 片段之间留空白：mp3 编码的前后延迟不会让一段的头尾串到隔壁


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-af', 'highpass=f=110', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def find(name):
    for root, _, fs in os.walk(src):
        if name in fs: return os.path.join(root, name)
    raise FileNotFoundError(name)


audio = {k: load(find(f)) for k, f in FILES.items()}
parts, meta, t = [], {}, GAP
for kind, clips in CLIPS.items():
    meta[kind] = []
    for key, a, b in clips:
        x = audio[key][int(a * SR):int(b * SR)].copy()
        f = int(0.015 * SR)                          # 头尾 15 ms 淡入淡出，不出咔哒声
        x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
        x *= 0.7 / max(1e-6, np.percentile(np.abs(x), 99.9))   # 统一到差不多的响度（按 99.9% 分位，不被单个尖峰带偏）
        x = np.clip(x, -0.98, 0.98)
        parts += [x, np.zeros(int(GAP * SR), np.float32)]
        meta[kind].append([round(t, 3), round(len(x) / SR, 3)])
        t += len(x) / SR + GAP
pcm = np.concatenate([np.zeros(int(GAP * SR), np.float32)] + parts)
os.makedirs(out, exist_ok=True)
mp3 = os.path.join(out, 'animals.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-b:a', '64k', mp3], input=pcm.tobytes(), check=True)
json.dump(meta, open(os.path.join(out, 'animals.json'), 'w'), separators=(',', ':'))
print(f'{len(pcm) / SR:.1f} s, {os.path.getsize(mp3) // 1024} KB', {k: len(v) for k, v in meta.items()})
