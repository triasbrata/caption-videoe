// ASR 服务 - 管理语音识别功能
// 基于 transformers.js-examples/whisper-word-timestamps 简化实现

import type { ASRProgress, SubtitleTranscript } from "../types/subtitle";
import { processAudioForASR, hasWebGPU } from "../utils/audioUtils";
import asrWorker from "../workers/asrWorker.ts?worker&inline";

export class ASRService {
  private worker: Worker | null = null;
  private onProgress: ((progress: ASRProgress) => void) | null = null;
  private isModelLoaded = false;
  private currentDevice: "webgpu" | "wasm" = "wasm";
  // private currentLanguage: string = 'en'; // TODO: Implement language switching

  constructor() {
    console.log("ASR service initialized");
    this.init();
  }

  /**
   * 初始化服务
   */
  private async init() {
    // 检测设备能力
    const supportsWebGPU = await hasWebGPU();
    this.currentDevice = supportsWebGPU ? "webgpu" : "wasm";
    console.log("ASR device detection result:", {
      supportsWebGPU,
      currentDevice: this.currentDevice,
    });
  }

  /**
   * 创建 Worker
   */
  private createWorker(): Worker {
    if (this.worker) {
      console.log("ASR terminating existing worker");
      this.worker.terminate();
    }

    console.log("ASR creating new worker");
    this.worker = new asrWorker();

    this.worker.onmessage = (e) => {
      console.log("ASR worker message received:", e.data);
      const progress = e.data as ASRProgress;

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
      console.error("ASR worker error:", error);
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
  public setProgressCallback(callback: (progress: ASRProgress) => void) {
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
      console.log("ASR device type changed:", this.currentDevice, "->", device);
      this.currentDevice = device;
      this.isModelLoaded = false; // 重置模型加载状态

      // 设备切换时需要重新创建 Worker 以使用新设备
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
    console.log("ASR starting model load:", this.currentDevice);

    if (!this.worker) {
      this.createWorker();
    }

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.error("ASR worker creation failed");
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
          console.log("ASR model loaded");
          this.onProgress = originalCallback;
          resolve();
        } else if (progress.status === "error") {
          console.error("ASR model load failed:", progress.error);
          this.onProgress = originalCallback;
          reject(new Error(progress.error || "Model load failed"));
        }
      };

      console.log("ASR sending model load message:", {
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
    console.log("ASR preparing model:", this.currentDevice);

    if (!this.worker) {
      this.createWorker();
    }

    if (!this.isModelLoaded) {
      console.log("ASR starting model load");
      await this.loadModel();
    } else {
      console.log("ASR model already loaded, skipping preparation");
    }
  }

  /**
   * 识别音频（分步操作第二步）
   */
  public async transcribeAudio(
    audioBuffer: ArrayBuffer,
    language: string = "en"
  ): Promise<SubtitleTranscript> {
    console.log("ASR starting transcription:", {
      bufferSize: audioBuffer.byteLength,
      language,
    });

    // 检查模型是否已准备好
    if (!this.isModelLoaded || !this.worker) {
      throw new Error("Model not ready, call prepareModel() first");
    }

    // 保存当前语言用于结果格式化
    // this.currentLanguage = language; // TODO: Implement language switching

    // 处理音频数据
    const audioData = await processAudioForASR(audioBuffer);
    console.log("ASR audio data processed:", {
      audioDataLength: audioData.length,
    });

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        console.error("ASR worker unavailable");
        reject(new Error("Worker unavailable"));
        return;
      }

      const originalCallback = this.onProgress;

      this.onProgress = (progress) => {
        // 转发给原始回调
        if (originalCallback) {
          originalCallback(progress);
        }

        // 处理识别完成
        if (progress.status === "complete" && progress.result) {
          this.onProgress = originalCallback;
          resolve(progress.result);
        } else if (progress.status === "error") {
          console.error("ASR recognition failed:", progress.error);
          this.onProgress = originalCallback;
          reject(new Error(progress.error || "ASR recognition failed"));
        }
      };

      console.log("ASR sending transcription message:", {
        audioLength: audioData.length,
        language,
      });
      this.worker.postMessage({
        type: "run",
        data: { audio: audioData, language },
      });
    });
  }

  /**
   * 一键识别（兼容原有接口）
   */
  public async transcribeAudioWithAutoLoad(
    audioBuffer: ArrayBuffer,
    language: string = "en"
  ): Promise<SubtitleTranscript> {
    await this.prepareModel();
    return this.transcribeAudio(audioBuffer, language);
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
    console.log("ASR service destroyed");
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.onProgress = null;
    this.isModelLoaded = false;
  }
}

// 全局单例
export const asrService = new ASRService();
