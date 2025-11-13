// Cloudflare Pages Function：提供 /api/models 接口
// 返回可用的 AI 模型列表
import { AVAILABLE_MODELS } from '../../src/constants/messages';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequest = async ({ request }: { request: Request }) => {
  // 处理 OPTIONS 请求 (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    if (request.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: '仅支持 GET 请求' }),
        {
          status: 405,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        }
      );
    }

    return new Response(
      JSON.stringify({ models: AVAILABLE_MODELS }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...corsHeaders
        },
      },
    );
  } catch (err: any) {
    console.error('Models API error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || '服务器内部错误' }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...corsHeaders
        },
      },
    );
  }
};
