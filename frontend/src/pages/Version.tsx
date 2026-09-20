import { Empty, Input, Tabs, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useProjects } from "../app/project-context.js";
import { RefPicker } from "../components/RefPicker.js";
import { WhatIfThread } from "../components/WhatIfThread.js";
import { LocalizationPanel } from "../components/review/LocalizationPanel.js";
import { WritersPanel } from "../components/review/WritersPanel.js";
import { PageHeader } from "../components/ui/PageHeader.js";
import { SectionCard } from "../components/ui/SectionCard.js";

/**
 * VersionPage works with a single version: pick one ref, then draft release
 * text for the change at that ref, QA its localization table, or explore a
 * hypothetical edit on top of it. The compare-oriented Review page stays
 * separate; this page never needs two refs.
 */
export function VersionPage(): React.JSX.Element {
  const { active, updateProject } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(
    initialTab === "localization" || initialTab === "whatif" ? initialTab : "writers",
  );
  const [ref, setRef] = useState(active?.lastVersionRef ?? "HEAD");
  const [instructions, setInstructions] = useState(active?.writerInstructions ?? "");
  const [glossary, setGlossary] = useState(active?.localizationGlossary ?? "");

  const activeId = active?.id;
  useEffect(() => {
    setRef(active?.lastVersionRef ?? "HEAD");
    setInstructions(active?.writerInstructions ?? "");
    setGlossary(active?.localizationGlossary ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  if (!active) {
    return (
      <div>
        <PageHeader
          eyebrow="Single version"
          title="Version tools"
          description="Pick a project first — writers, localization, and what-if all work on one version."
        />
        <Empty description="No project selected.">
          <Link to="/">Choose a project</Link>
        </Empty>
      </div>
    );
  }

  const switchTab = (key: string): void => {
    setTab(key);
    setSearchParams(key === "writers" ? {} : { tab: key }, { replace: true });
  };

  const changeRef = (value: string): void => {
    setRef(value);
    updateProject(active.id, { lastVersionRef: value });
  };

  // The change AT a version is parent -> version; git resolves the ^ suffix.
  const writerBase = ref === "WORKTREE" ? "HEAD" : `${ref}^`;

  return (
    <div>
      <PageHeader
        eyebrow={active.name}
        title="Version tools"
        description="One version, three tools — release text, localization QA, and hypothetical edits."
      />
      <SectionCard title="Version">
        <div style={{ maxWidth: 420 }}>
          <RefPicker
            localPath={active.localPath}
            label="Version"
            value={ref}
            onChange={changeRef}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <Tag color="blue">{ref}</Tag>
          <Typography.Text type="secondary">
            writers describe {writerBase} → {ref}
          </Typography.Text>
        </div>
      </SectionCard>
      <SectionCard style={{ marginTop: 12 }}>
        <Tabs
          activeKey={tab}
          onChange={switchTab}
          items={[
            {
              key: "writers",
              label: "Writers",
              children: (
                <div>
                  <Input.TextArea
                    placeholder="Team style for the writer (e.g. scope = game system, always include a test plan) — saved per project"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    onBlur={() => updateProject(active.id, { writerInstructions: instructions })}
                    rows={2}
                    style={{ marginBottom: 12 }}
                  />
                  <WritersPanel
                    localPath={active.localPath}
                    baseRef={writerBase}
                    currentRef={ref}
                    instructions={instructions}
                  />
                </div>
              ),
            },
            {
              key: "localization",
              label: "Localization",
              children: (
                <LocalizationPanel
                  localPath={active.localPath}
                  baseRef={ref}
                  glossary={glossary}
                  onGlossaryChange={(value) => {
                    setGlossary(value);
                    updateProject(active.id, { localizationGlossary: value });
                  }}
                />
              ),
            },
            {
              key: "whatif",
              label: "What-if",
              children: (
                <WhatIfThread
                  projectId={active.id}
                  projectName={active.name}
                  localPath={active.localPath}
                  baseRef={ref}
                />
              ),
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
