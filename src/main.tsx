import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { StoreInitializer } from "./components/StoreInitializer";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreInitializer />
    <App />
  </StrictMode>
);
