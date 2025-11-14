/*
文件说明：菜谱工具（Mastra Tool）
- 依赖 TheMealDB 开放 API，支持按食材、类别、菜系筛选与随机推荐
- 返回结构化菜谱数据，供 Agent 进一步生成菜单、烹饪步骤等
- 设计要点：
  1) 以「优雅降级」为原则：筛选失败时回退到 searchByName，再失败则随机推荐
  2) 使用 fetch 原生接口，适配 Cloudflare Workers / 浏览器环境
  3) TheMealDB 的 instructions 为英文，如需中文可在上层 Agent 中做翻译
- 输入参数包含 language（zh-CN / en-US），当前用于可扩展的多语言支持（非强制）
- 所有函数尽量保持纯函数 / 无副作用，便于测试与复用
*/
import { createTool } from '@mastra/core/tools'; // 从 Mastra 核心库导入创建工具的函数
import { z } from 'zod'; // 导入 Zod 库用于运行时类型验证和 schema 定义
import { Translator, type NormalizedRecipe } from '../../utils/translator'; // 导入翻译器类和类型定义

// 简要菜谱摘要结构（用于筛选列表返回）
interface MealSummary { // 定义菜谱摘要的 TypeScript 接口
  idMeal: string; // 菜谱的唯一标识符 ID
  strMeal: string; // 菜品名称
  strMealThumb: string; // 菜品缩略图 URL
}

// 完整菜谱详情结构（包含做法、标签、食材等）
interface MealDetail extends MealSummary { // 继承 MealSummary 接口，添加更多详细字段
  strCategory: string | null; // 菜品类别（如素食、海鲜等）
  strArea: string | null; // 菜系/地区（如中国菜、意大利菜等）
  strTags: string | null; // 菜品标签，逗号分隔的字符串
  strInstructions: string | null; // 详细做法步骤（英文）
  strYoutube: string | null; // 教学视频链接（YouTube URL）
  [key: string]: string | null; // 索引签名：用于访问 strIngredient1-20 / strMeasure1-20 等动态字段
}

// 工具函数：从详情中抽取食材与用量（TheMealDB 使用最多 20 个食材位）
function extractIngredients(meal: MealDetail) { // 函数定义：接收菜谱详情对象作为参数
  const items: { ingredient: string; measure: string }[] = []; // 初始化空数组，用于存储食材和用量的对象
  for (let i = 1; i <= 20; i++) { // 循环遍历 1 到 20（TheMealDB API 最多支持 20 个食材）
    const ingredient = (meal[`strIngredient${i}`] || '')?.trim(); // 动态访问 strIngredient1-20 字段，去除空白字符
    const measure = (meal[`strMeasure${i}`] || '')?.trim(); // 动态访问 strMeasure1-20 字段，去除空白字符
    if (ingredient) { // 如果食材字段不为空（用量可以为空）
      // 收集存在的食材与对应用量
      items.push({ ingredient, measure }); // 将食材和用量对象添加到数组中
    }
  }
  return items; // 返回包含所有食材和用量的数组
}

// 根据菜谱 ID 批量查询详情（lookup.php）
async function fetchDetailsFor(ids: string[]): Promise<MealDetail[]> { // 异步函数：接收 ID 数组，返回菜谱详情数组的 Promise
  const details: MealDetail[] = []; // 初始化空数组，用于存储获取到的菜谱详情
  for (const id of ids) { // 遍历每个菜谱 ID
    const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`); // 调用 TheMealDB API 查询单个菜谱详情
    const json = await resp.json(); // 将响应解析为 JSON 对象
    const meal = (json?.meals?.[0] || null) as MealDetail | null; // 提取 meals 数组的第一个元素（单个菜谱），类型断言为 MealDetail 或 null
    if (meal) details.push(meal); // 如果菜谱存在，添加到详情数组中
  }
  return details; // 返回包含所有菜谱详情的数组
}

// 按食材筛选（filter.php?i=）——API 仅支持单一食材筛选
async function filterByIngredient(ingredient: string): Promise<MealSummary[]> { // 异步函数：根据单个食材筛选菜谱
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${encodeURIComponent(ingredient)}`); // 调用 TheMealDB API 按食材筛选，encodeURIComponent 编码特殊字符
  const json = await resp.json(); // 将响应解析为 JSON 对象
  // 若无结果，返回空数组，避免后续流程报错
  return Array.isArray(json?.meals) ? (json.meals as MealSummary[]) : [];
}

// 按类别筛选（filter.php?c=），如 Vegetarian、Seafood
async function filterByCategory(category: string): Promise<MealSummary[]> { // 异步函数：根据菜品类别筛选菜谱
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`); // 调用 TheMealDB API 按类别筛选
  const json = await resp.json(); // 将响应解析为 JSON 对象
  return Array.isArray(json?.meals) ? (json.meals as MealSummary[]) : [];
}

// 按菜系/地区筛选（filter.php?a=），如 Chinese、Italian
async function filterByArea(area: string): Promise<MealSummary[]> { // 异步函数：根据菜系/地区筛选菜谱
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`); // 调用 TheMealDB API 按地区筛选
  const json = await resp.json(); // 将响应解析为 JSON 对象
  return Array.isArray(json?.meals) ? (json.meals as MealSummary[]) : [];
}

// 随机选取多道菜（改为调用随机单菜 random.php 多次，避免 randomselection.php 可能返回空）
async function randomSelection(): Promise<MealDetail[]> { // 异步函数：随机获取多个菜谱详情
  const results: MealDetail[] = []; // 初始化结果数组，用于存储随机获取的菜谱
  const maxCount = 10; // 设置最多获取 10 道菜谱
  const maxTries = 20; // 设置最多尝试次数为 20，防止无限循环
  let tries = 0; // 初始化尝试计数器
  while (results.length < maxCount && tries < maxTries) { // 当结果数量少于目标且尝试次数未超限时继续循环
    tries += 1; // 尝试次数加 1
    try { // 使用 try-catch 处理单次请求可能的错误
      const resp = await fetch('https://www.themealdb.com/api/json/v1/1/random.php'); // 调用 TheMealDB API 获取单个随机菜谱
      const json = await resp.json(); // 将响应解析为 JSON 对象
      const meal = (Array.isArray(json?.meals) ? (json.meals[0] as MealDetail) : null); // 提取 meals 数组的第一个元素，类型断言为 MealDetail
      if (meal && meal.idMeal) { // 如果菜谱存在且有有效 ID
        // 去重：检查结果数组中是否已存在相同 ID 的菜谱
        if (!results.find((m) => m.idMeal === meal.idMeal)) { // 使用 find 方法查找是否有重复 ID
          results.push(meal); // 如果不存在重复，将菜谱添加到结果数组
        }
      }
    } catch (e) { // 捕获单次请求的异常
      // 忽略单次错误，继续尝试（不中断整个流程）
    }
  }
  return results; // 返回随机获取的菜谱数组（可能少于 maxCount）
}

// 新增：按名称搜索（search.php?s=），用于自由文本的潜在支持
async function searchByName(query: string): Promise<MealDetail[]> { // 异步函数：根据菜品名称进行模糊搜索
  const resp = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`); // 调用 TheMealDB API 按名称搜索，支持模糊匹配
  const json = await resp.json(); // 将响应解析为 JSON 对象
  const mealsRaw = json?.meals; // 提取 meals 字段（可能为 null 或数组）
  const meals = Array.isArray(mealsRaw) ? (mealsRaw as MealDetail[]) : []; // 如果 mealsRaw 是数组则类型断言为 MealDetail 数组，否则返回空数组
  return meals; // 返回搜索结果数组
}

// 辅助函数：将 MealDetail 转换为 NormalizedRecipe 格式
function normalizeMeal(meal: MealDetail): NormalizedRecipe {
  return {
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory || null,
    area: meal.strArea || null,
    tags: meal.strTags ? meal.strTags.split(',').map((t) => t.trim()).filter(Boolean) : null,
    instructions: meal.strInstructions || null,
    thumbnail: meal.strMealThumb || null,
    youtube: meal.strYoutube || null,
    ingredients: extractIngredients(meal),
  };
}

// Mastra 工具定义：根据输入筛选菜谱并返回结构化结果
export const recipeTool = createTool({ // 使用 createTool 创建 Mastra 工具对象
  id: 'get-recipes', // 工具的唯一标识符
  description: '根据食材/类别/菜系推荐菜谱（TheMealDB）', // 工具描述，供 Agent 理解工具用途
  // 输入参数说明：
  // - ingredients: 可用食材，逗号分隔（API仅支持单食材筛选，因此取第一个）
  // - category: 菜品类别，如 Vegetarian
  // - cuisine: 菜系/地区，如 Chinese
  // - limit: 返回条数上限（1-10）
  // - language: 语言选择（zh-CN 或 en-US）
  inputSchema: z.object({ // 使用 Zod 定义输入参数的验证 schema
    ingredients: z.string().describe('可用食材，逗号分隔，如"鸡肉, 西兰花"').optional(), // 食材参数：字符串类型，可选
    category: z.string().describe('菜品类别，如"海鲜"、"素食的"').optional(), // 类别参数：字符串类型，可选
    cuisine: z.string().describe('菜系/地区，如"粤菜"、"山西菜"').optional(), // 菜系参数：字符串类型，可选
    language: z.enum(['zh-CN', 'en-US']).default('zh-CN').describe('语言选择（zh-CN 或 en-US）'), // 语言参数：枚举类型，默认中文
    limit: z.number().min(1).max(10).default(5).describe('返回菜谱数量上限'), // 数量限制：数字类型，1-10之间，默认5
  }),
  // 输出结构：包含标准化后的菜谱信息与来源标记
  outputSchema: z.object({ // 使用 Zod 定义输出数据的验证 schema
    recipes: z.array( // recipes 字段：菜谱对象的数组
      z.object({ // 单个菜谱对象的结构
        id: z.string(), // 菜谱 ID：字符串类型
        name: z.string(), // 菜品名称：字符串类型
        category: z.string().nullable(), // 菜品类别：字符串或 null
        area: z.string().nullable(), // 菜系/地区：字符串或 null
        tags: z.array(z.string()).nullable(), // 标签数组：字符串数组或 null
        instructions: z.string().nullable(), // 做法步骤：字符串或 null
        thumbnail: z.string().nullable(), // 缩略图 URL：字符串或 null
        youtube: z.string().nullable(), // YouTube 视频链接：字符串或 null
        ingredients: z.array(z.object({ ingredient: z.string(), measure: z.string() })), // 食材数组：包含食材名和用量的对象数组
      }),
    ),
    source: z.literal('TheMealDB'), // 数据来源标记：固定值 'TheMealDB'
  }),
  // 执行逻辑：优先使用筛选条件，否则走随机推荐
  execute: async ({ context }) => { // execute 方法：异步执行工具逻辑，接收 context 上下文对象
    const { ingredients, category, cuisine, limit, language } = context as { // 从 context 中解构出所有输入参数，使用类型断言
      ingredients?: string; // 食材参数：可选字符串
      category?: string; // 类别参数：可选字符串
      cuisine?: string; // 菜系参数：可选字符串
      limit?: number; // 数量限制：可选数字
      language?: 'zh-CN' | 'en-US'; // 语言参数：可选枚举
    };

    // 初始化翻译器（从全局环境变量获取 API Key）
    const translator = new Translator();

    // 使用增强版翻译：生成联想词并翻译所有关键词
    const enhancedInput = await translator.translateRecipeInputEnhanced({
      ingredients,
      category,
      cuisine,
    });

    // 用于去重的 Set（存储已查询过的菜谱 ID）
    const foundIds = new Set<string>();
    let allSummaries: MealSummary[] = []; // 存储所有查询结果的摘要

    try { // 使用 try-catch 包裹整体逻辑，失败时降级到随机推荐
      if (enhancedInput.ingredients) { // 如果有食材输入
        const { translated, relatedTerms } = enhancedInput.ingredients;
        // 所有要查询的关键词：原始翻译 + 联想词
        const allKeywords = [translated, ...relatedTerms].filter(Boolean);

        // 对每个关键词进行查询，合并结果并去重
        for (const keyword of allKeywords) {
          const summaries = await filterByIngredient(keyword); // 按食材筛选
          // 去重：只添加新发现的菜谱
          for (const summary of summaries) {
            if (!foundIds.has(summary.idMeal)) {
              foundIds.add(summary.idMeal);
              allSummaries.push(summary);
            }
          }
          // 如果已经找到足够的结果，提前退出
          if (allSummaries.length >= (limit ?? 5)) break;
        }

        // 若所有关键词都没有筛选结果，尝试按名称搜索原始关键词
        if (!allSummaries.length) {
          const byName = await searchByName(translated);
          if (byName.length) {
            const rawRecipes = byName.slice(0, limit ?? 5).map(normalizeMeal);
            const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
            return { recipes, source: 'TheMealDB' as const };
          }

          // 如果按名称搜索也没有结果，回退到随机推荐
          const randoms = await randomSelection();
          const rawRecipes = randoms.slice(0, limit ?? 5).map(normalizeMeal);
          const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
          return { recipes, source: 'TheMealDB' as const };
        }
      } else if (enhancedInput.category) { // 如果有类别输入
        const { translated, relatedTerms } = enhancedInput.category;
        const allKeywords = [translated, ...relatedTerms].filter(Boolean);

        for (const keyword of allKeywords) {
          const summaries = await filterByCategory(keyword); // 按类别筛选
          for (const summary of summaries) {
            if (!foundIds.has(summary.idMeal)) {
              foundIds.add(summary.idMeal);
              allSummaries.push(summary);
            }
          }
          if (allSummaries.length >= (limit ?? 5)) break;
        }

        if (!allSummaries.length) {
          const byName = await searchByName(translated);
          if (byName.length) {
            const rawRecipes = byName.slice(0, limit ?? 5).map(normalizeMeal);
            const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
            return { recipes, source: 'TheMealDB' as const };
          }

          const randoms = await randomSelection();
          const rawRecipes = randoms.slice(0, limit ?? 5).map(normalizeMeal);
          const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
          return { recipes, source: 'TheMealDB' as const };
        }
      } else if (enhancedInput.cuisine) { // 如果有菜系输入
        const { translated, relatedTerms } = enhancedInput.cuisine;
        const allKeywords = [translated, ...relatedTerms].filter(Boolean);

        for (const keyword of allKeywords) {
          const summaries = await filterByArea(keyword); // 按菜系筛选
          for (const summary of summaries) {
            if (!foundIds.has(summary.idMeal)) {
              foundIds.add(summary.idMeal);
              allSummaries.push(summary);
            }
          }
          if (allSummaries.length >= (limit ?? 5)) break;
        }

        if (!allSummaries.length) {
          const byName = await searchByName(translated);
          if (byName.length) {
            const rawRecipes = byName.slice(0, limit ?? 5).map(normalizeMeal);
            const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
            return { recipes, source: 'TheMealDB' as const };
          }

          const randoms = await randomSelection();
          const rawRecipes = randoms.slice(0, limit ?? 5).map(normalizeMeal);
          const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
          return { recipes, source: 'TheMealDB' as const };
        }
      } else { // 如果没有提供任何筛选条件（食材、类别、菜系都为空）
        // 无筛选条件时，直接使用随机选择结果（已是详情数据）
        const randoms = await randomSelection();
        const rawRecipes = randoms.slice(0, limit ?? 5).map(normalizeMeal);
        const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN');
        return { recipes, source: 'TheMealDB' as const };
      }

      // 将摘要列表截取到期望数量后，再查详情并结构化返回
      const ids = allSummaries.slice(0, limit ?? 5).map((m: MealSummary) => m.idMeal); // 从摘要数组中提取前 limit 个菜谱的 ID
      const details = await fetchDetailsFor(ids); // 根据 ID 列表批量查询菜谱详情
      const rawRecipes = details.map(normalizeMeal); // 使用辅助函数规范化所有菜谱数据
      const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN'); // 翻译输出

      return { recipes, source: 'TheMealDB' as const }; // 返回筛选结果对象
    } catch (err) { // 捕获整个 try 块中的任何异常
      // 失败时优雅降级：返回随机推荐，避免影响 Agent 流程
      const randoms = await randomSelection(); // 调用随机选择函数作为兜底方案
      const rawRecipes = randoms.slice(0, limit ?? 5).map(normalizeMeal); // 使用辅助函数规范化数据
      const recipes = await translator.translateRecipeOutput(rawRecipes, language || 'zh-CN'); // 翻译输出
      return { recipes, source: 'TheMealDB' as const }; // 返回降级的随机推荐结果
    }
  }, // execute 方法结束
}); // recipeTool 定义结束