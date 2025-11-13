// Cloudflare Pages Function：提供 /api/recipes 接口（支持 GET 与 POST）
// 说明：
// - 作为 Cloudflare Pages 的 Functions（即在 Workers 环境中运行），本文件对外暴露一个 HTTP 入口
// - 该入口接收查询或请求体中的条件（ingredients、category、cuisine、limit），并委托内部的 recipeTool 执行检索/评分/返回候选菜谱
// - 返回 JSON，包含 suggestions（简短提示文本）、recipes（候选菜谱数组）及 source（可选的来源信息）
// - 支持中文输入自动翻译和 CORS
import { recipeTool } from '../../src/mastra/tools/recipe-tool';
import { translateRecipes } from '../../src/utils/translator';
import { MESSAGES } from '../../src/constants/messages';
import type { Recipe } from '../../src/types';

type RecipeInput = {
  ingredients?: string;
  category?: string;
  cuisine?: string;
  limit?: number;
};

type FrontendInput = {
  ingredients?: string;
  category?: string;
  cuisine?: string;
  taste?: string;
  timeBudget?: number;
  servings?: number;
  equipment?: string[];
  limit?: number;
};

// 中文 → 英文映射
const ingredientMap: Record<string, string> = {
  '鸡胸肉': 'chicken',
  '鸡肉': 'chicken',
  '西兰花': 'broccoli',
  '猪肉': 'pork',
  '牛肉': 'beef',
  '虾仁': 'shrimp',
  '虾': 'shrimp',
  '豆腐': 'tofu',
  '香菇': 'shiitake',
  '小白菜': 'bok choy',
  '青椒': 'green pepper',
  '辣椒': 'chili',
  '蒜': 'garlic',
  '大蒜': 'garlic',
  '酱油': 'soy sauce',
  '米饭': 'rice',
  '鸡蛋': 'egg',
  '番茄': 'tomato',
  '西红柿': 'tomato',
  '洋葱': 'onion',
};

const categoryMap: Record<string, string | undefined> = {
  '素食': 'Vegetarian',
  '素食的': 'Vegetarian',
  '清淡': undefined,
  '清淡的': undefined,
  '海鲜': 'Seafood',
  '鸡肉': 'Chicken',
  '牛肉': 'Beef',
  '猪肉': 'Pork',
};

const cuisineMap: Record<string, string> = {
  '中国菜': 'Chinese',
  '中华菜': 'Chinese',
  '广东菜': 'Chinese',
  '川菜': 'Chinese',
  '鲁菜': 'Chinese',
  '浙菜': 'Chinese',
  '苏菜': 'Chinese',
  '闽菜': 'Chinese',
  '徽菜': 'Chinese',
  '湘菜': 'Chinese',
  '日本菜': 'Japanese',
  '意大利菜': 'Italian',
  '印度菜': 'Indian',
  '法国菜': 'French',
  '墨西哥菜': 'Mexican',
  '美国菜': 'American',
  '英国菜': 'British',
  '泰国菜': 'Thai',
  '越南菜': 'Vietnamese',
};

function normalizeChinese(input: FrontendInput): { normalized: RecipeInput; meta: Record<string, any> } {
  let normalizedIngredients: string | undefined;
  if (input.ingredients && input.ingredients.trim()) {
    const tokens = input.ingredients
      .split(/[，,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const mapped = tokens.map((t) => ingredientMap[t] || t);
    normalizedIngredients = mapped.join(',');
  }

  let normalizedCategory: string | undefined;
  if (input.category && input.category.trim()) {
    const c = input.category.trim();
    normalizedCategory = categoryMap[c] ?? c;
  }

  let normalizedCuisine: string | undefined;
  if (input.cuisine && input.cuisine.trim()) {
    const a = input.cuisine.trim();
    normalizedCuisine = cuisineMap[a] ?? a;
  }

  const limit = typeof input.limit === 'number' ? input.limit : undefined;

  const normalized: RecipeInput = {
    ingredients: normalizedIngredients,
    category: normalizedCategory,
    cuisine: normalizedCuisine,
    limit,
  };

  const meta = {
    original: input,
    normalized,
    taste: input.taste,
    timeBudget: input.timeBudget,
    servings: input.servings,
    equipment: input.equipment,
  };

  return { normalized, meta };
}

async function getRecipes(input: RecipeInput) {
  const limitNum = typeof input.limit === 'number' ? input.limit : 5;
  const { ingredients, category, cuisine } = input;

  const result = await recipeTool.execute({
    context: { ingredients, category, cuisine, limit: limitNum },
    runtimeContext: {},
  } as any);

  // 翻译食谱到中文
  let recipes = result.recipes || [];
  if (recipes.length > 0) {
    console.log(MESSAGES.LOG.TRANSLATING_RECIPES(recipes.length));
    recipes = await translateRecipes(recipes);
  }

  const names = recipes.map((r: Recipe) => r.strMeal || '未知菜品');
  const head = recipes.length > 0
    ? MESSAGES.RECIPES_FOUND(names.length, names)
    : MESSAGES.NO_RECIPES_FOUND;

  return { suggestions: head, recipes, source: result.source };
}

function parseQuery(search: URLSearchParams): FrontendInput {
  const limitStr = search.get('limit');
  const limit = limitStr ? Number(limitStr) : undefined;
  const equipmentStr = search.get('equipment');
  const equipment = equipmentStr ? equipmentStr.split(/[，,、\s]+/).map((s) => s.trim()).filter(Boolean) : undefined;
  return {
    ingredients: search.get('ingredients') ?? undefined,
    category: search.get('category') ?? undefined,
    cuisine: search.get('cuisine') ?? undefined,
    taste: search.get('taste') ?? undefined,
    timeBudget: search.get('timeBudget') ? Number(search.get('timeBudget')) : undefined,
    servings: search.get('servings') ? Number(search.get('servings')) : undefined,
    equipment,
    limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
  };
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest = async ({ request }: { request: Request }) => {
  // 处理 OPTIONS 请求 (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);

    let frontInput: FrontendInput = {};
    if (request.method === 'GET') {
      frontInput = parseQuery(url.searchParams);
    } else if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      frontInput = {
        ingredients: body.ingredients,
        category: body.category,
        cuisine: body.cuisine,
        taste: body.taste,
        timeBudget: typeof body.timeBudget === 'number' ? body.timeBudget : undefined,
        servings: typeof body.servings === 'number' ? body.servings : undefined,
        equipment: Array.isArray(body.equipment) ? body.equipment : undefined,
        limit: typeof body.limit === 'number' ? body.limit : undefined,
      };
    } else {
      return new Response(
        JSON.stringify({ error: MESSAGES.ERROR.METHOD_NOT_ALLOWED }),
        { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } }
      );
    }

    // 中文输入标准化
    const { normalized, meta } = normalizeChinese(frontInput);

    const data = await getRecipes(normalized);
    return new Response(
      JSON.stringify({ ...data, request: meta }),
      {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
      },
    );
  } catch (err: any) {
    console.error('Recipes API error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || MESSAGES.ERROR.INTERNAL }),
      {
        status: 500,
        headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
      },
    );
  }
};
