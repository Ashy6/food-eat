// Cloudflare Worker：公开一个 HTTP 接口，直接调用 recipeTool 获取菜谱数据
// 路由：
// - GET /api/recipes?ingredients=鸡胸肉,西兰花&category=Seafood&cuisine=Chinese&limit=4
// - POST /api/recipes  { ingredients, category, cuisine, limit }

import { recipeTool } from './mastra/tools/recipe-tool';

type RecipeInput = {
  ingredients?: string;
  category?: string;
  cuisine?: string;
  limit?: number;
};

export interface Env {}

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

function parseQuery(input: URLSearchParams): RecipeInput {
  const limitStr = input.get('limit');
  const limit = limitStr ? Number(limitStr) : undefined;
  return {
    ingredients: input.get('ingredients') ?? undefined,
    category: input.get('category') ?? undefined,
    cuisine: input.get('cuisine') ?? undefined,
    limit: Number.isFinite(limit as number) ? (limit as number) : undefined,
  };
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/recipes') {
        let input: RecipeInput = {};
        if (request.method === 'GET') {
          input = parseQuery(url.searchParams);
        } else if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          input = {
            ingredients: body.ingredients,
            category: body.category,
            cuisine: body.cuisine,
            limit: typeof body.limit === 'number' ? body.limit : undefined,
          };
        } else {
          return new Response('Method Not Allowed', { status: 405 });
        }

        const data = await getRecipes(input);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }

      // 默认返回说明
      return new Response(
        JSON.stringify({
          message: 'Use GET /api/recipes or POST /api/recipes with { ingredients, category, cuisine, limit }',
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