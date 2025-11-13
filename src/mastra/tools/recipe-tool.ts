// 菜谱工具：基于 TheMealDB 获取并整理菜谱数据，供 Agent 使用
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// 简要菜谱摘要结构（用于筛选列表返回）
interface MealSummary {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
}

// 完整菜谱详情结构（包含做法、标签、食材等）
interface MealDetail extends MealSummary {
  strCategory: string | null;
  strArea: string | null; // 菜系/地区
  strTags: string | null;
  strInstructions: string | null; // 详细做法步骤（英文）
  strYoutube: string | null; // 教学视频链接
  [key: string]: string | null; // 用于访问 strIngredientX / strMeasureX 字段
}

// 工具函数：从详情中抽取食材与用量（TheMealDB 使用最多 20 个食材位）
function extractIngredients(meal: MealDetail) {
  const items: { ingredient: string; measure: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = (meal[`strIngredient${i}`] || '')?.trim();
    const measure = (meal[`strMeasure${i}`] || '')?.trim();
    if (ingredient) {
      // 收集存在的食材与对应用量
      items.push({ ingredient, measure });
    }
  }
  return items;
}

// 根据菜谱 ID 批量查询详情（lookup.php）
async function fetchDetailsFor(ids: string[]): Promise<MealDetail[]> {
  const details: MealDetail[] = [];
  for (const id of ids) {
    const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`);
    const json = await resp.json();
    const meal = (json?.meals?.[0] || null) as MealDetail | null;
    if (meal) details.push(meal);
  }
  return details;
}

// 按食材筛选（filter.php?i=）——API 仅支持单一食材筛选
async function filterByIngredient(ingredient: string): Promise<MealSummary[]> {
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`);
  const json = await resp.json();
  return (json?.meals || []) as MealSummary[];
}

// 按类别筛选（filter.php?c=），如 Vegetarian、Seafood
async function filterByCategory(category: string): Promise<MealSummary[]> {
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`);
  const json = await resp.json();
  return (json?.meals || []) as MealSummary[];
}

// 按菜系/地区筛选（filter.php?a=），如 Chinese、Italian
async function filterByArea(area: string): Promise<MealSummary[]> {
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`);
  const json = await resp.json();
  return (json?.meals || []) as MealSummary[];
}

// 随机选取多道菜（randomselection.php），直接返回详情列表
async function randomSelection(): Promise<MealDetail[]> {
  const resp = await fetch('https://www.themealdb.com/api/json/v1/1/randomselection.php');
  const json = await resp.json();
  const meals = (json?.meals || []) as MealDetail[];
  return meals;
}

// 新增：按名称搜索（search.php?s=），用于自由文本的潜在支持
async function searchByName(query: string): Promise<MealDetail[]> {
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
  const json = await resp.json();
  const meals = (json?.meals || []) as MealDetail[];
  return meals;
}

// Mastra 工具定义：根据输入筛选菜谱并返回结构化结果
export const recipeTool = createTool({
  id: 'get-recipes',
  description: '根据食材/类别/菜系推荐菜谱（TheMealDB）',
  // 输入参数说明：
  // - ingredients: 可用食材，逗号分隔（API仅支持单食材筛选，因此取第一个）
  // - category: 菜品类别，如 Vegetarian
  // - cuisine: 菜系/地区，如 Chinese
  // - limit: 返回条数上限（1-10）
  inputSchema: z.object({
    ingredients: z.string().describe('可用食材，逗号分隔，如"鸡肉, 西兰花"').optional(),
    category: z.string().describe('菜品类别，如"海鲜"、"素食的"').optional(),
    cuisine: z.string().describe('菜系/地区，如"粤菜"、"山西菜"').optional(),
    limit: z.number().min(1).max(10).default(5).describe('返回菜谱数量上限'),
  }),
  // 输出结构：包含标准化后的菜谱信息与来源标记
  outputSchema: z.object({
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
  }),
  // 执行逻辑：优先使用筛选条件，否则走随机推荐
  execute: async ({ context }) => {
    const { ingredients, category, cuisine, limit } = context as {
      ingredients?: string;
      category?: string;
      cuisine?: string;
      limit?: number;
    };

    let summaries: MealSummary[] = [];

    try {
      if (ingredients && ingredients.trim()) {
        // 取第一个食材作为筛选条件（API只支持单食材）
        const first = ingredients.split(',')[0].trim();
        summaries = await filterByIngredient(first);

        // 若筛选结果为空，先尝试按名称搜索，再回退到随机推荐
        if (!summaries.length) {
          const byName = await searchByName(first);
          if (byName.length) {
            const recipes = byName.slice(0, limit ?? 5).map((meal) => ({
              id: meal.idMeal,
              name: meal.strMeal,
              category: meal.strCategory || null,
              area: meal.strArea || null,
              tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
              instructions: meal.strInstructions || null,
              thumbnail: meal.strMealThumb || null,
              youtube: meal.strYoutube || null,
              ingredients: extractIngredients(meal),
            }));
            return { recipes, source: 'TheMealDB' as const };
          }

          const randoms = await randomSelection();
          const recipes = randoms.slice(0, limit ?? 5).map((meal) => ({
            id: meal.idMeal,
            name: meal.strMeal,
            category: meal.strCategory || null,
            area: meal.strArea || null,
            tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
            instructions: meal.strInstructions || null,
            thumbnail: meal.strMealThumb || null,
            youtube: meal.strYoutube || null,
            ingredients: extractIngredients(meal),
          }));
          return { recipes, source: 'TheMealDB' as const };
        }
      } else if (category && category.trim()) {
        const cat = category.trim();
        summaries = await filterByCategory(cat);
        if (!summaries.length) {
          const byName = await searchByName(cat);
          if (byName.length) {
            const recipes = byName.slice(0, limit ?? 5).map((meal) => ({
              id: meal.idMeal,
              name: meal.strMeal,
              category: meal.strCategory || null,
              area: meal.strArea || null,
              tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
              instructions: meal.strInstructions || null,
              thumbnail: meal.strMealThumb || null,
              youtube: meal.strYoutube || null,
              ingredients: extractIngredients(meal),
            }));
            return { recipes, source: 'TheMealDB' as const };
          }

          const randoms = await randomSelection();
          const recipes = randoms.slice(0, limit ?? 5).map((meal) => ({
            id: meal.idMeal,
            name: meal.strMeal,
            category: meal.strCategory || null,
            area: meal.strArea || null,
            tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
            instructions: meal.strInstructions || null,
            thumbnail: meal.strMealThumb || null,
            youtube: meal.strYoutube || null,
            ingredients: extractIngredients(meal),
          }));
          return { recipes, source: 'TheMealDB' as const };
        }
      } else if (cuisine && cuisine.trim()) {
        const area = cuisine.trim();
        summaries = await filterByArea(area);
        if (!summaries.length) {
          const byName = await searchByName(area);
          if (byName.length) {
            const recipes = byName.slice(0, limit ?? 5).map((meal) => ({
              id: meal.idMeal,
              name: meal.strMeal,
              category: meal.strCategory || null,
              area: meal.strArea || null,
              tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
              instructions: meal.strInstructions || null,
              thumbnail: meal.strMealThumb || null,
              youtube: meal.strYoutube || null,
              ingredients: extractIngredients(meal),
            }));
            return { recipes, source: 'TheMealDB' as const };
          }

          const randoms = await randomSelection();
          const recipes = randoms.slice(0, limit ?? 5).map((meal) => ({
            id: meal.idMeal,
            name: meal.strMeal,
            category: meal.strCategory || null,
            area: meal.strArea || null,
            tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
            instructions: meal.strInstructions || null,
            thumbnail: meal.strMealThumb || null,
            youtube: meal.strYoutube || null,
            ingredients: extractIngredients(meal),
          }));
          return { recipes, source: 'TheMealDB' as const };
        }
      } else {
        // 无筛选条件时，直接使用随机选择结果（已是详情数据）
        const randoms = await randomSelection();
        const recipes = randoms.slice(0, limit ?? 5).map((meal) => ({
          id: meal.idMeal,
          name: meal.strMeal,
          category: meal.strCategory || null,
          area: meal.strArea || null,
          tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
          instructions: meal.strInstructions || null,
          thumbnail: meal.strMealThumb || null,
          youtube: meal.strYoutube || null,
          ingredients: extractIngredients(meal),
        }));
        return { recipes, source: 'TheMealDB' as const };
      }

      // 将摘要列表截取到期望数量后，再查详情并结构化返回
      const ids = summaries.slice(0, limit ?? 5).map((m) => m.idMeal);
      const details = await fetchDetailsFor(ids);
      const recipes = details.map((meal) => ({
        id: meal.idMeal,
        name: meal.strMeal,
        category: meal.strCategory || null,
        area: meal.strArea || null,
        tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
        instructions: meal.strInstructions || null,
        thumbnail: meal.strMealThumb || null,
        youtube: meal.strYoutube || null,
        ingredients: extractIngredients(meal),
      }));

      return { recipes, source: 'TheMealDB' as const };
    } catch (err) {
      // 失败时优雅降级：返回随机推荐，避免影响 Agent 流程
      const randoms = await randomSelection();
      const recipes = randoms.slice(0, limit ?? 5).map((meal) => ({
        id: meal.idMeal,
        name: meal.strMeal,
        category: meal.strCategory || null,
        area: meal.strArea || null,
        tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
        instructions: meal.strInstructions || null,
        thumbnail: meal.strMealThumb || null,
        youtube: meal.strYoutube || null,
        ingredients: extractIngredients(meal),
      }));
      return { recipes, source: 'TheMealDB' as const };
    }
  },
});