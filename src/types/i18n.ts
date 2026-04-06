// 国际化相关类型定义

export type SupportedLanguage = "zh" | "en";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
}
