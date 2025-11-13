// 统一的 Recipe 类型定义，兼容 TheMealDB 原始结构与规范化后的结构

export interface IngredientItem {
  ingredient: string;
  measure: string;
}

// 规范化后的菜谱结构（来自 recipe-tool.ts 输出）
export interface NormalizedRecipe {
  id: string;
  name: string;
  category: string | null;
  area: string | null;
  tags: string[] | null;
  instructions: string | null;
  thumbnail: string | null;
  youtube: string | null;
  ingredients: IngredientItem[];
}

// TheMealDB 原始菜谱结构（包含 strIngredient1..20 等动态字段）
export interface TheMealDBRecipe {
  idMeal?: string;
  strMeal?: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strYoutube?: string | null;
  strTags?: string | null;
  // 允许动态访问，如 strIngredientX / strMeasureX
  [key: string]: any;
}

// 统一导出类型：可为原始或规范化结构
export type Recipe = NormalizedRecipe | TheMealDBRecipe;