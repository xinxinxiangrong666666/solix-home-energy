/* Optional cloud wording for the local evidence assistant. The optimizer and
 * device controls never pass through this bridge. Cloud use requires a fresh
 * opt-in and sends a compact synthetic record, the question and recent chat. */
(() => {
  "use strict";

  const ENDPOINT = "/api/chat";
  const HEALTH_ENDPOINT = "/api/health";
  // 云端 Worker（2026-09-26）：静态托管（GitHub Pages）无服务端，/api/chat 走
  // Cloudflare Worker 代理。本地 serve.py 优先（同源健康检查通过即用本地）。
  const REMOTE_ENDPOINT = "https://solix-energy-llm.qianhuayikai.workers.dev/api/chat";
  const REMOTE_HEALTH = "https://solix-energy-llm.qianhuayikai.workers.dev/api/health";
  // A new key makes older default-on preferences ineligible for cloud opt-in.
  const SWITCH_KEY = "solix-cloud-explanation-v2";
  const HISTORY_KEY = "solix-llm-history";
  let availability = "local";
  let lastFailure = "";
  let remoteMode = false; // true = 走 Cloudflare Worker（静态托管场景）
  const activeRequests = new Set();

  const byId = (id) => document.getElementById(id);
  const english = () => document.documentElement.lang === "en";
  const say = (zh, en) => (english() ? en : zh);

  function requested() {
    /* 云端默认开（2026-10-01 用户指令）：新访客未做过选择时默认 on。
     * 隐私边界不变——只有真正提问时才发送数据，且页面明示发送范围；
     * 用户关一次即写入 "off"，之后永远尊重用户选择。 */
    try {
      const stored = localStorage.getItem(SWITCH_KEY);
      return stored === null ? true : stored === "on";
    } catch (_) { return true; }
  }

  function persist(on) {
    try { localStorage.setItem(SWITCH_KEY, on ? "on" : "off"); } catch (_) { /* current tab still works */ }
  }

  function enabled() { return requested() && availability === "ready"; }
  function status() { return availability; }

  function paint() {
    const badge = byId("llm-status");
    const toggle = byId("llm-toggle");
    const note = byId("llm-mode-note");
    if (!badge || !toggle || !note) return;
    const copy = {
      local: ["本地解释", "Local explanation", "开启云端解释", "Enable cloud explanation",
        "当前提问与证据留在本页，由本地规则回答。", "Questions and evidence stay in this page; local rules answer."],
      checking: ["正在检查云端服务", "Checking cloud service", "正在检查", "Checking",
        "尚未发送提问或决策证据。", "No question or decision evidence has been sent."],
      ready: ["云端解释已开启", "Cloud explanation on", "关闭云端解释", "Turn off cloud explanation",
        "提问时，问题、最近一条合成证据和最多六条本次对话会经本地代理发送到火山方舟。", "When you ask, the question, latest synthetic evidence and up to six recent messages go through the local proxy to Volcengine Ark."],
      unavailable: ["云端不可用 · 本地解释", "Cloud unavailable · local explanation", "重试云端解释", "Retry cloud explanation",
        "已切回本地解释；后续提问不会发送至云端。", "Local explanation is active; later questions will not be sent to the cloud."]
    }[availability];
    const en = english();
    badge.textContent = copy[en ? 1 : 0];
    toggle.textContent = copy[en ? 3 : 2];
    note.textContent = copy[en ? 5 : 4];
    toggle.setAttribute("aria-pressed", String(enabled()));
    toggle.disabled = availability === "checking";
  }

  function markUnavailable(reason = "unavailable") {
    lastFailure = reason;
    persist(false);
    availability = "unavailable";
    clearHistory();
    paint();
  }

  function disableCloud() {
    persist(false);
    availability = "local";
    lastFailure = "disabled";
    activeRequests.forEach((controller) => controller.abort());
    clearHistory();
    paint();
  }

  async function checkAvailability() {
    // 直连模式（比赛临时方案）：前端自带 ARK 配置时跳过 /api/health 探测，
    // 直接把云端置为可用。合规边界不变（LLM 只收证据+问题，只回文字）。
    const direct = window.LLM_DIRECT;
    if (direct && direct.enabled && direct.apiKey && direct.endpoint) {
      availability = "ready";
      lastFailure = "";
      paint();
      return true;
    }
    availability = "checking";
    paint();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    // 本地代理优先；本地不通（静态托管）再探远程 Worker
    try {
      const response = await fetch(HEALTH_ENDPOINT, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("proxy-unavailable");
      const health = await response.json();
      if (health.ready !== true) throw new Error("proxy-not-configured");
      availability = "ready";
      lastFailure = "";
      paint();
      return true;
    } catch (_) { /* 落到远程探测 */ }
    try {
      const remoteTimeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(REMOTE_HEALTH, { cache: "no-store", signal: controller.signal });
      clearTimeout(remoteTimeout);
      if (!response.ok) throw new Error("remote-unavailable");
      const health = await response.json();
      if (health.ready !== true) throw new Error("remote-not-configured");
      availability = "ready";
      remoteMode = true;
      lastFailure = "";
      paint();
      return true;
    } catch (_) {
      markUnavailable("unavailable");
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /* 把最近一条证据压成紧凑 JSON（控制 token：只留解释需要的字段） */
  function evidenceForPrompt(record) {
    if (!record) return null;
    return {
      id: record.id,
      clock: record.clock,
      status: record.status,
      input: record.input
        ? {
            priceEurKwh: record.input.priceEurKwh,
            price0: record.input.price0,
            pvKw: record.input.pvKw,
            loadKw: record.input.loadKw,
            socPct: record.input.socPct,
            reservePct: record.input.reservePct,
            negPrice: record.input.negPrice,
          }
        : null,
      plannedAction: record.plannedAction
        ? {
            chargeKw: record.plannedAction.chargeKw,
            dischargeKw: record.plannedAction.dischargeKw,
            importKw: record.plannedAction.importKw,
            exportKw: record.plannedAction.exportKw,
            evKw: record.plannedAction.evKw,
          }
        : null,
      horizon: record.horizon || null,
      failureReason: record.failureReason || null,
    };
  }

  function systemPrompt(record) {
    return say(
      [
        "你是家庭能源系统的「证据助手」，任务：向普通用户解释本地 LP 优化器刚刚做出的充放电决策。",
        "硬规则（违反即失败）：",
        "1. 所有数字（功率/价格/SOC/约束）只能来自我给你的证据 JSON，禁止编造或外推任何数字；",
        "2. 不确定就说不确定，绝不虚构收益金额或省电百分比；",
        "3. 你没有设备控制能力，回答结尾固定带一句：此为解释，不下发任何设备指令；",
        "4. 用口语化中文回答，不超过 4 句话；先直接回答问题，再给 1-2 个证据里的关键数字作依据。",
      ].join("\n"),
      [
        "You are the evidence assistant of a home energy system. Explain the latest LP scheduling decision to a non-technical user.",
        "Hard rules:",
        "1. Use ONLY numbers from the evidence JSON provided; never invent or extrapolate numbers;",
        "2. Admit uncertainty; never fabricate savings amounts or percentages;",
        "3. You have no device-control ability; always end with: explanation only, no device command was sent;",
        "4. Plain language, max 4 sentences; answer first, then cite 1-2 key numbers from the evidence.",
      ].join("\n")
    ) + `\n[证据 JSON]\n${JSON.stringify(record)}`;
  }

  /* 主入口：energy-agent 的 ask() 在调用本地 answer() 前先试 LLM */
  async function askLLM(question, record, onDelta) {
    if (!enabled()) return null;
    const evidence = evidenceForPrompt(record);
    if (!evidence) { lastFailure = "no-evidence"; return null; }
    let history = [];
    try {
      history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]").slice(-6);
    } catch (e) {
      history = [];
    }
    const messages = [
      { role: "system", content: systemPrompt(evidence) },
      ...history,
      { role: "user", content: question },
    ];
    // 直连模式（比赛临时方案，用户 2026-09-26 确认）：GitHub Pages 无服务端，
    // 由前端持 key 直打 ARK。合规边界不变：LLM 只收证据 JSON + 问题，只回文字。
    const direct = window.LLM_DIRECT;
    const useDirect = !!(direct && direct.enabled && direct.apiKey && direct.endpoint);
    // 端点选择：直连 > 远程 Worker（静态托管）> 同源本地代理
    const endpoint = useDirect ? direct.endpoint : (remoteMode ? REMOTE_ENDPOINT : ENDPOINT);
    const headers = useDirect
      ? { "Content-Type": "application/json", "Authorization": `Bearer ${direct.apiKey}` }
      : { "Content-Type": "application/json" };
    const extraBody = useDirect ? { model: direct.model } : {};
    const controller = new AbortController();
    activeRequests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      // 打字机（2026-09-26）：请求流式响应，每收到一段就回调 onDelta 喂给消息体。
      // 合规不变：流里只有 GLM 的解释文字，没有工具调用、没有设备指令。
      const resp = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages, max_tokens: 2400, stream: true, ...extraBody }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("proxy-error");
      const ctype = resp.headers.get("Content-Type") || "";
      let full = "";
      const isSSE = ctype.includes("text/plain") || ctype.includes("text/event-stream");
      if (resp.body && typeof resp.body.getReader === "function" && (isSSE || useDirect)) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let sseBuf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const piece = decoder.decode(value, { stream: true });
          if (piece.includes("STREAM_EMPTY")) break; // 上游没吐内容 → 走降级
          // 直连 ARK 时上游是 SSE（data: {...}），解析出 delta.content 再喂打字机
          if (useDirect && (ctype.includes("event-stream") || piece.includes("data:"))) {
            sseBuf += piece;
            let idx;
            while ((idx = sseBuf.indexOf("\n")) >= 0) {
              const line = sseBuf.slice(0, idx).trim();
              sseBuf = sseBuf.slice(idx + 1);
              if (!line.startsWith("data:")) continue;
              const chunk = line.slice(5).trim();
              if (!chunk || chunk === "[DONE]") continue;
              try {
                const evt = JSON.parse(chunk);
                const delta = (evt.choices?.[0]?.delta?.content) || "";
                if (delta) {
                  full += delta;
                  if (typeof onDelta === "function") { try { onDelta(delta); } catch (e) {} }
                }
              } catch (e) { /* 半行等待下一块 */ }
            }
          } else {
            full += piece;
            if (piece && typeof onDelta === "function") {
              try { onDelta(piece); } catch (e) { /* 渲染失败不影响收流 */ }
            }
          }
        }
      } else {
        const data = await resp.json();
        full = (data.ok && typeof data.content === "string") ? data.content : "";
      }
      full = full.trim();
      if (!full) throw new Error("empty-answer");
      // 追加历史（裁到最近 6 条，控制 token）
      history.push({ role: "user", content: question });
      history.push({ role: "assistant", content: full });
      try {
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-6)));
      } catch (e) { /* ignore */ }
      if (!enabled()) return null;
      lastFailure = "";
      return full.slice(0, 1800);
    } catch (_) {
      if (!requested()) { lastFailure = "disabled"; return null; }
      markUnavailable("unavailable");
      return null;
    } finally {
      clearTimeout(timeout);
      activeRequests.delete(controller);
    }
  }

  function clearHistory() {
    try { sessionStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
  }

  function initModeControl() {
    const toggle = byId("llm-toggle");
    const consent = byId("llm-consent");
    const confirm = byId("llm-confirm");
    const cancel = byId("llm-cancel");
    if (!toggle || !consent || !confirm || !cancel) return;
    toggle.addEventListener("click", () => {
      if (enabled()) {
        disableCloud();
        consent.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      consent.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      const available = await checkAvailability();
      confirm.disabled = false;
      if (!available) {
        consent.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      persist(true);
      consent.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      paint();
    });
    cancel.addEventListener("click", () => {
      consent.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== SWITCH_KEY) return;
      if (event.newValue === "on") void checkAvailability();
      else disableCloud();
    });
    paint();
    if (requested()) void checkAvailability();
    else clearHistory();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initModeControl, { once: true });
  } else {
    initModeControl();
  }

  window.EnergyLLM = { askLLM, enabled, status, paint, clearHistory, lastFailure: () => lastFailure };
})();
