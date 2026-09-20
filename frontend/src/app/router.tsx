import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./shell.js";
import { AnalysesPage } from "../pages/Analyses.js";
import { AnalysisDetailPage } from "../pages/AnalysisDetail.js";
import { ComparePage } from "../pages/Compare.js";
import { OverviewPage } from "../pages/Overview.js";
import { ProjectsPage } from "../pages/Projects.js";
import { SettingsPage } from "../pages/Settings.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "analyses", element: <AnalysesPage /> },
      { path: "analyses/:id", element: <AnalysisDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
