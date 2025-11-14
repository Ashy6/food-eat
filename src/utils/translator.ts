// AI 翻译工具类：基于 OpenAI API 实现中英文双向翻译
// 设计要点：
// 1. 智能检测中文，避免不必要的翻译
// 2. 缓存翻译结果，优化性能和成本
// 3. 错误降级，翻译失败时返回原文
// 4. 专业食材翻译，使用食品领域优化的 Prompt

/**
 * 规范化后的菜谱数据结构（用于翻译）
 */
export interface NormalizedRecipe {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  tags: string[] | null;
  instructions: string | null;
  thumbnail: string | null;
  youtube: string | null;
  ingredients: Array<{
    ingredient: string;
    measure: string;
  }>;
}

/**
 * 翻译器类 - 封装 OpenAI API 调用逻辑
 */
export class Translator {
  private cache = new Map<string, string>(); // 翻译缓存，格式：'language:原文' -> '译文'
  private apiKey: string; // OpenAI API Key

  /**
   * 构造函数
   * @param apiKey - OpenAI API Key（可选，默认从全局环境变量读取）
   */
  constructor(apiKey?: string) {
    // 尝试从多个来源获取 API Key
    this.apiKey =
      apiKey ||
      (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) ||
      '';
  }

  /**
   * 检测文本是否包含中文字符
   * @param text - 待检测文本
   * @returns 是否包含中文
   */
  isChinese(text: string): boolean {
    if (!text) return false;
    return /[\u4e00-\u9fa5]/.test(text); // Unicode 范围：U+4E00 到 U+9FA5
  }

  /**
   * 通用翻译方法（私有）
   * @param text - 待翻译文本
   * @param targetLang - 目标语言（'zh-CN' 或 'en-US'）
   * @returns 翻译后的文本
   */
  private async translate(
    text: string,
    targetLang: 'zh-CN' | 'en-US'
  ): Promise<string> {
    // 边界检查
    if (!text || !text.trim()) return text;
    if (!this.apiKey) {
      console.warn('OpenAI API Key not found, returning original text');
      return text;
    }

    // 检查缓存
    const cacheKey = `${targetLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // 根据目标语言设置 System Prompt
      const systemPrompt =
        targetLang === 'zh-CN'
          ? 'You are a professional food and cooking translator. Translate the following English food-related text to simplified Chinese. Only return the translation without any explanations or additional text. Preserve measurements and numbers as-is.'
          : 'You are a professional food and cooking translator. Translate the following Chinese food-related text to English. Only return the translation without any explanations or additional text. Preserve measurements and numbers as-is.';

      // 调用 OpenAI Chat Completions API
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo', // 使用 gpt-3.5-turbo 以平衡成本和质量
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.3, // 降低随机性，保证翻译一致性
            max_tokens: 1000, // 限制最大 token 数
          }),
        }
      );

      // 解析响应
      if (!response.ok) {
        console.error(
          `OpenAI API error: ${response.status} ${response.statusText}`
        );
        return text;
      }

      const data = await response.json();
      const translation = data.choices?.[0]?.message?.content?.trim() || text;

      // 存入缓存
      this.cache.set(cacheKey, translation);
      return translation;
    } catch (error) {
      // 错误降级：返回原文
      console.error('Translation error:', error);
      return text;
    }
  }

  /**
   * 翻译菜谱输入参数（智能检测中文并翻译为英文）
   * 用途：用户可能输入中文食材名，需要翻译为英文才能调用 TheMealDB API
   *
   * @param input - 原始输入参数
   * @returns 翻译后的输入参数
   */
  async translateRecipeInput(input: {
    ingredients?: string;
    category?: string;
    cuisine?: string;
  }): Promise<{
    ingredients?: string;
    category?: string;
    cuisine?: string;
  }> {
    const result = { ...input };

    // 只翻译包含中文的字段
    if (input.ingredients && this.isChinese(input.ingredients)) {
      result.ingredients = await this.translate(input.ingredients, 'en-US');
    }
    if (input.category && this.isChinese(input.category)) {
      result.category = await this.translate(input.category, 'en-US');
    }
    if (input.cuisine && this.isChinese(input.cuisine)) {
      result.cuisine = await this.translate(input.cuisine, 'en-US');
    }

    return result;
  }

  /**
   * 翻译单个菜谱输出（所有字段）
   * @param recipe - 原始菜谱对象（英文）
   * @param language - 目标语言
   * @returns 翻译后的菜谱对象
   */
  private async translateSingleRecipe(
    recipe: NormalizedRecipe,
    language: 'zh-CN' | 'en-US'
  ): Promise<NormalizedRecipe> {
    // 如果目标语言是英文，直接返回原数据
    if (language === 'en-US') {
      return recipe;
    }

    // 并行翻译所有字段（优化性能）
    const [
      name,
      category,
      area,
      tags,
      instructions,
      ingredients,
    ] = await Promise.all([
      // 翻译菜品名称
      this.translate(recipe.name, 'zh-CN'),

      // 翻译类别（可能为 null）
      recipe.category ? this.translate(recipe.category, 'zh-CN') : null,

      // 翻译地区/菜系（可能为 null）
      recipe.area ? this.translate(recipe.area, 'zh-CN') : null,

      // 翻译标签数组（可能为 null）
      recipe.tags
        ? Promise.all(recipe.tags.map((tag) => this.translate(tag, 'zh-CN')))
        : null,

      // 翻译做法步骤（可能为 null，且可能很长）
      recipe.instructions
        ? this.translate(recipe.instructions, 'zh-CN')
        : null,

      // 翻译食材列表（每个食材的名称和用量）
      Promise.all(
        recipe.ingredients.map(async (item) => ({
          ingredient: await this.translate(item.ingredient, 'zh-CN'),
          measure: await this.translate(item.measure, 'zh-CN'),
        }))
      ),
    ]);

    // 返回翻译后的菜谱对象
    return {
      ...recipe,
      name,
      category,
      area,
      tags,
      instructions,
      ingredients,
    };
  }

  /**
   * 翻译菜谱输出数组（批量处理）
   * 用途：TheMealDB 返回的所有内容都是英文，需要根据用户语言偏好翻译
   *
   * @param recipes - 原始菜谱数组（英文）
   * @param language - 目标语言（'zh-CN' 或 'en-US'）
   * @returns 翻译后的菜谱数组
   */
  async translateRecipeOutput(
    recipes: NormalizedRecipe[],
    language: 'zh-CN' | 'en-US'
  ): Promise<NormalizedRecipe[]> {
    // 如果目标语言是英文，直接返回原数据（无需翻译）
    if (language === 'en-US') {
      return recipes;
    }

    // 并行翻译所有菜谱（优化性能）
    const translated = await Promise.all(
      recipes.map((recipe) => this.translateSingleRecipe(recipe, language))
    );

    return translated;
  }

  /**
   * 获取缓存统计信息（用于调试）
   * @returns 缓存大小
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * 清空翻译缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * 创建翻译器实例（单例模式，可选）
 * @param apiKey - OpenAI API Key
 * @returns Translator 实例
 */
export function createTranslator(apiKey?: string): Translator {
  return new Translator(apiKey);
}
