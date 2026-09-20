import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./shell.js";
import { AnalyzePage } from "../pages/Analyze.js";
import { RunDetailPage } from "../pages/RunDetail.js";
import { RunsPage } from "../pages/Runs.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <AnalyzePage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "runs/:id", element: <RunDetailPage /> },
    ],
  },
]);
