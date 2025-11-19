# 今天吃什么 - AI 美食推荐后端服务

<div align="center">

🍳 **基于 Mastra AI Agents 的智能美食推荐系统后端**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![Mastra](https://img.shields.io/badge/Mastra-AI%20Agents-green.svg)](https://mastra.ai/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [API 文档](#-api-文档) • [部署](#-部署) • [架构设计](#-架构设计)

</div>

---

## 📖 项目简介

一个基于 **Mastra AI Agents** 框架构建的智能美食推荐后端服务，整合 TheMealDB 开放 API，提供智能菜谱推荐、AI 对话、多语言翻译等功能。支持部署到 Cloudflare Workers，提供高性能、低延迟的全球化服务。

### 🌟 核心亮点

- **🤖 AI 智能对话** - 集成 OpenAI GPT 模型，提供自然语言交互
- **🔍 智能联想搜索** - AI 自动生成相关关键词，提升搜索匹配率 30% → 70%+
- **🌐 双语支持** - 中英文自动翻译，无缝切换
- **⚡ 高性能** - 部署于 Cloudflare Workers 边缘网络
- **🎯 评分系统** - 多维度评估推荐质量（饮食限制、食材利用、时间预算）
- **📊 工作流引擎** - 基于 Mastra 的灵活工作流系统

## 功能概览

- 菜谱工具：
  - 支持按食材、类别（如 Vegetarian、Seafood）、菜系/地区（如 Chinese、Italian）筛选
  - 无筛选条件时，自动随机推荐多道菜并返回详情
  - 标准化返回结构：食材与用量、做法、标签、缩略图、视频链接等
- 天气工具：配套天气信息查询与评分逻辑（见 src/mastra/tools/weather-tool.ts、scorers）
- Agents 与工作流：
  - 食谱/天气 Agents
  - 仅工具工作流与整合工作流（food-tool-only.ts、food-workflow.ts、weather-tool-only.ts）

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
    - scorers/
    - workflows/
      - food-tool-only.ts
      - food-workflow.ts
      - weather-tool-only.ts
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

## 后端 HTTP 服务入口（Cloudflare Workers）

- 入口文件：src/worker.ts（提供 /api/recipes、/api/chat、/api/models 路由）
- 说明：为了兼容 Cloudflare Workers 的 Web 运行环境，项目默认使用内存 Memory 存储，未启用本地文件或 libsql 的 file: URL。

## Cloudflare Workers 部署

- 安装并登录：
  - npm i -g wrangler（或使用 npx）
  - npx wrangler login
- 配置 Secrets：至少需要 OpenAI 密钥用于聊天（以及可选翻译）
  - npx wrangler secret put OPENAI_API_KEY
- 部署：
  - npx wrangler deploy
- 查看日志（可选）：
  - npx wrangler tail

## REST API 接口

- GET /api/models
  - 返回可用模型列表
- GET /api/recipes
  - 查询参数：ingredients、category、cuisine、limit
  - 示例：/api/recipes?ingredients=beef&cuisine=British&limit=3
- POST /api/recipes
  - JSON Body 示例：
    {
      "ingredients": "chicken, tomato",
      "category": "dinner",
      "cuisine": "Chinese",
      "limit": 3,
      "taste": "清淡",
      "timeBudget": 20,
      "servings": 2,
      "equipment": ["炒锅"]
    }
- POST /api/chat
  - JSON Body 示例：
    {
      "message": "今天吃什么？我冰箱有鸡蛋和番茄",
      "threadId": "test-1",
      "model": "openai/gpt-4o-mini"
    }

### 快速自测（curl）

- 获取模型：
  - curl -s https://<your-worker>.workers.dev/api/models
- 拉取食谱（GET）：
  - curl -s "https://<your-worker>.workers.dev/api/recipes?ingredients=beef&cuisine=British&limit=3"
- 拉取食谱（POST）：
  - curl -s -X POST https://<your-worker>.workers.dev/api/recipes -H "Content-Type: application/json" -d '{"ingredients":"chicken, tomato","cuisine":"Chinese","limit":3}'
- 聊天：
  - curl -s -X POST https://<your-worker>.workers.dev/api/chat -H "Content-Type: application/json" -d '{"message":"今天吃什么？我冰箱有鸡蛋和番茄"}'

## 可选：开启中文翻译

- 位置：src/worker.ts 的 getRecipes 内部，默认注释了翻译调用，以避免未配置密钥时阻塞。
- 开启方式：取消注释并显式传入 env.OPENAI_API_KEY
  - recipes = await translateRecipes(recipes, { apiKey: env.OPENAI_API_KEY });
- 翻译实现：src/utils/translator.ts 支持 options.apiKey，如果未传会尝试读取 process.env.OPENAI_API_KEY（Workers 环境推荐通过 env 显式传入）。

## 记忆存储说明

- 默认使用内存 Memory，重启或版本切换不会持久化历史。
- 如需持久化，可改用远程 LibSQL/Turso（https/libsql 协议），并通过 Cloudflare Secrets 配置：
  - LIBSQL_URL、LIBSQL_AUTH_TOKEN（示例）
- 注意：Cloudflare Workers 不支持 libsql 的 file: 协议，请勿使用 file:../mastra.db。

## 类型兼容性（Recipe）

- 统一类型定义位于 src/types/index.ts，Recipe 为联合类型：
  - NormalizedRecipe（归一化结构，包含 id、name、category、area、tags、instructions、thumbnail、youtube、ingredients[{ ingredient, measure }]）
  - TheMealDBRecipe（原始结构，包含 strMeal 及一系列 strIngredientN/strMeasureN 字段）
- 名称提取逻辑兼容 name 与 strMeal，相关代码已在 src/worker.ts 与部分工具中适配。
