import {
  DashboardOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Alert, Dropdown, Layout, Menu, Select, Space, Typography } from "antd";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useHealth } from "../api/hooks.js";
import { StatusDot } from "../components/ui/StatusDot.js";
import { runStatusTone } from "../theme/tokens.js";
import { ProjectProvider, useProjects } from "./project-context.js";

const { Content, Header, Sider } = Layout;

const MENU_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Overview</Link> },
  { key: "/review", icon: <FileSearchOutlined />, label: <Link to="/review">Review</Link> },
  { key: "/version", icon: <ToolOutlined />, label: <Link to="/version">Version tools</Link> },
  { key: "/runs", icon: <HistoryOutlined />, label: <Link to="/runs">Runs</Link> },
  { key: "/settings", icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
];

function selectedKey(pathname: string): string {
  if (pathname.startsWith("/review")) return "/review";
  if (pathname.startsWith("/version") || pathname.startsWith("/whatif")) return "/version";
  if (pathname.startsWith("/runs")) return "/runs";
  if (pathname.startsWith("/settings")) return "/settings";
  return "/";
}

function crumb(pathname: string): string {
  if (pathname.startsWith("/review")) return "Review";
  if (pathname.startsWith("/version") || pathname.startsWith("/whatif")) return "Version tools";
  if (/^\/runs\/[^/]+/.test(pathname)) return "Runs / Run detail";
  if (pathname.startsWith("/runs")) return "Runs";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Overview";
}

function ProjectSwitcher(): React.JSX.Element {
  const { projects, active, setActive } = useProjects();
  if (projects.length === 0) {
    return <Typography.Text style={{ color: "#a5b4fc" }}>No project yet</Typography.Text>;
  }
  return (
    <Select
      value={active?.id}
      onChange={(id: string) => setActive(id)}
      options={projects.map((project) => ({
        value: project.id,
        label: project.name,
      }))}
      style={{ width: "100%" }}
      size="small"
    />
  );
}

function BackendStatus(): React.JSX.Element {
  const health = useHealth();
  const aiOn = health.data?.ai.configured === true;
  const items = [
    {
      key: "persistence",
      label: `History: ${health.data?.persistence ?? "…"}`,
      disabled: true,
    },
    {
      key: "ai",
      label: `AI: ${aiOn ? "connected" : "off"}`,
      disabled: true,
    },
    {
      key: "pending",
      label: `Queued jobs: ${health.data?.pendingJobs ?? "…"}`,
      disabled: true,
    },
  ];
  const queueTone = runStatusTone(
    (health.data?.pendingJobs ?? 0) > 0 ? "running" : "completed",
  );
  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <span style={{ cursor: "pointer" }}>
        <Space size={12} wrap>
          <span className="cqa-pill">
            <StatusDot
              color={health.data ? "green" : "gray"}
              label={health.data ? `Backend: ${health.data.persistence}` : "Backend: …"}
            />
          </span>
          <span className="cqa-pill">
            <StatusDot color={aiOn ? "blue" : "gray"} label={aiOn ? "AI on" : "AI off"} />
          </span>
          {(health.data?.pendingJobs ?? 0) > 0 && (
            <span className="cqa-pill">
              <StatusDot
                color={queueTone.tone}
                pulse={queueTone.pulse}
                label={`${health.data?.pendingJobs} queued`}
              />
            </span>
          )}
        </Space>
      </span>
    </Dropdown>
  );
}

function ShellBody(): React.JSX.Element {
  const location = useLocation();
  const health = useHealth();
  const [collapsed, setCollapsed] = useState(false);
  const ephemeral = health.data?.persistence === "memory";

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        className="cqa-sider"
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <Typography.Title level={4} className="cqa-logo">
            {collapsed ? (
              "CQA"
            ) : (
              <>
                Quality Analyzer
                <span className="cqa-logo-sub">Craftland review ops</span>
              </>
            )}
          </Typography.Title>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey(location.pathname)]}
            items={MENU_ITEMS}
            style={{ background: "transparent", borderRight: 0 }}
          />
          {!collapsed && (
            <div className="cqa-sider-project">
              <span className="cqa-sider-label">Project</span>
              <ProjectSwitcher />
            </div>
          )}
        </div>
      </Sider>
      <Layout
        style={{
          marginLeft: collapsed ? 80 : 220,
          minHeight: "100vh",
          background: "transparent",
        }}
      >
        <Header
          className="cqa-header"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
            position: "sticky",
            top: 0,
            zIndex: 5,
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Typography.Text strong>{crumb(location.pathname)}</Typography.Text>
          <div style={{ marginLeft: "auto" }}>
            <BackendStatus />
          </div>
        </Header>
        <Content
          className="cqa-content cqa-page"
          style={{ padding: 24, maxWidth: 1200, width: "100%", margin: "0 auto" }}
        >
          {ephemeral === true && (
            <Alert
              type="warning"
              showIcon
              message="Ephemeral history — backend uses in-memory persistence, runs are lost on restart."
              style={{ marginBottom: 16 }}
            />
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export function AppShell(): React.JSX.Element {
  return (
    <ProjectProvider>
      <ShellBody />
    </ProjectProvider>
  );
}
