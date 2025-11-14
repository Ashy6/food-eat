// 《今天吃什么》scorers：用于评估工具调用是否恰当、输出完整性、饮食限制符合度、食材利用度、时间预算匹配度
import { z } from 'zod';
import { createToolCallAccuracyScorerCode } from '@mastra/evals/scorers/code';
import { createCompletenessScorer } from '@mastra/evals/scorers/code';
import { createScorer } from '@mastra/core/scores';
import LANGUAGE from '../../utils/language';

// 评估是否合理调用了 recipeTool
export const toolCallAppropriatenessScorer = createToolCallAccuracyScorerCode({
  expectedTool: 'recipeTool',
  strictMode: false,
});

// 通用完整性评分（文本是否满足基本结构与回答要求）
export const completenessScorer = createCompletenessScorer();

// LLM 评分：饮食限制是否被正确考虑（如：素食/低碳/无麸质等）
export const dietaryComplianceScorer = createScorer({
  name: 'Dietary Compliance',
  description: LANGUAGE.val === 'en-US'
    ? 'Check if suggestions comply with user dietary restrictions (vegetarian, low-carb, gluten-free, etc.)'
    : '检查建议是否遵守用户的饮食限制（素食、低碳、无麸质等）',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions: LANGUAGE.val === 'en-US'
      ? 'You are a dietary restriction evaluation expert. Based on the dietary restrictions provided by the user (such as vegetarian/low-carb/gluten-free, etc.), determine if the assistant\'s suggestions fully comply with these restrictions. Return JSON that conforms to the schema below.'
      : '你是一个饮食限制评估专家。根据用户提供的饮食限制（如素食/低碳/无麸质等），判断助手的建议是否完全遵守这些限制。返回符合下方 schema 的 JSON。',
  },
})
  .preprocess(({ run }) => {
    const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
    const assistantText = (run.output?.[0]?.content as string) || '';
    return { userText, assistantText };
  })
  .analyze({
    description: '提取用户饮食限制并判断建议是否符合',
    outputSchema: z.object({
      compliant: z.boolean(),
      violations: z.array(z.string()).default([]),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      用户文本：\n${results.preprocessStepResult.userText}\n\n
      助手建议：\n${results.preprocessStepResult.assistantText}\n\n
      任务：
      1) 识别用户是否声明了饮食限制（素食/低碳/无麸质等）。
      2) 若存在限制，判断助手建议是否完全遵守。
      3) 返回 JSON：{ compliant: boolean, violations: string[], confidence: number, explanation: string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return r.compliant ? Math.max(0.7, r.confidence ?? 1) : 0;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Dietary: compliant=${r.compliant ?? false}, score=${score}. violations=${(r.violations||[]).join(', ')}. ${r.explanation ?? ''}`;
  });

// LLM 评分：是否合理利用了用户提供的食材
export const ingredientsUsageScorer = createScorer({
  name: 'Ingredients Usage',
  description: LANGUAGE.val === 'en-US'
    ? 'Check if suggestions prioritize/reasonably use the ingredients provided by the user'
    : '检查建议是否优先/合理使用了用户提供的食材',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions: LANGUAGE.val === 'en-US'
      ? 'Determine if the assistant used the ingredients provided by the user in the suggestions and provide confidence level. Return JSON.'
      : '判断助手是否在建议中使用了用户提供的食材，并给出置信度。返回 JSON。',
  },
})
  .preprocess(({ run }) => {
    const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
    const assistantText = (run.output?.[0]?.content as string) || '';
    return { userText, assistantText };
  })
  .analyze({
    description: '从用户文本中抽取食材，并匹配助手建议内容',
    outputSchema: z.object({
      used: z.boolean(),
      matchedIngredients: z.array(z.string()).default([]),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      用户文本：\n${results.preprocessStepResult.userText}\n\n
      助手建议：\n${results.preprocessStepResult.assistantText}\n\n
      任务：
      1) 抽取用户明确提供的食材（中文/英文均可）。
      2) 判断建议是否使用了这些食材（允许替代建议但需说明）。
      3) 返回 JSON：{ used: boolean, matchedIngredients: string[], confidence: number, explanation: string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return r.used ? Math.max(0.6, r.confidence ?? 1) : 0.2; // 未使用给予少量分
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `Ingredients: used=${r.used ?? false}, matched=${(r.matchedIngredients||[]).join(', ')}, score=${score}. ${r.explanation ?? ''}`;
  });

// LLM 评分：时间预算匹配（建议是否符合用户的时间预算）
export const timeBudgetAlignmentScorer = createScorer({
  name: 'Time Budget Alignment',
  description: LANGUAGE.val === 'en-US'
    ? 'Check if the suggested duration roughly matches the user\'s timeBudget'
    : '检查建议的时长是否与用户 timeBudget 大致匹配',
  type: 'agent',
  judge: {
    model: 'openai/gpt-4o-mini',
    instructions: LANGUAGE.val === 'en-US'
      ? 'Identify the user\'s timeBudget (in minutes) and determine if the suggestions are within the budget (reasonable margin ±10 minutes). Return JSON.'
      : '识别用户的 timeBudget（分钟），判断建议是否在预算内（合理误差±10分钟）。返回 JSON。',
  },
})
  .preprocess(({ run }) => {
    const userText = (run.input?.inputMessages?.[0]?.content as string) || '';
    const assistantText = (run.output?.[0]?.content as string) || '';
    return { userText, assistantText };
  })
  .analyze({
    description: '解析时间预算并比较建议的预计时长',
    outputSchema: z.object({
      aligned: z.boolean(),
      estimatedTotalMinutes: z.number().optional(),
      budgetMinutes: z.number().optional(),
      confidence: z.number().min(0).max(1).default(1),
      explanation: z.string().default(''),
    }),
    createPrompt: ({ results }) => `
      用户文本：\n${results.preprocessStepResult.userText}\n\n
      助手建议：\n${results.preprocessStepResult.assistantText}\n\n
      任务：
      1) 若用户文本提到 timeBudget（分钟），记录该值。
      2) 从建议中提取每道菜的预计时长，并估算整体可行性是否在预算内（允许±10分钟误差）。
      3) 返回 JSON：{ aligned: boolean, estimatedTotalMinutes?: number, budgetMinutes?: number, confidence: number, explanation: string }
    `,
  })
  .generateScore(({ results }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return r.aligned ? Math.max(0.7, r.confidence ?? 1) : 0.1;
  })
  .generateReason(({ results, score }) => {
    const r = (results as any)?.analyzeStepResult || {};
    return `TimeBudget: aligned=${r.aligned ?? false}, est=${r.estimatedTotalMinutes ?? 'NA'}, budget=${r.budgetMinutes ?? 'NA'}, score=${score}. ${r.explanation ?? ''}`;
  });

export const scorers = {
  toolCallAppropriatenessScorer,
  completenessScorer,
  dietaryComplianceScorer,
  ingredientsUsageScorer,
  timeBudgetAlignmentScorer,
};