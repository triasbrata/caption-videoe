// Translation Service - 管理翻译功能
// 基于 TranslateGemma 模型实现文本翻译

import type { TranslationProgress, SubtitleTranscript } from "../types/subtitle";
import { hasWebGPU } from "../utils/audioUtils";
import translationWorker from "../workers/translationWorker.ts?worker&inline";

export class TranslationService {
  private worker: Worker | null = null;
  private onProgress: ((progress: TranslationProgress) => void) | null = null;
  private isModelLoaded = false;
  private currentDevice: "webgpu" | "wasm" = "wasm";

  constructor() {
    console.log("Translation service initialized");
    this.init();
  }

  /**
   * 初始化服务
   */
  private async init() {
    // 检测设备能力
    const supportsWebGPU = await hasWebGPU();
    this.currentDevice = supportsWebGPU ? "webgpu" : "wasm";
    console.log("Translation device detection result:", {
      supportsWebGPU,
      currentDevice: this.currentDevice,
    });
  }

  /**
   * 创建 Worker
   */
  private createWorker(): Worker {
    if (this.worker) {
      console.log("Translation terminating existing worker");
      this.worker.terminate();
    }

    console.log("Translation creating new worker");
    this.worker = new translationWorker();

    this.worker.onmessage = (e) => {
      console.log("Translation worker message received:", e.data);
      const progress = e.data as TranslationProgress;

      // 更新模型加载状态
      if (progress.status === "loaded") {
        this.isModelLoaded = true;
      } else if (progress.status === "error") {
        this.isModelLoaded = false;
      }

      // 转发进度给外部监听器
      if (this.onProgress) {
        this.onProgress(progress);
      }
    };

    this.worker.onerror = (error) => {
      console.error("Translation worker error:", error);
      if (this.onProgress) {
        this.onProgress({
          status: "error",
          error: "Worker runtime error",
        });
      }
    };

    return this.worker;
  }

  /**
   * 设置进度回调
   */
  public setProgressCallback(callback: (progress: TranslationProgress) => void) {
    this.onProgress = callback;
  }

  /**
   * 获取当前设备类型
   */
  public getCurrentDevice(): "webgpu" | "wasm" {
    return this.currentDevice;
  }

  /**
   * 设置设备类型
   */
  public setDevice(device: "webgpu" | "wasm") {
    if (this.currentDevice !== device) {
      console.log("Translation device type changed:", this.currentDevice, "->", device);
      this.currentDevice = device;
      this.isModelLoaded = false;

      // 设备切换时需要重新创建 Worker
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
    }
  }

  /**
   * 加载模型
   */
  public async loadModel(): Promise<void> {
    console.log("Translation starting model load:", this.currentDevice);

    if (!this.worker) {
      this.createWorker();
    }

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.error("Translation worker creation failed");
        reject(new Error("Worker creation failed"));
        return;
      }

      const originalCallback = this.onProgress;

      this.onProgress = (progress) => {
        // 转发给原始回调
        if (originalCallback) {
          originalCallback(progress);
        }

        // 处理加载完成
        if (progress.status === "loaded") {
          console.log("Translation model loaded");
          this.onProgress = originalCallback;
          resolve();
        } else if (progress.status === "error") {
          console.error("Translation model load failed:", progress.error);
          this.onProgress = originalCallback;
          reject(new Error(progress.error || "Model load failed"));
        }
      };

      console.log("Translation sending model load message:", {
        device: this.currentDevice,
      });
      this.worker.postMessage({
        type: "load",
        data: { device: this.currentDevice },
      });
    });
  }

  /**
   * 准备模型（分步操作第一步）
   */
  public async prepareModel(): Promise<void> {
    console.log("Translation preparing model:", this.currentDevice);

    if (!this.worker) {
      this.createWorker();
    }

    if (!this.isModelLoaded) {
      console.log("Translation starting model load");
      await this.loadModel();
    } else {
      console.log("Translation model already loaded, skipping preparation");
    }
  }

  /**
   * 翻译字幕
   */
  public async translateTranscript(
    transcript: SubtitleTranscript,
    targetLanguage: string
  ): Promise<SubtitleTranscript> {
    console.log("Translation starting translation:", {
      chunksCount: transcript.chunks.length,
      sourceLanguage: transcript.language,
      targetLanguage,
    });

    // 检查模型是否已准备好
    if (!this.isModelLoaded || !this.worker) {
      throw new Error("Model not ready, call prepareModel() first");
    }

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.error("Translation worker unavailable");
        reject(new Error("Worker unavailable"));
        return;
      }

      const originalCallback = this.onProgress;

      this.onProgress = (progress) => {
        // 转发给原始回调
        if (originalCallback) {
          originalCallback(progress);
        }

        // 处理翻译完成
        if (progress.status === "complete" && progress.result) {
          this.onProgress = originalCallback;
          resolve(progress.result);
        } else if (progress.status === "error") {
          console.error("Translation failed:", progress.error);
          this.onProgress = originalCallback;
          reject(new Error(progress.error || "Translation failed"));
        }
      };

      console.log("Translation sending translation message:", {
        transcriptChunks: transcript.chunks.length,
        targetLanguage,
      });
      this.worker.postMessage({
        type: "run",
        data: { transcript, targetLanguage },
      });
    });
  }

  /**
   * 一键翻译（兼容原有接口）
   */
  public async translateWithAutoLoad(
    transcript: SubtitleTranscript,
    targetLanguage: string
  ): Promise<SubtitleTranscript> {
    await this.prepareModel();
    return this.translateTranscript(transcript, targetLanguage);
  }

  /**
   * 检查模型是否已加载
   */
  public isReady(): boolean {
    return this.isModelLoaded;
  }

  /**
   * 销毁服务
   */
  public destroy() {
    console.log("Translation service destroyed");
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.onProgress = null;
    this.isModelLoaded = false;
  }
}

// 全局单例
export const translationService = new TranslationService();