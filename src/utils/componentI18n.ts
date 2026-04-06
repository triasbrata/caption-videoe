// 组件专用的独立 i18n 实例
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// 导入翻译资源
import zhCommon from "@/locales/zh/common.json";
import zhApp from "@/locales/zh/app.json";
import zhComponents from "@/locales/zh/components.json";
import zhMessages from "@/locales/zh/messages.json";

import enCommon from "@/locales/en/common.json";
import enApp from "@/locales/en/app.json";
import enComponents from "@/locales/en/components.json";
import enMessages from "@/locales/en/messages.json";

// 组织翻译资源
const resources = {
  zh: {
    common: zhCommon,
    app: zhApp,
    components: zhComponents,
    messages: zhMessages,
  },
  en: {
    common: enCommon,
    app: enApp,
    components: enComponents,
    messages: enMessages,
  },
};

// 创建独立的 i18n 实例，避免与主应用冲突
const componentI18n = i18n.createInstance();

componentI18n.use(initReactI18next).init({
  // 默认语言和回退策略
  fallbackLng: "zh",

  // 默认命名空间
  defaultNS: "common",

  // 关闭调试模式（在生产环境中）
  debug: false,

  // 插值配置
  interpolation: {
    escapeValue: false, // React 已经默认转义
  },

  // 翻译资源
  resources,

  // 返回对象配置
  returnObjects: false,

  // 后备配置
  returnEmptyString: false,
  returnNull: false,

  // 不进行语言检测，由组件 props 控制
  lng: "zh", // 默认中文
});

export default componentI18n;
