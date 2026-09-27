/* Read-only evidence assistant. Optional GLM bridge supplies wording only;
 * local LP records remain the source of numbers and no device command is sent. */
(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const english = () => document.documentElement.lang === "en";
  const say = (zh, en) => english() ? en : zh;
  const fmt = (value, digits = 2) => Number(value || 0).toFixed(digits);
  const latest = () => window.EnergySession?.getLatestEvidence?.() || null;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  function isRollingPlanActive() {
    const strategy = document.querySelector(".strategy-button.is-active")?.dataset.strategy;
    const weather = document.querySelector("[data-weather].is-active")?.dataset.weather;
    return strategy === "auto" && !["storm", "snow"].includes(weather);
  }

  function setLanguage() {
    const input = byId("agent-input");
    if (input) input.placeholder = say("例如：为什么这格不放电？", "e.g. Why not discharge this slot?");
    const thread = byId("agent-thread");
    if (thread) {
      thread.setAttribute("aria-label", say("证据助手对话", "Evidence assistant conversation"));
      if (thread.children.length === 1 && thread.firstElementChild?.classList.contains("agent-message--assistant")) {
        const body = thread.firstElementChild.firstElementChild;
        if (body) body.textContent = say(
          "想知道为什么现在充电、待机或给家里留备电？问我就好。默认使用本地解释；技术依据可随时展开查看。",
          "Want to know why the battery charges, waits or keeps a home reserve? Ask here. Explanations stay local by default; technical evidence is available below."
        );
      }
    }
    updateSummary();
  }

  function updateSummary() {
    const summary = byId("agent-evidence-summary");
    if (!summary) return;
    const record = latest();
    if (!record) {
      summary.textContent = say("等待首条决策证据…", "Waiting for the first decision record…");
      renderHistory();
      return;
    }
    if (record.status !== "ok" || !record.plannedAction) {
      summary.textContent = say(
        `证据 ${record.id} · ${record.clock} · 本次求解未成功（${record.failureReason}），不推断充放动作。`,
        `Evidence ${record.id} · ${record.clock} · solve failed (${record.failureReason}); no action inferred.`
      );
      renderHistory();
      return;
    }
    const action = record.plannedAction;
    const verb = action.chargeKw > 0.025 ? say("充电", "charge")
      : action.dischargeKw > 0.025 ? say("放电", "discharge") : say("待机", "hold");
    const power = Math.max(action.chargeKw, action.dischargeKw);
    summary.textContent = say(
      `证据 ${record.id} · ${record.clock} · LP 首格${verb} ${fmt(power)} kW · SOC ${fmt(record.input.socPct, 1)}%`,
      `Evidence ${record.id} · ${record.clock} · LP first slot: ${verb} ${fmt(power)} kW · SOC ${fmt(record.input.socPct, 1)}%`
    );
    renderHistory();
  }

  function renderHistory() {
    const list = byId("agent-history-list");
    if (!list) return;
    list.replaceChildren();
    const records = window.EnergySession?.getEvidenceLog?.(5) || [];
    for (const record of records.reverse()) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      const action = record.plannedAction;
      const guarded = record.weather === "storm" || record.weather === "snow";
      const state = !action ? say("求解失败", "Solve failed")
        : action.chargeKw > 0.025 ? say(`充 ${fmt(action.chargeKw)} kW`, `Charge ${fmt(action.chargeKw)} kW`)
        : action.dischargeKw > 0.025 ? say(`放 ${fmt(action.dischargeKw)} kW`, `Discharge ${fmt(action.dischargeKw)} kW`)
        : say("待机", "Hold");
      /* 天气守护标注（2026-09-27）：雷暴/降雪时 LP 计划被守护逻辑覆盖，展示"参考计划"防误导 */
      button.textContent = guarded
        ? `${record.id} · ${record.clock} · ${say("参考计划(未执行) ", "Reference only (not applied) ")}${state}`
        : `${record.id} · ${record.clock} · ${state}`;
      button.addEventListener("click", () => showEvidence(record.id));
      item.appendChild(button);
      list.appendChild(item);
    }
  }

  function showEvidence(id) {
    const record = window.EnergySession?.getEvidenceById?.(id);
    if (!record) return;
    const details = byId("agent-evidence-detail");
    const json = byId("agent-json");
    if (!details || !json) return;
    json.textContent = JSON.stringify(record, null, 2);
    details.open = true;
  }

  function appendCitation(message, record) {
    if (!record || message.querySelector(".agent-citation")) return;
    const cite = document.createElement("button");
    cite.type = "button";
    cite.className = "agent-citation";
    cite.textContent = say(`查看证据 ${record.id} · ${record.clock}`, `Inspect evidence ${record.id} · ${record.clock}`);
    cite.addEventListener("click", () => showEvidence(record.id));
    message.appendChild(cite);
  }

  function appendMessage(kind, body, record) {
    const thread = byId("agent-thread");
    if (!thread) return null;
    const message = document.createElement("div");
    message.className = `agent-message agent-message--${kind}`;
    const content = document.createElement("div");
    content.className = "agent-message__body";
    content.textContent = body;
    message.appendChild(content);
    if (kind === "assistant") appendCitation(message, record);
    thread.appendChild(message);
    while (thread.children.length > 18) thread.firstElementChild?.remove();
    thread.scrollTop = thread.scrollHeight;
    return message;
  }

  // /api/chat returns a complete JSON answer. Reveal that finished answer in
  // short text batches; this is presentation, not a claim of streamed tokens.
  function revealAnswer(message, answerText, record) {
    const content = message?.querySelector(".agent-message__body");
    if (!content) return;
    message.classList.remove("agent-message--thinking");
    const finish = () => {
      content.textContent = answerText;
      message.classList.remove("agent-message--revealing");
      message.removeAttribute("aria-busy");
      appendCitation(message, record);
      const thread = byId("agent-thread");
      if (thread) thread.scrollTop = thread.scrollHeight;
    };
    if (motionPreference.matches || document.hidden) { finish(); return; }
    const chars = Array.from(answerText);
    const batch = Math.max(3, Math.ceil(chars.length / 25));
    let shown = 0;
    let rendered = "";
    message.classList.add("agent-message--revealing");
    message.setAttribute("aria-busy", "true");
    content.textContent = "";
    const step = () => {
      if (!message.isConnected) return;
      if (motionPreference.matches || document.hidden) { finish(); return; }
      const next = Math.min(chars.length, shown + batch);
      rendered += chars.slice(shown, next).join("");
      shown = next;
      content.textContent = rendered;
      const thread = byId("agent-thread");
      if (thread) thread.scrollTop = thread.scrollHeight;
      if (shown < chars.length) setTimeout(step, 42);
      else finish();
    };
    step();
  }

  function inferIntent(text) {
    const query = text.toLowerCase();
    if (/证据|日志|原始|json|evidence|record|log/.test(query)) return "evidence";
    if (/不多充|多充|charge more|more charging|extra charge/.test(query)) return "more";
    if (/不放电|不该放|why not discharg|not discharg|don't discharg/.test(query)) return "discharge";
    if (/如果.*待机|如果不这样|不动作|do nothing|if.*idle|if.*hold/.test(query)) return "idle";
    if (/为什么.*放电|why.*discharg/.test(query)) return "discharge";
    if (/为什么.*充|现在充电|why.*charg/.test(query)) return "charge";
    if (/备电|安全|风暴|storm|reserve|safety/.test(query)) return "reserve";
    return "unknown";
  }

  function answer(intent, record) {
    if (!record) return say(
      "还没有求解记录。请等本地模拟器生成第一条 LP 计划；我不会在没有证据时编理由。",
      "There is no solve record yet. Wait for the local LP plan; I will not invent a reason without evidence."
    );
    if (record.status !== "ok" || !record.plannedAction) return say(
      `最近一次求解 ${record.id} 未成功（${record.failureReason}）。我只能报告失败，不能虚构动作或收益。`,
      `The latest solve ${record.id} failed (${record.failureReason}). I can report the failure, not invent an action or savings.`
    );
    const input = record.input;
    const action = record.plannedAction;
    const context = say(
      `本格模拟价 €${fmt(input.priceEurKwh, 3)}/kWh、光伏 ${fmt(input.pvKw)} kW、家庭负荷 ${fmt(input.homeLoadKw)} kW、SOC ${fmt(input.socPct, 1)}%，备电目标 ${fmt(input.reservePct, 0)}%。`,
      `This slot's synthetic tariff is €${fmt(input.priceEurKwh, 3)}/kWh, solar ${fmt(input.pvKw)} kW, home load ${fmt(input.homeLoadKw)} kW, SOC ${fmt(input.socPct, 1)}%, reserve target ${fmt(input.reservePct, 0)}%.`
    );
    const notExecuted = !isRollingPlanActive()
      ? say("当前不是常态滚动优化执行情景；这里引用的是 LP 计划，不是设备执行反馈。", "Normal rolling execution is not active; this cites an LP plan, not device feedback.")
      : say("网页只模拟计划，不连接设备。", "This webpage simulates the plan and does not connect to devices.");

    if (intent === "evidence") return say(
      `证据 ${record.id} 记录了输入快照、首格计划、6 小时目标值与显式规则。${context} 点击下方引用可查看原始 JSON；它不是真实设备日志。`,
      `Evidence ${record.id} records the input snapshot, first-slot plan, six-hour objective and explicit rules. ${context} Open the citation for raw JSON; this is not a real device log.`
    );
    if (intent === "charge") return action.chargeKw > 0.025
      ? say(`本地 LP 首格计划充电 ${fmt(action.chargeKw)} kW。${context} 充电功率是否已触上限：${record.activeRules.includes("charge_power_cap") ? "是" : "否"}。单看本格不能断言全部未来原因；可追问“为什么不多充”做同输入影子重算。${notExecuted}`,
        `The local LP plans ${fmt(action.chargeKw)} kW charging in this slot. ${context} At the charging cap: ${record.activeRules.includes("charge_power_cap") ? "yes" : "no"}. One slot alone cannot prove every future trade-off; ask why not charge more for a same-input shadow re-solve. ${notExecuted}`)
      : say(`这条计划的本格充电功率是 0 kW，并没有正在充电。${context} 如要比较强制多充，可点“为什么不多充”。${notExecuted}`,
        `This plan charges 0 kW in the current slot. ${context} Ask why not charge more to test a forced increase. ${notExecuted}`);
    if (intent === "discharge") {
      if (input.priceEurKwh < 0) return say(
        `本格模拟价为负（€${fmt(input.priceEurKwh, 3)}/kWh），求解器明确把放电和上网功率上界设为 0；本格计划放电 ${fmt(action.dischargeKw)} kW。这是可在记录中核对的硬约束。${notExecuted}`,
        `The synthetic tariff is negative (€${fmt(input.priceEurKwh, 3)}/kWh). The solver hard-caps discharge and export at zero; planned discharge is ${fmt(action.dischargeKw)} kW. The record exposes that constraint. ${notExecuted}`
      );
      return action.dischargeKw > 0.025
        ? say(`计划其实正在放电 ${fmt(action.dischargeKw)} kW。${context} ${notExecuted}`,
          `The plan does discharge ${fmt(action.dischargeKw)} kW. ${context} ${notExecuted}`)
        : say(`计划本格不放电。${context} 记录能证明动作是 0，但除负价等显式边界外，不能把它武断归因于单一因素；如要比较“不动作”，可以运行影子重算。${notExecuted}`,
          `The plan does not discharge this slot. ${context} The record proves zero action, but not a unique cause beyond explicit bounds such as negative tariffs. A no-action shadow re-solve can compare the alternative. ${notExecuted}`);
    }
    if (intent === "reserve") return say(
      `本地情景的备电目标是 ${fmt(input.reservePct, 0)}%，求解器约束的是演示窗口末格存量；单户看板还会逐格限制越过该线的放电。没有写入设备的 SOC 限值实体。${context}`,
      `The synthetic reserve target is ${fmt(input.reservePct, 0)}%. The LP constrains terminal energy, and the single-home display clamps discharge across the line each slot. No device SOC-limit entity is written. ${context}`
    );
    if (intent === "more" || intent === "idle") {
      if (!isRollingPlanActive()) return say(
        "当前是天气守护或非滚动优化策略，LP 影子结果不对应正在展示的执行动作。我不会拿它当真实收益解释。请切回晴朗/多云与滚动优化后再试。",
        "Weather guard or a non-rolling strategy is active. An LP shadow result would not match the displayed action, so I will not present it as a real outcome. Try Clear/Cloudy with Rolling optimizer."
      );
      const result = intent === "more" ? window.EnergySession?.compareExtraCharge?.(0.4) : window.EnergySession?.compareNoAction?.();
      if (!result || result.status === "unavailable") return say("同输入影子求解暂不可用；请等待下一条成功记录。", "The same-input shadow solve is unavailable; wait for another successful record.");
      if (result.status === "power-limit") return say(
        `这一步已经不能再多充。当前计划 ${fmt(result.currentKw)} kW，演示功率上限 ${fmt(result.powerLimitKw)} kW；额外增加 0.4 kW 不可行。`,
        `The plan cannot charge more in this slot. Current charge is ${fmt(result.currentKw)} kW against the ${fmt(result.powerLimitKw)} kW demo cap; another 0.4 kW is infeasible.`
      );
      if (result.status === "infeasible") return say("影子方案无可行解；同一批输入下，额外约束与其他边界冲突，不给出虚构差额。", "The shadow plan is infeasible under the same inputs; its extra constraint conflicts with other bounds, so no delta is fabricated.");
      if (intent === "more") {
        const leadZh = result.deltaCostEur > 0.005 ? "现在多充会提高本次模拟的综合成本。" : result.deltaCostEur < -0.005 ? "在这组模拟输入下，多充方案的目标值更低。" : "现在多充没有明显的模拟收益差异。";
        const leadEn = result.deltaCostEur > 0.005 ? "Charging more now raises the simulated total cost." : result.deltaCostEur < -0.005 ? "With these synthetic inputs, charging more gives a lower objective value." : "Charging more now shows no meaningful simulated difference.";
        return say(
          `${leadZh}我在同一组输入上强制本格至少多充 0.4 kW 并重新求解；${result.horizonHours} 小时模拟目标由 €${fmt(result.baselineCostEur, 3)} 变为 €${fmt(result.alternativeCostEur, 3)}。这不是已结算节省，也不下发设备。`,
          `${leadEn} I forced at least 0.4 kW more charging now and re-solved the same inputs; the ${result.horizonHours}-hour simulated objective changes from €${fmt(result.baselineCostEur, 3)} to €${fmt(result.alternativeCostEur, 3)}. This is not settled savings or a device command.`
        );
      }
      const idleLeadZh = result.deltaObjectiveEur > 0.005 ? "让电池这一步待机会提高模拟综合成本。" : result.deltaObjectiveEur < -0.005 ? "让电池这一步待机在这组输入下更有利。" : "让电池这一步待机，模拟综合成本几乎不变。";
      const idleLeadEn = result.deltaObjectiveEur > 0.005 ? "Holding the battery this slot raises the simulated total cost." : result.deltaObjectiveEur < -0.005 ? "Holding the battery this slot is more favorable with these inputs." : "Holding the battery this slot barely changes the simulated total cost.";
      return say(
        `${idleLeadZh}影子方案把本格充放都设为 0，并重新求解后续时隙；${result.horizonHours} 小时模拟目标由 €${fmt(result.baselineObjectiveEur, 3)} 变为 €${fmt(result.alternativeObjectiveEur, 3)}。无设备指令。`,
        `${idleLeadEn} The shadow plan fixes charge and discharge at zero now and re-solves later slots; the ${result.horizonHours}-hour simulated objective changes from €${fmt(result.baselineObjectiveEur, 3)} to €${fmt(result.alternativeObjectiveEur, 3)}. No device command.`
      );
    }
    return say(
      "我目前只回答：为什么充电/不放电、为什么不多充、如果本格待机会怎样、以及当前证据。其他问题不能从这条求解日志可靠推出。",
      "I can answer why this slot charges or does not discharge, why not charge more, what happens if it idles, and what the evidence says. Other claims cannot reliably be inferred from this record."
    );
  }

  function ask(question, forcedIntent) {
    const text = String(question || "").trim();
    if (!text) return;
    const record = latest();
    appendMessage("user", text);
    const input = byId("agent-input");
    if (input) input.value = "";

    const localFallback = (cloudFailed = false) => {
      const prefix = cloudFailed ? say("云端解释暂不可用，下面是本地证据解释。\n", "Cloud explanation is unavailable. Here is the local evidence-based answer.\n") : "";
      appendMessage("assistant", prefix + answer(forcedIntent || inferIntent(text), record), record);
    };
    if (window.EnergyLLM?.enabled?.()) {
      const thinking = appendMessage("assistant", say("云端正在根据决策证据整理回答", "Cloud explanation is using the decision evidence"), null);
      thinking?.classList.add("agent-message--thinking");
      thinking?.setAttribute("aria-busy", "true");
      if (thinking) {
        const dots = document.createElement("span");
        dots.className = "agent-thinking-dots";
        dots.setAttribute("aria-hidden", "true");
        for (let index = 0; index < 3; index += 1) dots.appendChild(document.createElement("i"));
        thinking.querySelector(".agent-message__body")?.appendChild(dots);
      }
      // 打字机（2026-09-26）：流式 chunk 直接打进 thinking 气泡——10-30s 的思考等待
      // 从"三个点干等"变成"看着 AI 逐字写"。首字到达时撤掉点动画。
      let streamed = "";
      const body = thinking?.querySelector(".agent-message__body");
      const onDelta = (piece) => {
        if (!thinking?.isConnected || !body) return;
        if (!streamed) {
          thinking.classList.remove("agent-message--thinking");
          body.textContent = "";
        }
        streamed += piece;
        // thinking 气泡里只做预览渲染；最终态仍走 revealAnswer（补引用+合规尾注）
        body.textContent = streamed;
        const thread = byId("agent-thread");
        if (thread) thread.scrollTop = thread.scrollHeight;
      };
      window.EnergyLLM.askLLM(text, record, onDelta).then((reply) => {
        if (reply) {
          const answerText = say(`${reply}\n—— 云端文字解释 · 依据 ${record?.id || "?"} · 不下发设备指令`, `${reply}\n— Cloud-written explanation · evidence ${record?.id || "?"} · no device command`);
          if (thinking?.isConnected) revealAnswer(thinking, answerText, record);
          else appendMessage("assistant", answerText, record);
        } else {
          thinking?.remove();
          localFallback(window.EnergyLLM?.lastFailure?.() === "unavailable");
        }
      }).catch(() => {
        thinking?.remove();
        localFallback(true);
      });
    } else {
      localFallback();
    }
  }

  function init() {
    if (!byId("energy-agent")) return;
    setLanguage();
    appendMessage("assistant", say(
      "想知道为什么现在充电、待机或给家里留备电？问我就好。默认使用本地解释；技术依据可随时展开查看。",
      "Want to know why the battery charges, waits or keeps a home reserve? Ask here. Explanations stay local by default; technical evidence is available below."
    ));
    document.querySelectorAll("[data-agent-prompt]").forEach((button) => {
      button.addEventListener("click", () => ask(button.textContent, button.dataset.agentPrompt));
    });
    byId("agent-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      ask(byId("agent-input")?.value);
    });
    window.addEventListener("solix:evidence", updateSummary);
    updateSummary();
  }

  window.EnergyAgent = { ask, setLanguage };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
