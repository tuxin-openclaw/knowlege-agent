import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { modelConfigs } from "@/api/model-configs";
import type { ModelConfig, ModelKind } from "@/api/model-configs";
import { Badge } from "@knowledge/ui/components/badge";
import { Button } from "@knowledge/ui/components/button";
import { Checkbox } from "@knowledge/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@knowledge/ui/components/dialog";
import { Input } from "@knowledge/ui/components/input";
import { Label } from "@knowledge/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@knowledge/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@knowledge/ui/components/table";
import "@/model-usage.css";
import "@/model-configs.css";

type Form = {
  id?: string;
  kind: ModelKind;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  streamIncludeUsage: boolean;
  isDefault: boolean;
  inputPrice: string;
  cachedInputPrice: string;
  outputPrice: string;
  imagePrice: string;
};

const empty = (): Form => ({
  kind: "text",
  name: "",
  baseUrl: "",
  model: "",
  apiKey: "",
  streamIncludeUsage: true,
  isDefault: false,
  inputPrice: "",
  cachedInputPrice: "",
  outputPrice: "",
  imagePrice: "",
});

/** 编辑时清空 API Key 输入框：留空表示沿用已保存的密钥。 */
const toForm = (config: ModelConfig): Form => ({
  id: config.id,
  kind: config.kind,
  name: config.name,
  baseUrl: config.baseUrl,
  model: config.model,
  apiKey: "",
  streamIncludeUsage: config.streamIncludeUsage,
  isDefault: config.isDefault,
  inputPrice: config.price.inputPrice ?? "",
  cachedInputPrice: config.price.cachedInputPrice ?? "",
  outputPrice: config.price.outputPrice ?? "",
  imagePrice: config.price.imagePrice ?? "",
});

/** 列表里的价格摘要：文本按“输入/缓存/输出”，图片按“元/张”。 */
const priceLabel = (config: ModelConfig) => {
  if (config.kind === "image")
    return config.price.imagePrice
      ? `¥${config.price.imagePrice}/张`
      : "未配置";
  const { inputPrice, cachedInputPrice, outputPrice } = config.price;
  if (!inputPrice && !cachedInputPrice && !outputPrice) return "未配置";
  return [inputPrice ?? "-", cachedInputPrice ?? "-", outputPrice ?? "-"].join(
    " / ",
  );
};

const kindLabel = (kind: ModelKind) => (kind === "text" ? "文本" : "图片");

export default function ModelConfigs() {
  const [items, setItems] = useState<ModelConfig[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    try {
      setItems(await modelConfigs.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((old) => ({ ...old, [key]: value }));

  /** 新增和编辑共用同一个弹框，打开时总是覆盖上一次的表单内容。 */
  function openForm(next: Form) {
    setForm(next);
    setFormError("");
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  /** 编辑前重新取一次详情，避免拿列表里的旧数据覆盖别人的修改。 */
  async function edit(config: ModelConfig) {
    setError("");
    setNotice("");
    try {
      openForm(toForm(await modelConfigs.detail(config.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取配置详情失败");
      await load();
    }
  }

  function closeForm() {
    setFormOpen(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const apiKey = form.apiKey.trim();
      const payload = {
        kind: form.kind,
        name: form.name.trim(),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        streamIncludeUsage: form.streamIncludeUsage,
        isDefault: form.isDefault,
        price: {
          inputPrice: form.inputPrice.trim() || null,
          cachedInputPrice: form.cachedInputPrice.trim() || null,
          outputPrice: form.outputPrice.trim() || null,
          imagePrice: form.imagePrice.trim() || null,
        },
        ...(apiKey ? { apiKey } : {}),
      };
      if (form.id) {
        await modelConfigs.update(form.id, payload);
        setNotice(`“${payload.name}”已更新，之后的调用将使用新配置。`);
      } else {
        await modelConfigs.create(payload);
        setNotice(`“${payload.name}”已保存。`);
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(config: ModelConfig) {
    setBusy(config.id);
    setError("");
    setNotice("");
    try {
      await modelConfigs.setDefault(config.id);
      await load();
      setNotice(
        `“${config.name}”已设为${kindLabel(config.kind)}模型的默认配置。`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  async function remove(config: ModelConfig) {
    if (
      !window.confirm(
        `删除“${config.name}”？已生成的作品和用量记录会保留，进行中的任务会改用默认模型。`,
      )
    )
      return;
    setBusy(config.id);
    setError("");
    setNotice("");
    try {
      await modelConfigs.remove(config.id);
      await load();
      setNotice(`“${config.name}”已删除。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="usage-page">
      <div className="usage-toolbar">
        <Link to="/model-usage">模型用量监控</Link>
      </div>
      {error && (
        <div className="usage-error" role="alert">
          {error}
        </div>
      )}
      {notice && <p className="usage-success">{notice}</p>}
      <section className="config-card">
        <div className="config-table-heading">
          <h2>
            已配置的模型 <span>{items.length}</span>
          </h2>
          <Button onClick={() => openForm(empty())}>＋ 新增配置</Button>
        </div>
        {items.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>服务商</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>默认</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((config) => (
                <TableRow key={config.id}>
                  <TableCell>
                    <Badge variant="outline">{kindLabel(config.kind)}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{config.name}</TableCell>
                  <TableCell
                    className="max-w-[240px] truncate"
                    title={config.baseUrl}
                  >
                    {config.baseUrl}
                  </TableCell>
                  <TableCell>{config.model}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {config.apiKeyHint}
                  </TableCell>
                  <TableCell
                    className={config.kind === "text" ? "price-cell" : ""}
                    title={
                      config.kind === "text"
                        ? "元/百万 tokens：输入 / 缓存输入 / 输出"
                        : "元/张"
                    }
                  >
                    {priceLabel(config)}
                  </TableCell>
                  <TableCell>
                    {config.isDefault ? (
                      <Badge>默认</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy === config.id}
                        onClick={() => void makeDefault(config)}
                      >
                        设为默认
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="row-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void edit(config)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy === config.id}
                        onClick={() => void remove(config)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="usage-empty">
            {loading
              ? "正在加载模型配置…"
              : "还没有模型配置，先添加一个文本模型和生图模型，页面就可以开始调用。"}
          </p>
        )}
      </section>
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormError("");
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? "编辑模型配置" : "新增模型配置"}
            </DialogTitle>
            <DialogDescription>
              API Key 加密保存，只在服务端使用，不会返回浏览器。
            </DialogDescription>
          </DialogHeader>
          <form className="config-form" onSubmit={save}>
            <div className="model-config-grid">
              <div className="config-field">
                <Label htmlFor="cfg-kind">类型</Label>
                {/* 类型决定调用方式，创建后不可改；用 disabled 呈现既有限制。 */}
                <Select
                  value={form.kind}
                  disabled={!!form.id}
                  onValueChange={(value) => set("kind", value as ModelKind)}
                >
                  <SelectTrigger id="cfg-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="image">图片</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="config-field">
                <Label htmlFor="cfg-name">配置名称</Label>
                <Input
                  id="cfg-name"
                  required
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="例如 DeepSeek 官方"
                />
              </div>
              <div className="config-field">
                <Label htmlFor="cfg-base-url">服务商 API 根地址</Label>
                <Input
                  id="cfg-base-url"
                  required
                  type="url"
                  value={form.baseUrl}
                  onChange={(event) => set("baseUrl", event.target.value)}
                  placeholder="例如 https://api.deepseek.com"
                />
              </div>
              <div className="config-field">
                <Label htmlFor="cfg-model">模型名称</Label>
                <Input
                  id="cfg-model"
                  required
                  value={form.model}
                  onChange={(event) => set("model", event.target.value)}
                  placeholder="例如 deepseek-chat"
                />
              </div>
              <div className="config-field">
                <Label htmlFor="cfg-api-key">API Key</Label>
                <Input
                  id="cfg-api-key"
                  required={!form.id}
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={(event) => set("apiKey", event.target.value)}
                  placeholder={
                    form.id ? "留空表示沿用已保存的密钥" : "例如 sk-…"
                  }
                />
              </div>
            </div>
            <div className="price-section">
              <div className="price-section-title">
                {form.kind === "text"
                  ? "单价（元/百万 tokens，留空表示不估算成本）"
                  : "单价（元/张，留空表示不估算成本）"}
              </div>
              <div className="model-config-grid">
                {form.kind === "text" ? (
                  <>
                    <div className="config-field">
                      <Label htmlFor="cfg-input-price">输入价格</Label>
                      <Input
                        id="cfg-input-price"
                        inputMode="decimal"
                        value={form.inputPrice}
                        onChange={(event) =>
                          set("inputPrice", event.target.value)
                        }
                        placeholder="例如 1.00"
                      />
                    </div>
                    <div className="config-field">
                      <Label htmlFor="cfg-cached-price">缓存输入价格</Label>
                      <Input
                        id="cfg-cached-price"
                        inputMode="decimal"
                        value={form.cachedInputPrice}
                        onChange={(event) =>
                          set("cachedInputPrice", event.target.value)
                        }
                        placeholder="例如 0.10"
                      />
                    </div>
                    <div className="config-field">
                      <Label htmlFor="cfg-output-price">输出价格</Label>
                      <Input
                        id="cfg-output-price"
                        inputMode="decimal"
                        value={form.outputPrice}
                        onChange={(event) =>
                          set("outputPrice", event.target.value)
                        }
                        placeholder="例如 2.00"
                      />
                    </div>
                  </>
                ) : (
                  <div className="config-field">
                    <Label htmlFor="cfg-image-price">每张图片价格</Label>
                    <Input
                      id="cfg-image-price"
                      inputMode="decimal"
                      value={form.imagePrice}
                      onChange={(event) =>
                        set("imagePrice", event.target.value)
                      }
                      placeholder="例如 0.20"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="model-config-switches">
              {form.kind === "text" && (
                <div className="inline-check">
                  <Checkbox
                    id="cfg-stream-usage"
                    checked={form.streamIncludeUsage}
                    onCheckedChange={(checked) =>
                      set("streamIncludeUsage", checked === true)
                    }
                  />
                  <Label htmlFor="cfg-stream-usage" className="font-normal">
                    请求返回用量（stream_options.include_usage）
                  </Label>
                </div>
              )}
              <div className="inline-check">
                <Checkbox
                  id="cfg-is-default"
                  checked={form.isDefault}
                  onCheckedChange={(checked) =>
                    set("isDefault", checked === true)
                  }
                />
                <Label htmlFor="cfg-is-default" className="font-normal">
                  设为默认{kindLabel(form.kind)}模型
                </Label>
              </div>
            </div>
            <p className="usage-note">
              服务商地址必须是不带凭证和查询参数的 HTTP
              地址，它会用于调用模型和匹配单价（单价跟着“服务商地址 +
              模型名”走，两条配置指向同一个模型时共用一份单价）。
              每种类型只有一个默认模型；类型创建后不可修改，需要区分时请新增一条配置。
            </p>
            {formError && (
              <div className="usage-error" role="alert">
                {formError}
              </div>
            )}
            <div className="config-actions">
              <Button type="submit" disabled={saving}>
                {saving ? "保存中…" : form.id ? "保存修改" : "新增配置"}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>
                取消
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
