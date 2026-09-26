/* Browser-only simulated cash-flow ledger. It is not the Anker simulator's
 * R_settled endpoint or an official saving_settled_percent calculation. */
(() => {
  "use strict";

  function createLedger() {
    let baselineCost = 0;
    let purchaseCost = 0;
    let saleIncome = 0;
    let dayRevenue = 0;
    let elapsedMinutes = 0;
    let dayIndex = 0;

    function snapshot() {
      return {
        cumulativeRevenue: baselineCost - purchaseCost + saleIncome,
        settledRevenue: null,
        baselineCost,
        purchaseCost,
        saleIncome,
        dayRevenue,
        elapsedMinutes,
        dayIndex
      };
    }

    function reset() {
      baselineCost = 0;
      purchaseCost = 0;
      saleIncome = 0;
      dayRevenue = 0;
      elapsedMinutes = 0;
      dayIndex = 0;
      return snapshot();
    }

    function accrue(metrics, startMinute, deltaMinutes, priceForMinute) {
      if (!Number.isFinite(metrics?.load) || !Number.isFinite(metrics?.grid) ||
          !Number.isFinite(startMinute) || !Number.isFinite(deltaMinutes) ||
          deltaMinutes <= 0 || typeof priceForMinute !== "function") return snapshot();

      let minute = ((startMinute % 1440) + 1440) % 1440;
      let remaining = deltaMinutes;
      while (remaining > 1e-8) {
        const segment = Math.min(remaining, 15 - (minute % 15), 1440 - minute);
        const price = Number(priceForMinute(minute));
        if (!Number.isFinite(price)) return snapshot();
        const hours = segment / 60;
        const baselinePart = Math.max(0, metrics.load) * price * hours;
        const purchasePart = Math.max(0, metrics.grid) * price * hours;
        const salePart = Math.max(0, -metrics.grid) * price * hours;
        baselineCost += baselinePart;
        purchaseCost += purchasePart;
        saleIncome += salePart;
        dayRevenue += baselinePart - purchasePart + salePart;
        elapsedMinutes += segment;
        remaining -= segment;
        minute += segment;
        if (minute >= 1440 - 1e-8) {
          minute = 0;
          dayIndex += 1;
          dayRevenue = 0;
        }
      }
      return snapshot();
    }

    return { accrue, snapshot, reset };
  }

  const api = { createLedger };
  if (typeof window !== "undefined") window.SimulatedRevenueLedger = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
