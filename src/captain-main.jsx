import { createRoot } from "react-dom/client";
import CaptainRoster from "./pages/CaptainRoster";

const container = document.getElementById("grsh-captain-app");
if (container) {
  createRoot(container).render(<CaptainRoster />);
}
