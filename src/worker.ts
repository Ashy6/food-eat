// Cloudflare Worker：公开一个 HTTP 接口，直接调用 recipeTool 获取菜谱数据
// 路由：
// - GET /api/recipes?ingredients=鸡胸肉,西兰花&category=清淡的&cuisine=广东菜&limit=4
// - POST /api/recipes  { ingredients, category, cuisine, taste, timeBudget, servings, equipment, limit }

import { recipeTool } from './mastra/tools/recipe-tool';

type RecipeInput = {
  ingredients?: string;
  category?: string;
  cuisine?: string;
  limit?: number;
};

type FrontendInput = {
  ingredients?: string; // 逗号分隔（可能是中文），示例："鸡胸肉, 西兰花"
  category?: string; // 中文类别：如 "清淡的"、"素食"、"海鲜"
  cuisine?: string; // 中文菜系：如 "广东菜"、"中国菜"
  taste?: string; // 口味，如 "清淡"
  timeBudget?: number; // 预算时间（分钟）
  servings?: number; // 份数
  equipment?: string[]; // 设备，如 ["炒锅"]
  limit?: number;
};

export interface Env {}

// 中文 → TheMealDB 关键词映射（尽量覆盖常见项）
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
  '清淡': undefined, // TheMealDB 无“清淡”类别，跳过以避免误筛
  '清淡的': undefined,
  '海鲜': 'Seafood',
  '鸡肉': 'Chicken',
  '牛肉': 'Beef',
  '猪肉': 'Pork',
};

const cuisineMap: Record<string, string> = {
  '中国菜': 'Chinese',
  '中华菜': 'Chinese',
  '广东菜': 'Chinese', // TheMealDB 只有 Chinese，不区分粤菜/川菜
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
  // 1) 处理食材：中文拆分并映射到英文，拼成逗号分隔
  let normalizedIngredients: string | undefined;
  if (input.ingredients && input.ingredients.trim()) {
    const tokens = input.ingredients
      .split(/[，,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const mapped = tokens.map((t) => ingredientMap[t] || t);
    normalizedIngredients = mapped.join(',');
  }

  // 2) 处理类别：中文到 TheMealDB 类别
  let normalizedCategory: string | undefined;
  if (input.category && input.category.trim()) {
    const c = input.category.trim();
    normalizedCategory = categoryMap[c] ?? c; // 未匹配则尝试原值
  }

  // 3) 处理菜系/地区：中文到 TheMealDB area
  let normalizedCuisine: string | undefined;
  if (input.cuisine && input.cuisine.trim()) {
    const a = input.cuisine.trim();
    normalizedCuisine = cuisineMap[a] ?? a;
  }

  // 4) limit 透传
  const limit = typeof input.limit === 'number' ? input.limit : undefined;

  const normalized: RecipeInput = {
    ingredients: normalizedIngredients,
    category: normalizedCategory,
    cuisine: normalizedCuisine,
    limit,
  };

  // 暂时不参与筛选的字段作为元信息回传（便于前端调试展示）
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

  const names = (result.recipes || []).map((r: any) => r.name);
  const head = `找到 ${names.length} 道候选菜：${names.slice(0, 5).join('、')}`;

  return { suggestions: head, recipes: result.recipes, source: result.source };
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

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/recipes') {
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
          return new Response('Method Not Allowed', { status: 405 });
        }

        // 中文输入标准化到 TheMealDB 可识别的英文关键词
        const { normalized, meta } = normalizeChinese(frontInput);

        const data = await getRecipes(normalized);
        return new Response(
          JSON.stringify({ ...data, request: meta }),
          {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          },
        );
      }

      // 默认返回说明
      return new Response(
        JSON.stringify({
          message:
            'Use GET /api/recipes or POST /api/recipes with { ingredients, category, cuisine, taste, timeBudget, servings, equipment, limit }',
        }),
        { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err?.message || 'Internal Error' }),
        { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }
  },
};