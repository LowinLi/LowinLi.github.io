/**
 * 右墙书架顶格那排书：用户的开源项目（GitHub: LowinLi）。书脊上印项目名，点书脊弹出卡片：简介、相关文章、GitHub 链接。
 * 简介按旧博客里的文章写的；posts 是相关文章的 id（src/content/posts 下的路径，不带 .md）。
 */
export interface Project { id: string; name: string; color: string; desc: string; lang: string; posts: string[] }

export const PROJECTS: Project[] = [
  { id: 'transformers-stream-generator', name: 'transformers-stream-generator', color: '#2d4f7c', lang: 'Python',
    desc: '让 Hugging Face transformers 的 generate 变成生成器：推理时一个 token 一个 token 地往外吐，不用等整句生成完。', posts: [] },
  { id: 'fastgpt', name: 'fastgpt', color: '#7a2f2a', lang: 'Python',
    desc: '基于 transformers 和 onnxruntime，无缝换上量化后的 ONNX 模型，给 GPT 类文本生成提速。',
    posts: ['2022/06/25/shi-yong-fastgpt-ti-su-huggingface-de-gpt-wen-ben-sheng-cheng-mo-xing', '2022/06/27/pan-dian-kai-yuan-copilot'] },
  { id: 'chinese-bigbird', name: 'chinese-bigbird', color: '#3d5a3a', lang: 'Python',
    desc: '中文 BigBird 长文本预训练模型，从 tiny 到 base 五个尺寸，block sparse attention 处理 4096 长度的序列。',
    posts: ['2021/12/12/bigbird-chang-wen-ben-yu-xun-lian-mo-xing-jie-shao'] },
  { id: 'Text-Summarizer-Pytorch-Chinese', name: 'Text-Summarizer-Pytorch-Chinese', color: '#6b5426', lang: 'Python',
    desc: '中文生成式摘要：从数据、训练到部署的完整流程。当初在开源社区几乎找不到能用的中文摘要模型，就自己做了一个。',
    posts: ['2020/11/15/yi-ge-zhong-wen-zhai-yao-sheng-cheng-kai-yuan-xiang-mu'] },
  { id: 'stable-diffusion-streamlit', name: 'stable-diffusion-streamlit', color: '#4b3f8f', lang: 'Python',
    desc: 'Stable Diffusion 量化（内存降 75%）+ Streamlit 在线生成图片调试 + docker 部署，家用显卡也能跑。',
    posts: ['2022/10/09/stable-diffusion'] },
  { id: 'torchtext_multi_label', name: 'torchtext_multi_label', color: '#22375a', lang: 'Python',
    desc: '谁说 torchtext 不能做多标签：用 torchtext + textcnn 跑百度事件多标签比赛的完整例子。',
    posts: ['2021/10/24/shui-shuo-torchtext-bu-neng-zuo-duo-biao-qian-ren-wu'] },
  { id: 'cml4textcnn', name: 'cml4textcnn', color: '#5a2a3a', lang: 'Python',
    desc: '用 CML 在 GitHub 上跑机器学习的持续集成：每次提交自动训练、评估，把结果贴回 PR。',
    posts: ['2021/10/15/fen-xiang-cml-gong-ju-zai-github-shang-de-yi-ge-yuan-chuang-li-zi'] },
  { id: 'devpi-docker', name: 'devpi-docker', color: '#2a4a3f', lang: 'Dockerfile',
    desc: '一条命令用 docker 起一个 devpi 私有 pypi 源：只缓存装过的包，还能托管自己的包和接口文档。',
    posts: ['2022/03/05/devpi'] },
];
