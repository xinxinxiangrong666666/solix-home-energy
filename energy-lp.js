/* energy-lp.js — 浏览器端 LP 调度核
 * 移植自 Anker_ChargingAndEnergyStorage/energy_brain（Python + scipy/HiGHS）
 *
 * 模型（与 energy_brain/Controller.py 逐项对应，另加第 7 个变量 p_ev）：
 *   每 15min 时隙 7 变量 [p_ch, p_dis, p_imp, p_exp, e, p_cur, p_ev]
 *     充电   放电    买电    卖电   存量  弃光   车充
 *   min  Σ_t ((p_imp − p_exp)·price[t] + optionalCycleCost·(p_ch+p_dis)/2)·Δt
 *   s.t. 平衡:  p_dis + p_imp − p_ch − p_exp − p_cur − p_ev = load[t] − pv[t]
 *        SOC:   e[t] − e[t−1] − η·Δt·p_ch + Δt·p_dis = 0      (e[−1] = e0, η=0.95)
 *        界:    0 ≤ p_ch ≤ Pch; 0 ≤ p_dis ≤ Pdis; 0 ≤ p_imp,p_exp ≤ Pgrid
 *               0 ≤ e ≤ E;      0 ≤ p_cur ≤ pv[t]; 0 ≤ p_ev ≤ Pev
 *        负价:  price[t] < 0 ⇒ p_dis[t] = p_exp[t] = 0（只充不卖，硬约束）
 *        终端:  e[H−1] ≥ floor·E
 *        车会话: Σ_{t<departSlot} p_ev[t]·Δt ≥ evNeedKwh（出发前必须充够）
 *
 * 求解: 两阶段单纯形法（Dantzig 进入 + Bland 防退化回退），H=24 时隙×7 变量。
 * 交叉验证: energy-lp.test.js(JS) vs energy-lp.test.py(scipy·HiGHS) 同输入对照。
 */
(function (global) {
  "use strict";

  const DT_H = 0.25; // 15min = 0.25h
  const API = { planHorizon, simplexStandard, DT_H };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.EnergyLP = API;

  /* ================= 标准型两阶段单纯形法 =================
   * min c·x  s.t. A x = b (调用前保证 b≥0), x ≥ 0
   * 上界已由调用方转成 "x + s = u" 行。 */
  function simplexStandard(c, A, b, maxIter) {
    const m = A.length;
    const n = c.length;
    const total = n + m; // 原变量 + 每行人工变量
    maxIter = maxIter || 60000;

    // 构建初始 tableau：A | I | b
    const T = new Array(m);
    for (let i = 0; i < m; i++) {
      const row = new Float64Array(total + 1);
      row.set(A[i], 0);
      row[n + i] = 1;
      row[total] = b[i];
      T[i] = row;
    }
    const basis = new Int32Array(m);
    for (let i = 0; i < m; i++) basis[i] = n + i;
    const inBasis = new Uint8Array(total);
    for (let i = 0; i < m; i++) inBasis[basis[i]] = 1;

    function pivot(pr, pc) {
      const prow = T[pr];
      const piv = prow[pc];
      for (let j = 0; j <= total; j++) prow[j] /= piv;
      for (let i = 0; i < m; i++) {
        if (i === pr) continue;
        const row = T[i];
        const f = row[pc];
        if (f !== 0) {
          for (let j = 0; j <= total; j++) row[j] -= f * prow[j];
        }
      }
      inBasis[basis[pr]] = 0;
      basis[pr] = pc;
      inBasis[pc] = 1;
    }

    // 一阶段通用循环。allowed[j]=1 表示 j 可入基。
    function runPhase(cost, allowed, useBlandOnly) {
      for (let iter = 0; iter < maxIter; iter++) {
        // 选进入列
        let enter = -1;
        let bestD = -1e-9;
        if (!useBlandOnly) {
          // Dantzig: 最负检验数（遍历完才确定，不能提前锁死）
          for (let j = 0; j < n; j++) { // Phase2 中人工列不允许（allowed 只到 n）
            if (!allowed[j] || inBasis[j]) continue;
            let d = cost[j];
            for (let i = 0; i < m; i++) d -= cost[basis[i]] * T[i][j];
            if (d < bestD) { bestD = d; enter = j; }
          }
          if (enter < 0) bestD = -1e-9; // Dantzig 无候选 → 落入 Bland 确认最优
        }
        if (enter < 0) {
          // Bland: 最小下标（防退化；或 Dantzig 找不到时确认最优）
          for (let j = 0; j < n; j++) {
            if (!allowed[j] || inBasis[j]) continue;
            let d = cost[j];
            for (let i = 0; i < m; i++) d -= cost[basis[i]] * T[i][j];
            if (d < -1e-9) { enter = j; break; }
          }
          if (enter < 0) return "optimal";
        }
        // 比值检验选离基行（优先移出人工变量 → 其次最小下标）
        let leave = -1, bestRatio = Infinity;
        for (let i = 0; i < m; i++) {
          const a = T[i][enter];
          if (a > 1e-11) {
            const ratio = T[i][total] / a;
            if (ratio < bestRatio - 1e-12) { bestRatio = ratio; leave = i; }
            else if (ratio < bestRatio + 1e-12) {
              // 平 tie：优先人工变量，其次小 basis 下标
              const curIsArt = basis[leave] >= n;
              const newIsArt = basis[i] >= n;
              if ((newIsArt && !curIsArt) || (newIsArt === curIsArt && basis[i] < basis[leave])) leave = i;
            }
          }
        }
        if (leave < 0) return "unbounded";
        pivot(leave, enter);
      }
      return "maxiter";
    }

    // ---- Phase 1: min Σ artificial ----
    const cost1 = new Float64Array(total);
    for (let i = 0; i < m; i++) cost1[n + i] = 1;
    const allowed1 = new Uint8Array(total).fill(1);
    let s1 = runPhase(cost1, allowed1, false);
    if (s1 !== "optimal") return { ok: false, reason: "phase1:" + s1 };

    // Phase1 目标值 = Σ artificial 基值
    let p1 = 0;
    for (let i = 0; i < m; i++) if (basis[i] >= n) p1 += T[i][total];
    if (p1 > 1e-7) return { ok: false, reason: "infeasible" };

    // 把仍在本基中的人工变量（值为0）转出基
    for (let i = 0; i < m; i++) {
      if (basis[i] >= n) {
        for (let j = 0; j < n; j++) {
          if (Math.abs(T[i][j]) > 1e-9) { pivot(i, j); break; }
        }
      }
    }

    // ---- Phase 2: 真目标，人工列禁入 ----
    const allowed2 = new Uint8Array(total);
    for (let j = 0; j < n; j++) allowed2[j] = 1;
    let s2 = runPhase(c, allowed2, false);
    if (s2 !== "optimal") return { ok: false, reason: "phase2:" + s2 };

    const x = new Float64Array(n);
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = Math.max(0, T[i][total]);
    let obj = 0;
    for (let j = 0; j < n; j++) obj += c[j] * x[j];
    return { ok: true, x, obj };
  }

  /* ================= LP 构建 + 求解 =================
   * input = {
   *   price[], pv[], load[]: 长度 H 的预测（kW / €·kWh⁻¹）
   *   capacityKwh, pChargeMaxKw, pDischargeMaxKw, pGridMaxKw, pEvMaxKw
   *   soc: 0..1（家庭电池当前 SOC）
   *   terminalSocFloor: 0..1
   *   departSlot: EV 必须在此槽位前充完（默认 H = 窗口内任意时段）
   *   evNeedKwh: 本会话还需充入的电量
   * }
   * 返回 { status, plan[], costEur(电费), objectiveEur(含可选循环成本), evCostEur, naiveCostEur, finishSlot, greenShare } */
  function planHorizon(input) {
    const H = Math.min(input.price.length, 32);
    const dt = DT_H;
    const eta = input.efficiency ?? 0.95;
    const E = input.capacityKwh;
    const Pch = input.pChargeMaxKw ?? 2.0;
    const Pdis = input.pDischargeMaxKw ?? 2.0;
    const Pgrid = input.pGridMaxKw ?? 12;
    const Pev = input.pEvMaxKw ?? 7.4;
    const tie = 1e-5;
    const cycleCost = Math.max(0, input.cycleCostEurPerKwh ?? 0);
    const e0 = Math.max(0, Math.min(1, input.soc ?? 0.5)) * E;
    const floorFrac = input.terminalSocFloor ?? 0;
    const departSlot = Math.max(1, Math.min(H, input.departSlot ?? H));
    // 车会话需求上限 = 物理可达上限（防 infeasible）
    const evNeed = Math.min(input.evNeedKwh ?? 0, Pev * departSlot * dt);

    const V = 7;                       // 每槽 7 变量
    const nCore = V * H;               // 决策变量数
    const minFirstCharge = Math.max(0, input.firstSlotMinChargeKw ?? 0);
    const shadowRows = minFirstCharge > 1e-8 ? 1 : 0;
    const n = nCore + nCore + 2 + shadowRows;       // + 上界松弛 + 会话/终端松弛 + 可选影子约束
    const nRows = 2 * H + 7 * H + 2 + shadowRows;

    const c = new Float64Array(n);
    const rows = new Array(nRows);
    for (let i = 0; i < nRows; i++) rows[i] = new Float64Array(n);
    const b = new Float64Array(nRows);
    const SLACK0 = nCore; // 上界松弛变量起始下标

    const price = input.price, pv = input.pv, load = input.load;

    for (let t = 0; t < H; t++) {
      const k = t * V;
      const neg = price[t] < 0;

      /* ---- 目标 ---- */
      // Demo uses one synthetic tariff for buy and sell. A tiny, symmetric
      // tie-break makes simultaneous import/export strictly worse while leaving
      // the displayed bill (computed below without ties) unchanged.
      c[k + 2] = (price[t] + tie) * dt;
      c[k + 3] = (-price[t] + tie) * dt;
      c[k + 0] = (cycleCost * 0.5 + tie) * dt; // optional demo cycle cost; default zero preserves the reference model
      c[k + 1] = (cycleCost * 0.5 + tie) * dt;

      /* ---- 平衡行（等式）: p_dis + p_imp − p_ch − p_exp − p_cur − p_ev = load − pv ---- */
      let r = rows[t];
      r[k + 0] = -1; r[k + 1] = 1; r[k + 2] = 1; r[k + 3] = -1; r[k + 4] = 0; r[k + 5] = -1; r[k + 6] = -1;
      b[t] = load[t] - pv[t];

      /* ---- SOC 行（等式）: e[t] − e[t−1] − η·dt·p_ch + dt·p_dis = (t==0 ? e0 : 0) ---- */
      r = rows[H + t];
      r[k + 4] = 1;
      r[k + 0] = -eta * dt;
      r[k + 1] = dt;
      if (t > 0) r[(t - 1) * V + 4] = -1;
      else b[H + t] = e0;

      /* ---- 上界行（7 条）: var + slack = ub ---- */
      const ubv = [
        t === 0 && Number.isFinite(input.firstSlotMaxChargeKw) ? Math.min(Pch, Math.max(0, input.firstSlotMaxChargeKw)) : Pch,
        neg ? 0 : t === 0 && Number.isFinite(input.firstSlotMaxDischargeKw) ? Math.min(Pdis, Math.max(0, input.firstSlotMaxDischargeKw)) : Pdis,
        Pgrid, neg ? 0 : Pgrid, E, Math.max(pv[t], 0), Pev
      ];
      for (let v = 0; v < V; v++) {
        const rowIdx = 2 * H + t * V + v;
        const rr = rows[rowIdx];
        rr[k + v] = 1;
        rr[SLACK0 + t * V + v] = 1;
        b[rowIdx] = ubv[v];
      }
    }

    /* ---- 车会话行: Σ_{t<departSlot} p_ev·dt − s = evNeed ---- */
    const rowSess = 9 * H;
    for (let t = 0; t < departSlot; t++) rows[rowSess][t * V + 6] = dt;
    rows[rowSess][nCore + nCore] = -1;
    b[rowSess] = evNeed;

    /* ---- 终端 SOC 行: e[H−1] − s = floor·E ---- */
    const rowFloor = 9 * H + 1;
    rows[rowFloor][(H - 1) * V + 4] = 1;
    rows[rowFloor][nCore + nCore + 1] = -1;
    b[rowFloor] = floorFrac * E;

    if (shadowRows) {
      // Same objective and forecasts, one counterfactual constraint:
      // force at least this much charging in the current 15-minute slot.
      const rowShadow = 9 * H + 2;
      rows[rowShadow][0] = 1;
      rows[rowShadow][nCore + nCore + 2] = -1;
      b[rowShadow] = minFirstCharge;
    }

    /* ---- 平衡行 rhs 可能为负（光伏过剩）→ 翻转行保证 b≥0 ---- */
    for (let i = 0; i < nRows; i++) {
      if (b[i] < 0) {
        const rr = rows[i];
        for (let j = 0; j < n; j++) rr[j] = -rr[j];
        b[i] = -b[i];
      }
    }

    const t0 = performance.now();
    const res = simplexStandard(c, rows, Array.from(b), 80000);
    const solveMs = performance.now() - t0;

    if (!res.ok) {
      return { status: res.reason, plan: [], costEur: NaN, evCostEur: NaN, naiveCostEur: NaN, finishSlot: -1, greenShare: 0, solveMs };
    }

    /* ---- 提取计划 ---- */
    const x = res.x;
    const plan = [];
    let evEnergy = 0, costEcon = 0, evCost = 0, greenKwh = 0;
    let finishSlot = -1;
    for (let t = 0; t < H; t++) {
      const k = t * V;
      const slot = {
        chargeKw: x[k + 0], dischargeKw: x[k + 1],
        importKw: x[k + 2], exportKw: x[k + 3],
        energyKwh: x[k + 4], curtailKw: x[k + 5], evKw: x[k + 6]
      };
      plan.push(slot);
      costEcon += (slot.importKw - slot.exportKw) * price[t] * dt;
      evCost += slot.evKw * price[t] * dt;
      evEnergy += slot.evKw * dt;
      if (finishSlot < 0 && evEnergy >= evNeed - 1e-4 && evNeed > 1e-6) finishSlot = t;
      // 绿电份额（近似口径）：本槽 EV 消耗中被"光伏过剩"覆盖的部分
      const surplus = Math.max(0, pv[t] - load[t]);
      greenKwh += Math.min(slot.evKw, surplus) * dt;
    }
    if (evNeed <= 1e-6) finishSlot = -2; // -2 = 已达标/无需充电

    /* ---- 朴素对照：现在就全功率充到目标（多数 wallbox 的默认行为） ---- */
    let naiveCost = 0, naiveLeft = evNeed;
    for (let t = 0; t < departSlot && naiveLeft > 1e-6; t++) {
      const p = Math.min(Pev, naiveLeft / dt);
      naiveCost += p * price[t] * dt;
      naiveLeft -= p * dt;
    }

    return {
      status: "ok", plan, costEur: costEcon, objectiveEur: res.obj, evCostEur: evCost,
      naiveCostEur: naiveCost, finishSlot, evEnergyKwh: evEnergy,
      greenShare: evEnergy > 1e-6 ? Math.min(1, greenKwh / evEnergy) : 0,
      solveMs
    };
  }

  return { planHorizon, simplexStandard, DT_H };
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = (typeof window !== "undefined" ? window : globalThis).EnergyLP;
