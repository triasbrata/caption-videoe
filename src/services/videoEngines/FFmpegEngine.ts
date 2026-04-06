// FFmpeg.wasm 视频处理引擎实现

import type { 
  IVideoProcessingEngine, 
  VideoEngineType, 
  EngineCapabilities, 
  VideoProcessingOptions 
} from '@/types/videoEngine';
import type { VideoFile, VideoSegment, VideoProcessingProgress } from '@/types/video';

// FFmpeg.wasm 类型定义（简化版）
declare global {
  interface Window {
    FFmpeg?: any;
  }
}

export class FFmpegEngine implements IVideoProcessingEngine {
  readonly name = 'FFmpeg.wasm';
  readonly type: VideoEngineType = 'ffmpeg';
  readonly version = '0.12.0';

  private ffmpeg: any = null;
  private onProgress?: (progress: VideoProcessingProgress) => void;
  private isLoaded = false;

  async checkCapabilities(): Promise<EngineCapabilities> {
    try {
      // 检查是否支持 SharedArrayBuffer (FFmpeg.wasm 需要)
      const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      
      // 检查是否支持 WebAssembly
      const supportsWasm = typeof WebAssembly !== 'undefined';

      if (!supportsSharedArrayBuffer) {
        return {
          supported: false,
          reason: 'Browser does not support SharedArrayBuffer; ensure HTTPS and cross-origin isolation are enabled',
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

      if (!supportsWasm) {
        return {
          supported: false,
          reason: 'Browser does not support WebAssembly',
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

      return {
        supported: true,
        formats: ['mp4', 'webm', 'avi', 'mov', 'mkv'],
        maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
        features: {
          trimming: true,
          concatenation: true,
          audioProcessing: true,
          subtitleBurning: true, // FFmpeg 支持字幕烧录
          qualityControl: true,
        }
      };
    } catch (error) {
      return {
        supported: false,
        reason: `FFmpeg engine check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  async initialize(videoFile: VideoFile, onProgress?: (progress: VideoProcessingProgress) => void): Promise<void> {
    try {
      this.onProgress = onProgress;
      this.reportProgress('initializing', 0, 'Loading FFmpeg.wasm...');

      // 动态加载 FFmpeg.wasm
      if (!window.FFmpeg) {
        await this.loadFFmpegLibrary();
      }

      // 创建 FFmpeg 实例
      const { FFmpeg } = window.FFmpeg;
      this.ffmpeg = new FFmpeg();

      this.reportProgress('initializing', 30, 'Initializing FFmpeg instance...');

      // 设置进度回调
      this.ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        this.reportProgress('processing', progress * 100, 'Processing...');
      });

      this.ffmpeg.on('log', ({ message }: { message: string }) => {
        console.log('FFmpeg:', message);
      });

      // 加载 FFmpeg 核心
      this.reportProgress('initializing', 60, 'Loading FFmpeg core...');
      await this.ffmpeg.load();

      this.reportProgress('initializing', 90, 'Preparing video file...');

      // 将视频文件写入 FFmpeg 文件系统
      const videoData = await fetch(videoFile.url).then(r => r.arrayBuffer());
      const videoFileName = `input.${this.getFileExtension(videoFile.name)}`;
      await this.ffmpeg.writeFile(videoFileName, new Uint8Array(videoData));

      this.isLoaded = true;
      this.reportProgress('initializing', 100, 'FFmpeg engine initialization complete');

      console.log('FFmpeg engine initialized successfully');
    } catch (error) {
      console.error('FFmpeg engine initialization failed:', error);
      throw new Error(`FFmpeg engine initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processVideo(segments: VideoSegment[], options: VideoProcessingOptions): Promise<Blob> {
    if (!this.isLoaded || !this.ffmpeg) {
      throw new Error('Engine not initialized, call initialize() first');
    }

    try {
      this.reportProgress('processing', 0, 'Analyzing video segments...');

      // 筛选保留的片段
      const keptSegments = segments
        .filter(seg => seg.keep)
        .sort((a, b) => a.start - b.start);

      if (keptSegments.length === 0) {
        throw new Error('No video segments selected to keep');
      }

      const inputFileName = 'input.mp4'; // 假设输入是 MP4
      const outputFormat = options.format || 'mp4';
      const outputFileName = `output.${outputFormat}`;

      this.reportProgress('processing', 10, 'Building FFmpeg command...');

      // 构建 FFmpeg 命令
      const ffmpegArgs = this.buildFFmpegCommand(
        inputFileName,
        outputFileName,
        keptSegments,
        options
      );

      console.log('Executing FFmpeg command:', ffmpegArgs.join(' '));
      this.reportProgress('processing', 20, 'Running video processing...');

      // 执行 FFmpeg 命令
      await this.ffmpeg.exec(ffmpegArgs);

      this.reportProgress('processing', 90, 'Reading processing result...');

      // 读取输出文件
      const outputData = await this.ffmpeg.readFile(outputFileName);
      
      // 创建 Blob
      const mimeType = this.getMimeType(outputFormat);
      const outputBlob = new Blob([outputData], { type: mimeType });

      this.reportProgress('processing', 100, 'Video processing completed');

      console.log('FFmpeg Video processing completed:', {
        originalSegments: segments.length,
        keptSegments: keptSegments.length,
        outputSize: outputBlob.size,
        outputType: outputBlob.type
      });

      return outputBlob;
    } catch (error) {
      console.error('FFmpeg video processing failed:', error);
      throw new Error(`Video processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.ffmpeg) {
        // 清理 FFmpeg 文件系统中的临时文件
        try {
          const files = await this.ffmpeg.listDir('/');
          for (const file of files) {
            if (file.name !== '.' && file.name !== '..') {
              await this.ffmpeg.deleteFile(file.name);
            }
          }
        } catch (e) {
          console.warn('Warning while cleaning FFmpeg temporary files:', e);
        }

        this.ffmpeg = null;
      }
      
      this.isLoaded = false;
      this.onProgress = undefined;
      console.log('FFmpeg engine resources cleaned up');
    } catch (error) {
      console.warn('Warning during FFmpeg engine cleanup:', error);
    }
  }

  configure(config: Record<string, any>): void {
    // FFmpeg 引擎特定的配置选项
    console.log('FFmpeg engine configuration:', config);
  }

  private async loadFFmpegLibrary(): Promise<void> {
    // 动态加载 FFmpeg.wasm 库
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/esm/index.js';
    script.type = 'module';
    
    return new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load FFmpeg.wasm library'));
      document.head.appendChild(script);
    });
  }

  private buildFFmpegCommand(
    inputFile: string,
    outputFile: string,
    segments: VideoSegment[],
    options: VideoProcessingOptions
  ): string[] {
    const args = ['-i', inputFile];

    if (segments.length === 1) {
      // 单个片段，直接裁剪
      const segment = segments[0];
      args.push('-ss', segment.start.toString());
      args.push('-t', (segment.end - segment.start).toString());
    } else {
      // 多个片段，需要使用 concat 滤镜
      let filterComplex = '';
      segments.forEach((segment, index) => {
        filterComplex += `[0:v]trim=start=${segment.start}:end=${segment.end},setpts=PTS-STARTPTS[v${index}];`;
        if (options.preserveAudio) {
          filterComplex += `[0:a]atrim=start=${segment.start}:end=${segment.end},asetpts=PTS-STARTPTS[a${index}];`;
        }
      });

      // 连接视频流
      filterComplex += segments.map((_, i) => `[v${i}]`).join('') + `concat=n=${segments.length}:v=1:a=0[outv];`;
      
      if (options.preserveAudio) {
        // 连接音频流
        filterComplex += segments.map((_, i) => `[a${i}]`).join('') + `concat=n=${segments.length}:v=0:a=1[outa]`;
        args.push('-map', '[outv]', '-map', '[outa]');
      } else {
        args.push('-map', '[outv]');
      }

      args.push('-filter_complex', filterComplex);
    }

    // 质量设置
    if (options.quality === 'high') {
      args.push('-crf', '18');
    } else if (options.quality === 'medium') {
      args.push('-crf', '23');
    } else {
      args.push('-crf', '28');
    }

    // 音频处理
    if (!options.preserveAudio) {
      args.push('-an'); // 不包含音频
    }

    // 输出格式
    args.push('-c:v', 'libx264');
    if (options.preserveAudio) {
      args.push('-c:a', 'aac');
    }

    args.push(outputFile);
    return args;
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'mp4';
  }

  private getMimeType(format: string): string {
    const mimeTypes: Record<string, string> = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'avi': 'video/avi',
      'mov': 'video/quicktime',
      'mkv': 'video/x-matroska',
    };
    return mimeTypes[format] || 'video/mp4';
  }

  private reportProgress(stage: string, progress: number, message: string) {
    if (this.onProgress) {
      this.onProgress({
        stage: stage as any,
        progress: Math.min(100, Math.max(0, progress)),
        message,
        engine: 'ffmpeg'
      } as VideoProcessingProgress);
    }
  }
}