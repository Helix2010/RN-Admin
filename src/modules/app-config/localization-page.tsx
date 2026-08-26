import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Plus, Save, UploadCloud } from "lucide-react";
import { adminApi, type LocalizationView } from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";

export function LocalizationPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["localization", tenantId],
    queryFn: () => adminApi.localization(),
  });
  const [draft, setDraft] = useState<LocalizationView | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"save" | "publish" | null>(null);
  const [error, setError] = useState("");
  const [newLanguageCode, setNewLanguageCode] = useState("");
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("没有待保存内容");
      await adminApi.saveLocalizationLanguages(
        draft.settings,
        draft.metadata.tenantVersion,
        reason.trim(),
      );
      const documents = documentPayload(draft);
      if (documents.length === 0) return adminApi.localization();
      return adminApi.saveLocalizationDocuments(documents, reason.trim());
    },
    onSuccess: (value) => {
      queryClient.setQueryData(["localization", tenantId], value);
      setDraft(null);
      setConfirm(null);
      setReason("");
    },
    onError: (value: Error) => {
      setConfirm(null);
      setError(value.message);
    },
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("没有待发布内容");
      await adminApi.saveLocalizationLanguages(
        draft.settings,
        draft.metadata.tenantVersion,
        reason.trim(),
      );
      const documents = documentPayload(draft);
      if (documents.length > 0)
        await adminApi.saveLocalizationDocuments(documents, reason.trim());
      return adminApi.publishLocalization([], reason.trim());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["localization", tenantId],
      });
      setDraft(null);
      setConfirm(null);
      setReason("");
    },
    onError: (value: Error) => {
      setConfirm(null);
      setError(value.message);
    },
  });
  if (query.isLoading) return <EmptyState title="正在加载多语言配置" />;
  if (query.isError || !query.data)
    return (
      <div className="error-banner">
        无法加载多语言：{query.error?.message ?? "无数据"}
      </div>
    );
  const data = draft ?? query.data;
  const languages = Object.entries(data.settings.languages).sort(
    ([, a], [, b]) => a.sort - b.sort,
  );
  const begin = () => {
    setDraft(structuredClone(query.data));
    setError("");
  };
  const updateValue = (key: string, code: string, content: string) =>
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const item = next.documents.items.find((entry) => entry.key === key);
      if (item)
        item.values[code] = {
          content,
          source: "tenant",
          missing: content.trim() === "",
        };
      return next;
    });
  const addRow = () =>
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const key = `new.message.${next.documents.items.length + 1}`;
      next.documents.items.push({
        key,
        meta: "",
        values: Object.fromEntries(
          languages.map(([code]) => [
            code,
            { content: "", source: "tenant", missing: true },
          ]),
        ),
      });
      return next;
    });
  const addLanguage = () => {
    const code = newLanguageCode.trim();
    if (
      !/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?$/.test(code)
    ) {
      setError("语言编码必须使用标准 BCP 47，例如 ja-JP。");
      return;
    }
    if (data.settings.languages[code]) {
      setError("该语言已经存在。");
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.settings.languages[code] = {
        label: code,
        nativeName: code,
        enabled: true,
        direction: "ltr",
        sort: languages.length + 1,
        source: "tenant",
        publishStatus: "draft",
        resource: null,
      };
      for (const item of next.documents.items)
        item.values[code] = { content: "", source: "missing", missing: true };
      return next;
    });
    setNewLanguageCode("");
    setError("");
  };
  const updateLanguage = (
    code: string,
    change: (item: LocalizationView["settings"]["languages"][string]) => void,
  ) =>
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next.settings.languages[code]);
      next.settings.languages[code].source = "tenant";
      return next;
    });
  const exportExcel = async () => {
    const XLSX = await import("@e965/xlsx");
    const rows = data.documents.items.map((item) =>
      Object.fromEntries([
        ["key", item.key],
        ["meta", item.meta],
        ...languages.map(([code]) => [code, item.values[code]?.content ?? ""]),
      ]),
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "localization",
    );
    XLSX.writeFile(workbook, `localization-${tenantId}.xlsx`);
  };
  const importExcel = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const XLSX = await import("@e965/xlsx");
        const workbook = XLSX.read(reader.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("empty workbook");
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        setDraft((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const existing = new Map(
            next.documents.items.map((item) => [item.key, item]),
          );
          for (const row of rows) {
            const key = String(row.key ?? "").trim();
            if (!key) continue;
            let item = existing.get(key);
            if (!item) {
              item = {
                key,
                meta: String(row.meta ?? ""),
                values: Object.fromEntries(
                  languages.map(([code]) => [
                    code,
                    { content: "", source: "tenant", missing: true },
                  ]),
                ),
              };
              next.documents.items.push(item);
              existing.set(key, item);
            }
            for (const [code] of languages) {
              if (typeof row[code] === "string") {
                const content = row[code] as string;
                item.values[code] = {
                  content,
                  source: "tenant",
                  missing: content.trim() === "",
                };
              }
            }
          }
          return next;
        });
        setError(`已导入 ${rows.length} 行，请检查后保存。`);
      } catch {
        setError("Excel 文件无法解析，请使用当前页面导出的模板。");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const save = () => {
    if (!draft || reason.trim().length < 3) {
      setError("保存或发布前请填写至少 3 个字符的原因");
      return;
    }
    setConfirm("save");
  };
  const publish = () => {
    if (reason.trim().length < 3) {
      setError("发布前请填写至少 3 个字符的原因");
      return;
    }
    setConfirm("publish");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Localization</div>
          <h1>多语言管理</h1>
          <p>语言由数据库配置动态生成，租户修改只保存覆盖项。</p>
        </div>
        <div className="heading-actions">
          <StatusPill status={draft ? "editing" : "active"} />
          {draft ? (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              取消编辑
            </Button>
          ) : (
            <Button onClick={begin}>
              <Languages size={16} />
              编辑多语言
            </Button>
          )}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <Card>
        <div className="card-header">
          <div>
            <h2>语言设置</h2>
            <p className="section-caption">
              全局语言会自动继承，租户可单独停用或调整排序。
            </p>
          </div>
        </div>
        <div className="card-body form-grid form-grid-3">
          <label className="form-field">
            <span>回退语言</span>
            <select
              className="input"
              disabled={!draft}
              value={data.settings.fallbackLanguage}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        settings: {
                          ...current.settings,
                          fallbackLanguage: event.target.value,
                        },
                      }
                    : current,
                )
              }
            >
              {languages.map(([code, item]) => (
                <option key={code} value={code}>
                  {item.label}（{code}）
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>刷新间隔（秒）</span>
            <input
              className="input"
              disabled={!draft}
              type="number"
              min={300}
              max={86400}
              value={data.settings.refreshIntervalSeconds}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        settings: {
                          ...current.settings,
                          refreshIntervalSeconds: Number(event.target.value),
                        },
                      }
                    : current,
                )
              }
            />
          </label>
          <div className="language-chip-list">
            {languages.map(([code, item]) => (
              <span className="status-pill" key={code}>
                {item.label} · {code} ·{" "}
                {item.source === "tenant" ? "租户覆盖" : "全局继承"}
              </span>
            ))}
          </div>
        </div>
        <div className="card-body language-settings-area">
          {draft && (
            <div className="language-add-row">
              <input
                className="input mono"
                value={newLanguageCode}
                placeholder="例如 ja-JP"
                onChange={(event) => setNewLanguageCode(event.target.value)}
              />
              <Button variant="ghost" type="button" onClick={addLanguage}>
                <Plus size={15} />
                新增语言
              </Button>
            </div>
          )}
          <div className="message-table-wrap">
            <table className="message-table language-settings-table">
              <thead>
                <tr>
                  <th>语言编码</th>
                  <th>显示名称</th>
                  <th>本地名称</th>
                  <th>方向</th>
                  <th>排序</th>
                  <th>启用</th>
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {languages.map(([code, item]) => (
                  <tr key={code}>
                    <td className="mono">{code}</td>
                    <td>
                      <input
                        className="input"
                        disabled={!draft}
                        value={item.label}
                        onChange={(event) =>
                          updateLanguage(code, (value) => {
                            value.label = event.target.value;
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="input"
                        disabled={!draft}
                        value={item.nativeName}
                        onChange={(event) =>
                          updateLanguage(code, (value) => {
                            value.nativeName = event.target.value;
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        disabled={!draft}
                        value={item.direction}
                        onChange={(event) =>
                          updateLanguage(code, (value) => {
                            value.direction = event.target.value as
                              "ltr" | "rtl";
                          })
                        }
                      >
                        <option value="ltr">LTR</option>
                        <option value="rtl">RTL</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="input language-sort-input"
                        disabled={!draft}
                        type="number"
                        min={0}
                        value={item.sort}
                        onChange={(event) =>
                          updateLanguage(code, (value) => {
                            value.sort = Number(event.target.value);
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={
                          !draft || code === data.settings.fallbackLanguage
                        }
                        checked={item.enabled}
                        onChange={(event) =>
                          updateLanguage(code, (value) => {
                            value.enabled = event.target.checked;
                          })
                        }
                      />
                    </td>
                    <td>
                      <span className="status-pill">
                        {item.source === "tenant" ? "租户覆盖" : "全局继承"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      <Card>
        <div className="card-header">
          <div>
            <h2>文案内容</h2>
            <p className="section-caption">
              语言列由 app_configs.languages 动态生成，可横向扩展。
            </p>
          </div>
          <div className="heading-actions">
            {draft && (
              <Button variant="ghost" type="button" onClick={addRow}>
                <Plus size={15} />
                添加文案
              </Button>
            )}
            <label className="button button-ghost">
              <UploadCloud size={15} />
              导入 Excel
              <input
                hidden
                type="file"
                accept=".xlsx,.xls"
                disabled={!draft}
                onChange={(event) => importExcel(event.target.files?.[0])}
              />
            </label>
            <Button
              variant="ghost"
              type="button"
              onClick={() => void exportExcel()}
            >
              导出 Excel
            </Button>
          </div>
        </div>
        <div className="card-body">
          <div className="message-table-wrap">
            <table className="message-table">
              <thead>
                <tr>
                  <th>消息 Key</th>
                  {languages.map(([code, item]) => (
                    <th key={code}>
                      {item.label}
                      <small className="table-language-code">{code}</small>
                    </th>
                  ))}
                  <th>来源</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.items.map((item) => (
                  <tr key={item.key}>
                    <td className="mono">{item.key}</td>
                    {languages.map(([code]) => (
                      <td key={code}>
                        <input
                          className="input"
                          disabled={!draft}
                          value={item.values[code]?.content ?? ""}
                          placeholder="缺失时发布会按回退语言补齐"
                          onChange={(event) =>
                            updateValue(item.key, code, event.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td>
                      {Object.values(item.values).some(
                        (value) => value.source === "tenant",
                      ) ? (
                        <span className="status-pill status-active">
                          租户覆盖
                        </span>
                      ) : (
                        <span className="status-pill">全局继承</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
      <Card className="save-card">
        <div className="card-body save-layout">
          <label className="form-field">
            <span>修改原因</span>
            <textarea
              className="input textarea"
              value={reason}
              placeholder="例如：新增日语并修正文案"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="save-actions">
            <Button variant="ghost" disabled={!draft} onClick={save}>
              <Save size={16} />
              保存草稿
            </Button>
            <Button disabled={!draft} onClick={publish}>
              保存并发布
            </Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "publish" ? "发布多语言资源？" : "保存多语言草稿？"}
        description={
          confirm === "publish"
            ? "将为所有启用语言生成完整 JSON 并上传对象存储。"
            : "只保存当前租户的文案和语言设置覆盖。"
        }
        confirmLabel={confirm === "publish" ? "确认发布" : "确认保存"}
        loading={saveMutation.isPending || publishMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "publish") publishMutation.mutate();
          else saveMutation.mutate();
        }}
      >
        <div className="dialog-detail-list">
          <span>语言数量：{languages.length}</span>
          <span>变更原因：{reason.trim() || "未填写"}</span>
        </div>
      </ConfirmDialog>
    </>
  );
}

function documentPayload(draft: LocalizationView) {
  return draft.documents.items
    .map((item) => ({
      key: item.key,
      meta: item.meta,
      values: Object.fromEntries(
        Object.entries(item.values)
          .filter(([, value]) => value.source === "tenant")
          .map(([code, value]) => [
            code,
            value.content.trim() === "" ? null : value.content,
          ]),
      ),
    }))
    .filter((item) => Object.keys(item.values).length > 0);
}
