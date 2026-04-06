// 视频处理引擎工厂

import type { IVideoProcessingEngine, VideoEngineType, EngineCapabilities } from '@/types/videoEngine';
import { WebAVEngine } from './WebAVEngine';
import { FFmpegEngine } from './FFmpegEngine';
// import { WebCodecsEngine } from './WebCodecsEngine'; // 未来扩展

export class VideoEngineFactory {
  private static engines = new Map<VideoEngineType, new () => IVideoProcessingEngine>([
    ['webav', WebAVEngine],
    ['ffmpeg', FFmpegEngine],
    // ['webcodecs', WebCodecsEngine], // 未来扩展
  ]);

  /**
   * 获取指定类型的引擎实例
   */
  static async createEngine(type: VideoEngineType): Promise<IVideoProcessingEngine> {
    const EngineClass = this.engines.get(type);
    if (!EngineClass) {
      throw new Error(`Unsupported video processing engine type: ${type}`);
    }

    const engine = new EngineClass();
    
    // 检查引擎是否可用
    const capabilities = await engine.checkCapabilities();
    if (!capabilities.supported) {
      throw new Error(`Engine ${type} unavailable: ${capabilities.reason}`);
    }

    return engine;
  }

  /**
   * 获取最佳可用引擎
   * 根据用户环境自动选择最适合的引擎
   */
  static async getBestAvailableEngine(preferredOrder: VideoEngineType[] = ['webav', 'ffmpeg']): Promise<{
    engine: IVideoProcessingEngine;
    type: VideoEngineType;
  }> {
    for (const type of preferredOrder) {
      try {
        const engine = await this.createEngine(type);
        console.log(`Selected video processing engine: ${type}`);
        return { engine, type };
      } catch (error) {
        console.warn(`Engine ${type} unavailable:`, error);
        continue;
      }
    }
    
    throw new Error('No available video processing engine');
  }

  /**
   * 检查所有引擎的可用性
   */
  static async checkAllEngines(): Promise<Record<VideoEngineType, EngineCapabilities>> {
    const results = {} as Record<VideoEngineType, EngineCapabilities>;
    
    for (const [type] of this.engines) {
      try {
        const EngineClass = this.engines.get(type)!;
        const engine = new EngineClass();
        results[type] = await engine.checkCapabilities();
      } catch (error) {
        results[type] = {
          supported: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          formats: [],
          features: {
            trimming: false,
            concatenation: false,
            audioProcessing: false,
            subtitleBurning: false,
            qualityControl: false,
          }
        };
      }
    }
    
    return results;
  }

  /**
   * 注册新的引擎类型（用于插件化扩展）
   */
  static registerEngine(type: VideoEngineType, engineClass: new () => IVideoProcessingEngine) {
    this.engines.set(type, engineClass);
    console.log(`Registered video processing engine: ${type}`);
  }

  /**
   * 获取所有支持的引擎类型
   */
  static getSupportedEngines(): VideoEngineType[] {
    return Array.from(this.engines.keys());
  }
}