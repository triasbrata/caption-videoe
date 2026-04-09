// ASR Worker - 基于 Whisper 的语音识别处理
// 生成句子级别时间戳，适合字幕编辑

import { pipeline, env } from "@huggingface/transformers";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { ASRProgress, SubtitleTranscript } from "../types/subtitle";
import { isValidLanguageCode } from "../constants/languages";

type Device = "webgpu" | "wasm";

interface LoadParams {
  device: Device;
}

interface RunParams {
  audio: Float32Array;
  language: string;
}

interface ChunkResult {
  text: string;
  timestamp: [number, number];
}

interface TranscriptionResult {
  text: string;
  chunks?: ChunkResult[];
}

/**
 * ASR Worker - 类封装版本
 * 管理 Whisper 模型的加载和语音识别
 */
class ASRWorker {
  // OSS 配置
  private readonly OSS_BASE_URL = "https://fly-cut.oss-cn-hangzhou.aliyuncs.com";
  private readonly OSS_MODEL_PATH = "models/onnx-community/whisper-smallwhisper-small";
  private readonly useOssServer = false;

  // 模型配置
  private readonly modelId = "onnx-community/whisper-large-v3-turbo";

  // 管道实例
  private pipelineInstance: AutomaticSpeechRecognitionPipeline | null = null;

  // 设备配置
  private readonly perDeviceConfig = {
    webgpu: {
      dtype: {
        encoder_model: "fp16",
        decoder_model_merged: "q4",
      },
      device: "webgpu" as const,
    },
    wasm: {
      dtype: "q8" as const,
      device: "wasm" as const,
    },
  } as const;

  constructor() {
    this.setupEnvironment();
    this.setupFetchInterceptor();
    this.setupMessageListener();
  }

  /**
   * 配置 transformers.js 环境
   */
  private setupEnvironment(): void {
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    console.log("🔧 ASR Worker initialized, model:", this.modelId);
  }

  /**
   * 设置 fetch 拦截器，用于将 Hugging Face 请求重定向到 OSS
   */
  private setupFetchInterceptor(): void {
    const worker = this;
    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      if (!worker.useOssServer) {
        return originalFetch(input, init);
      }

      const url = worker.extractUrl(input);

      if (url?.includes("huggingface.co")) {
        return worker.handleHuggingFaceRequest(url, init, originalFetch);
      }

      return originalFetch(input, init);
    };
  }

  /**
   * 从 RequestInfo 中提取 URL 字符串
   */
  private extractUrl(input: RequestInfo | URL): string | undefined {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return input.url;
  }

  /**
   * 处理 Hugging Face 请求，重定向到 OSS
   */
  private async handleHuggingFaceRequest(
    url: string,
    init: RequestInit | undefined,
    originalFetch: typeof fetch
  ): Promise<Response> {
    console.log("🔍 Detected Hugging Face request:", url);

    const ossUrl = this.tryRedirectToOss(url);
    if (ossUrl) {
      return this.fetchFromOss(ossUrl, init, originalFetch);
    }

    console.warn("⚠️ Unable to match URL format:", url);
    return originalFetch(url, init);
  }

  /**
   * 尝试将 Hugging Face URL 转换为 OSS URL
   */
  private tryRedirectToOss(url: string): string | null {
    const modelBaseURL = `${this.OSS_BASE_URL}/${this.OSS_MODEL_PATH}`;

    // 格式 1: /resolve/main/ 或 /raw/main/ 路径
    const match1 = url.match(
      /onnx-community\/whisper-small\/(?:resolve|raw)\/[^/]+\/(.+)$/
    );
    if (match1) {
      return `${modelBaseURL}/${match1[1]}`;
    }

    // 格式 2: 其他可能的路径格式
    const match2 = url.match(/onnx-community\/whisper-small\/(.+)$/);
    if (match2) {
      const cleanPath = match2[1].replace(/^(resolve|raw)\/[^/]+\//, "");
      return `${modelBaseURL}/${cleanPath}`;
    }

    return null;
  }

  /**
   * 从 OSS 获取文件
   */
  private async fetchFromOss(
    ossUrl: string,
    init: RequestInit | undefined,
    originalFetch: typeof fetch
  ): Promise<Response> {
    console.log(`🔄 Redirecting to OSS: ${ossUrl}`);
    try {
      return await originalFetch(ossUrl, init);
    } catch (error) {
      console.error(`❌ OSS request failed: ${ossUrl}`, error);
      throw error;
    }
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    self.addEventListener("message", async (e) => {
      console.log("ASR worker received message:", e.data);
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
  ): Promise<AutomaticSpeechRecognitionPipeline> {
    if (!this.pipelineInstance) {
      console.log("ASR creating new pipeline instance:", {
        device,
        modelId: this.modelId,
      });

      this.pipelineInstance = await pipeline("automatic-speech-recognition", this.modelId, {
        ...this.perDeviceConfig[device],
        progress_callback: progressCallback,
      });
    }
    return this.pipelineInstance;
  }

  /**
   * 加载 ASR 模型
   */
  private async load(params: LoadParams): Promise<void> {
    console.log("ASR worker starting model load:", params.device);

    this.postMessage({
      status: "loading",
      data: `Loading model (${params.device})...`,
    });

    try {
      const transcriber = await this.getPipeline(
        (progress) => {
          console.log("ASR model load progress:", progress);
          this.postMessage(progress);
        },
        params.device
      );

      // WebGPU 需要预热
      if (params.device === "webgpu") {
        this.postMessage({
          status: "loading",
          data: "Compiling shaders and warming up model...",
        });

        await transcriber(new Float32Array(16_000), { language: "en" });
      }

      console.log("ASR model loaded");
      this.postMessage({ status: "loaded" });
    } catch (error) {
      console.error("ASR model load failed:", error);
      this.sendError(error instanceof Error ? error.message : "Model load failed");
    }
  }

  /**
   * 运行 ASR 识别
   */
  private async run(params: RunParams): Promise<void> {
    console.log("ASR worker starting recognition:", {
      audioLength: params.audio?.length,
      language: params.language,
    });

    try {
      const transcriber = await this.getPipeline();
      const start = performance.now();

      this.postMessage({
        status: "running",
        data: "Running speech recognition...",
      });

      const validLanguage = isValidLanguageCode(params.language) ? params.language : "en";
      console.log("ASR language in use:", {
        original: params.language,
        valid: validLanguage,
      });

      const result = (await transcriber(params.audio, {
        language: validLanguage,
        return_timestamps: true,
        chunk_length_s: 30,
      })) as TranscriptionResult;

      const end = performance.now();
      console.log("ASR raw recognition result:", result);

      const transcript = this.processResult(result, params.language);
      const time = end - start;

      console.log("ASR recognition completed:", {
        transcriptLength: transcript.chunks.length,
        duration: transcript.duration,
        time,
      });

      this.postMessage({
        status: "complete",
        result: transcript,
        time,
      });
    } catch (error) {
      console.error("ASR recognition failed:", error);
      this.sendError(error instanceof Error ? error.message : "ASR recognition failed");
    }
  }

  /**
   * 处理识别结果，生成字幕片段
   */
  private processResult(
    result: TranscriptionResult,
    language: string
  ): SubtitleTranscript {
    let chunks: SubtitleTranscript["chunks"] = [];
    let duration = 0;

    if (result.chunks && Array.isArray(result.chunks)) {
      chunks = result.chunks.map((chunk, index) => ({
        text: chunk.text.trim(),
        timestamp: chunk.timestamp,
        id: `sentence-${index}`,
        selected: false,
      }));
      duration = Math.max(...result.chunks.map((c) => c.timestamp[1]));
    } else if (result.text) {
      chunks = [
        {
          text: result.text.trim(),
          timestamp: [0, duration || 0] as [number, number],
          id: "sentence-0",
          selected: false,
        },
      ];
    }

    return {
      text: result.text,
      chunks,
      language,
      duration,
    };
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
    } satisfies ASRProgress);
  }
}

// 初始化 ASR Worker
new ASRWorker();
