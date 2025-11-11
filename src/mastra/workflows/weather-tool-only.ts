// 工具直连工作流（不依赖 LLM）：直接调用 weatherTool 返回当前天气
// 用途：无法连接 OpenAI 时仍可提供天气摘要
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { weatherTool } from '../tools/weather-tool';

const inputSchema = z.object({
  location: z.string(),
});

const outputSchema = z.object({
  summary: z.string(),
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  windGust: z.number(),
  conditions: z.string(),
  location: z.string(),
});

const fetchWeatherToolOnly = createStep({
  id: 'fetch-weather-tool-only',
  description: '直接调用 weatherTool 获取当前天气并生成简短摘要',
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const result = await weatherTool.execute({
      context: { location: inputData.location },
      runtimeContext: {},
    } as any);
    const summary = `${result.location}：${result.conditions}，气温 ${result.temperature}℃，体感 ${result.feelsLike}℃，湿度 ${result.humidity}% ，风速 ${result.windSpeed}m/s，阵风 ${result.windGust}m/s`;
    return { summary, ...result };
  },
});

export const weatherToolOnlyWorkflow = createWorkflow({
  id: 'weather-tool-only',
  inputSchema,
  outputSchema,
})
  .then(fetchWeatherToolOnly);

weatherToolOnlyWorkflow.commit();