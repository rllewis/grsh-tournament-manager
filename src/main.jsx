import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("grsh-app");
if (container) {
  createRoot(container).render(<App />);
}
