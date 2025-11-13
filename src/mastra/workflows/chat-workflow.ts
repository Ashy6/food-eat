// 聊天工作流：处理用户的一般性对话
import { Step, Workflow } from '@mastra/core/workflow';
import { z } from 'zod';
import { chatAgent } from '../agents/chat-agent';

// 聊天工作流
export const chatWorkflow = new Workflow({
  name: 'chat-workflow',
  triggerSchema: z.object({
    message: z.string().describe('用户的聊天消息'),
    threadId: z.string().optional().describe('会话线程 ID，用于保持对话上下文'),
    model: z.string().optional().describe('使用的模型，如 gpt-4o-mini, gpt-4 等'),
  }),
});

// Step 1: 使用 chat agent 生成回复
chatWorkflow.step(chatAgent, {
  variables: {
    prompt: {
      step: Step.trigger,
      path: '$.message',
    },
    threadId: {
      step: Step.trigger,
      path: '$.threadId',
    },
    model: {
      step: Step.trigger,
      path: '$.model',
    },
  },
});

// Step 2: 提交结果
chatWorkflow.commit();
