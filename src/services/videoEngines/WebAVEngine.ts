// WebAV 视频处理引擎实现

import { Combinator, MP4Clip, OffscreenSprite, EmbedSubtitlesClip } from '@webav/av-cliper';
import { 
  createSubtitleClip, 
  formatSubtitleText, 
  calculateSubtitlePosition, 
  secondsToMicroseconds,
  type SubtitleChunk
} from '@/utils/subtitleUtils';
import type { 
  IVideoProcessingEngine, 
  VideoEngineType, 
  EngineCapabilities, 
  VideoProcessingOptions 
} from '@/types/videoEngine';
import type { SubtitleStyle } from '@/components/SubtitleSettings';

interface SubtitleStruct {
  start: number; // 开始时间（微秒）
  end: number;   // 结束时间（微秒）
  text: string;  // 字幕文本
}
import type { VideoFile, VideoSegment, VideoProcessingProgress } from '@/types/video';

export class WebAVEngine implements IVideoProcessingEngine {
  readonly name = 'WebAV';
  readonly type: VideoEngineType = 'webav';
  readonly version = '1.0.0';

  private combinator: Combinator | null = null;
  private videoClip: MP4Clip | null = null;
  private onProgress?: (progress: VideoProcessingProgress) => void;

  async checkCapabilities(): Promise<EngineCapabilities> {
    try {
      // 检查 WebAV 依赖是否可用
      if (typeof Combinator === 'undefined' || typeof MP4Clip === 'undefined') {
        return {
          supported: false,
          reason: 'WebAV library not loaded correctly',
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

      // 检查浏览器支持
      const canvas = document.createElement('canvas');
      const supported = !!(canvas.getContext && canvas.getContext('2d'));
      
      if (!supported) {
        return {
          supported: false,
          reason: 'Browser does not support Canvas 2D',
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
        formats: ['mp4', 'webm'],
        maxFileSize: 500 * 1024 * 1024, // 500MB
        features: {
          trimming: true,
          concatenation: true,
          audioProcessing: true,
          subtitleBurning: true, // 现在支持字幕烧录
          qualityControl: true,
        }
      };
    } catch (error) {
      return {
        supported: false,
        reason: `WebAV engine check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      this.reportProgress('initializing', 0, 'Initializing WebAV engine...');

      // 使用原始工作方式：直接从文件创建stream
      const fileStream = videoFile.file.stream();
      this.videoClip = new MP4Clip(fileStream);
      await this.videoClip.ready;

      this.reportProgress('initializing', 100, 'WebAV engine initialization complete');
      console.log('WebAV engine initialized successfully:', {
        duration: this.videoClip.meta.duration,
        width: this.videoClip.meta.width,
        height: this.videoClip.meta.height,
      });
    } catch (error) {
      console.error('WebAV engine initialization failed:', error);
      throw new Error(`WebAV engine initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processVideo(segments: VideoSegment[], options: VideoProcessingOptions): Promise<Blob> {
    if (!this.videoClip) {
      throw new Error('Engine not initialized, call initialize() first');
    }

    try {
      this.reportProgress('processing', 0, 'Starting video processing...');

      // 筛选保留的片段
      const keptSegments = segments
        .filter(seg => seg.keep)
        .sort((a, b) => a.start - b.start);

      if (keptSegments.length === 0) {
        throw new Error('No video segments selected to keep');
      }

      this.reportProgress('processing', 10, 'Analyzing removed segments...');

      // 获取所有删除的片段并合并连续片段
      const deletedSegments = this.mergeConsecutiveSegments(
        segments.filter(seg => !seg.keep)
      );

      console.log('Removed segments:', deletedSegments.map(s => `${s.start}s-${s.end}s`));
      console.log('Kept segments:', keptSegments.map(s => `${s.start}s-${s.end}s`));

      this.reportProgress('processing', 20, 'Splitting video...');

      // 使用split方法分割视频
      const splitClips = await this.splitVideoByDeletedSegments(this.videoClip, deletedSegments);

      this.reportProgress('processing', 50, 'Creating video combiner...');

      // 创建合成器
      const combinatorOptions: {
        width: number;
        height: number;
        audio?: false;
      } = {
        width: this.videoClip.meta.width,
        height: this.videoClip.meta.height,
      };

      if (!options.preserveAudio) {
        combinatorOptions.audio = false;
      }

      this.combinator = new Combinator(combinatorOptions);

      this.reportProgress('processing', 60, 'Recombining video segments...');

      // 添加分割后的视频片段到合成器
      let totalDuration = 0;
      for (let i = 0; i < splitClips.length; i++) {
        const clip = splitClips[i];
        
        console.log(`Adding video segment ${i + 1}/${splitClips.length}, duration: ${clip.meta.duration / 1e6}s`);

        const sprite = new OffscreenSprite(clip);
        
        // 设置时间偏移
        sprite.time.offset = totalDuration;
        
        // 添加到合成器
        await this.combinator.addSprite(sprite);

        totalDuration += clip.meta.duration;

        this.reportProgress(
          'processing', 
          60 + (i / splitClips.length) * 15, 
          `Recombining segment ${i + 1}/${splitClips.length}`
        );
      }

      // 从 segments 中提取字幕信息
      const subtitleChunks = segments
        .filter(seg => seg.text && seg.id) // 只处理有字幕文本和ID的片段
        .map(seg => ({
          id: seg.id!,
          text: seg.text!,
          timestamp: [seg.start, seg.end] as [number, number],
          deleted: !seg.keep,
        }));

      // 根据字幕处理类型添加字幕
      console.log('options.subtitleProcessing:', options.subtitleProcessing, subtitleChunks);
      if (options.subtitleProcessing && options.subtitleProcessing !== 'none' && subtitleChunks.length > 0) {
        this.reportProgress('processing', 75, 'Adding subtitles to video...');
        
        await this.addSoftSubtitles(subtitleChunks, keptSegments, options.subtitleStyle);
        
        this.reportProgress('processing', 78, 'Subtitle addition completed');
      }

      this.reportProgress('processing', 80, 'Starting video output...');

      // 输出视频
      const outputStream = this.combinator.output();
      if (!outputStream) {
        throw new Error('Unable to create video output stream');
      }
      
      const chunks: Uint8Array[] = [];
      const reader = outputStream.getReader();

      let totalSize = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalSize += value.length;
        
        // 简单的进度估计
        this.reportProgress('processing', 80 + (totalSize / (10 * 1024 * 1024)) * 15, 'Writing video data...');
      }

      this.reportProgress('processing', 95, 'Finalizing video processing...');

      // 创建最终的 Blob
      const outputBlob = new Blob(chunks.map(chunk => new Uint8Array(chunk)), { 
        type: options.format === 'webm' ? 'video/webm' : 'video/mp4' 
      });

      this.reportProgress('processing', 100, 'Video processing completed');

      console.log('WebAV Video processing completed:', {
        originalSegments: segments.length,
        keptSegments: keptSegments.length,
        splitClips: splitClips.length,
        outputSize: outputBlob.size,
        outputType: outputBlob.type,
        totalDuration: totalDuration / 1e6
      });

      return outputBlob;
    } catch (error) {
      console.error('WebAV video processing failed:', error);
      throw new Error(`Video processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.combinator) {
        await this.combinator.destroy();
        this.combinator = null;
      }
      
      if (this.videoClip) {
        await this.videoClip.destroy();
        this.videoClip = null;
      }
      
      this.onProgress = undefined;
      console.log('WebAV engine resources cleaned up');
    } catch (error) {
      console.warn('Warning during WebAV engine cleanup:', error);
    }
  }

  configure(config: Record<string, unknown>): void {
    // WebAV 引擎特定的配置选项
    console.log('WebAV engine configuration:', config);
  }


  private reportProgress(stage: string, progress: number, message: string) {
    if (this.onProgress) {
      this.onProgress({
        stage: stage as VideoProcessingProgress['stage'],
        progress: Math.min(100, Math.max(0, progress)),
        message
      });
    }
  }

  private async splitVideoByDeletedSegments(clip: MP4Clip, deletedSegments: VideoSegment[]): Promise<MP4Clip[]> {
    if (deletedSegments.length === 0) {
      return [clip];
    }

    // 合并重叠的删除片段
    const mergedDeleted = this.mergeOverlappingSegments(deletedSegments);
    
    console.log('Merged removed segments:', mergedDeleted.map(s => `${s.start}s-${s.end}s`));

    const resultClips: MP4Clip[] = [];
    let currentClip = clip;
    let currentTime = 0; // 当前在原视频中的时间偏移（秒）

    for (let i = 0; i < mergedDeleted.length; i++) {
      const deleteSegment = mergedDeleted[i];
      
      // 如果删除片段开始时间 > 当前时间，保留中间的片段
      if (deleteSegment.start > currentTime) {
        const keepDuration = deleteSegment.start - currentTime;
        console.log(`Kept segment: ${currentTime}s-${deleteSegment.start}s, duration: ${keepDuration}s`);
        
        if (keepDuration > 0.01) { // 最小0.01秒片段
          // 在删除片段开始处分割
          const splitTime = (deleteSegment.start - currentTime) * 1e6; // 转换为微秒
          const [keepPart, remaining] = await currentClip.split(splitTime);
          
          if (keepPart && keepPart.meta.duration > 0) {
            resultClips.push(keepPart);
          }
          
          currentClip = remaining;
        }
      }

      // 跳过删除的片段
      const deleteDuration = deleteSegment.end - deleteSegment.start;
      if (deleteDuration > 0 && currentClip) {
        const deleteTime = deleteDuration * 1e6; // 转换为微秒
        
        console.log(`Skipped removed segment: ${deleteSegment.start}s-${deleteSegment.end}s, duration: ${deleteDuration}s`);
        
        // 检查是否还有足够的视频长度
        if (currentClip.meta.duration > deleteTime) {
          const [, remaining] = await currentClip.split(deleteTime);
          currentClip = remaining;
        } else {
          // 删除片段超过了剩余视频长度，直接结束
          currentClip = null;
          break;
        }
      }

      currentTime = deleteSegment.end;
    }

    // 如果还有剩余的视频片段，添加到结果中
    if (currentClip && currentClip.meta.duration > 0.01 * 1e6) {
      console.log(`Kept final segment, duration: ${currentClip.meta.duration / 1e6}s`);
      resultClips.push(currentClip);
    }

    console.log(`Split complete, total ${resultClips.length} segments`);
    return resultClips;
  }

  private mergeOverlappingSegments(segments: VideoSegment[]): VideoSegment[] {
    if (segments.length === 0) return [];
    
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const merged: VideoSegment[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];
      
      // 如果当前片段与最后一个合并的片段重叠，则合并
      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  }

  private mergeConsecutiveSegments(segments: VideoSegment[]): VideoSegment[] {
    if (segments.length === 0) return [];
    
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const merged: VideoSegment[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];
      
      // 如果当前片段与最后一个片段连续（next.start === prev.end）或重叠，则合并
      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  }


  /**
   * 将字幕添加到合成器中
   */
  private async addSubtitlesToCombinator(
    keptSegments: VideoSegment[], 
    subtitleChunks: SubtitleChunk[], 
    subtitleType: 'soft' | 'hard'
  ): Promise<void> {
    if (!this.combinator || !this.videoClip || subtitleChunks.length === 0) {
      return;
    }
    
    // WebAV引擎支持软烧录和硬烧录
    console.log(`WebAV engine uses ${subtitleType === 'soft' ? 'soft' : 'hard'} subtitle burn-in`);

    // 计算最终视频中字幕的时间映射
    const subtitleTimeMapping = this.calculateSubtitleTimeMapping(keptSegments, subtitleChunks);
    
    let subtitleIndex = 0;
    for (const subtitleChunk of subtitleChunks) {
      const mappedTime = subtitleTimeMapping.get(subtitleChunk);
      if (!mappedTime) {
        continue; // 这个字幕片段被删除了，跳过
      }

      try {
        // 格式化字幕文本
        const formattedText = formatSubtitleText(subtitleChunk.text, 40);
        
        // 创建字幕图像
        const subtitleClip = await createSubtitleClip(formattedText, {
          fontSize: 28,
          color: 'white',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          padding: 12,
          borderRadius: 6,
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9)',
        });

        // 创建字幕精灵
        const subtitleSprite = new OffscreenSprite(subtitleClip);
        
        // 设置字幕时间
        subtitleSprite.time = {
          offset: mappedTime.startTime,
          duration: mappedTime.duration,
        };

        // 计算字幕位置（底部居中）
        const position = calculateSubtitlePosition(
          this.videoClip.meta.width,
          this.videoClip.meta.height,
          subtitleClip.meta.width || 400, // 默认宽度
          subtitleClip.meta.height || 60  // 默认高度
        );

        // 设置字幕位置
        subtitleSprite.rect.x = position.x;
        subtitleSprite.rect.y = position.y;
        subtitleSprite.rect.w = subtitleClip.meta.width || 400;
        subtitleSprite.rect.h = subtitleClip.meta.height || 60;

        // 设置 z-index 确保字幕在视频上方
        subtitleSprite.zIndex = 10;

        // 添加到合成器
        await this.combinator.addSprite(subtitleSprite);
        
        console.log(`Adding subtitle ${subtitleIndex + 1}: "${subtitleChunk.text}" (${mappedTime.startTime / 1e6}s - ${(mappedTime.startTime + mappedTime.duration) / 1e6}s)`);
        
        subtitleIndex++;
      } catch (error) {
        console.warn(`Failed to add subtitle:`, subtitleChunk.text, error);
      }
    }

    console.log(`Added ${subtitleIndex} subtitles in total`);
  }

  /**
   * 计算字幕在最终视频中的时间映射
   * 关键修复：正确处理被删除片段后的时间重新映射
   */
  private calculateSubtitleTimeMapping(
    keptSegments: VideoSegment[], 
    subtitleChunks: SubtitleChunk[]
  ): Map<SubtitleChunk, { startTime: number; duration: number }> {
    const mapping = new Map<SubtitleChunk, { startTime: number; duration: number }>();
    
    // 按时间排序保留的片段
    const sortedKeptSegments = [...keptSegments].sort((a, b) => a.start - b.start);
    
    let currentOffset = 0; // 当前在最终视频中的偏移时间（微秒）
    
    for (const segment of sortedKeptSegments) {
      // 找到这个片段内的字幕（修复：包含跨片段边界的字幕）
      const segmentSubtitles = subtitleChunks.filter(subtitle => {
        const [subtitleStart, subtitleEnd] = subtitle.timestamp;
        // 字幕与片段有重叠即可（不要求完全包含）
        return subtitleStart < segment.end && subtitleEnd > segment.start;
      });
      
      for (const subtitle of segmentSubtitles) {
        const [subtitleStart, subtitleEnd] = subtitle.timestamp;
        
        // 计算字幕与片段的重叠部分
        const overlapStart = Math.max(subtitleStart, segment.start);
        const overlapEnd = Math.min(subtitleEnd, segment.end);
        
        if (overlapStart < overlapEnd) {
          // 计算字幕在最终视频中的开始时间
          const relativeStart = overlapStart - segment.start; // 相对于片段开始的时间
          const finalStartTime = currentOffset + secondsToMicroseconds(relativeStart);
          
          // 计算重叠部分的持续时间
          const duration = secondsToMicroseconds(overlapEnd - overlapStart);
          
          // 如果已经存在映射，合并时间范围（处理跨片段字幕）
          const existing = mapping.get(subtitle);
          if (existing) {
            // 扩展时间范围以包含新的重叠部分
            const newStartTime = Math.min(existing.startTime, finalStartTime);
            const newEndTime = Math.max(existing.startTime + existing.duration, finalStartTime + duration);
            mapping.set(subtitle, {
              startTime: newStartTime,
              duration: newEndTime - newStartTime,
            });
          } else {
            mapping.set(subtitle, {
              startTime: finalStartTime,
              duration: duration,
            });
          }
        }
      }
      
      // 更新偏移时间
      currentOffset += secondsToMicroseconds(segment.end - segment.start);
    }
    
    return mapping;
  }
  
  /**
   * 添加软烧录字幕（使用 EmbedSubtitlesClip）
   */
  private async addSoftSubtitles(
    subtitleChunks: SubtitleChunk[], 
    keptSegments: VideoSegment[], 
    subtitleStyle?: SubtitleStyle
  ): Promise<void> {
    if (!this.combinator || !this.videoClip) {
      return;
    }
    
    try {
      // 生成 SubtitleStruct 数组
      const subtitleStructs = this.generateSubtitleStructs(subtitleChunks, keptSegments);
      
      if (subtitleStructs.length === 0) {
        console.warn('No subtitle content available to add');
        return;
      }
      
      console.log('Generated subtitle structure:', subtitleStructs);
      console.log('Subtitle style used:', subtitleStyle);
      
      // 使用配置的字幕样式或默认样式
      const effectiveStyle = subtitleStyle || {
        fontSize: 48,
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        fontStyle: 'normal',
        color: '#FFFFFF',
        backgroundColor: '#000000',
        borderColor: '#000000',
        shadowColor: '#000000',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        borderWidth: 3,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowBlur: 4,
        backgroundOpacity: 0,
        backgroundRadius: 4,
        backgroundPadding: 8,
        bottomOffset: 60,
        visible: true,
      } as SubtitleStyle;
      
      // 创建字幕嵌入精灵 - 使用配置的样式
      const subtitleSprite = new OffscreenSprite(
        new EmbedSubtitlesClip(subtitleStructs, {
          videoWidth: this.videoClip.meta.width,
          videoHeight: this.videoClip.meta.height,
          fontSize: effectiveStyle.fontSize,
          fontFamily: effectiveStyle.fontFamily,
          fontWeight: effectiveStyle.fontWeight,
          fontStyle: effectiveStyle.fontStyle,
          color: effectiveStyle.color,
          textBgColor: effectiveStyle.backgroundOpacity > 0 
            ? `${effectiveStyle.backgroundColor}${Math.round(effectiveStyle.backgroundOpacity * 255).toString(16).padStart(2, '0')}`
            : undefined,
          strokeStyle: effectiveStyle.borderWidth > 0 ? effectiveStyle.borderColor : undefined,
          lineWidth: effectiveStyle.borderWidth,
          lineJoin: 'round',
          lineCap: 'round',
          letterSpacing: effectiveStyle.letterSpacing.toString(),
          bottomOffset: effectiveStyle.bottomOffset,
          textShadow: effectiveStyle.shadowBlur > 0 ? {
            offsetX: effectiveStyle.shadowOffsetX,
            offsetY: effectiveStyle.shadowOffsetY,
            blur: effectiveStyle.shadowBlur,
            color: effectiveStyle.shadowColor,
          } : undefined,
        })
      );
      
      // 设置字幕时间（覆盖整个视频时长）
      const totalDuration = keptSegments.reduce((total, seg) => {
        return total + (seg.end - seg.start);
      }, 0) * 1e6; // 转换为微秒
      
      subtitleSprite.time = {
        offset: 0,
        duration: totalDuration,
      };
      
      // 设置 z-index 确保字幕在视频上方
      subtitleSprite.zIndex = 10;
      
      // 添加到合成器
      await this.combinator.addSprite(subtitleSprite);
      
      console.log('Soft subtitle burn-in added successfully');
    } catch (error) {
      console.error('Failed to add soft subtitle burn-in:', error);
    }
  }
  
  /**
   * 生成 SubtitleStruct 数组，时间单位为微秒
   */
  private generateSubtitleStructs(subtitleChunks: SubtitleChunk[], keptSegments: VideoSegment[]): SubtitleStruct[] {
    // 计算时间映射
    const timeMapping = this.calculateSubtitleTimeMapping(keptSegments, subtitleChunks);
    
    const subtitleStructs: SubtitleStruct[] = [];
    
    for (const chunk of subtitleChunks) {
      const mappedTime = timeMapping.get(chunk);
      if (!mappedTime) {
        continue; // 这个字幕片段被删除了，跳过
      }
      
      subtitleStructs.push({
        start: mappedTime.startTime, // 已经是微秒
        end: mappedTime.startTime + mappedTime.duration, // 已经是微秒
        text: chunk.text
      });
    }
    
    return subtitleStructs;
  }
  
}