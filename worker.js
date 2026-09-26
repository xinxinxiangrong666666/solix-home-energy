// Anker SOLIX Home Energy Studio — LLM 解释代理（Cloudflare Worker）
//
// 合规边界（与本地 serve.py 完全一致）：
// - 只转发"证据 JSON + 用户问题"到 GLM，只返回解释文字
// - 无任何工具调用能力，不能下发功率/修改约束
// - key 存 Worker 加密环境变量，永不进入前端代码
//
// 路由：
//   GET  /api/health  → { ok, ready, model }
//   POST /api/chat    → 流式转发（SSE → 纯文本流），或 JSON 完整返回

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检（GitHub Pages 域名等任意来源均可——本站无用户数据，只暴露解释功能）
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname.replace(/\/+$/, "") === "/api/health") {
      const ready = !!env.ARK_API_KEY;
      return new Response(JSON.stringify({ ok: true, ready, model: env.ARK_MODEL || "glm-5-3-flash-260828" }), {
        headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
      });
    }

    if (url.pathname.replace(/\/+$/, "") === "/api/chat" && request.method === "POST") {
      if (!env.ARK_API_KEY) {
        return json({ ok: false, error: "no-key", message: "Worker 未配置 ARK_API_KEY" }, 500);
      }
      let payload;
      try {
        payload = await request.json();
      } catch (e) {
        return json({ ok: false, error: "bad-request" }, 400);
      }
      const messages = payload.messages || [];
      if (!messages.length) return json({ ok: false, error: "bad-request", message: "messages required" }, 400);

      const wantStream = !!payload.stream;
      const body = {
        model: payload.model || env.ARK_MODEL || "glm-5-3-flash-260828",
        messages,
        max_tokens: Math.min(parseInt(payload.max_tokens) || 2600, 4000),
        temperature: 0.4,
      };
      if (wantStream) body.stream = true;

      const upstream = await fetch("https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.ARK_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        const detail = (await upstream.text()).slice(0, 300);
        return json({ ok: false, error: `upstream-${upstream.status}`, detail }, 502);
      }

      if (wantStream) {
        // 上游 SSE → 逐段解析 delta.content → 转发为纯文本流（前端打字机直接吃）
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const enc = new TextEncoder();
        (async () => {
          const reader = upstream.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let sentAny = false;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let idx;
              while ((idx = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (!line.startsWith("data:")) continue;
                const chunk = line.slice(5).trim();
                if (!chunk || chunk === "[DONE]") continue;
                try {
                  const evt = JSON.parse(chunk);
                  const piece = evt.choices?.[0]?.delta?.content || "";
                  if (piece) {
                    sentAny = true;
                    await writer.write(enc.encode(piece));
                  }
                } catch (e) { /* 忽略半行 */ }
              }
            }
            if (!sentAny) await writer.write(enc.encode("\u0000STREAM_EMPTY"));
          } catch (e) {
            /* 上游中断：尽力而为 */
          } finally {
            await writer.close();
          }
        })();
        return new Response(readable, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            ...corsHeaders(),
          },
        });
      }

      // 非流式：聚合返回
      const data = await upstream.json();
      const content = data.choices?.[0]?.message?.content || "";
      return json({ ok: true, content: content.trim(), model: body.model, usage: data.usage || {} });
    }

    return json({ ok: false, error: "not-found" }, 404);
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}
