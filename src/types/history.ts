// 历史记录相关类型定义

export interface TimeSegment {
  id: string;
  start: number; // 新时间轴上的开始时间
  end: number; // 新时间轴上的结束时间
  originalStart: number; // 原始时间轴上的开始时间
  originalEnd: number; // 原始时间轴上的结束时间
  duration: number; // 片段时长
}

export interface EditAction {
  id: string;
  type: "DELETE_CHUNKS" | "RESTORE_CHUNKS" | "SELECT_ALL" | "CLEAR_SELECTION";
  timestamp: number;
  description: string;
  data: {
    chunkIds?: string[];
    previousSelection?: Set<string>;
    newSelection?: Set<string>;
  };
}

export interface HistoryState {
  actions: EditAction[];
  currentIndex: number; // -1 表示在初始状态
  maxHistorySize: number;
}

export interface EditingSession {
  id: string;
  originalDuration: number;
  currentDuration: number;
  keptSegments: TimeSegment[];
  deletedSegments: TimeSegment[];
  selectedChunks: Set<string>;
  totalDeletedTime: number;
  compressionRatio: number; // 压缩比例
}
