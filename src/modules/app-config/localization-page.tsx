import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Languages,
  Plus,
  Save,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { adminApi, publicApiUrl, type LocalizationView } from "../../core/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  SidePanel,
  StatusPill,
} from "../../design-system/components";
import type { AdminPageProps } from "../../plugin-system/types";
import { documentPayload } from "./localization-draft";

export function LocalizationPage({ tenantId }: AdminPageProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["localization", tenantId],
    queryFn: () => adminApi.localization(),
  });
  const [draft, setDraft] = useState<LocalizationView | null>(null);
  const [original, setOriginal] = useState<LocalizationView | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"save" | "publish" | "discard" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newLanguageCode, setNewLanguageCode] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [newDocumentKey, setNewDocumentKey] = useState("");
  const [newDocumentMeta, setNewDocumentMeta] = useState("");
  const [newDocumentValues, setNewDocumentValues] = useState<
    Record<string, string>
  >({});
  const [newDocumentError, setNewDocumentError] = useState("");
  const settingsChanged = Boolean(
    draft &&
    original &&
    JSON.stringify(draft.settings) !== JSON.stringify(original.settings),
  );
  const changedDocuments =
    draft && original ? documentPayload(draft, original) : [];
  const documentsChanged = changedDocuments.length > 0;
  const hasUnsavedChanges = settingsChanged || documentsChanged;
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("没有待保存内容");
      let value: LocalizationView | null = null;
      if (settingsChanged) {
        value = await adminApi.saveLocalizationLanguages(
          draft.settings,
          draft.metadata.tenantVersion,
          reason.trim(),
        );
      }
      const documents = documentsChanged ? changedDocuments : [];
      if (documents.length > 0) {
        value = await adminApi.saveLocalizationDocuments(
          documents,
          reason.trim(),
        );
      }
      return value ?? adminApi.localization();
    },
    onSuccess: (value) => {
      queryClient.setQueryData(["localization", tenantId], value);
      setDraft(structuredClone(value));
      setConfirm(null);
      setReason("");
      setOriginal(structuredClone(value));
      setError("");
      setNotice("已保存为租户草稿，尚未生成 App 使用的发布资源。");
    },
    onError: (value: Error) => {
      setConfirm(null);
      setError(value.message);
    },
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("没有待发布内容");
      if (settingsChanged) {
        await adminApi.saveLocalizationLanguages(
          draft.settings,
          draft.metadata.tenantVersion,
          reason.trim(),
        );
      }
      const documents = documentsChanged ? changedDocuments : [];
      if (documents.length > 0) {
        await adminApi.saveLocalizationDocuments(documents, reason.trim());
      }
      return adminApi.publishLocalization([], reason.trim());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["localization", tenantId],
      });
      setDraft(null);
      setConfirm(null);
      setReason("");
      setOriginal(null);
      setNotice(
        "已发布，多语言资源已生成并上传对象存储，App 下次刷新会获取新版本。",
      );
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
  const hasUnpublishedDraft = languages.some(
    ([, item]) => item.publishStatus !== "published",
  );
  const normalizedSearch = documentSearch.trim().toLowerCase();
  const filteredDocuments = data.documents.items.filter(
    (item) =>
      normalizedSearch === "" ||
      item.key.toLowerCase().includes(normalizedSearch) ||
      Object.values(item.values).some((value) =>
        value.content.toLowerCase().includes(normalizedSearch),
      ),
  );
  const documentIndexes = new Map(
    data.documents.items.map((item, index) => [item.key, index + 1]),
  );
  const originalKeys = new Set(
    original?.documents.items.map((item) => item.key.toLowerCase()) ?? [],
  );
  const begin = () => {
    setDraft(structuredClone(query.data));
    setOriginal(structuredClone(query.data));
    setError("");
    setNotice("");
  };
  const updateValue = (key: string, code: string, content: string) => {
    setNotice("");
    setError("");
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
  };
  const openAddPanel = () => {
    setNotice("");
    setError("");
    setNewDocumentKey("");
    setNewDocumentMeta("");
    setNewDocumentValues(
      Object.fromEntries(languages.map(([code]) => [code, ""])),
    );
    setNewDocumentError("");
    setAddPanelOpen(true);
  };
  const addDocument = () => {
    const key = newDocumentKey.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,254}$/.test(key)) {
      setNewDocumentError(
        "Key 只能包含小写字母、数字、点、下划线或短横线，最长 255 个字符。",
      );
      return;
    }
    if (
      data.documents.items.some(
        (item) => item.key.toLowerCase() === key.toLowerCase(),
      )
    ) {
      setNewDocumentError("该 Key 已存在，请直接编辑已有文案。");
      return;
    }
    if (!newDocumentValues[data.settings.fallbackLanguage]?.trim()) {
      setNewDocumentError(
        `请至少填写回退语言 ${data.settings.fallbackLanguage} 的文案。`,
      );
      return;
    }
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.documents.items.push({
        key,
        meta: newDocumentMeta.trim(),
        enabled: true,
        values: Object.fromEntries(
          languages.map(([code]) => {
            const content = newDocumentValues[code]?.trim() ?? "";
            return [
              code,
              {
                content,
                source: content ? "tenant" : "missing",
                missing: content === "",
              },
            ];
          }),
        ),
      });
      next.documents.total = next.documents.items.length;
      return next;
    });
    setAddPanelOpen(false);
    setDocumentSearch(key);
    setNotice(`文案 ${key} 已加入当前草稿，尚未写入数据库。`);
  };
  const removeNewDocument = (key: string) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      next.documents.items = next.documents.items.filter(
        (item) => item.key !== key,
      );
      next.documents.total = next.documents.items.length;
      return next;
    });
    setNotice(`已从当前草稿移除 ${key}。`);
  };
  const toggleDocument = (key: string, enabled: boolean) => {
    setNotice("");
    setError("");
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const item = next.documents.items.find((entry) => entry.key === key);
      if (item) item.enabled = enabled;
      return next;
    });
  };
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
    setNotice("");
  };
  const updateLanguage = (
    code: string,
    change: (item: LocalizationView["settings"]["languages"][string]) => void,
  ) => {
    setNotice("");
    setError("");
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      change(next.settings.languages[code]);
      next.settings.languages[code].source = "tenant";
      return next;
    });
  };
  const copyLanguageResource = async (code: string, fileUrl: string) => {
    const url = publicApiUrl(fileUrl);
    try {
      await navigator.clipboard.writeText(url);
      setError("");
      setNotice(`已复制 ${code} 语言包链接。`);
    } catch {
      setNotice("");
      setError("复制失败，请打开语言包后从浏览器地址栏复制链接。");
    }
  };
  const exportExcel = async () => {
    const XLSX = await import("@e965/xlsx");
    const rows = data.documents.items.map((item) =>
      Object.fromEntries([
        ["key", item.key],
        ["meta", item.meta],
        ["enabled", item.enabled],
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
        const normalizedRows: Array<Record<string, unknown>> = rows
          .filter((row) => String(row.key ?? "").trim().length > 0)
          .map((row) => ({
            ...row,
            key: String(row.key).trim().toLowerCase(),
          }));
        const seen = new Set<string>();
        for (const row of normalizedRows) {
          const key = String(row.key);
          if (!/^[a-z0-9][a-z0-9._-]{0,254}$/.test(key))
            throw new Error(`invalid key: ${key}`);
          if (seen.has(key)) throw new Error(`duplicate key: ${key}`);
          seen.add(key);
        }
        const existingKeys = new Set(
          data.documents.items.map((item) => item.key.toLowerCase()),
        );
        for (const row of normalizedRows) {
          const key = String(row.key);
          if (
            !existingKeys.has(key) &&
            !String(row[data.settings.fallbackLanguage] ?? "").trim()
          )
            throw new Error(`missing fallback value: ${key}`);
        }
        setDraft((current) => {
          if (!current) return current;
          const next = structuredClone(current);
          const existing = new Map(
            next.documents.items.map((item) => [item.key.toLowerCase(), item]),
          );
          for (const row of normalizedRows) {
            const key = String(row.key);
            let item = existing.get(key);
            if (!item) {
              item = {
                key,
                meta: String(row.meta ?? ""),
                enabled: true,
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
            if (!existingKeys.has(key) && typeof row.meta === "string")
              item.meta = row.meta.trim();
            if (typeof row.enabled === "boolean") item.enabled = row.enabled;
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
          next.documents.total = next.documents.items.length;
          return next;
        });
        setError("");
        setNotice(
          `已导入 ${normalizedRows.length} 行到当前草稿，请检查后点击“保存草稿”或“保存并发布”。`,
        );
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
    if (!hasUnsavedChanges) {
      setError("当前没有未保存的修改。");
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
  const cancelEditing = () => {
    if (hasUnsavedChanges) {
      setConfirm("discard");
      return;
    }
    setDraft(null);
    setOriginal(null);
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
          <StatusPill
            status={
              draft
                ? hasUnsavedChanges
                  ? "editing"
                  : hasUnpublishedDraft
                    ? "draft"
                    : "active"
                : hasUnpublishedDraft
                  ? "draft"
                  : "active"
            }
          />
          {draft ? (
            <Button variant="ghost" onClick={cancelEditing}>
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
      {notice && <div className="success-banner">{notice}</div>}
      {draft && (
        <div className="draft-help-banner">
          <strong>
            {hasUnsavedChanges ? "有未保存修改" : "当前没有未保存修改"}
          </strong>
          <span>
            ① 手动输入或导入 Excel：只修改当前浏览器草稿，不会自动保存 -&gt; ②
            保存草稿：写入数据库，App 暂不可见 -&gt; ③
            保存并发布：生成语言资源，App 下次刷新后获取
          </span>
        </div>
      )}
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
                  <th className="message-index-column">序号</th>
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
                {languages.map(([code, item], index) => {
                  const resourceUrl = item.resource?.fileUrl
                    ? publicApiUrl(item.resource.fileUrl)
                    : null;
                  return (
                    <tr key={code}>
                      <td className="message-index-column mono">{index + 1}</td>
                      <td className="language-code-cell">
                        <span className="language-code-actions">
                          {resourceUrl ? (
                            <a
                              className="language-resource-link mono"
                              href={resourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={`在新窗口打开 ${code} 语言包`}
                            >
                              {code}
                              <ExternalLink size={14} aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="mono language-resource-unavailable">
                              {code}
                            </span>
                          )}
                          <button
                            className="icon-button language-resource-copy"
                            type="button"
                            disabled={!item.resource?.fileUrl}
                            aria-label={`复制 ${code} 语言包链接`}
                            title={
                              resourceUrl
                                ? `复制 ${code} 语言包链接`
                                : "该语言尚未发布语言包"
                            }
                            onClick={() =>
                              item.resource?.fileUrl &&
                              void copyLanguageResource(
                                code,
                                item.resource.fileUrl,
                              )
                            }
                          >
                            <Copy size={14} aria-hidden="true" />
                          </button>
                        </span>
                      </td>
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
                  );
                })}
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
              <Button variant="ghost" type="button" onClick={openAddPanel}>
                <Plus size={15} />
                添加文案
              </Button>
            )}
            {draft ? (
              <label className="button button-ghost">
                <UploadCloud size={15} />
                导入 Excel
                <input
                  hidden
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => {
                    importExcel(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <span className="section-caption">进入编辑后可导入 Excel</span>
            )}
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
          <div className="localization-toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                className="input"
                value={documentSearch}
                placeholder="搜索 Key 或任意语言文案"
                onChange={(event) => setDocumentSearch(event.target.value)}
              />
            </label>
            <span className="section-caption">
              共 {filteredDocuments.length} / {data.documents.items.length} 条
            </span>
          </div>
          <div className="message-table-wrap">
            <table className="message-table localization-documents-table">
              <thead>
                <tr>
                  <th className="message-index-column">序号</th>
                  <th>消息 Key</th>
                  {languages.map(([code, item]) => (
                    <th key={code}>
                      {item.label}
                      <small className="table-language-code">{code}</small>
                    </th>
                  ))}
                  <th>状态</th>
                  <th>来源</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((item) => (
                  <tr key={item.key}>
                    <td className="message-index-column mono">
                      {documentIndexes.get(item.key)}
                    </td>
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
                      <label className="inline-switch">
                        <input
                          type="checkbox"
                          disabled={!draft}
                          checked={item.enabled}
                          onChange={(event) =>
                            toggleDocument(item.key, event.target.checked)
                          }
                        />
                        <span>{item.enabled ? "启用" : "停用"}</span>
                      </label>
                    </td>
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
                    <td>
                      {!originalKeys.has(item.key.toLowerCase()) && draft ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => removeNewDocument(item.key)}
                        >
                          <Trash2 size={15} />
                          移除
                        </Button>
                      ) : (
                        <span className="section-caption">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredDocuments.length === 0 && (
            <EmptyState title="没有匹配的多语言文案" />
          )}
        </div>
      </Card>
      <SidePanel
        open={addPanelOpen}
        title="添加文案"
        description="Key 保存后不可直接改名；请使用小写字母、数字、点、下划线或短横线。"
        onClose={() => setAddPanelOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddPanelOpen(false)}>
              取消
            </Button>
            <Button onClick={addDocument}>
              <Plus size={16} />
              加入草稿
            </Button>
          </>
        }
      >
        <div className="side-panel-form">
          <label className="form-field">
            <span>Key</span>
            <input
              className="input mono"
              autoFocus
              value={newDocumentKey}
              placeholder="例如 wallet.connect"
              onChange={(event) => {
                setNewDocumentKey(event.target.value.toLowerCase());
                setNewDocumentError("");
              }}
            />
          </label>
          <label className="form-field">
            <span>备注（可选）</span>
            <input
              className="input"
              value={newDocumentMeta}
              placeholder="例如：钱包连接按钮"
              onChange={(event) => setNewDocumentMeta(event.target.value)}
            />
          </label>
          {languages.map(([code, item]) => (
            <label className="form-field" key={code}>
              <span>
                {item.label}（{code}）
                {code === data.settings.fallbackLanguage && " · 必填"}
              </span>
              <textarea
                className="input textarea"
                value={newDocumentValues[code] ?? ""}
                placeholder={`填写 ${item.label} 文案`}
                onChange={(event) =>
                  setNewDocumentValues((current) => ({
                    ...current,
                    [code]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          {newDocumentError && (
            <div className="error-banner">{newDocumentError}</div>
          )}
        </div>
      </SidePanel>
      <Card className="save-card">
        <div className="card-body save-layout">
          <label className="form-field">
            <span>修改原因</span>
            <textarea
              className="input textarea"
              disabled={!draft}
              value={reason}
              placeholder={
                draft ? "例如：新增日语并修正文案" : "点击“编辑多语言”后填写"
              }
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="save-state">
            <StatusPill
              status={
                hasUnsavedChanges || hasUnpublishedDraft
                  ? hasUnsavedChanges
                    ? "editing"
                    : hasUnpublishedDraft
                      ? "draft"
                      : "active"
                  : "active"
              }
            />
            <span>
              {hasUnsavedChanges
                ? "修改仍在当前浏览器草稿中，尚未写入数据库。"
                : draft && hasUnpublishedDraft
                  ? "草稿已保存到数据库，但尚未生成 App 可用的发布资源。"
                  : draft
                    ? "当前内容已发布，没有未保存修改。"
                    : hasUnpublishedDraft
                      ? "数据库中有已保存但尚未发布的草稿；进入编辑后可直接发布。"
                      : "点击“编辑多语言”开始修改。"}
            </span>
          </div>
          <div className="save-actions">
            <Button
              variant="ghost"
              disabled={
                !draft ||
                !hasUnsavedChanges ||
                saveMutation.isPending ||
                publishMutation.isPending
              }
              onClick={save}
            >
              <Save size={16} />
              保存草稿
            </Button>
            <Button
              disabled={
                !draft || saveMutation.isPending || publishMutation.isPending
              }
              onClick={publish}
            >
              {hasUnsavedChanges
                ? "保存并发布"
                : hasUnpublishedDraft
                  ? "发布当前草稿"
                  : "重新发布资源"}
            </Button>
          </div>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === "publish"
            ? "发布多语言资源？"
            : confirm === "discard"
              ? "丢弃未保存修改？"
              : "保存多语言草稿？"
        }
        description={
          confirm === "publish"
            ? hasUnsavedChanges
              ? "先将未保存修改写入数据库，再为所有启用语言生成完整 JSON 并上传对象存储。"
              : "将数据库中的当前草稿生成为完整 JSON 并上传对象存储。"
            : confirm === "discard"
              ? "当前输入和 Excel 导入内容尚未保存，取消后将无法恢复。"
              : "只保存当前租户的文案和语言设置覆盖，不会生成 App 可下载资源。"
        }
        confirmLabel={
          confirm === "publish"
            ? "确认发布"
            : confirm === "discard"
              ? "丢弃修改"
              : "确认保存"
        }
        loading={saveMutation.isPending || publishMutation.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "publish") publishMutation.mutate();
          else if (confirm === "discard") {
            setDraft(null);
            setOriginal(null);
            setConfirm(null);
            setReason("");
            setNotice("");
          } else saveMutation.mutate();
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
