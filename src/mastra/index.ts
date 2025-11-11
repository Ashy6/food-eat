
// Mastra 主入口：注册工作流、智能体与评分器等全局配置
// - workflows: 工作流集合（天气、今天吃什么）
// - agents: 智能体集合（weatherAgent、foodAgent）
// - scorers: 全局评分器（当前用于天气模块）；foodAgent 的评分器在其自身配置中接入
// - storage/logger/telemetry/observability: 存储、日志与可观测性配置
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';
import { foodAgent } from './agents/food-agent';
import { foodWorkflow } from './workflows/food-workflow';
import { foodToolOnlyWorkflow } from './workflows/food-tool-only';
import { weatherToolOnlyWorkflow } from './workflows/weather-tool-only';

export const mastra = new Mastra({
  // 注册工作流：天气与“今天吃什么”
  workflows: { weatherWorkflow, foodWorkflow, weatherToolOnlyWorkflow, foodToolOnlyWorkflow },
  // 注册智能体：天气与“今天吃什么”
  agents: { weatherAgent, foodAgent },
  // 全局评分器：用于天气模块的评估（foodAgent 的评分器在 agent 内配置）
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  // 存储：默认内存，可改为文件持久化（file:../mastra.db）
  storage: new LibSQLStore({
    // stores observability, scores, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  // 日志：使用 PinoLogger
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  // 遥测：已弃用（即将移除），保持关闭
  telemetry: {
    // Telemetry is deprecated and will be removed in the Nov 4th release
    enabled: false, 
  },
  // 可观测性：启用默认导出器用于 AI tracing
  observability: {
    // Enables DefaultExporter and CloudExporter for AI tracing
    default: { enabled: true }, 
  },
});
