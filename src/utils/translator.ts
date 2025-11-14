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
 * 联想词结构（用于智能关键词扩展）
 */
export interface AssociatedTerms {
  original: string; // 原始输入
  translated: string; // 翻译后的原始输入
  relatedTerms: string[]; // 联想到的相关词汇（已翻译）
}

/**
 * 增强版翻译输入（包含联想词）
 */
export interface EnhancedTranslationInput {
  ingredients?: AssociatedTerms;
  category?: AssociatedTerms;
  cuisine?: AssociatedTerms;
}

/**
 * 翻译器类 - 封装 OpenAI API 调用逻辑
 */
export class Translator {
  private cache = new Map<string, string>(); // 翻译缓存，格式：'language:原文' -> '译文'
  private associationCache = new Map<string, string[]>(); // 联想词缓存，格式：'type:原文' -> ['联想词1', '联想词2', ...]
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
   * 生成相关联想词（使用 AI 智能扩展关键词）
   * @param input - 原始输入（中文）
   * @param type - 联想类型（食材/分类/菜系）
   * @returns 联想到的相关词汇数组（中文）
   */
  private async generateRelatedTerms(
    input: string,
    type: 'ingredients' | 'category' | 'cuisine'
  ): Promise<string[]> {
    // 边界检查
    if (!input || !input.trim()) return [];
    if (!this.apiKey) {
      console.warn('OpenAI API Key not found, skipping association');
      return [];
    }

    // 检查缓存
    const cacheKey = `${type}:${input}`;
    if (this.associationCache.has(cacheKey)) {
      return this.associationCache.get(cacheKey)!;
    }

    try {
      // 根据类型设置不同的 System Prompt
      let systemPrompt = '';
      if (type === 'ingredients') {
        systemPrompt = `你是一个专业的食材联想专家。用户会输入一个菜品名称或食材名称，你需要联想出制作这道菜可能用到的主要食材（2-3个）。
规则：
1. 只返回食材名称，用逗号分隔
2. 优先返回核心食材（如面粉、鸡蛋、肉类等）
3. 不要返回调味料
4. 不要返回任何解释或额外文字
5. 示例：输入"炒拉条" → 输出"面粉,水,面条"`;
      } else if (type === 'category') {
        systemPrompt = `你是一个专业的菜品分类专家。用户会输入一个菜品名称，你需要联想出这道菜所属的分类（2-3个）。
规则：
1. 只返回分类名称，用逗号分隔
2. 使用通用分类（如面食、肉类、汤类、素食等）
3. 不要返回任何解释或额外文字
4. 示例：输入"炒拉条" → 输出"面食,面"`;
      } else {
        // cuisine
        systemPrompt = `你是一个专业的菜系分类专家。用户会输入一个菜品名称，你需要联想出这道菜所属的菜系或风味（2-3个）。
规则：
1. 只返回菜系名称，用逗号分隔
2. 使用标准菜系名称（如中国菜、意大利菜、日本料理等）或地方菜系（如川菜、粤菜、山西菜等）
3. 不要返回任何解释或额外文字
4. 示例：输入"炒拉条" → 输出"面食类,山西菜"`;
      }

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
              { role: 'user', content: input },
            ],
            temperature: 0.5, // 适度的随机性，保证联想多样性
            max_tokens: 100, // 联想词不需要太多 token
          }),
        }
      );

      // 解析响应
      if (!response.ok) {
        console.error(
          `OpenAI API error: ${response.status} ${response.statusText}`
        );
        return [];
      }

      const data = await response.json();
      const associationText =
        data.choices?.[0]?.message?.content?.trim() || '';

      // 解析联想词（逗号分隔）
      const relatedTerms = associationText
        .split(',')
        .map((term: string) => term.trim())
        .filter(Boolean)
        .slice(0, 3); // 最多返回 3 个联想词

      // 存入缓存
      this.associationCache.set(cacheKey, relatedTerms);
      return relatedTerms;
    } catch (error) {
      // 错误降级：返回空数组
      console.error('Association generation error:', error);
      return [];
    }
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
   * 增强版翻译菜谱输入（支持 AI 联想词扩展）
   * 用途：智能生成相关词汇，提高 TheMealDB API 查询匹配率
   *
   * @param input - 原始输入参数
   * @param enableAssociation - 是否启用联想词功能（默认启用）
   * @returns 增强版翻译输入（包含原始词和联想词）
   */
  async translateRecipeInputEnhanced(
    input: {
      ingredients?: string;
      category?: string;
      cuisine?: string;
    },
    enableAssociation: boolean = true
  ): Promise<EnhancedTranslationInput> {
    const result: EnhancedTranslationInput = {};

    // 处理 ingredients 字段
    if (input.ingredients) {
      const original = input.ingredients;

      // 如果是中文输入且启用联想词
      if (this.isChinese(original) && enableAssociation) {
        // 1. 生成联想词（中文）
        const relatedTermsChinese = await this.generateRelatedTerms(
          original,
          'ingredients'
        );

        // 2. 翻译原始词 + 所有联想词
        const [translated, ...translatedRelated] = await Promise.all([
          this.translate(original, 'en-US'),
          ...relatedTermsChinese.map((term) => this.translate(term, 'en-US')),
        ]);

        result.ingredients = {
          original,
          translated,
          relatedTerms: translatedRelated,
        };
      } else {
        // 英文输入或禁用联想词：只翻译原始词
        result.ingredients = {
          original,
          translated: original, // 英文不需要翻译
          relatedTerms: [],
        };
      }
    }

    // 处理 category 字段
    if (input.category) {
      const original = input.category;

      if (this.isChinese(original) && enableAssociation) {
        const relatedTermsChinese = await this.generateRelatedTerms(
          original,
          'category'
        );

        const [translated, ...translatedRelated] = await Promise.all([
          this.translate(original, 'en-US'),
          ...relatedTermsChinese.map((term) => this.translate(term, 'en-US')),
        ]);

        result.category = {
          original,
          translated,
          relatedTerms: translatedRelated,
        };
      } else {
        result.category = {
          original,
          translated: original,
          relatedTerms: [],
        };
      }
    }

    // 处理 cuisine 字段
    if (input.cuisine) {
      const original = input.cuisine;

      if (this.isChinese(original) && enableAssociation) {
        const relatedTermsChinese = await this.generateRelatedTerms(
          original,
          'cuisine'
        );

        const [translated, ...translatedRelated] = await Promise.all([
          this.translate(original, 'en-US'),
          ...relatedTermsChinese.map((term) => this.translate(term, 'en-US')),
        ]);

        result.cuisine = {
          original,
          translated,
          relatedTerms: translatedRelated,
        };
      } else {
        result.cuisine = {
          original,
          translated: original,
          relatedTerms: [],
        };
      }
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
