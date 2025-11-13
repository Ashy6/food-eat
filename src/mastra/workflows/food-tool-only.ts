// 工具直连工作流（不依赖 LLM）：直接调用 recipeTool 返回菜谱
// 用途：当无法连接 OpenAI 或未配置 API Key 时，仍可给出候选菜谱
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { recipeTool } from '../tools/recipe-tool';

const inputSchema = z.object({
  ingredients: z.string().optional(),
  category: z.string().optional(),
  cuisine: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(5).optional(),
  lang: z.enum(['zh', 'en']).default('zh').optional(),
});

const outputSchema = z.object({
  suggestions: z.string(),
  recipes: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string().nullable(),
      area: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      instructions: z.string().nullable(),
      thumbnail: z.string().nullable(),
      youtube: z.string().nullable(),
      ingredients: z.array(z.object({ ingredient: z.string(), measure: z.string() })),
    }),
  ),
  source: z.literal('TheMealDB'),
});

const fetchRecipes = createStep({
  id: 'fetch-recipes-tool-only',
  description: '直接调用 recipeTool 获取菜谱数据并格式化建议',
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const { ingredients, category, cuisine, limit, lang } = inputData || {};
    const lim = typeof limit === 'number' ? limit : 5;
    const result = await recipeTool.execute({
      context: { ingredients, category, cuisine, limit: lim },
      runtimeContext: {},
    } as any);
    const names = (result.recipes || []).map((r) => r.name);
    const head = (lang === 'en')
      ? `Found ${names.length} candidate dishes: ${names.slice(0, 5).join(', ')}`
      : `找到 ${names.length} 道候选菜：${names.slice(0, 5).join('、')}`;
    return { suggestions: head, recipes: result.recipes, source: result.source };
  },
});

export const foodToolOnlyWorkflow = createWorkflow({
  id: 'food-tool-only',
  inputSchema,
  outputSchema,
})
  .then(fetchRecipes);

foodToolOnlyWorkflow.commit();