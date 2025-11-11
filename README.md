# 今天吃什么 · Mastra 食谱与天气 Agents

一个基于 Mastra 的 TypeScript 项目，通过工具与工作流为你提供菜谱推荐与天气信息整合，支持按食材、类别、菜系筛选菜谱，并返回结构化结果，方便在 Agents 中使用。

## 功能概览
- 菜谱工具：
  - 支持按食材、类别（如 Vegetarian、Seafood）、菜系/地区（如 Chinese、Italian）筛选
  - 无筛选条件时，自动随机推荐多道菜并返回详情
  - 标准化返回结构：食材与用量、做法、标签、缩略图、视频链接等
- 天气工具：配套天气信息查询与评分逻辑（见 src/mastra/tools/weather-tool.ts、scorers）
- Agents 与工作流：
  - 食谱/天气 Agents
  - 仅工具工作流与整合工作流（food-tool-only.ts、food-workflow.ts、weather-tool-only.ts、weather-workflow.ts）

## 运行环境
- Node >= 20.9.0
- TypeScript 项目（ES2022、严格模式、bundler 模块解析）

## 安装依赖
你可以选择自己熟悉的包管理器安装依赖：
- 使用 npm：
  - npm install
- 使用 pnpm：
  - pnpm install

提示：项目中同时存在 package-lock.json 与 pnpm-lock.yaml，请按你的实际使用选择对应的包管理器以保持一致性。

## 常用脚本
- 开发：
  - npm run dev / pnpm dev（启动 Mastra 开发环境）
- 构建：
  - npm run build / pnpm build（构建 Mastra 项目）
- 启动：
  - npm run start / pnpm start（运行构建后的服务）
- 体验食谱脚本：
  - npm run test:food / pnpm test:food（执行 src/scripts/test-food.ts）

## 快速体验
1. 安装依赖（npm 或 pnpm）
2. 运行开发模式：npm run dev / pnpm dev
3. 或直接运行测试脚本：npm run test:food / pnpm test:food

## 目录结构
- .gitignore
- package.json / package-lock.json / pnpm-lock.yaml
- tsconfig.json
- src/
  - mastra/
    - agents/
    - tools/
      - recipe-tool.ts
      - weather-tool.ts
    - scorers/
    - workflows/
      - food-tool-only.ts
      - food-workflow.ts
      - weather-tool-only.ts
      - weather-workflow.ts
  - scripts/
    - test-food.ts

## 关键实现说明
- 菜谱工具（src/mastra/tools/recipe-tool.ts）：
  - 输入参数：
    - ingredients：可用食材，逗号分隔（API 仅支持单食材筛选，内部取第一个）
    - category：菜品类别（如 Vegetarian、Seafood）
    - cuisine：菜系/地区（如 Chinese、Italian）
    - limit：返回数量（1–10，默认 5）
  - 输出字段：
    - id、name、category、area、tags、instructions、thumbnail、youtube、ingredients（包含 { ingredient, measure } 列表）
  - 数据来源：TheMealDB（公共开放 API）

## 开发建议
- 优先选择一种包管理器并保持一致（npm 或 pnpm）
- 通过工作流脚本或开发模式调用工具，便于在 Agents 场景中复用
- 若需要扩展评分或多工具协作，可在 scorers 与 workflows 下增添对应逻辑

## 许可证
- ISC（见 package.json）