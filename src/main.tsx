import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { testSignatureSerialization } from "./services/starknetService";

(window as any).testSignatureSerialization = testSignatureSerialization;
console.log("[main] testSignatureSerialization mounted to window");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
