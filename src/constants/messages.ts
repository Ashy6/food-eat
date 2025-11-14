/**
 * 双语消息常量
 * 集中管理所有 API 响应和错误消息（中文/英文）
 */
import LANGUAGE from '../utils/language';
const isChinese = LANGUAGE.val === 'zh-CN';

export const MESSAGES = {
  // API 响应消息
  RECIPES_FOUND: (count: number, names: string[]) => {
    if (isChinese) {
      const displayNames = names.slice(0, 5).join('、');
      return `找到 ${count} 道候选菜：${displayNames}${count > 5 ? '等' : ''}`;
    } else {
      const displayNames = names.slice(0, 5).join(', ');
      return `Found ${count} recipe${count > 1 ? 's' : ''}: ${displayNames}${count > 5 ? ', etc.' : ''}`;
    }
  },

  RANDOM_RECIPES: (count: number) => {
    return isChinese
      ? `已为您随机推荐 ${count} 道菜品`
      : `Randomly recommended ${count} recipe${count > 1 ? 's' : ''} for you`;
  },

  NO_RECIPES_FOUND: () => {
    return isChinese
      ? '抱歉，没有找到符合条件的食谱'
      : 'Sorry, no recipes found matching your criteria';
  },

  VALIDATION_ERROR: {
    LIMIT_ONLY: () => {

      return isChinese
        ? '请至少填写一个食材 / 分类 / 菜系'
        : 'Please provide at least one ingredient, category, or cuisine';
    },
  },

  // API 欢迎消息
  API_WELCOME: `欢迎使用今天吃什么 API！

  使用方法：
  - GET /api/recipes - 获取随机食谱推荐
  - POST /api/recipes - 根据条件获取个性化推荐
  - POST /api/chat - 聊天对话
  - GET /api/models - 获取可用模型列表

  请求参数（POST /api/recipes）：
  {
    "ingredients": ["食材1", "食材2"],  // 可选
    "category": "分类",                // 可选：素食、海鲜、甜点等
    "cuisine": "菜系",                 // 可选：中国、意大利、日本等
    "taste": "口味偏好",              // 可选
    "timeBudget": 30,                  // 可选：制作时间（分钟）
    "servings": 2,                     // 可选：份数
    "equipment": ["设备"]              // 可选：厨房设备
  }`,

  // 错误消息
  ERROR: {
    INTERNAL: () => {

      return isChinese ? '服务器内部错误，请稍后重试' : 'Internal server error, please try again later';
    },
    INVALID_REQUEST: () => {

      return isChinese ? '请求参数格式错误' : 'Invalid request parameters';
    },
    NO_API_KEY: '未配置 OpenAI API 密钥',
    TRANSLATION_FAILED: '翻译失败，返回原始内容',
    FETCH_FAILED: '获取食谱失败',
    UNKNOWN: '未知错误',
    WORKFLOW_FAILED: '工作流执行失败',
    TOOL_EXECUTION_FAILED: '工具执行失败',
    METHOD_NOT_ALLOWED: () => {

      return isChinese ? '不支持的请求方法' : 'Method not allowed';
    },
  },

  // 成功消息
  SUCCESS: {
    RECIPES_GENERATED: '成功生成食谱推荐',
    CHAT_RESPONSE: '对话成功',
  },

  // 日志消息
  LOG: {
    TRANSLATING_RECIPES: (count: number) => `正在翻译 ${count} 个食谱...`,
    TRANSLATION_CACHED: (count: number) => `使用缓存翻译 ${count} 项`,
    FETCHING_RECIPES: '正在获取食谱数据...',
    WORKFLOW_STARTED: '工作流已启动',
    WORKFLOW_COMPLETED: '工作流已完成',
  },

  // 提示消息
  HINT: {
    TRY_DIFFERENT_PARAMS: '建议尝试调整搜索参数',
    GENERIC_SEARCH: '已为您展示通用推荐',
    TRANSLATION_DISABLED: '翻译功能未启用，显示原文',
  },
};

// 可用模型列表
export const AVAILABLE_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
];
