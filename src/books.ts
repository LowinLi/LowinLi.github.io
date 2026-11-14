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
interface PostRef { title: string; url: string; date: string }

/**
 * 书架上的书，从左到右。
 * 技术书里是简短的读书笔记（TODO：换成你自己的）；古籍是原文选段。
 */
export function buildBooks(site: Site, posts: PostRef[], postsIndex: string): Book[] {
  const postPages: Page[] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(posts.length / 6)); i++) {
    postPages.push({
      heading: i === 0 ? '最近文章' : undefined,
      lines: posts.slice(i * 6, i * 6 + 6).map((p) => ({ text: p.title, href: p.url, meta: p.date })),
    });
  }
  postPages[postPages.length - 1].lines.push({ text: '全部文章 →', href: postsIndex });

  return [
    {
      id: 'about', title: '关于我', author: site.name, kind: 'self', color: '#c8553d',
      pages: [
        { heading: site.name, lines: [site.tagline, ...site.bio] },
        { heading: '联系', lines: site.links.map((l) => ({ text: l.label, href: `https://${l.url.replace(/^https?:\/\//, '')}`, meta: l.url })) },
      ],
    },
    { id: 'posts', title: '文章索引', author: site.name, kind: 'self', color: '#2f6f73', pages: postPages },
    {
      id: 'sicp', title: '计算机程序的构造和解释', author: 'Abelson / Sussman', kind: 'tech', color: '#4b3f8f',
      pages: [
        { heading: '读书笔记', lines: ['程序首先是写给人读的，其次才是给机器执行的。', '全书只做一件事：教你用抽象控制复杂度。过程抽象、数据抽象、语言抽象，一层层往上搭。'] },
        { heading: '带走的三件事', lines: ['一、遇到复杂问题，先问能不能造一种更贴合问题的语言。', '二、求值器不神秘：eval 和 apply 互相调用，就是一门语言的全部。', '三、状态和时间是麻烦的根源，能不引入就不引入。'] },
      ],
    },
    {
      id: 'pragmatic', title: '程序员修炼之道', author: 'Hunt / Thomas', kind: 'tech', color: '#d98b2b',
      pages: [
        { heading: '读书笔记', lines: ['一本讲习惯的书。没有哪条建议是新的，但把它们都做到的人很少。', '不要容忍破窗：一处将就，很快处处将就。'] },
        { heading: '常翻的几条', lines: ['DRY：每一项知识在系统里只应有一个权威表述。', '正交：改一处不该牵动另一处。', '曳光弹：先打通一条贯穿全链路的细线，再加粗。', '纯文本、版本控制、自动化，是不会过时的工具。'] },
      ],
    },
    {
      id: 'ddia', title: '设计数据密集型应用', author: 'Martin Kleppmann', kind: 'tech', color: '#1f4e79',
      pages: [
        { heading: '读书笔记', lines: ['可靠、可扩展、可维护，三个词贯穿全书。', '它不教某个数据库怎么用，而是讲清每种设计在换取什么、放弃什么。'] },
        { heading: '带走的三件事', lines: ['一、复制、分区、事务，各自解决不同的问题，别混为一谈。', '二、分布式系统里，时钟不可信，网络不可信，只有明确的协议可信。', '三、日志是数据系统的脊梁：流和批只是看待同一份日志的两种方式。'] },
      ],
    },
    {
      id: 'dl', title: '深度学习', author: 'Goodfellow / Bengio / Courville', kind: 'tech', color: '#7a2f4f',
      pages: [
        { heading: '读书笔记', lines: ['俗称「花书」。前半本是线性代数、概率和优化的底子，后半本才是网络。', '模型会变，底子不变：读论文卡住的地方，多半能在前八章找到。'] },
        { heading: '带走的三件事', lines: ['一、表示学习是核心：好的特征让后面的一切变简单。', '二、正则化不是一个技巧，是一类思路——限制模型，逼它泛化。', '三、优化和泛化是两件事，训练得动不等于学得对。'] },
      ],
    },
    {
      id: 'clrs', title: '算法导论', author: 'Cormen 等', kind: 'tech', color: '#3d6b45',
      pages: [
        { heading: '读书笔记', lines: ['不必从头读到尾，当字典用最合适。', '真正值得反复练的是证明的习惯：循环不变式、摊还分析、归约。'] },
        { heading: '常翻的章节', lines: ['排序与顺序统计：分治的范本。', '动态规划与贪心：先写出最优子结构，再谈实现。', '图算法：最短路径和最大流，几乎能套进一半的实际问题。'] },
      ],
    },
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
