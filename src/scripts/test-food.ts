// 测试脚本：以三种方式运行《今天吃什么》工作流/智能体
// - runViaMastra: 通过 mastra.runWorkflow / run 统一入口
// - runViaWorkflow: 直接用 foodWorkflow.run
// - runViaAgentFallback: 直接调用 foodAgent.stream 作为降级方案
import { mastra } from '../mastra';
import { foodWorkflow } from '../mastra/workflows/food-workflow';

async function runViaMastra(input: any) {
  const anyMastra: any = mastra as any;
  // 优先调用 Mastra 提供的统一入口
  if (typeof anyMastra.runWorkflow === 'function') {
    return await anyMastra.runWorkflow('food-workflow', input);
  }
  if (typeof anyMastra.run === 'function') {
    return await anyMastra.run('food-workflow', input);
  }
  return null;
}

async function runViaWorkflow(input: any) {
  const wf: any = foodWorkflow as any;
  // 直接运行工作流（需传入 mastra 以便步骤调用 agent）
  if (typeof wf.run === 'function') {
    return await wf.run(input, { mastra });
  }
  return null;
}

async function runViaAgentFallback(input: any) {
  const agent = (mastra as any).getAgent?.('foodAgent');
  if (!agent) throw new Error('找不到 foodAgent');
  // 构造提示词，调用 agent 流式生成建议
  const prompt = `请根据以下用户偏好生成“今天吃什么”的结构化建议，并尽可能调用 recipeTool 获取真实菜谱：\n\n` +
    `偏好信息：\n` +
    `${JSON.stringify(input, null, 2)}\n\n` +
    `输出要求（中文）：\n` +
    `- 今日建议：一句话总结（含口味/时间/难度）。\n` +
    `- 候选菜谱（${input.limit ?? 5} 道）：\n` +
    `  • 名称（菜系/类别）\n` +
    `  • 关键食材（含替代建议）\n` +
    `  • 预计时长与难度（简单/中等/略难）\n` +
    `  • 简要做法要点（3-5 步）\n` +
    `  • 是否符合饮食偏好（如：素食/低碳/无麸质）\n` +
    `- 若无法完全满足偏好，请给出合理替代建议。\n` +
    `- 如需更多选项，提示用户可更换食材或指定菜系。`;
  const response = await agent.stream([{ role: 'user', content: prompt }]);
  let text = '';
  for await (const chunk of response.textStream) {
    text += chunk;
  }
  return { suggestions: text };
}

async function main() {
  console.log('Running food-workflow test...');
  const input = {
    ingredients: '鸡胸肉, 西兰花',
    taste: '清淡',
    timeBudget: 30,
    dietary: ['低碳'],
    servings: 2,
    equipment: ['炒锅'],
    limit: 4,
  };

  let result = await runViaMastra(input);
  if (!result) {
    result = await runViaWorkflow(input);
  }
  if (!result) {
    result = await runViaAgentFallback(input);
  }

  console.log('\n===== 建议输出 =====');
  console.log(result?.suggestions ?? result);
}

main().catch((err) => {
  console.error('Error running food-workflow test:', err);
  process.exit(1);
});