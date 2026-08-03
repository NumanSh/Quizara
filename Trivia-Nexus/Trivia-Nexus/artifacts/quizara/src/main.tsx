import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAuth } from "./lib/auth-init";

initAuth();

createRoot(document.getElementById("root")!).render(<App />);
