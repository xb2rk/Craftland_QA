import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "./shell.js";
import { OverviewPage } from "../pages/Overview.js";
import { ReviewPage } from "../pages/Review.js";
import { RunDetailPage } from "../pages/RunDetail.js";
import { RunsPage } from "../pages/Runs.js";
import { SettingsPage } from "../pages/Settings.js";
import { WhatIfPage } from "../pages/WhatIf.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "review", element: <ReviewPage /> },
      { path: "runs", element: <RunsPage /> },
      { path: "runs/:id", element: <RunDetailPage /> },
      { path: "whatif", element: <WhatIfPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
