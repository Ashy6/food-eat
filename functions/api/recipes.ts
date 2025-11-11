// Cloudflare Pages Functions：提供 /api/recipes 接口（GET/POST），复用 recipeTool
// 该文件位于 /functions/api/recipes.ts，会在 Pages 项目中作为 Workers 运行
import { recipeTool } from '../../src/mastra/tools/recipe-tool';

export const onRequest = async ({ request }: { request: Request }) => {
  try {
    const url = new URL(request.url);
    if (url.pathname !== '/api/recipes') {
      return new Response(JSON.stringify({ message: 'Use /api/recipes' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }

    let input: { ingredients?: string; category?: string; cuisine?: string; limit?: number } = {};
    if (request.method === 'GET') {
      const limitStr = url.searchParams.get('limit');
      const limitNum = limitStr ? Number(limitStr) : undefined;
      input = {
        ingredients: url.searchParams.get('ingredients') ?? undefined,
        category: url.searchParams.get('category') ?? undefined,
        cuisine: url.searchParams.get('cuisine') ?? undefined,
        limit: Number.isFinite(limitNum as number) ? (limitNum as number) : undefined,
      };
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

    const result = await recipeTool.execute({
      context: input,
      runtimeContext: {},
    } as any);

    const names = (result.recipes || []).map((r: any) => r.name);
    const head = `找到 ${names.length} 道候选菜：${names.slice(0, 5).join('、')}`;

    return new Response(
      JSON.stringify({ suggestions: head, recipes: result.recipes, source: result.source }),
      { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal Error' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
};