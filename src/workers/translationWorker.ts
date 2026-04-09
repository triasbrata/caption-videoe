// Translation Worker - 基于 TranslateGemma 的翻译处理
// 使用 image-text-to-text pipeline 进行文本翻译

import { pipeline, env } from "@huggingface/transformers";
import type {
  TranslationProgress,
  SubtitleTranscript,
} from "../types/subtitle";

type Device = "webgpu" | "wasm";

interface LoadParams {
  device: Device;
}

interface RunParams {
  transcript: SubtitleTranscript;
  targetLanguage: string;
}

interface TranslateMessage {
  role: "user";
  content: Array<{
    type: "text";
    source_lang_code: string;
    target_lang_code: string;
    text: string;
  }>;
}

/**
 * Translation Worker - 类封装版本
 * 管理 TranslateGemma 模型的加载和文本翻译
 */
class TranslationWorker {
  // 模型配置
  private readonly modelId = "onnx-community/translategemma-text-4b-it-ONNX";

  // 管道实例 (typed loosely to support TranslateGemma's custom message format)
  private pipelineInstance:
    | ((
        input: TranslateMessage[],
        options: { max_new_tokens: number }
      ) => Promise<Array<{ generated_text: Array<{ role: string; content: string }> }>>)
    | undefined;

  // 设备配置
  private readonly perDeviceConfig = {
    webgpu: {
      dtype: "q4" as const,
      device: "webgpu" as const,
    },
    wasm: {
      dtype: "q4" as const,
      device: "cpu" as const, // TranslateGemma has no wasm ONNX files; use cpu fallback
    },
  } as const;

  constructor() {
    this.setupEnvironment();
    this.setupMessageListener();
  }

  /**
   * 配置 transformers.js 环境
   */
  private setupEnvironment(): void {
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    console.log("🔧 Translation Worker initialized, model:", this.modelId);
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    self.addEventListener("message", async (e) => {
      console.log("Translation worker received message:", e.data);
      const { type, data } = e.data;

      switch (type) {
        case "load":
          await this.load(data);
          break;
        case "run":
          await this.run(data);
          break;
        default:
          this.sendError(`Unknown message type: ${type}`);
          break;
      }
    });
  }

  /**
   * 获取或创建管道实例
   */
  private async getPipeline(
    progressCallback?: (progress: unknown) => void,
    device: Device = "webgpu"
  ): Promise<NonNullable<TranslationWorker["pipelineInstance"]>> {
    if (!this.pipelineInstance) {
      console.log("Translation creating new pipeline instance:", {
        device,
        modelId: this.modelId,
      });

      const p = await pipeline("text-generation", this.modelId, {
        ...this.perDeviceConfig[device],
        progress_callback: progressCallback,
      });
      this.pipelineInstance = p as unknown as NonNullable<TranslationWorker["pipelineInstance"]>;
    }
    return this.pipelineInstance;
  }

  /**
   * 加载翻译模型
   */
  private async load(params: LoadParams): Promise<void> {
    console.log("Translation worker starting model load:", params.device);

    this.postMessage({
      status: "loading",
      data: `Loading translation model (${params.device})...`,
    });

    try {
      await this.getPipeline((progress) => {
        console.log("Translation model load progress:", progress);
        this.postMessage(progress);
      }, params.device);

      console.log("Translation model loaded");
      this.postMessage({ status: "loaded" });
    } catch (error) {
      console.error("Translation model load failed:", error);
      this.sendError(
        error instanceof Error ? error.message : "Model load failed"
      );
    }
  }

  /**
   * 运行翻译
   */
  private async run(params: RunParams): Promise<void> {
    console.log("Translation worker starting translation:", {
      chunksCount: params.transcript.chunks.length,
      sourceLanguage: params.transcript.language,
      targetLanguage: params.targetLanguage,
    });

    try {
      const transcriber = await this.getPipeline();
      const start = performance.now();

      this.postMessage({
        status: "running",
        data: "Translating subtitles...",
      });

      const sourceLanguage = params.transcript.language;
      const targetLanguage = params.targetLanguage;

      // 翻译每个字幕片段
      const translatedChunks = [];
      const totalChunks = params.transcript.chunks.length;

      for (let i = 0; i < totalChunks; i++) {
        const chunk = params.transcript.chunks[i];

        // 更新进度
        this.postMessage({
          status: "running",
          data: `Translating ${i + 1}/${totalChunks}...`,
          progress: i,
          total: totalChunks,
        });

        // 构建翻译消息
        const messages: TranslateMessage[] = [
          {
            role: "user",
            content: [
              {
                type: "text",
                source_lang_code: sourceLanguage,
                target_lang_code: targetLanguage,
                text: chunk.text,
              },
            ],
          },
        ];

        // 执行翻译
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (transcriber as any)(messages, { max_new_tokens: 1024 });
        const translatedText = this.extractTranslatedText(result);

        translatedChunks.push({
          ...chunk,
          text: translatedText,
        });

        console.log(`Translated chunk ${i + 1}/${totalChunks}:`, {
          original: chunk.text,
          translated: translatedText,
        });
      }

      const end = performance.now();
      const translatedText = translatedChunks.map((c) => c.text).join(" ");

      const translatedTranscript: SubtitleTranscript = {
        text: translatedText,
        chunks: translatedChunks,
        language: targetLanguage,
        duration: params.transcript.duration,
      };

      console.log("Translation completed:", {
        chunksCount: translatedChunks.length,
        time: end - start,
      });

      this.postMessage({
        status: "complete",
        result: translatedTranscript,
        time: end - start,
      });
    } catch (error) {
      console.error("Translation failed:", error);
      this.sendError(
        error instanceof Error ? error.message : "Translation failed"
      );
    }
  }

  /**
   * 从模型输出中提取翻译文本
   */
  private extractTranslatedText(result: unknown): string {
    // image-text-to-text pipeline 返回的是数组
    if (Array.isArray(result) && result.length > 0) {
      const first = result[0];
      if (
        typeof first === "object" &&
        first !== null &&
        "generated_text" in first
      ) {
        return String(first.generated_text).trim();
      }
    }
    console.warn("Unexpected translation result format:", result);
    return "";
  }

  /**
   * 发送消息到主线程
   */
  private postMessage(data: unknown): void {
    self.postMessage(data);
  }

  /**
   * 发送错误消息
   */
  private sendError(error: string): void {
    this.postMessage({
      status: "error",
      error,
    } satisfies TranslationProgress);
  }
}

// 初始化 Translation Worker
new TranslationWorker();
