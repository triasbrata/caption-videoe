// 音频处理工具函数

/**
 * 处理音频文件，转换为 Whisper 所需的格式
 * 重采样到 16kHz，单声道
 * 与官方 transformers.js-examples/whisper-word-timestamps 完全一致
 */
export async function processAudioForASR(buffer: ArrayBuffer): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass({ sampleRate: 16_000 });

  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer);
    let audio;
    if (audioBuffer.numberOfChannels === 2) {
      // Merge channels
      const SCALING_FACTOR = Math.sqrt(2);
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      audio = new Float32Array(left.length);
      for (let i = 0; i < audioBuffer.length; ++i) {
        audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
      }
    } else {
      audio = audioBuffer.getChannelData(0);
    }
    
    await audioContext.close();
    return audio;
  } catch (error) {
    console.error('Audio processing failed:', error);
    await audioContext.close();
    throw new Error(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * 检测浏览器是否支持 WebGPU
 */
export async function hasWebGPU(): Promise<boolean> {
  if (!('gpu' in navigator)) {
    return false;
  }
  
  try {
    const adapter = await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter();
    return !!adapter;
  } catch (e) {
    console.error('WebGPU detection failed:', e);
    return false;
  }
}

/**
 * 从音频缓冲区创建可播放的音频 URL
 */
export function createAudioFromBuffer(
  audioBuffer: AudioBuffer, 
  sampleRate: number = 44100
): string {
  const length = audioBuffer.length;
  const numberOfChannels = audioBuffer.numberOfChannels;
  
  // 创建 WAV 文件头
  const buffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(buffer);
  
  // WAV 文件头
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numberOfChannels * 2, true);
  
  // 音频数据
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

/**
 * 音频音量标准化
 */
export function normalizeAudio(audioData: Float32Array): Float32Array {
  // 找到最大绝对值
  let maxValue = 0;
  for (let i = 0; i < audioData.length; i++) {
    const absValue = Math.abs(audioData[i]);
    if (absValue > maxValue) {
      maxValue = absValue;
    }
  }
  
  if (maxValue === 0) return audioData;
  
  // 标准化到 [-1, 1] 范围
  const normalizedData = new Float32Array(audioData.length);
  const factor = 1.0 / maxValue;
  
  for (let i = 0; i < audioData.length; i++) {
    normalizedData[i] = audioData[i] * factor;
  }
  
  return normalizedData;
}

/**
 * 应用音频淡入淡出效果
 */
export function applyFadeInOut(
  audioData: Float32Array,
  fadeInDuration: number = 0.1,
  fadeOutDuration: number = 0.1,
  sampleRate: number = 16000
): Float32Array {
  const fadedData = new Float32Array(audioData.length);
  const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
  const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
  
  for (let i = 0; i < audioData.length; i++) {
    let multiplier = 1.0;
    
    // 淡入
    if (i < fadeInSamples) {
      multiplier = i / fadeInSamples;
    }
    // 淡出
    else if (i >= audioData.length - fadeOutSamples) {
      multiplier = (audioData.length - i) / fadeOutSamples;
    }
    
    fadedData[i] = audioData[i] * multiplier;
  }
  
  return fadedData;
}