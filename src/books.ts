export type Line = string | { text: string; href: string; meta?: string };
export interface Page { heading?: string; lines: Line[] }
export interface Book {
  id: string;
  title: string;
  author?: string;
  /** tech：现代技术书；classic：线装古籍，竖排；self：关于我 / 文章索引 */
  kind: 'tech' | 'classic' | 'self';
  color: string; // 书脊颜色
  pages: Page[];
}

interface Site { name: string; tagline: string; bio: string[]; links: { label: string; url: string }[] }
export interface PostRef { title: string; url: string; date: string; shelf: string; description?: string }

/** 书桌上的五卷文集：旧博客 lowin.li 的 30 篇文章按主题分卷（每篇的 front matter 里有 shelf） */
export const VOLUMES: { shelf: string; id: string; title: string; color: string; intro: string }[] = [
  { shelf: 'llm', id: 'vol-llm', title: '大模型与生成', color: '#4b3f8f', intro: '从解码方法、受限集束搜索，到 RLHF、ChatGPT 和 Copilot，再到 Vibecoding 的冷思考。' },
  { shelf: 'infer', id: 'vol-infer', title: '推理与量化', color: '#1f4e79', intro: '让大模型在小硬件上跑起来：8 位矩阵乘法、ONNX 量化、fastgpt、GPU 服务排队。' },
  { shelf: 'tf', id: 'vol-tf', title: '模型拆解', color: '#7a2f4f', intro: '拆开 Transformers 仓库看：DataCollator、bigbird、SentenceTransformer、多标签分类、中文摘要。' },
  { shelf: 'eng', id: 'vol-eng', title: '工程手记', color: '#3d6b45', intro: '部署路上踩过的坑：docker 瘦身和卡死、编译 so、devpi、向量存储、.li 域名。' },
  { shelf: 'road', id: 'vol-road', title: '行路', color: '#8a5a2b', intro: '十天走完青海湖一圈，正月十七坐绿皮车离开黑土地；还有一篇关于人工智能能否实现的转载。' },
];

/**
 * 书架上的书，从左到右：关于我、文章索引、五卷文集、四本古籍（原文选段）。
 */
export function buildBooks(site: Site, posts: PostRef[], postsIndex: string): Book[] {
  const postPages: Page[] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(posts.length / 6)); i++) {
    postPages.push({
      heading: i === 0 ? `全部文章（${posts.length} 篇）` : undefined,
      lines: posts.slice(i * 6, i * 6 + 6).map((p) => ({ text: p.title, href: p.url, meta: p.date })),
    });
  }
  postPages[postPages.length - 1].lines.push({ text: '按日期看全部 →', href: postsIndex });

  const volumes: Book[] = VOLUMES.map((v) => {
    const list = posts.filter((p) => p.shelf === v.shelf);
    const pages: Page[] = [{ heading: v.title, lines: [v.intro, `共 ${list.length} 篇。`] }];
    for (let i = 0; i < list.length; i += 3) {
      pages.push({ lines: list.slice(i, i + 3).map((p) => ({ text: p.title, href: p.url, meta: p.description ? `${p.date} · ${p.description}` : p.date })) });
    }
    return { id: v.id, title: v.title, author: site.name, kind: 'tech', color: v.color, pages };
  });

  return [
    {
      id: 'about', title: '关于我', author: site.name, kind: 'self', color: '#c8553d',
      pages: [
        { heading: site.name, lines: [site.tagline, ...site.bio] },
        { heading: '在别处', lines: site.links.map((l) => ({ text: l.label, href: `https://${l.url.replace(/^https?:\/\//, '')}`, meta: l.url })) },
      ],
    },
    { id: 'posts', title: '文章索引', author: site.name, kind: 'self', color: '#2f6f73', pages: postPages },
    ...volumes,
    {
      id: 'lunyu', title: '论语', author: '孔子弟子及再传弟子 辑', kind: 'classic', color: '#22375a',
      pages: [
        { heading: '学而第一', lines: ['子曰：「学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？」', '曾子曰：「吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？」'] },
        { heading: '为政第二', lines: ['子曰：「温故而知新，可以为师矣。」', '子曰：「学而不思则罔，思而不学则殆。」'] },
        { heading: '述而第七', lines: ['子曰：「三人行，必有我师焉。择其善者而从之，其不善者而改之。」'] },
      ],
    },
    {
      id: 'daodejing', title: '道德经', author: '老子', kind: 'classic', color: '#2a4a3f',
      pages: [
        { heading: '第一章', lines: ['道可道，非常道；名可名，非常名。', '无名天地之始；有名万物之母。', '故常无欲，以观其妙；常有欲，以观其徼。', '此两者，同出而异名，同谓之玄。玄之又玄，众妙之门。'] },
        { heading: '第八章', lines: ['上善若水。水善利万物而不争，处众人之所恶，故几于道。', '居善地，心善渊，与善仁，言善信，政善治，事善能，动善时。', '夫唯不争，故无尤。'] },
      ],
    },
    {
      id: 'sunzi', title: '孙子兵法', author: '孙武', kind: 'classic', color: '#5a2a2a',
      pages: [
        { heading: '始计篇', lines: ['孙子曰：兵者，国之大事，死生之地，存亡之道，不可不察也。', '兵者，诡道也。故能而示之不能，用而示之不用，近而示之远，远而示之近。'] },
        { heading: '谋攻篇', lines: ['是故百战百胜，非善之善者也；不战而屈人之兵，善之善者也。', '知彼知己者，百战不殆；不知彼而知己，一胜一负；不知彼，不知己，每战必殆。'] },
      ],
    },
    {
      id: 'shijing', title: '诗经', author: '佚名', kind: 'classic', color: '#3a3358',
      pages: [
        { heading: '周南 · 关雎', lines: ['关关雎鸠，在河之洲。窈窕淑女，君子好逑。', '参差荇菜，左右流之。窈窕淑女，寤寐求之。', '求之不得，寤寐思服。悠哉悠哉，辗转反侧。', '参差荇菜，左右采之。窈窕淑女，琴瑟友之。', '参差荇菜，左右芼之。窈窕淑女，钟鼓乐之。'] },
        { heading: '秦风 · 蒹葭', lines: ['蒹葭苍苍，白露为霜。所谓伊人，在水一方。', '溯洄从之，道阻且长。溯游从之，宛在水中央。'] },
      ],
    },
  ];
}
