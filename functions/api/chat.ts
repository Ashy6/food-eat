// Cloudflare Pages Function：提供 /api/chat 接口
// 处理聊天对话请求
import { chatAgent } from '../../src/mastra/agents/chat-agent';
import { MESSAGES } from '../../src/constants/messages';

type ChatInput = {
  message: string;
  threadId?: string;
  model?: string;
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handleChat(input: ChatInput) {
  try {
    const threadId = input.threadId || `thread-${Date.now()}`;

    // 调用 chat agent
    const response = await chatAgent.generate(input.message, {
      threadId,
    });

    return {
      success: true,
      response: response.text || '',
      threadId,
      model: input.model || 'gpt-4o-mini',
    };
  } catch (error: any) {
    console.error('Chat error:', error);
    return {
      success: false,
      error: error?.message || MESSAGES.ERROR.UNKNOWN,
    };
  }
}

export const onRequest = async ({ request }: { request: Request }) => {
  // 处理 OPTIONS 请求 (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: MESSAGES.ERROR.METHOD_NOT_ALLOWED }),
        {
          status: 405,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const chatInput: ChatInput = {
      message: body.message || '',
      threadId: body.threadId,
      model: body.model,
    };

    if (!chatInput.message) {
      return new Response(
        JSON.stringify({ error: '消息不能为空' }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            ...corsHeaders
          }
        }
      );
    }

    const result = await handleChat(chatInput);
    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...corsHeaders
        },
      },
    );
  } catch (err: any) {
    console.error('Chat API error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || MESSAGES.ERROR.INTERNAL }),
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
