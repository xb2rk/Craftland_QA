import { Button, Card, Divider, Input, List, Select, Tag, Typography } from "antd";
import { useState } from "react";

import { useHealth } from "../api/hooks.js";
import { ANALYSIS_LENSES, VERBOSITIES, type AnalysisLens, type Verbosity } from "../api/types.js";
import { LensPicker } from "../components/LensPicker.js";
import { VerbosityPicker } from "../components/VerbosityPicker.js";
import { loadSavedProjects, saveActiveProjectId, saveSavedProjects } from "../projects/registry.js";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  newTemplateId,
  saveSettings,
  type AppSettings,
} from "../settings/store.js";
import { loadScenarios, saveScenarios } from "../whatif/scenarios.js";

export function SettingsPage(): React.JSX.Element {
  const health = useHealth();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [templateName, setTemplateName] = useState("");
  const [templateGoal, setTemplateGoal] = useState("");
  const [templateLens, setTemplateLens] = useState<AnalysisLens>(settings.defaultLens);
  const [templateVerbosity, setTemplateVerbosity] = useState<Verbosity>(settings.verbosity);

  const update = (patch: Partial<AppSettings>): void => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const addTemplate = (): void => {
    if (templateName.trim().length === 0 || templateGoal.trim().length === 0) return;
    update({
      templates: [
        ...settings.templates,
        {
          id: newTemplateId(),
          name: templateName.trim(),
          goal: templateGoal.trim(),
          lens: templateLens,
          verbosity: templateVerbosity,
        },
      ],
    });
    setTemplateName("");
    setTemplateGoal("");
  };

  const wipe = (action: () => void): void => {
    action();
    window.location.reload();
  };

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        Settings
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Defaults apply to every new review — each run can still override them.
      </Typography.Paragraph>

      <Card title="AI defaults" style={{ marginBottom: 16 }}>
        <VerbosityPicker
          value={settings.verbosity}
          onChange={(verbosity) => update({ verbosity })}
        />
        <LensPicker
          value={settings.defaultLens}
          onChange={(defaultLens) => update({ defaultLens })}
        />
      </Card>

      <Card title={`Prompt templates (${settings.templates.length})`} style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">
          Saved goals with lens and length baked in — apply them in one click from the Review page.
        </Typography.Paragraph>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Input
            placeholder="Template name, e.g. Sprint balance check"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            style={{ flex: "2 1 200px" }}
          />
          <Select
            value={templateLens}
            onChange={setTemplateLens}
            style={{ flex: "1 1 160px" }}
            options={ANALYSIS_LENSES.map((lens) => ({ value: lens.value, label: lens.label }))}
          />
          <Select
            value={templateVerbosity}
            onChange={setTemplateVerbosity}
            style={{ flex: "1 1 140px" }}
            options={VERBOSITIES.map((entry) => ({ value: entry.value, label: entry.label }))}
          />
        </div>
        <Input.TextArea
          rows={2}
          placeholder="Goal text the template fills in"
          value={templateGoal}
          onChange={(event) => setTemplateGoal(event.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Button
          type="primary"
          disabled={templateName.trim().length === 0 || templateGoal.trim().length === 0}
          onClick={addTemplate}
        >
          Save template
        </Button>
        <Divider />
        <List
          locale={{ emptyText: "No templates yet." }}
          dataSource={settings.templates}
          renderItem={(template) => (
            <List.Item
              actions={[
                <Button
                  key="delete"
                  type="link"
                  size="small"
                  danger
                  onClick={() =>
                    update({
                      templates: settings.templates.filter((entry) => entry.id !== template.id),
                    })
                  }
                >
                  Delete
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={template.name}
                description={
                  <span>
                    <Tag>{template.lens.replace(/_/g, " ")}</Tag>{" "}
                    <Tag>{template.verbosity}</Tag> {template.goal}
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="Backend" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tag>History: {health.data?.persistence ?? "…"}</Tag>
          <Tag>AI: {health.data?.ai.configured === true ? "connected" : "off"}</Tag>
          <Tag>Queued jobs: {health.data?.pendingJobs ?? "…"}</Tag>
        </div>
        {health.data?.persistence === "memory" && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            In-memory history is lost on backend restart — export runs you want to keep.
          </Typography.Paragraph>
        )}
      </Card>

      <Card title="Local data">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            danger
            onClick={() =>
              wipe(() => {
                saveSavedProjects([]);
                saveActiveProjectId(null);
              })
            }
          >
            Clear saved projects ({loadSavedProjects().length})
          </Button>
          <Button danger onClick={() => wipe(() => saveScenarios([]))}>
            Clear what-if scenarios ({loadScenarios().length})
          </Button>
          <Button danger onClick={() => wipe(() => saveSettings(DEFAULT_SETTINGS))}>
            Reset settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
