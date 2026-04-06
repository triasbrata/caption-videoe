import { useMemo } from "react";
import { FlyCutCaption } from "./index";
import {
  enUS,
  jaJP,
  zhCN,
  type FlyCutCaptionLocale,
} from "./contexts/LocaleProvider";
import { useAppStore } from "./stores/appStore";

const getLocaleForLanguage = (
  language: string
): FlyCutCaptionLocale | undefined => {
  switch (language) {
    case "zh":
    case "zh-CN":
      return zhCN;
    case "en":
    case "en-US":
      return enUS;
    case "ja":
    case "ja-JP":
      return jaJP;
    default:
      return undefined;
  }
};

function App() {
  const currentLanguage = useAppStore((s) => s.language);
  const setCurrentLanguage = useAppStore((s) => s.setLanguage);
  const currentLocale = useMemo<FlyCutCaptionLocale>(
    () => getLocaleForLanguage(currentLanguage),
    [currentLanguage]
  );

  const handleLanguageChange = (language: string) => {
    console.log("Language changed to:", language);
    setCurrentLanguage(language);
  };

  return (
    <FlyCutCaption
      config={{
        language: currentLanguage,
      }}
      locale={currentLocale}
      onLanguageChange={handleLanguageChange}
      onError={(error) => {
        console.error("Component error:", error);
      }}
      onProgress={(stage, progress) => {
        console.log(`Progress: ${stage} - ${progress}%`);
      }}
      onReady={() => {
        console.log("FlyCut Caption is ready");
      }}
      onFileSelected={(file) => {
        console.log("File selected:", file.name);
      }}
      onSubtitleGenerated={(subtitles) => {
        console.log("Subtitles generated:", subtitles.length);
      }}
      onSubtitleChanged={(subtitles) => {
        console.log("Subtitles changed:", subtitles.length);
      }}
      onVideoProcessed={(blob, filename) => {
        console.log("Video processed:", filename, blob.size, "bytes");
      }}
      onExportComplete={(blob, filename) => {
        console.log("Export complete:", filename, blob.size, "bytes");
      }}
    />
  );
}

export default App;
