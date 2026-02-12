import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./components/dashboard/Dashboard";
import { ProjectView } from "./components/project/ProjectView";
import { Toaster } from "./components/ui/sonner";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/project/:id" element={<ProjectView />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  </StrictMode>
);
