import { Recipe } from '../types';

// 翻译缓存，避免重复翻译
const translationCache = new Map<string, string>();

interface TranslationOptions {
  apiKey?: string;
  model?: string;
}

/**
 * 使用 GPT 翻译文本到中文
 */
async function translateText(
  text: string,
  options: TranslationOptions = {}
): Promise<string> {
  // 检查缓存
  const cacheKey = text.toLowerCase().trim();
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  try {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('No OpenAI API key found, returning original text');
      return text;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的翻译助手，专门将英文菜谱内容翻译成简洁、地道的中文。保持原文的格式和结构。',
          },
          {
            role: 'user',
            content: `请将以下内容翻译成中文：\n\n${text}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Translation API error:', response.statusText);
      return text;
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim() || text;

    // 存入缓存
    translationCache.set(cacheKey, translated);

    return translated;
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

/**
 * 批量翻译文本数组
 */
async function batchTranslate(
  texts: string[],
  options: TranslationOptions = {}
): Promise<string[]> {
  // 合并文本，用特殊分隔符
  const separator = '\n---SEPARATOR---\n';
  const combinedText = texts.join(separator);

  try {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn('No OpenAI API key found, returning original texts');
      return texts;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的翻译助手，专门将英文菜谱内容翻译成简洁、地道的中文。保持原文的格式和结构。翻译后的内容请用 ---SEPARATOR--- 分隔。',
          },
          {
            role: 'user',
            content: `请将以下内容逐条翻译成中文，翻译后用 ---SEPARATOR--- 分隔：\n\n${combinedText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!response.ok) {
      console.error('Batch translation API error:', response.statusText);
      return texts;
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim() || combinedText;
    const translatedArray = translatedText.split(separator).map((t: string) => t.trim());

    // 如果翻译结果数量不匹配，返回原文
    if (translatedArray.length !== texts.length) {
      console.warn('Translation count mismatch, returning original texts');
      return texts;
    }

    return translatedArray;
  } catch (error) {
    console.error('Batch translation error:', error);
    return texts;
  }
}

/**
 * 翻译食谱到中文
 */
export async function translateRecipe(
  recipe: Recipe,
  options: TranslationOptions = {}
): Promise<Recipe> {
  try {
    // 准备需要翻译的文本
    const textsToTranslate: string[] = [];
    const keys: string[] = [];

    // 食谱名称
    if (recipe.strMeal) {
      textsToTranslate.push(recipe.strMeal);
      keys.push('strMeal');
    }

    // 分类和地区
    if (recipe.strCategory) {
      textsToTranslate.push(recipe.strCategory);
      keys.push('strCategory');
    }

    if (recipe.strArea) {
      textsToTranslate.push(recipe.strArea);
      keys.push('strArea');
    }

    // 制作步骤
    if (recipe.strInstructions) {
      textsToTranslate.push(recipe.strInstructions);
      keys.push('strInstructions');
    }

    // 食材（收集所有非空食材）
    const ingredients: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const ingredient = recipe[`strIngredient${i}` as keyof Recipe];
      if (ingredient && typeof ingredient === 'string' && ingredient.trim()) {
        ingredients.push(ingredient);
        textsToTranslate.push(ingredient);
        keys.push(`strIngredient${i}`);
      }
    }

    // 批量翻译
    const translated = await batchTranslate(textsToTranslate, options);

    // 构建翻译后的食谱
    const translatedRecipe = { ...recipe };

    keys.forEach((key, index) => {
      if (translated[index]) {
        (translatedRecipe as any)[key] = translated[index];
      }
    });

    return translatedRecipe;
  } catch (error) {
    console.error('Recipe translation error:', error);
    return recipe; // 翻译失败返回原食谱
  }
}

/**
 * 批量翻译多个食谱
 */
export async function translateRecipes(
  recipes: Recipe[],
  options: TranslationOptions = {}
): Promise<Recipe[]> {
  try {
    // 并发翻译所有食谱（限制并发数）
    const concurrencyLimit = 3;
    const results: Recipe[] = [];

    for (let i = 0; i < recipes.length; i += concurrencyLimit) {
      const batch = recipes.slice(i, i + concurrencyLimit);
      const translatedBatch = await Promise.all(
        batch.map((recipe) => translateRecipe(recipe, options))
      );
      results.push(...translatedBatch);
    }

    return results;
  } catch (error) {
    console.error('Batch recipe translation error:', error);
    return recipes;
  }
}

/**
 * 清除翻译缓存
 */
export function clearTranslationCache(): void {
  translationCache.clear();
}

/**
 * 获取缓存大小
 */
export function getCacheSize(): number {
  return translationCache.size();
}
