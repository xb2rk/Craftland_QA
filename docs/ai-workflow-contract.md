# Craftland Quality Analyzer - AI Workflow Contract v1

## 1. Mục tiêu

Workflow AI đọc dữ liệu đã được backend thu thập từ Unity project, chủ động chọn
thêm file cần thiết, phân tích thay đổi config/code/gameplay và trả kết quả có cấu
trúc cùng evidence.

AI là lớp phân tích ngữ nghĩa chính. Các kiểm tra deterministic như CSV parsing,
duplicate ID, missing reference, probability range, Git diff và compiler output
được gửi kèm để AI kiểm chứng và giải thích, không thay thế việc AI đọc code.

## 2. Cách đọc source local

Backend chạy trên cùng máy với Unity project và nhận một đường dẫn local.

Backend phải:

- Xác nhận đường dẫn là một Git repository bằng `git rev-parse --show-toplevel`.
- Chỉ chạy Git theo argument array, không ghép command string từ input người dùng.
- Không checkout hoặc sửa working tree hiện tại.
- Dùng `git show <ref>:<path>` để đọc file ở version cũ.
- Dùng filesystem để đọc version hiện tại, bao gồm thay đổi chưa commit.
- Dùng `git diff` để lấy thay đổi tracked và `git status` để tìm file untracked.
- Từ chối mọi đường dẫn thoát khỏi repository root.

Các thư mục mặc định được xem xét:

- `Assets/**/CSV/**`
- `Assets/**/*.csv`
- `Assets/**/Scripts/**`
- `Assets/**/*.cs`
- `Packages/manifest.json`
- `ProjectSettings/*.asset` khi có liên quan

Các thư mục mặc định bị loại:

- `.git`
- `Library`
- `Temp`
- `Logs`
- `obj`
- `Build`
- `Builds`
- `UserSettings`

Các file secret, binary và file dung lượng vượt giới hạn không được gửi cho AI.

## 3. Luồng workflow

Backend gọi cùng một AI endpoint nhiều lần. `stage` nằm trong JSON string của
field `Manifest`.

### Stage 1: `context_selection`

AI nhận:

- Mong muốn của người dùng.
- Cây thư mục đã lọc.
- Danh sách file thay đổi.
- Git diff tóm tắt.
- Header và metadata của CSV.
- Danh sách class/script.

AI trả:

- File cần đọc đầy đủ.
- File cần đọc theo đoạn.
- Từ khóa/reference cần tìm.
- Giả thuyết ban đầu.

Backend kiểm tra các yêu cầu này, đọc thêm file hợp lệ rồi chuyển sang stage 2.

### Stage 2: `impact_analysis`

AI nhận:

- Nội dung và diff của các file đã chọn.
- Old/current CSV rows liên quan.
- Script tham chiếu tới config.
- Deterministic findings.
- Compiler/test output nếu có.

AI trả:

- Config consistency.
- Code impact.
- Gameplay impact.
- Flow và recovery risk.
- Test recommendation.
- Simulation request.
- File/line evidence.
- Những điều chưa đủ dữ liệu để kết luận.

Backend có thể lặp stage 1 và 2 tối đa số vòng được cấu hình nếu AI cần thêm file.

### Stage 3: `report_synthesis`

AI nhận toàn bộ partial findings, kết quả simulation và compiler/test output để
tạo báo cáo cuối cùng cho Game Developer và Game Designer.

## 4. Domain request envelope

Đây là JSON domain payload do backend tạo. Khi gọi Insea, backend serialize toàn
bộ object này thành JSON string và gửi trong multipart field `Manifest`.

```json
{
  "schema_version": "1.0",
  "request_id": "req_01J...",
  "analysis_id": "ana_01J...",
  "stage": "context_selection",
  "locale": "vi-VN",
  "actor": {
    "id": "developer-id",
    "role": "game_developer"
  },
  "project": {
    "name": "sample-craftland-game",
    "engine": "unity",
    "root_label": "sample-craftland-game"
  },
  "revision": {
    "base_ref": "origin/main",
    "base_commit": "6b1e...",
    "current_ref": "WORKTREE",
    "current_commit": "81ac...",
    "has_uncommitted_changes": true
  },
  "analysis_request": {
    "goal": "Giảm thời gian qua màn nhưng không làm mất cân bằng độ khó",
    "focus_paths": [],
    "focus_config_keys": ["MonsterCount", "SpawnInterval"],
    "quality_dimensions": [
      "config_consistency",
      "gameplay_impact",
      "flow_safety",
      "recovery",
      "bug_risk"
    ]
  },
  "repository_context": {
    "tree": [],
    "changed_files": [],
    "csv_catalog": [],
    "script_catalog": [],
    "files": [],
    "search_results": []
  },
  "deterministic_findings": [],
  "previous_stage_result": null,
  "limits": {
    "max_requested_files": 30,
    "max_total_bytes": 500000,
    "max_follow_up_rounds": 2
  }
}
```

## 5. File context format

Mỗi file gửi cho AI phải có path, hash và line number rõ ràng:

```json
{
  "path": "Assets/Game/CSV/Monster.csv",
  "kind": "csv",
  "change_type": "modified",
  "content_mode": "diff_and_relevant_rows",
  "base_hash": "sha256:...",
  "current_hash": "sha256:...",
  "diff": "@@ -2,2 +2,2 @@\n-1,Zombie,100,3\n+1,Zombie,100,2",
  "chunks": [
    {
      "start_line": 1,
      "end_line": 20,
      "content": "Id,Name,Hp,Count\n..."
    }
  ]
}
```

Không dùng filename đơn lẻ làm evidence; luôn dùng repository-relative path.

## 6. Context selection response

```json
{
  "schema_version": "1.0",
  "request_id": "req_01J...",
  "analysis_id": "ana_01J...",
  "stage": "context_selection",
  "status": "needs_context",
  "context_requests": [
    {
      "path": "Assets/Game/Scripts/Spawn/MonsterSpawner.cs",
      "mode": "full",
      "reason": "Cần xác định MonsterCount điều khiển số lượng spawn hay wave size",
      "priority": "high"
    },
    {
      "path": "Assets/Game/CSV/Stage.csv",
      "mode": "search",
      "search_terms": ["MonsterGroupId", "StageDuration"],
      "reason": "Tìm liên kết giữa màn chơi và nhóm quái",
      "priority": "high"
    }
  ],
  "search_requests": [
    {
      "query": "MonsterCount",
      "path_globs": ["Assets/**/*.cs", "Assets/**/*.csv"],
      "reason": "Tìm mọi consumer của config key"
    }
  ],
  "initial_hypotheses": [
    {
      "statement": "Giảm Count có thể giảm cả thời gian và lượng tài nguyên nhận được",
      "confidence": 0.55,
      "needs_evidence": true
    }
  ],
  "warnings": []
}
```

Backend không cho AI yêu cầu file nằm ngoài repository hoặc file thuộc deny list.

## 7. Impact analysis response

```json
{
  "schema_version": "1.0",
  "request_id": "req_01J...",
  "analysis_id": "ana_01J...",
  "stage": "impact_analysis",
  "status": "completed",
  "summary": "Monster Count giảm từ 3 xuống 2 làm giảm số enemy của wave đầu.",
  "confidence": 0.86,
  "config_consistency": [
    {
      "status": "warning",
      "config_key": "Monster.Count",
      "message": "Stage reward vẫn được tính theo cấu hình cũ"
    }
  ],
  "findings": [
    {
      "id": "finding-monster-count-001",
      "category": "gameplay_impact",
      "severity": "medium",
      "certainty": "probable",
      "title": "Thời gian qua màn giảm nhưng reward per minute tăng",
      "explanation": "Wave hoàn thành sớm hơn trong khi StageReward không đổi.",
      "player_impact": "Người chơi có thể farm reward nhanh hơn dự kiến.",
      "failure_scenario": null,
      "recovery_assessment": "not_applicable",
      "recommendation": "Chạy simulation với DPS thấp, trung bình và cao.",
      "evidence": [
        {
          "path": "Assets/Game/CSV/Monster.csv",
          "start_line": 2,
          "end_line": 2,
          "revision": "current",
          "excerpt": "1,Zombie,100,2",
          "reason": "Số lượng monster giảm từ 3 xuống 2"
        },
        {
          "path": "Assets/Game/Scripts/Reward/StageReward.cs",
          "start_line": 45,
          "end_line": 53,
          "revision": "current",
          "excerpt": "return stageConfig.FixedReward;",
          "reason": "Reward không phụ thuộc số monster bị tiêu diệt"
        }
      ],
      "recommended_tests": [
        {
          "name": "Compare stage completion time",
          "type": "simulation",
          "priority": "high",
          "expected": "Completion time giảm nhưng reward/minute không vượt ngưỡng"
        }
      ]
    }
  ],
  "simulation_requests": [
    {
      "id": "sim-stage-time-001",
      "type": "monte_carlo",
      "objective": "So sánh completion time trước và sau thay đổi",
      "inputs": [
        {
          "name": "monster_count",
          "before": 3,
          "after": 2,
          "source": {
            "path": "Assets/Game/CSV/Monster.csv",
            "line": 2
          }
        }
      ],
      "missing_inputs": ["player_dps_distribution"],
      "suggested_runs": 10000
    }
  ],
  "unknowns": [
    {
      "question": "DPS distribution thực tế của người chơi là bao nhiêu?",
      "impact": "Không thể ước lượng chính xác average completion time."
    }
  ],
  "context_requests": []
}
```

## 8. Final report response

```json
{
  "schema_version": "1.0",
  "request_id": "req_01J...",
  "analysis_id": "ana_01J...",
  "stage": "report_synthesis",
  "status": "completed",
  "verdict": "needs_review",
  "quality_score": 74,
  "summary": "Thay đổi đạt mục tiêu giảm thời gian nhưng có rủi ro tăng reward/minute.",
  "sections": {
    "config_consistency": [],
    "code_impact": [],
    "gameplay_impact": [],
    "flow_and_recovery": [],
    "bug_risks": [],
    "simulation_results": [],
    "recommended_tests": []
  },
  "blocking_findings": [],
  "non_blocking_findings": [],
  "unknowns": [],
  "disclaimer": "Kết quả dựa trên source, config và test evidence được cung cấp."
}
```

`quality_score` chỉ là chỉ báo tổng hợp. Quyết định pass/fail phải dựa trên
`verdict`, blocking finding và quality gate đã cấu hình.

## 9. Enum chuẩn

```text
stage:
  context_selection | impact_analysis | report_synthesis

status:
  completed | needs_context | partial | failed

severity:
  critical | high | medium | low | info

certainty:
  confirmed | probable | hypothesis | unknown

verdict:
  pass | pass_with_warnings | needs_review | fail | insufficient_evidence
```

## 10. Prompt rule bắt buộc

System prompt của workflow phải yêu cầu AI:

1. Chỉ kết luận dựa trên evidence đã nhận.
2. Phân biệt fact, inference và hypothesis.
3. Không phát minh file, class, config key hoặc line number.
4. Không coi thiếu compiler error là bằng chứng feature không có bug.
5. Nêu rõ gameplay assumption.
6. Đưa dữ liệu thiếu vào `unknowns`.
7. Trả đúng JSON schema, không thêm Markdown bên ngoài JSON.
8. Ưu tiên yêu cầu thêm context khi confidence thấp.
9. Không lặp lại secret nếu source vô tình chứa credential.
10. Mỗi finding phải có recommendation hoặc lý do không thể đưa recommendation.

## 11. Environment

```dotenv
AI_WORKFLOW_URL=https://ai.insea.io/api/workflows/25537/run
AI_WORKFLOW_API_KEY=
AI_WORKFLOW_TIMEOUT_MS=180000
AI_WORKFLOW_MAX_CONTEXT_BYTES=500000
AI_WORKFLOW_MAX_FOLLOW_UP_ROUNDS=2
```

Backend gửi:

```http
POST ${AI_WORKFLOW_URL}
Authorization: Bearer ${AI_WORKFLOW_API_KEY}
Content-Type: multipart/form-data; boundary=<generated-by-http-client>
```

Multipart fields:

```text
Prompt=<stage-specific instruction requesting strict JSON output>
Manifest=<JSON.stringify(domain request envelope)>
DataList=<one or more uploaded files>
```

Ví dụ:

```bash
curl -X POST 'https://ai.insea.io/api/workflows/25537/run' \
  --header "Authorization: Bearer $AI_WORKFLOW_API_KEY" \
  -F 'Prompt=Analyze the supplied Craftland context. Return JSON only.' \
  -F 'Manifest=<manifest.json;type=application/json' \
  -F 'DataList=@Assets/CSV/ZombieData.csv;filename=file-0001.csv;type=text/csv' \
  -F 'DataList=@Assets/Scripts/Systems/Zombie/Server_ZombieSpawner.fcg;filename=file-0002.fcg;type=text/plain'
```

Lặp lại cùng field `DataList` để tạo một file list. `Prompt` chứa role, rule và
output schema theo stage. `Manifest` chứa dữ liệu project, Git revision,
deterministic findings, kết quả stage trước và metadata ánh xạ từng upload name
về repository-relative path. API key không xuất hiện trong `Prompt`, `Manifest`,
file upload, application log hoặc database.

`DataList` có giới hạn API là 104857600 bytes (100 MiB). Đây là giới hạn
transport, không phải context window của model. Ứng dụng nên đặt giới hạn thấp
hơn theo từng stage, ví dụ 20 MiB và tối đa 30 file, rồi yêu cầu thêm context ở
vòng sau.

Ví dụ metadata của attachment trong `Manifest`:

```json
{
  "attachments": [
    {
      "id": "current-zombie-data",
      "upload_name": "file-0001.csv",
      "relative_path": "Assets/CSV/ZombieData.csv",
      "revision": "current",
      "kind": "config",
      "content_type": "text/csv",
      "sha256": "..."
    },
    {
      "id": "current-zombie-spawner",
      "upload_name": "file-0002.fcg",
      "relative_path": "Assets/Scripts/Systems/Zombie/Server_ZombieSpawner.fcg",
      "revision": "current",
      "kind": "source",
      "content_type": "text/plain",
      "sha256": "..."
    }
  ]
}
```

Không dùng original basename làm identity vì hai thư mục có thể chứa file cùng
tên. `upload_name` phải unique trong request; `relative_path` trong Manifest là
source of truth để hiển thị evidence.

### 11.1 JSON transport

Không dùng JSON transport để upload file local trừ khi Insea công bố rõ JSON
representation của `File List`.

Trong lệnh sau, `"C:/project/file.csv"` hoặc `"@file.csv"` chỉ là chuỗi JSON;
`curl` không đọc và upload file:

```json
{
  "Prompt": "...",
  "Manifest": "...",
  "DataList": ["@file.csv"]
}
```

JSON mode chỉ phù hợp nếu `DataList` nhận một format được Insea hỗ trợ, ví dụ
attachment ID đã upload trước, signed URL hoặc base64 object. Không suy đoán
format này trong client. MVP luôn dùng multipart.

### 11.2 Insea transport response

Response wrapper của Insea:

```json
{
  "data": {
    "status": "succeeded",
    "inputs": {
      "Prompt": "...",
      "Manifest": "...",
      "DataList": []
    },
    "outputs": {
      "result": "{\"schema_version\":\"1.0\",\"stage\":\"context_selection\"}"
    },
    "usage": {
      "input_tokens": 100,
      "output_tokens": 200,
      "cached_tokens": 0
    },
    "consumed_tokens": 300,
    "elapsed_time_ms": 8000
  },
  "request_id": "insea-request-id"
}
```

Backend chỉ xem request thành công khi:

- HTTP status là 2xx.
- `data.status` là `succeeded`.
- `data.outputs.result` tồn tại.
- `result` parse được thành JSON.
- JSON kết quả pass stage-specific schema validation.

`outputs.result` là string nên client phải parse thêm một lần. Nếu model trả
Markdown code fence, client có thể bỏ đúng một fence bao quanh kết quả rồi parse;
mọi text ngoài JSON phải được đánh dấu là protocol violation.

### 11.3 Prompt template

```text
You are the Craftland Quality Analyzer.

Analyze only the repository evidence described in Manifest and supplied in DataList.
The current stage is: {{stage}}.

Rules:
- Distinguish confirmed facts, probable inferences, hypotheses, and unknowns.
- Never invent files, symbols, config keys, values, or line numbers.
- Request more context when evidence is insufficient.
- Every finding must cite repository-relative file paths and line ranges.
- Never repeat credentials or secrets.
- Return exactly one JSON object matching schema version 1.0.
- Do not add Markdown or prose outside the JSON object.

Task requested by the user:
{{analysis_goal}}
```

Prompt template là source-controlled. Nội dung project và file không được nối
trực tiếp vào Prompt; metadata nằm trong `Manifest` và source nằm trong
`DataList` để giúp audit payload rõ ràng hơn.

## 12. Retry và validation

- Retry tối đa 2 lần với lỗi timeout, 429 hoặc 5xx.
- Không retry lỗi 4xx do payload.
- Dùng cùng domain `request_id` khi retry cùng một logical request.
- Validate response bằng JSON schema trước khi lưu database.
- Response sai schema được lưu dưới dạng diagnostic, không dùng làm báo cáo chính.
- Backend giới hạn số vòng AI yêu cầu thêm context để tránh loop vô hạn.

## 13. Bảo mật

- Không gửi `.git/config`, `.env`, token, certificate hoặc private key.
- Không cho AI tự chạy shell command.
- Không cho người dùng nhập command tự do trong MVP.
- Không gửi binary, Unity Library cache hoặc generated build artifact.
- Log phải redact `Authorization` và nội dung file nhạy cảm.
- Workspace analyzer chỉ có quyền đọc project; file tạm nằm trong thư mục riêng.
