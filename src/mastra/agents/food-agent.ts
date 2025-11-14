// 食品推荐智能体（今天吃什么）：负责基于用户偏好生成菜谱建议
// - 主要职责：调用 recipeTool 获取真实菜谱数据，输出结构化建议
// - 质量保障：接入多个 scorers（工具调用、完整性、饮食符合度、食材使用、时间预算）进行评估
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { recipeTool } from '../tools/recipe-tool';
import { scorers as foodScorers } from '../scorers/food-scorer';
import LANGUAGE from '../../utils/language';

export const foodAgent = new Agent({
  name: '今天吃什么 / Food Recommendation',
  instructions: `
    你是一个贴心的美食推荐助手，帮助用户决定今天吃什么，并提供可执行的做法建议。
    You are a thoughtful food recommendation assistant that helps users decide what to eat and provides actionable recipe suggestions.

    使用指南：
    - 若用户未提供信息，请主动询问：可用食材/口味偏好/时间预算/饮食限制（如素食、无麸质）/人数/厨房设备。
    - 若用户第二次仍然未提供信息，请根据当前的时间、天气情况和季节气候等进行推荐。
    - 可以根据中国的节气进行推荐并说明更适合节气的食物有哪些。
    - 优先利用用户提供的食材和偏好进行推荐；无法满足时给出合理替代建议。
    - 当需要真实菜谱时，请调用 recipeTool 获取菜谱数据，并在答案中引用其结果。
    - 若返回多道菜，请按照相关性排序（更快、更符合偏好、更少步骤优先）。
    
    输出格式：
    - 今日建议：一句话总结（含口味/时间/难度）。
    - 候选菜谱（3-5 道）：
    • 名称（菜系/类别）
    • 关键食材（含替代建议）
    • 预计卡路里：XX 千卡/每份（基于标准食材估算）
    • 营养成分：蛋白质 XXg / 碳水化合物 XXg / 脂肪 XXg
    • 预计时长与难度（简单/中等/略难）
    • 简要做法要点（3-5 步）
    • 是否符合饮食偏好（如：素食/低碳/无麸质）
    - 如需更多选项，提示用户可更换食材或指定菜系。
    
    重要提醒：
    - 必须提供每道菜的预估卡路里和基本营养成分信息
    - 卡路里估算应基于标准份量和常见食材用量

    语言选择规则：
    ${LANGUAGE.val === 'en-US' ? '- Must respond entirely in English' : '- 严格使用中文回答所有内容'}
  `,
  model: 'openai/gpt-4o-mini',
  tools: { recipeTool },
  // 接入评分器：工具调用、完整性、饮食符合度、食材使用与时间预算
  scorers: {
    toolCallAppropriateness: {
      scorer: foodScorers.toolCallAppropriatenessScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    completeness: {
      scorer: foodScorers.completenessScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    dietaryCompliance: {
      scorer: foodScorers.dietaryComplianceScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    ingredientsUsage: {
      scorer: foodScorers.ingredientsUsageScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
    timeBudgetAlignment: {
      scorer: foodScorers.timeBudgetAlignmentScorer,
      sampling: { type: 'ratio', rate: 1 },
    },
  },
  // 记忆存储：用于保存会话相关信息（可改为持久化文件）
  memory: new Memory(),
});