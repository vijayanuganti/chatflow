import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { registerServiceWorker } from "@/lib/notify";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the SW after the app mounts. Notifications use it; if registration
// fails we silently fall back to the page-level Notification API.
if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    registerServiceWorker();
  });
}
