// 快捷键管理Hook
import { useEffect } from 'react';
import hotkeys from 'hotkeys-js';
import { useUndo, useRedo, useCanUndo, useCanRedo } from '@/stores/historyStore';
import { useShowInfo } from '@/stores/messageStore';
import { useTranslation } from '@/contexts/LocaleProvider';

interface UseHotkeysOptions {
  enableHistoryHotkeys?: boolean;
  enableGlobalHotkeys?: boolean;
}

export function useHotkeys(options: UseHotkeysOptions = {}) {
  const {
    enableHistoryHotkeys = true,
    enableGlobalHotkeys = false,
  } = options;

  const { t } = useTranslation();

  // 历史记录操作
  const undo = useUndo();
  const redo = useRedo();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // 消息通知
  const showInfo = useShowInfo();

  useEffect(() => {
    if (!enableHistoryHotkeys) return;

    // 设置快捷键作用域
    const scope = enableGlobalHotkeys ? 'all' : 'history';
    hotkeys.setScope(scope);

    // 撤销操作 - Ctrl+Z (Windows) / Cmd+Z (Mac)
    hotkeys('ctrl+z,cmd+z', { scope }, (event) => {
      event.preventDefault();
      if (canUndo) {
        undo();
        showInfo(t('hooks.hotkeys.undone'), t('hooks.hotkeys.undoneDetail'));
      } else {
        showInfo(t('hooks.hotkeys.cannotUndo'), t('hooks.hotkeys.cannotUndoDetail'));
      }
    });

    // 重做操作 - Ctrl+Y (Windows) / Cmd+Shift+Z (Mac) / Ctrl+Shift+Z (Windows)
    hotkeys('ctrl+y,cmd+shift+z,ctrl+shift+z', { scope }, (event) => {
      event.preventDefault();
      if (canRedo) {
        redo();
        showInfo(t('hooks.hotkeys.redone'), t('hooks.hotkeys.redoneDetail'));
      } else {
        showInfo(t('hooks.hotkeys.cannotRedo'), t('hooks.hotkeys.cannotRedoDetail'));
      }
    });

    return () => {
      // 清理快捷键
      hotkeys.unbind('ctrl+z,cmd+z', scope);
      hotkeys.unbind('ctrl+y,cmd+shift+z,ctrl+shift+z', scope);
    };
  }, [enableHistoryHotkeys, enableGlobalHotkeys, undo, redo, canUndo, canRedo, showInfo, t]);

  // 返回快捷键信息供UI显示
  return {
    shortcuts: {
      undo: {
        keys: navigator.platform.includes('Mac') ? ['⌘', 'Z'] : ['Ctrl', 'Z'],
        description: t('hooks.hotkeys.undoLabel'),
        enabled: canUndo,
      },
      redo: {
        keys: navigator.platform.includes('Mac') ? ['⌘', '⇧', 'Z'] : ['Ctrl', 'Y'],
        description: t('hooks.hotkeys.redoLabel'),
        enabled: canRedo,
      },
    },
  };
}

// 格式化快捷键显示
export function formatShortcut(keys: string[]): string {
  return keys.join(' + ');
}

// 检测操作系统并返回对应的快捷键
export function getOSShortcuts() {
  const isMac = navigator.platform.includes('Mac');
  
  return {
    undo: isMac ? ['⌘', 'Z'] : ['Ctrl', 'Z'],
    redo: isMac ? ['⌘', '⇧', 'Z'] : ['Ctrl', 'Y'],
    modifier: isMac ? '⌘' : 'Ctrl',
  };
}