import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Hexo 迁移过来的文章：保留 title/date/tags/categories，其它字段放行
const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z
    .object({
      title: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      categories: z.array(z.string()).default([]),
      description: z.string().optional(),
      draft: z.boolean().default(false),
      /** 书桌上的哪一卷：llm 大模型与生成 / infer 推理与量化 / tf Transformers 拆解 / eng 工程手记 / road 行路 */
      shelf: z.enum(['llm', 'infer', 'tf', 'eng', 'road', 'misc']).default('misc'),
      /** 旧博客 lowin.li 上的地址（astro.config 据此生成跳转页） */
      oldUrl: z.string().optional(),
    })
    .passthrough(),
});

export const collections = { posts };
