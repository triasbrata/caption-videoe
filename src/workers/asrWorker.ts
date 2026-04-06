// ASR Worker - 基于 Whisper 的语音识别处理
// 生成句子级别时间戳，适合字幕编辑

import { pipeline, env } from "@huggingface/transformers";
import type { ASRProgress, SubtitleTranscript } from "../types/subtitle";
import { isValidLanguageCode } from "../constants/languages";
import { validateModelCache, fetchWithCache } from "../utils/modelCache";

// ---------------------------------------------------------------------------
// OSS configuration
// ---------------------------------------------------------------------------

const OSS_BASE_URL = "https://fly-cut.oss-cn-hangzhou.aliyuncs.com";
const OSS_MODEL_PATH = "models/onnx-community/whisper-small";
const modelBaseURL = `${OSS_BASE_URL}/${OSS_MODEL_PATH}`;
console.log("ASR OSS model path configured:", modelBaseURL);

// Disable transformers.js's own browser cache — we manage caching ourselves
// in the fetch interceptor so we can validate checksums on each startup.
env.useBrowserCache = false;
env.allowRemoteModels = true;

const use_oss_server = false;

// ---------------------------------------------------------------------------
// Fetch interceptor
// ---------------------------------------------------------------------------

// Keep a reference to the native fetch before we override it so the cache
// utility can use it for network requests without causing infinite recursion.
const originalFetch = globalThis.fetch;
console.log("🔧 Setting fetch interceptor, OSS path:", modelBaseURL);

/**
 * Override globalThis.fetch to:
 *  1. Redirect HuggingFace model URLs → OSS URLs.
 *  2. Serve model files from the Cache API when available.
 *  3. Store fresh downloads in the Cache API for future use.
 */
globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  if (!use_oss_server) {
    return originalFetch(input, init);
  }
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  if (
    url?.includes("huggingface.co") &&
    url.includes("onnx-community/whisper-small")
  ) {
    console.log("🔍 Detected Hugging Face request:", url);

    const match = url.match(
      /onnx-community\/whisper-small\/(?:resolve|raw)\/[^/]+\/(.+)$/
    );
    if (match) {
      const filePath = match[1];
      const ossUrl = `${modelBaseURL}/${filePath}`;
      console.log(`🔄 Redirecting to OSS: ${filePath} -> ${ossUrl}`);
      try {
        return await fetchWithCache(originalFetch, url, init);
      } catch (error) {
        console.error(`❌ OSS request failed: ${ossUrl}`, error);
        throw error;
      }
    }

    const match2 = url.match(/onnx-community\/whisper-small\/(.+)$/);
    if (match2) {
      try {
        return await fetchWithCache(originalFetch, url, init);
      } catch (error) {
        console.error(`❌ OSS request failed: ${ossUrl}`, error);
        throw error;
      }
    }

    console.warn("⚠️ Unable to match URL format:", url);
  }

  return originalFetch(input, init);
};

// ---------------------------------------------------------------------------
// Pipeline singleton
// ---------------------------------------------------------------------------

function getModelId(): string {
  return "onnx-community/whisper-small";
}

const PER_DEVICE_CONFIG = {
  webgpu: {
    dtype: {
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    },
    device: "webgpu",
  },
  wasm: {
    dtype: "q8",
    device: "wasm",
  },
} as const;

class PipelineSingleton {
  static model_id = getModelId();
  static instance: Awaited<ReturnType<typeof pipeline>> | null = null;

  static async getInstance(
    progress_callback?: (progress: unknown) => void,
    device: "webgpu" | "wasm" = "webgpu"
  ) {
    if (!this.instance) {
      console.log("[ASR] Creating pipeline:", {
        device,
        model_id: this.model_id,
      });
      this.instance = pipeline("automatic-speech-recognition", this.model_id, {
        ...PER_DEVICE_CONFIG[device],
        progress_callback,
      });
    }
    return this.instance;
  }

  static reset() {
    this.instance = null;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

async function load({ device }: { device: "webgpu" | "wasm" }) {
  console.log("[ASR] Starting model load:", device);

  // Step 1: Validate the local cache against the remote checksum.
  // A single HEAD request to config.json retrieves the ETag from OSS.
  // For single-part uploads OSS sets ETag = MD5(content), which we
  // treat as the file checksum.  If it differs from the stored value
  // the cached model files are cleared so they are re-downloaded below.
  self.postMessage({
    status: "loading",
    data: "Checking model cache...",
  } satisfies ASRProgress);

  const { valid: cacheValid } = await validateModelCache(
    originalFetch,
    `${modelBaseURL}/config.json`
  );

  // Reset the singleton so the pipeline is recreated with fresh files
  // when the cache was invalidated.
  if (!cacheValid) {
    PipelineSingleton.reset();
  }

  self.postMessage({
    status: "loading",
    data: cacheValid
      ? `Loading model from cache (${device})...`
      : `Downloading updated model (${device})...`,
  } satisfies ASRProgress);

  // Step 2: Load the pipeline.  The fetch interceptor serves files from
  // the Cache API when available, otherwise downloads from OSS and
  // caches them for next time.
  try {
    const transcriber = await PipelineSingleton.getInstance((progress) => {
      console.log("[ASR] Model load progress:", progress);
      self.postMessage(progress);
    }, device);

    if (device === "webgpu") {
      self.postMessage({
        status: "loading",
        data: "Compiling shaders and warming up model...",
      } satisfies ASRProgress);

      await transcriber(new Float32Array(16_000), { language: "en" });
    }

    console.log("[ASR] Model loaded successfully");
    self.postMessage({ status: "loaded" } satisfies ASRProgress);
  } catch (error) {
    console.error("[ASR] Model load failed:", error);
    self.postMessage({
      status: "error",
      error: error instanceof Error ? error.message : "Model load failed",
    } satisfies ASRProgress);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run({
  audio,
  language,
}: {
  audio: Float32Array;
  language: string;
}) {
  console.log("[ASR] Starting recognition:", {
    audioLength: audio?.length,
    language,
  });

  try {
    const transcriber = await PipelineSingleton.getInstance();
    const start = performance.now();

    self.postMessage({
      status: "running",
      data: "Running speech recognition...",
    } satisfies ASRProgress);

    const validLanguage = isValidLanguageCode(language) ? language : "en";
    console.log("ASR language in use:", {
      original: language,
      valid: validLanguage,
    });

    const result = await transcriber(audio, {
      language: validLanguage,
      return_timestamps: true,
      chunk_length_s: 30,
    });

    const end = performance.now();
    console.log("ASR raw recognition result:", result);

    let chunks = [];
    let duration = 0;

    if (result.chunks && Array.isArray(result.chunks)) {
      chunks = result.chunks.map(
        (
          chunk: { text: string; timestamp: [number, number] },
          index: number
        ) => ({
          text: chunk.text.trim(),
          timestamp: chunk.timestamp,
          id: `sentence-${index}`,
          selected: false,
        })
      );
      duration = Math.max(
        ...result.chunks.map(
          (c: { timestamp: [number, number] }) => c.timestamp[1]
        )
      );
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

    const transcript: SubtitleTranscript = {
      text: result.text,
      chunks,
      language,
      duration,
    };

    console.log("ASR recognition completed:", {
      transcriptLength: transcript.chunks.length,
      duration: transcript.duration,
      time: end - start,
    });
    self.postMessage({
      status: "complete",
      result: transcript,
      time: end - start,
    } satisfies ASRProgress);
  } catch (error) {
    console.error("[ASR] Recognition failed:", error);
    self.postMessage({
      status: "error",
      error: error instanceof Error ? error.message : "ASR recognition failed",
    } satisfies ASRProgress);
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.addEventListener("message", async (e) => {
  console.log("ASR worker received message:", e.data);
  const { type, data } = e.data;

  switch (type) {
    case "load":
      await load(data);
      break;

    case "run":
      await run(data);
      break;

    default:
      console.error("Unknown ASR worker message type:", type);
      self.postMessage({
        status: "error",
        error: `Unknown message type: ${type}`,
      } satisfies ASRProgress);
  }
});

export {};
