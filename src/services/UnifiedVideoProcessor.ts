// 统一的视频处理器 - 支持多种引擎

import type {
	VideoFile,
	VideoSegment,
	VideoProcessingProgress,
} from "@/types/video";
import type {
	IVideoProcessingEngine,
	VideoEngineType,
	VideoProcessingOptions,
} from "@/types/videoEngine";
import { VideoEngineFactory } from "./videoEngines/VideoEngineFactory";

export class UnifiedVideoProcessor {
	private currentEngine: IVideoProcessingEngine | null = null;
	private onProgress?: (progress: VideoProcessingProgress) => void;

	constructor(onProgress?: (progress: VideoProcessingProgress) => void) {
		this.onProgress = onProgress;
	}

	/**
	 * 初始化视频处理器
	 * @param videoFile 视频文件
	 * @param preferredEngine 首选引擎类型
	 * @param fallbackEngines 备选引擎列表
	 */
	async initialize(
		videoFile: VideoFile,
		preferredEngine?: VideoEngineType,
		fallbackEngines: VideoEngineType[] = ["webav", "ffmpeg"],
	): Promise<VideoEngineType> {
		try {
			// 清理之前的引擎
			await this.cleanup();

			const engineOrder = preferredEngine
				? [
						preferredEngine,
						...fallbackEngines.filter((e) => e !== preferredEngine),
					]
				: fallbackEngines;

			// 尝试获取最佳可用引擎
			const { engine, type } =
				await VideoEngineFactory.getBestAvailableEngine(engineOrder);
			this.currentEngine = engine;

			// 初始化引擎
			await this.currentEngine.initialize(videoFile, this.onProgress);

			console.log(`Video processor initialized, using engine: ${type}`);
			return type;
		} catch (error) {
			console.error("Video processor initialization failed:", error);
			throw new Error(
				`Video processor initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * 处理视频
	 */
	async processVideo(
		segments: VideoSegment[],
		options: VideoProcessingOptions,
	): Promise<Blob> {
		if (!this.currentEngine) {
			throw new Error("Processor not initialized, call initialize() first");
		}

		return await this.currentEngine.processVideo(segments, options);
	}

	/**
	 * 获取当前引擎信息
	 */
	getCurrentEngineInfo(): {
		name: string;
		type: VideoEngineType;
		version?: string;
	} | null {
		if (!this.currentEngine) return null;

		return {
			name: this.currentEngine.name,
			type: this.currentEngine.type,
			version: this.currentEngine.version,
		};
	}

	/**
	 * 切换引擎
	 */
	async switchEngine(
		newEngineType: VideoEngineType,
		videoFile: VideoFile,
	): Promise<void> {
		try {
			console.log(`Switching video processing engine to: ${newEngineType}`);

			// 清理当前引擎
			await this.cleanup();

			// 创建新引擎
			this.currentEngine = await VideoEngineFactory.createEngine(newEngineType);

			// 初始化新引擎
			await this.currentEngine.initialize(videoFile, this.onProgress);

			console.log(`Successfully switched to engine: ${newEngineType}`);
		} catch (error) {
			console.error(`Failed to switch engine:`, error);
			throw new Error(
				`Failed to switch engine: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * 检查所有可用引擎
	 */
	async checkAllEngines() {
		return await VideoEngineFactory.checkAllEngines();
	}

	/**
	 * 配置当前引擎
	 */
	configureEngine(config: Record<string, any>): void {
		if (this.currentEngine?.configure) {
			this.currentEngine.configure(config);
		}
	}

	/**
	 * 清理资源
	 */
	async cleanup(): Promise<void> {
		if (this.currentEngine) {
			await this.currentEngine.cleanup();
			this.currentEngine = null;
		}
	}

	/**
	 * 获取支持的引擎类型
	 */
	static getSupportedEngines(): VideoEngineType[] {
		return VideoEngineFactory.getSupportedEngines();
	}
}
