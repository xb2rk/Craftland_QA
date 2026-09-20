import { DashboardOutlined, HistoryOutlined } from "@ant-design/icons";
import { Alert, Badge, Dropdown, Layout, Menu, Select, Typography } from "antd";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useHealth } from "../api/hooks.js";
import { ProjectProvider, useProjects } from "./project-context.js";

const { Content, Header, Sider } = Layout;

const MENU_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Analyze</Link> },
  { key: "/runs", icon: <HistoryOutlined />, label: <Link to="/runs">Runs</Link> },
];

function selectedKey(pathname: string): string {
  if (pathname.startsWith("/runs")) return "/runs";
  return "/";
}

function ProjectSwitcher(): React.JSX.Element {
  const { projects, active, setActive } = useProjects();
  if (projects.length === 0) {
    return <Typography.Text type="secondary">No project yet</Typography.Text>;
  }
  return (
    <Select
      value={active?.id}
      onChange={(id: string) => setActive(id)}
      options={projects.map((project) => ({
        value: project.id,
        label: project.name,
      }))}
      style={{ minWidth: 180 }}
    />
  );
}

function BackendStatus(): React.JSX.Element {
  const health = useHealth();
  const items = [
    {
      key: "persistence",
      label: `History: ${health.data?.persistence ?? "…"}`,
      disabled: true,
    },
    {
      key: "ai",
      label: `AI: ${health.data?.ai.configured === true ? "connected" : "off"}`,
      disabled: true,
    },
    {
      key: "pending",
      label: `Queued jobs: ${health.data?.pendingJobs ?? "…"}`,
      disabled: true,
    },
  ];
  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <span style={{ cursor: "pointer" }}>
        <Badge
          status={health.data ? "success" : "default"}
          text={health.data ? `Backend: ${health.data.persistence}` : "Backend: …"}
        />{" "}
        <Badge
          status={health.data?.ai.configured === true ? "processing" : "default"}
          text={health.data?.ai.configured === true ? "AI on" : "AI off"}
        />
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
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <Typography.Title
          level={4}
          style={{ color: "#fff", padding: "16px 16px 8px", margin: 0 }}
        >
          {collapsed ? "CQA" : "Quality Analyzer"}
        </Typography.Title>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey(location.pathname)]}
          items={MENU_ITEMS}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
          }}
        >
          <Typography.Text strong>Craftland Quality Analyzer</Typography.Text>
          <ProjectSwitcher />
          <div style={{ marginLeft: "auto" }}>
            <BackendStatus />
          </div>
        </Header>
        <Content style={{ padding: 24, maxWidth: 1200, width: "100%", margin: "0 auto" }}>
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
