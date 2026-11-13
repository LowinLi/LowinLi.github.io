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
    })
    .passthrough(),
});

export const collections = { posts };
