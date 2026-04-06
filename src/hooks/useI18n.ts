import { useTranslation } from "react-i18next";
import { useCallback } from "react";
import type { SupportedLanguage, LanguageOption } from "@/types/i18n";

// 支持的语言列表
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: "zh",
    name: "Chinese",
    nativeName: "Chinese",
  },
  {
    code: "en",
    name: "English",
    nativeName: "English",
  },
];

/**
 * 国际化自定义 Hook
 * 提供翻译功能和语言切换功能
 */
export function useI18n() {
  const { t, i18n } = useTranslation();

  // 当前语言
  const currentLanguage = i18n.language as SupportedLanguage;

  // 切换语言
  const changeLanguage = useCallback(
    async (language: SupportedLanguage) => {
      try {
        await i18n.changeLanguage(language);
      } catch (error) {
        console.error("Failed to change language:", error);
      }
    },
    [i18n]
  );

  // 获取当前语言信息
  const getCurrentLanguageInfo = useCallback((): LanguageOption => {
    return (
      SUPPORTED_LANGUAGES.find((lang) => lang.code === currentLanguage) ||
      SUPPORTED_LANGUAGES[0]
    );
  }, [currentLanguage]);

  // 检查是否为指定语言
  const isLanguage = useCallback(
    (language: SupportedLanguage): boolean => {
      return currentLanguage === language;
    },
    [currentLanguage]
  );

  // 获取浏览器默认语言
  const getBrowserLanguage = useCallback((): SupportedLanguage => {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith("zh")) {
      return "zh";
    }
    return "en"; // 默认英文
  }, []);

  // 格式化带参数的翻译
  const formatTranslation = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      return t(key, params);
    },
    [t]
  );

  return {
    // 翻译函数
    t,

    // 语言相关
    currentLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
    changeLanguage,
    getCurrentLanguageInfo,
    isLanguage,
    getBrowserLanguage,

    // 工具函数
    formatTranslation,

    // i18n 实例（高级用法）
    i18n,
  };
}

/**
 * 用于组件中快速获取翻译函数的 Hook
 * 适用于只需要翻译功能的简单场景
 */
export function useTranslate() {
  const { t } = useTranslation();
  return t;
}

/**
 * 用于获取特定命名空间翻译的 Hook
 */
export function useNamespaceTranslation(namespace: string) {
  const { t } = useTranslation(namespace);
  return t;
}
