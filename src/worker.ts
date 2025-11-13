// Cloudflare Worker：公开 HTTP 接口
// 路由：
// - GET /api/recipes - 获取食谱
// - POST /api/recipes - 搜索食谱
// - POST /api/chat - 聊天对话
// - GET /api/models - 获取可用模型列表

import { recipeTool } from './mastra/tools/recipe-tool';
import { translateRecipes } from './utils/translator';
import { MESSAGES, AVAILABLE_MODELS } from './constants/messages';
import type { Recipe } from './types';
import { chatAgent } from './mastra/agents/chat-agent';

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

type ChatInput = {
  message: string;
  threadId?: string;
  model?: string;
  language?: 'zh-CN' | 'en-US';
};

export interface Env {
  OPENAI_API_KEY?: string;
}

function normalizeChinese(input: FrontendInput): { normalized: RecipeInput; meta: Record<string, any> } {
  // 1) 处理食材：中文拆分并映射到英文，拼成逗号分隔
  let normalizedIngredients: string | undefined;
  if (input.ingredients && input.ingredients.trim()) {
    const tokens = input.ingredients
      .split(/[，,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const mapped = tokens; // 已移除：ingredientMap（原中文到英文的固定映射），现统一使用自由输入透传
    normalizedIngredients = mapped.join(',');
  }

  // 2) 处理类别：直接透传
  let normalizedCategory: string | undefined;
  if (input.category && input.category.trim()) {
    const c = input.category.trim();
    normalizedCategory = c; // 取消限定：不再使用 categoryMap，直接透传
  }

  // 3) 处理菜系/地区：直接透传
  let normalizedCuisine: string | undefined;
  if (input.cuisine && input.cuisine.trim()) {
    const a = input.cuisine.trim();
    normalizedCuisine = a; // 取消限定：不再使用 cuisineMap，直接透传
  }

  // 4) limit 透传
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
    // recipes = await translateRecipes(recipes);
  }

  // 兜底：若为空则进行随机推荐，以保证每次都有答案
  if (recipes.length === 0) {
    try {
      const fallback = await recipeTool.execute({
        context: { limit: limitNum },
        runtimeContext: {},
      } as any);
      recipes = fallback.recipes || [];
    } catch (e) {
      // 忽略兜底异常
    }
  }

  const names = recipes.map((r: Recipe) => (
    'strMeal' in r
      ? (r.strMeal || '未知菜品')
      : ('name' in r ? (r.name || '未知菜品') : '未知菜品')
  ));
  const head = recipes.length > 0
    ? MESSAGES.RECIPES_FOUND(names.length, names)
    : MESSAGES.NO_RECIPES_FOUND;

  return { suggestions: head, recipes, source: result.source };
}

async function handleChat(input: ChatInput) {
  const threadId = input.threadId || `thread-${Date.now()}`;

  // Prepare language instruction based on input.language
  let languageInstruction = '';
  if (input.language === 'en-US') {
    languageInstruction = '\n\n**Language preference: English (en-US). You MUST respond entirely in English.**';
  } else if (input.language === 'zh-CN') {
    languageInstruction = '\n\n**语言偏好：简体中文 (zh-CN)。你必须完全用中文回答。**';
  } else {
    // Default to Chinese if no language specified
    languageInstruction = '\n\n**语言偏好：简体中文 (zh-CN)。你必须完全用中文回答。**';
  }

  // Combine user message with language instruction
  const messageWithLanguage = input.message + languageInstruction;

  try {
    // 调用 chat agent
    const response = await chatAgent.generate(messageWithLanguage, {
      threadId,
    });

    return {
      success: true,
      response: response.text || '',
      threadId,
      model: input.model || 'gpt-4o-mini',
      language: input.language,
    };
  } catch (error: any) {
    console.error('Chat error:', error);
    // 兜底：返回基于工具的随机菜谱建议，而不是报错
    try {
      const fallback = await recipeTool.execute({
        context: { limit: 5 },
        runtimeContext: {},
      } as any);
      const names = (fallback.recipes || []).map((r: any) => (
        'strMeal' in r ? (r.strMeal || '未知菜品') : ('name' in r ? (r.name || '未知菜品') : '未知菜品')
      ));
      const text = names.length > 0
        ? `当前模型不可用，我为您随机推荐这些菜品：${names.slice(0, 5).join('、')}。`
        : '当前模型不可用，建议您稍后重试或指定食材/菜系以获取更多建议。';
      return {
        success: true,
        response: text,
        threadId,
        model: 'fallback',
      };
    } catch (_) {
      return {
        success: true,
        response: '当前模型不可用，建议您稍后重试或指定食材/菜系以获取更多建议。',
        threadId,
        model: 'fallback',
      };
    }
  }
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理 OPTIONS 请求 (CORS preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // 食谱搜索 API
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
          return new Response(
            JSON.stringify({ error: MESSAGES.ERROR.METHOD_NOT_ALLOWED }),
            { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } }
          );
        }

        // 中文输入标准化到 TheMealDB 可识别的英文关键词
        const { normalized, meta } = normalizeChinese(frontInput);

        const data = await getRecipes(normalized);
        return new Response(
          JSON.stringify({ ...data, request: meta }),
          {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
          },
        );
      }

      // 聊天 API
      if (url.pathname === '/api/chat') {
        if (request.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: MESSAGES.ERROR.METHOD_NOT_ALLOWED }),
            { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } }
          );
        }

        const body = await request.json().catch(() => ({}));
        const language = body.language as 'zh-CN' | 'en-US' | undefined;
        const chatInput: ChatInput = {
          message: body.message || '',
          threadId: body.threadId,
          model: body.model,
          language: language === 'zh-CN' || language === 'en-US' ? language : undefined,
        };

        if (!chatInput.message) {
          const isChinese = !chatInput.language || chatInput.language === 'zh-CN';
          const errorMsg = isChinese ? '消息不能为空' : 'Message cannot be empty';
          return new Response(
            JSON.stringify({ error: errorMsg }),
            { status: 400, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } }
          );
        }

        const result = await handleChat(chatInput);
        return new Response(
          JSON.stringify(result),
          {
            status: result.success ? 200 : 500,
            headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
          },
        );
      }

      // 模型列表 API
      if (url.pathname === '/api/models') {
        if (request.method !== 'GET') {
          return new Response(
            JSON.stringify({ error: MESSAGES.ERROR.METHOD_NOT_ALLOWED }),
            { status: 405, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } }
          );
        }

        return new Response(
          JSON.stringify({ models: AVAILABLE_MODELS }),
          {
            status: 200,
            headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders },
          },
        );
      }

      // 默认返回说明
      return new Response(
        JSON.stringify({
          message: MESSAGES.API_WELCOME,
        }),
        { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } },
      );
    } catch (err: any) {
      console.error('Worker error:', err);
      return new Response(
        JSON.stringify({ error: err?.message || MESSAGES.ERROR.INTERNAL }),
        { status: 500, headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders } },
      );
    }
  },
};
