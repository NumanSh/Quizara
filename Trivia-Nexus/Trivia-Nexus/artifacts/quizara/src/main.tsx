import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAuth } from "./lib/auth-init";
import { ErrorBoundary } from "./components/ErrorBoundary";

initAuth();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
