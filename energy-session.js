/* energy-session.js — 充电会话三件套：LP调度接入 + 充电计划卡 + 15min电价
 *
 * 数据流：
 *   ① 15min电价曲线 price15ForMinute()（替换原 2-4h 阶梯，兑现 hero "15 min 滚动决策"承诺）
 *   ② buildLpInput(): 从模拟器状态合成 LP 输入（96点日前预测取滚动24点）
 *   ③ EnergyLP.planHorizon(): 解出 24 时隙计划 → plan 头槽指令写回 calculateMetrics（EV功率=LP决策）
 *   ④ renderChargePlanCard(): 充电会话卡（目标SOC/出发时间/预计完成/单夜成本/续航/绿电占比/省€对照）
 *
 * 口径（与 energy_brain 官方算法一致）：
 *   η=0.95 充电侧、负电价禁放禁售、原生自用=对照臂、经济目标=买电−卖电。
 */
(function () {
  "use strict";

  const DT_MIN = 15;            // 时隙分钟数
  const SLOTS = 96;             // 日前曲线 96 × 15min
  const BATT_KWH = 7.0;
  const BATT_PMAX_KW = 2.0;     // Solarbank 充/放上限
  const GRID_PMAX_KW = 12;
  const EV_PMAX_KW = 7.4;       // 欧洲家用 wallbox 单相 32A

  const session = {
    targetSocPct: 80,           // 出发时想要的电池电量
    departHour: 7,              // 出发时间（下次到达的小时）
    enabled: true,
    lastPlan: null,
    lastSolveMinute: -1
  };
  const evidenceLog = [];
  const EVIDENCE_LIMIT = 96;
  const motionPreference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
  let evidenceSequence = 0;

  function recordEvidence(simMinute, socPct, input, result) {
    const plan = result.status === "ok" ? result.plan : null;
    const head = plan?.[0] || null;
    const last = plan?.at(-1) || null;
    const activeRules = [];
    if (input.price[0] < 0) activeRules.push("no_export_on_negative");
    if (head && head.chargeKw >= input.pChargeMaxKw - 1e-3) activeRules.push("charge_power_cap");
    if (head && head.dischargeKw >= input.pDischargeMaxKw - 1e-3) activeRules.push("discharge_power_cap");
    if (last && Math.abs(last.energyKwh - input.terminalSocFloor * input.capacityKwh) <= 0.025) activeRules.push("terminal_reserve_floor");
    if (input.cycleCostEurPerKwh > 0) activeRules.push("cycle_cost_assumption");
    if (input.evNeedKwh > 0) activeRules.push("ev_departure_target");
    const minute = ((Math.round(simMinute) % 1440) + 1440) % 1440;
    const record = {
      id: `D${String(++evidenceSequence).padStart(4, "0")}`,
      clock: `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`,
      recordedAt: new Date().toISOString(),
      source: "browser-synthetic-lp",
      site: "demo-site-1",
      status: result.status,
      input: {
        socPct,
        priceEurKwh: input.price[0], pvKw: input.pv[0], homeLoadKw: input.load[0],
        reservePct: input.terminalSocFloor * 100, capacityKwh: input.capacityKwh,
        chargeCapKw: input.pChargeMaxKw, dischargeCapKw: input.pDischargeMaxKw,
        gridCapKw: input.pGridMaxKw, evCapKw: input.pEvMaxKw,
        efficiency: input.efficiency ?? 0.95,
        cycleCostEurPerKwh: input.cycleCostEurPerKwh,
        evNeedKwh: input.evNeedKwh, departSlot: input.departSlot,
        horizonSlots: input.price.length, horizonHours: input.price.length * 0.25,
        forecast: {
          priceEurKwh: input.price.slice(),
          pvKw: input.pv.slice(),
          homeLoadKw: input.load.slice()
        }
      },
      plannedAction: head ? {
        chargeKw: head.chargeKw, dischargeKw: head.dischargeKw,
        netBatteryKw: head.chargeKw - head.dischargeKw,
        gridImportKw: head.importKw, gridExportKw: head.exportKw,
        solarCurtailKw: head.curtailKw, evChargeKw: head.evKw,
        batteryAfterKwh: head.energyKwh
      } : null,
      planEstimate: head ? {
        objectiveEur: result.objectiveEur, energyBillEur: result.costEur,
        evEnergyKwh: result.evEnergyKwh
      } : null,
      activeRules,
      shadowComparisons: [],
      failureReason: result.status === "ok" ? null : result.status
    };
    evidenceLog.push(record);
    if (evidenceLog.length > EVIDENCE_LIMIT) evidenceLog.shift();
    window.dispatchEvent(new CustomEvent("solix:evidence", { detail: { id: record.id } }));
    return record;
  }

  function copyEvidence(record) {
    return record ? JSON.parse(JSON.stringify(record)) : null;
  }

  function recordShadow(kind, result) {
    const record = evidenceLog.at(-1);
    if (record?.status === "ok") {
      record.shadowComparisons.push({ kind, computedAt: new Date().toISOString(), ...result });
      if (record.shadowComparisons.length > 8) record.shadowComparisons.shift();
    }
    return result;
  }

  /* ---------- ① 15min 电价曲线（北欧现货风格：负价窗/双峰/午后低谷） ---------- */
  /* 96 个定价点/天。形状参考 Nord Pool 小时价 + Tibber 15min 粒度：负价凌晨、傍晚 duck 尖峰 */
  const PRICE_15 = (() => {
    const pts = new Array(SLOTS);
    for (let s = 0; s < SLOTS; s++) {
      const h = (s * DT_MIN) / 60;
      let p;
      if (h >= 2 && h < 4.5) p = -0.021;              // 凌晨负价窗（风电过剩）
      else if (h >= 4.5 && h < 6) p = 0.068;
      else if (h >= 6 && h < 9) p = 0.193;            // 早峰
      else if (h >= 9 && h < 15.5) p = 0.098;         // 光伏压低谷
      else if (h >= 15.5 && h < 16.5) p = 0.174;      // 爬坡
      else if (h >= 16.5 && h < 21) p = 0.372;        // 晚峰（duck head）
      else p = 0.155;                                 // 夜间回落
      pts[s] = p;
    }
    return pts;
  })();

  function price15ForMinute(minute) {
    return PRICE_15[Math.floor((minute % 1440) / DT_MIN) % SLOTS];
  }

  /* 15min 光伏/负荷预测（与 app.js 的形状函数一致，聚合到时隙） */
  function pv15ForMinute(minute, solarFactor) {
    const hour = (minute % 1440) / 60;
    if (hour < 6 || hour > 19.5) return 0;
    const daylight = Math.sin(((hour - 6) / 13.5) * Math.PI);
    return Math.max(0, 2.45 * daylight * solarFactor);
  }
  function load15ForMinute(minute) {
    const hour = (minute % 1440) / 60;
    const morning = 0.55 * Math.exp(-Math.pow(hour - 7.5, 2) / 2);
    const evening = 0.9 * Math.exp(-Math.pow(hour - 19.5, 2) / 2);
    return Math.max(0.18, 0.85 * (0.5 + morning + evening));
  }

  /* ---------- ② 合成 LP 输入 ---------- */
  function buildLpInput(simMinute, socPct, solarFactor, currentHomeLoadKw, currentSolarKw, reservePct) {
    const H = 24; // 滚动窗口 6h
    const price = [], pv = [], load = [];
    const referenceLoad = load15ForMinute(simMinute);
    const loadScale = Number.isFinite(currentHomeLoadKw)
      ? Math.max(0.25, Math.min(4, currentHomeLoadKw / Math.max(0.18, referenceLoad))) : 1;
    for (let i = 0; i < H; i++) {
      const m = (simMinute + i * DT_MIN) % 1440;
      price.push(price15ForMinute(m));
      pv.push(i === 0 && Number.isFinite(currentSolarKw) ? Math.max(0, currentSolarKw) : pv15ForMinute(m, solarFactor));
      load.push(i === 0 && Number.isFinite(currentHomeLoadKw) ? Math.max(0.1, currentHomeLoadKw) : load15ForMinute(m) * loadScale);
    }
    // EV 会话：剩余电量 = 目标电量 − 当前电量。×0.55 系数≈"日常消耗后需要补回的部分"，
    // 并设最小补能 6kWh，避免 LP 在低价窗很远时给出"全程待机"的最优解导致首屏车充恒为 0。
    const evNeedRaw = Math.max(0, (session.targetSocPct / 100) * 54 - (socPct / 100) * 54) * 0.55;
    const evNeedKwh = Math.min(Math.max(evNeedRaw, 6), EV_PMAX_KW * 24 * 0.25);
    // 出发槽位：当前时间到 departHour 的 15min 步数（跨天取模）
    const nowHour = simMinute / 60;
    let hoursToDepart = session.departHour - nowHour;
    if (hoursToDepart <= 0.25) hoursToDepart += 24;
    const departSlot = Math.max(1, Math.min(H, Math.round(hoursToDepart * 4)));
    return {
      price, pv, load,
      capacityKwh: BATT_KWH,
      pChargeMaxKw: BATT_PMAX_KW, pDischargeMaxKw: BATT_PMAX_KW,
      pGridMaxKw: GRID_PMAX_KW, pEvMaxKw: EV_PMAX_KW,
      cycleCostEurPerKwh: 0.02, // illustrative web-demo assumption, not an official device parameter
      soc: socPct / 100,
      terminalSocFloor: Math.max(0, Math.min(0.95, (reservePct ?? 35) / 100)),
      departSlot,
      evNeedKwh
    };
  }

  /* ---------- ③ 滚动求解（每模拟 15min 重解一次） ---------- */
  function solveIfDue(simMinute, socPct, solarFactor, currentHomeLoadKw, currentSolarKw, reservePct) {
    const slot = Math.floor(simMinute / DT_MIN);
    if (slot === session.lastSolveMinute && session.lastPlan) return session.lastPlan;
    session.lastSolveMinute = slot;
    if (!window.EnergyLP) { session.lastPlan = null; return null; }
    const input = buildLpInput(simMinute, socPct, solarFactor, currentHomeLoadKw, currentSolarKw, reservePct);
    const result = window.EnergyLP.planHorizon(input);
    recordEvidence(simMinute, socPct, input, result);
    session.lastPlan = result.status === "ok" ? result : null;
    if (session.lastPlan) session.lastPlan.input = input;
    return session.lastPlan;
  }

  function invalidate() {
    session.lastSolveMinute = -1;
    session.lastPlan = null;
  }

  function compareExtraCharge(extraKw = 0.4) {
    const base = session.lastPlan;
    if (!base?.input || !base.plan?.length || !window.EnergyLP) return { status: "unavailable" };
    const currentKw = base.plan[0].chargeKw;
    const powerLimitKw = base.input.pChargeMaxKw;
    if (currentKw + extraKw > powerLimitKw + 1e-5) {
      return recordShadow("extra_charge", { status: "power-limit", currentKw, powerLimitKw, extraKw });
    }
    const requestedKw = currentKw + extraKw;
    const alternative = window.EnergyLP.planHorizon({
      ...base.input,
      firstSlotMinChargeKw: requestedKw,
      firstSlotMaxDischargeKw: 0
    });
    if (alternative.status !== "ok") {
      return recordShadow("extra_charge", { status: "infeasible", currentKw, requestedKw, reason: alternative.status });
    }
    return recordShadow("extra_charge", {
      status: "ok",
      currentKw,
      requestedKw,
      baselineCostEur: base.objectiveEur,
      alternativeCostEur: alternative.objectiveEur,
      deltaCostEur: alternative.objectiveEur - base.objectiveEur,
      firstPriceEurKwh: base.input.price[0],
      horizonHours: base.input.price.length * 0.25,
      solveMs: alternative.solveMs
    });
  }

  function compareNoAction() {
    const base = session.lastPlan;
    if (!base?.input || !base.plan?.length || !window.EnergyLP) return { status: "unavailable" };
    const alternative = window.EnergyLP.planHorizon({
      ...base.input,
      firstSlotMaxChargeKw: 0,
      firstSlotMaxDischargeKw: 0
    });
    if (alternative.status !== "ok") return recordShadow("idle_first_slot", { status: "infeasible", reason: alternative.status });
    return recordShadow("idle_first_slot", {
      status: "ok",
      baselineObjectiveEur: base.objectiveEur,
      alternativeObjectiveEur: alternative.objectiveEur,
      deltaObjectiveEur: alternative.objectiveEur - base.objectiveEur,
      baselineChargeKw: base.plan[0].chargeKw,
      baselineDischargeKw: base.plan[0].dischargeKw,
      horizonHours: base.input.price.length * 0.25
    });
  }

  /* ---------- ④ 充电计划卡渲染 ---------- */
  let cardEl = null;
  function ensureCard() {
    if (cardEl) return cardEl;
    const host = document.getElementById("charge-plan-host");
    if (!host) return null;
    cardEl = document.createElement("div");
    cardEl.className = "charge-plan-card";
    cardEl.id = "charge-plan-card";
    cardEl.setAttribute("aria-live", "polite");
    host.appendChild(cardEl);
    return cardEl;
  }

  function fmtEur(v) { return `€${Math.abs(v).toFixed(2)}`; }
  function fmtSlot(slot, simMinute) {
    const totalMin = (Math.round(simMinute) + slot * DT_MIN) % 1440;
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function renderChargePlanCard(simMinute, lang, weather, strategy) {
    const el = ensureCard();
    if (!el) return;
    const previousCost = el.querySelector("[data-plan-cost]")?.textContent;
    const previousSaving = el.querySelector("[data-plan-saving]")?.textContent;
    const plan = session.lastPlan;
    const zh = lang !== "en";
    if (weather === "storm" || weather === "snow") {
      el.innerHTML = `<small>EV CHARGING PLAN · WEATHER GUARD</small><strong>${zh ? "关键负荷备电优先" : "Essential reserve first"}</strong><div class="charge-plan-note">${weather === "storm"
        ? (zh ? "雷暴情景：车充暂停；模拟 LP 车充计划不下发。" : "Storm scenario: EV charging paused; the demo LP plan is not executed.")
        : (zh ? "降雪情景：车充限功率；常态 LP 车充计划暂不执行。" : "Snow scenario: EV power limited; the normal LP charging plan is paused.")}</div>`;
      return;
    }
    if (strategy !== "auto") {
      el.innerHTML = `<small>EV CHARGING PLAN · STANDBY</small><strong>${zh ? "滚动 LP 未接管" : "Rolling LP not active"}</strong><div class="charge-plan-note">${zh ? "当前为自发自用 / 备电 / 手动策略；本卡不展示未执行的 LP 车充收益。" : "Self-consumption, backup or manual mode is active; this card does not claim unexecuted LP savings."}</div>`;
      return;
    }
    if (!plan || !session.enabled) {
      el.innerHTML = `<small>EV CHARGING PLAN</small><strong>${zh ? "计划求解中…" : "Solving schedule…"}</strong>`;
      return;
    }
    const evKwh = plan.evEnergyKwh ?? 0;
    if (evKwh < 1e-3) {
      // 会话已满足
      el.innerHTML = `
        <small>EV CHARGING PLAN · ${zh ? "目标已达成" : "TARGET MET"}</small>
        <strong>${zh ? "电池电量已达标" : "Battery at target"}</strong>
        <div><span>${zh ? "下次出发" : "Next departure"} <b>${String(session.departHour).padStart(2, "0")}:00</b></span></div>`;
      return;
    }
    const finishSlot = plan.finishSlot;
    const finishTxt = finishSlot >= 0 ? fmtSlot(finishSlot, simMinute) : (zh ? "窗口内" : "in window");
    const save = plan.naiveCostEur - plan.evCostEur;
    const rangeKm = Math.round(evKwh * 6.2); // Model 3 ≈ 6.2 km/kWh
    const green = Math.round((plan.greenShare ?? 0) * 100);
    const nowEvKw = plan.plan[0]?.evKw ?? 0;
    // 首槽 0 功率 = LP 决定等待低价窗（数学最优但需人话解释）
    const waiting = nowEvKw < 0.05;
    const nextChargeSlot = plan.plan.findIndex((s) => s.evKw > 0.05);
    const nextTxt = waiting && nextChargeSlot > 0 ? fmtSlot(nextChargeSlot, simMinute) : "";
    el.innerHTML = `
      <small>EV CHARGING PLAN · LP OPTIMIZED</small>
      <strong>${waiting
        ? (zh ? `等待低价窗 · 约 ${nextTxt} 开始` : `Waiting for off-peak · from ~${nextTxt}`)
        : (zh ? `目标 ${session.targetSocPct}% · 出发 ${String(session.departHour).padStart(2, "0")}:00` : `Target ${session.targetSocPct}% · Depart ${String(session.departHour).padStart(2, "0")}:00`)}</strong>
      <div class="charge-plan-rows">
        <span>${zh ? "预计完成" : "Ready by"} <b>${finishTxt}</b></span>
        <span>${zh ? "本夜成本" : "Tonight"} <b data-plan-cost>${plan.evCostEur < -0.005 ? zh ? "倒赚 " + fmtEur(plan.evCostEur) : "earns " + fmtEur(plan.evCostEur) : fmtEur(plan.evCostEur)}</b></span>
        <span>${zh ? "无脑充对照" : "Charge-now"} <b>${fmtEur(plan.naiveCostEur)}</b></span>
        <span>${zh ? "智能调度省" : "LP saves"} <b class="is-save" data-plan-saving>${fmtEur(save)}</b></span>
        <span>${zh ? "补能" : "Energy"} <b>${evKwh.toFixed(1)} kWh ≈ ${rangeKm} km</b></span>
        <span>${zh ? "绿电占比" : "Green share"} <b>${green}%</b></span>
        <span>${zh ? "当前功率" : "Now"} <b>${nowEvKw.toFixed(1)} kW</b></span>
      </div>
      <div class="charge-plan-note">${zh ? "6 小时演示 · 模拟循环成本 €0.02/kWh · 负价只充不卖" : "6-hour demo · assumed cycling cost €0.02/kWh · no negative-price export"}</div>`;
    if (!motionPreference.matches && !document.hidden) {
      const cost = el.querySelector("[data-plan-cost]");
      const saving = el.querySelector("[data-plan-saving]");
      if (previousCost && cost?.textContent !== previousCost) cost.classList.add("discrete-value-enter");
      if (previousSaving && saving?.textContent !== previousSaving) saving.classList.add("discrete-value-enter");
    }
  }

  /* ---------- 对外钩子：app.js 在 simulationTick / updateSimulationUI 调用 ---------- */
  window.EnergySession = {
    session,
    price15ForMinute,
    solveIfDue,
    getCurrentPlan: () => session.lastPlan,
    getLatestEvidence: () => copyEvidence(evidenceLog.at(-1)),
    getEvidenceById: (id) => copyEvidence(evidenceLog.find((entry) => entry.id === id)),
    getEvidenceLog: (limit = EVIDENCE_LIMIT) => evidenceLog.slice(-Math.max(1, Math.min(EVIDENCE_LIMIT, limit))).map(copyEvidence),
    compareExtraCharge,
    compareNoAction,
    invalidate,
    renderChargePlanCard,
    EV_PMAX_KW
  };
})();
