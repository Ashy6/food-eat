// 聊天工作流：处理用户的一般性对话（兼容最新 Mastra workflows API）
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatAgent } from '../agents/chat-agent';

// 输入/输出 Schema
const inputSchema = z.object({
  message: z.string().describe('用户的聊天消息'),
  threadId: z.string().optional().describe('会话线程 ID，用于保持对话上下文'),
  model: z.string().optional().describe('使用的模型，如 gpt-4o-mini, gpt-4 等'),
});

const outputSchema = z.object({
  reply: z.string(),
});

// 单步：调用 chatAgent 生成回复
const generateReply = createStep({
  id: 'chat-generate-reply',
  description: '调用 chatAgent 生成聊天回复',
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const { message } = inputData || {};
    if (!message) throw new Error('缺少 message');

    const response = await chatAgent.stream([
      { role: 'user', content: message },
    ]);

    let reply = '';
    for await (const chunk of response.textStream) {
      reply += chunk;
    }

    return { reply };
  },
});

// 工作流：仅一环节，生成回复
export const chatWorkflow = createWorkflow({
  id: 'chat-workflow',
  inputSchema,
  outputSchema,
})
  .then(generateReply);

chatWorkflow.commit();
