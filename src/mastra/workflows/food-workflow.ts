// 《今天吃什么》工作流：收集偏好 -> 调用 Agent 生成菜谱建议
// - collect-preferences：规整/透传偏好
// - recommend-meals：调用 foodAgent（内部会使用 recipeTool）
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

// 工作流输入：用户的饮食偏好与约束
const preferencesSchema = z.object({
  ingredients: z.string().describe('可用食材，逗号分隔，如"鸡胸肉, 西兰花"').optional(),
  category: z.string().describe('菜品类别，如"海鲜"、"素食的"').optional(),
  cuisine: z.string().describe('菜系/地区，如"粤菜"、"山西菜"').optional(),
  taste: z.string().describe('口味偏好，如"清淡"、"微辣"、"重口"').optional(),
  timeBudget: z.number().int().describe('可用时间（分钟）').optional(),
  dietary: z.array(z.string()).describe('饮食限制，如"素食"、"无麸质"、"低碳"').optional(),
  servings: z.number().int().describe('就餐人数').optional(),
  equipment: z.array(z.string()).describe('可用设备，如"空气炸锅"、"烤箱"、"电饭锅"').optional(),
  limit: z.number().int().min(1).max(10).default(5).describe('候选菜谱数量').optional(),
});

// 第一步：规范化/透传用户偏好
const collectPreferences = createStep({
  id: 'collect-preferences',
  description: '收集并透传用户的饮食偏好与约束',
  inputSchema: preferencesSchema,
  outputSchema: preferencesSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('未提供偏好信息');
    }
    // 这里可以做更复杂的规整与默认值填充，目前直接透传
    return inputData;
  },
});

// 第二步：调用 Agent 生成菜谱建议（Agent 内部会调用 recipeTool 获取真实数据）
const recommendMeals = createStep({
  id: 'recommend-meals',
  description: '基于偏好生成结构化菜谱建议（调用 Agent 与工具）',
  inputSchema: preferencesSchema,
  outputSchema: z.object({
    suggestions: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error('缺少偏好信息');
    }

    const agent = mastra?.getAgent('foodAgent');
    if (!agent) {
      throw new Error('未找到 foodAgent');
    }

    // 将偏好信息整理为上下文，提示 Agent 使用 recipeTool
    const prompt = `请根据以下用户偏好生成“今天吃什么”的结构化建议，并尽可能调用 recipeTool 获取真实菜谱：\n\n` +
      `偏好信息：\n` +
      `${JSON.stringify(inputData, null, 2)}\n\n` +
      `输出要求（中文）：\n` +
      `- 今日建议：一句话总结（含口味/时间/难度）。\n` +
      `- 候选菜谱（${inputData.limit ?? 5} 道）：\n` +
      `  • 名称（菜系/类别）\n` +
      `  • 关键食材（含替代建议）\n` +
      `  • 预计时长与难度（简单/中等/略难）\n` +
      `  • 简要做法要点（3-5 步）\n` +
      `  • 是否符合饮食偏好（如：素食/低碳/无麸质）\n` +
      `- 若无法完全满足偏好，请给出合理替代建议。\n` +
      `- 如需更多选项，提示用户可更换食材或指定菜系。\n\n` +
      `工具调用指引：\n` +
      `- 当提供了食材/类别/菜系时，请优先调用 recipeTool，并在答案中融合其返回结果。\n` +
      `- recipeTool 参数：{ ingredients, category, cuisine, limit }。`;

    const response = await agent.stream([
      { role: 'user', content: prompt },
    ]);

    let suggestionsText = '';
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      suggestionsText += chunk;
    }

    return { suggestions: suggestionsText };
  },
});

const foodWorkflow = createWorkflow({
  id: 'food-workflow',
  inputSchema: preferencesSchema,
  outputSchema: z.object({
    suggestions: z.string(),
  }),
})
  .then(collectPreferences)
  .then(recommendMeals);

foodWorkflow.commit();

export { foodWorkflow };