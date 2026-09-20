import {
  BranchesOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  SettingOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Alert, Badge, Layout, Menu, Typography } from "antd";
import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { useHealth } from "../api/hooks.js";

const { Content, Header, Sider } = Layout;

const MENU_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Overview</Link> },
  { key: "/projects", icon: <FileSearchOutlined />, label: <Link to="/projects">Projects</Link> },
  { key: "/analyses", icon: <BranchesOutlined />, label: <Link to="/analyses">Analyses</Link> },
  { key: "/compare", icon: <SwapOutlined />, label: <Link to="/compare">Compare</Link> },
  { key: "/settings", icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
];

function selectedKey(pathname: string): string {
  if (pathname.startsWith("/analyses")) return "/analyses";
  const match = MENU_ITEMS.find((item) => item.key === pathname);
  return match?.key ?? "/";
}

export function AppShell(): React.JSX.Element {
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
          <Badge
            status={health.data ? "success" : "default"}
            text={health.data ? `Backend: ${health.data.persistence}` : "Backend: …"}
          />
          <Badge
            status={health.data?.ai.configured === true ? "processing" : "default"}
            text={health.data?.ai.configured === true ? "AI on" : "AI off"}
          />
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
