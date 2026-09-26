(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const formatPower = (kw) => `${Math.abs(kw).toFixed(2)} kW`;
  const STORAGE_KEY = "every-kwh-home-lab-v3";
  const LANGUAGE_KEY = "solix-home-language-v1";
  const readingMotionPreference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
  const readingStates = new WeakMap();

  function setLiveReading(selector, value) {
    const element = $(selector);
    if (!element) return;
    const next = String(value);
    let reading = readingStates.get(element);
    if (!reading) {
      reading = { value: next, animation: null };
      readingStates.set(element, reading);
      element.textContent = next;
      return;
    }
    if (reading.value === next) return;
    reading.value = next;
    reading.animation?.cancel();
    // One DOM value at a time: the prior two-face swap visibly overprinted
    // large digits when both faces crossed at mid-animation.
    element.textContent = next;
    reading.animation = null;
    if (!readingMotionPreference.matches && !document.hidden && !element.closest("[hidden]") && element.animate) {
      reading.animation = element.animate(
        [{ opacity: 0.62, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 280, easing: "cubic-bezier(.16,1,.3,1)" }
      );
    }
  }

  const staticEnglish = {
    "跳到主要内容": "Skip to main content",
    "产品体验": "Experience",
    "3D 能源空间": "3D Energy Space",
    "智能管理": "Smart Control",
    "安全保障": "Safety",
    "技术支持": "Technology",
    "探索能源空间": "Explore Energy Space",
    "本地控制，开放生态，让家庭能源安静地为你工作。": "Local control and an open ecosystem, quietly working for your home.",
    "体验能源空间": "Explore the energy space",
    "让每一度电": "Make every kilowatt-hour",
    "都有依据。": "accountable.",
    "读懂电价、天气、光伏与家庭节奏。用本地控制持续平衡每一度电，并把每一次充放电的原因讲清楚。": "Understand tariffs, weather, solar and the rhythm of home. Balance every kilowatt-hour locally and explain every charge and discharge.",
    "查看工作原理": "See how it works",
    "一个会思考、会解释、会省钱的家庭能源系统。它理解电价、光伏、家庭负荷与电池状态，通过本地 Home Assistant 通道持续平衡每一度电。": "A home energy system that thinks, explains and saves. It balances tariffs, solar, household demand and battery state through a local Home Assistant connection.",
    "让家庭敢把控制权交出去。确定性优化负责充放电，独立安全层守住边界，AI 只负责把每一步决定讲清楚。": "Give households a reason to trust automation. Deterministic optimization plans charging, an independent safety layer sets the limits, and AI explains each decision.",
    "进入 3D 家庭": "Enter the 3D Home",
    "了解智能管理": "How It Thinks",
    "本地安全控制": "Secure local control",
    "实时能源模拟": "Live energy simulation",
    "前瞻能源计划": "look-ahead plan",
    "当前演示窗口": "current demo horizon",
    "站点目标": "site target",
    "滚动决策": "rolling decisions",
    "只读": "Read-only",
    "AI 不下发功率": "AI never sends power commands",
    "本地模拟决策": "Local simulated decisions",
    "关键负荷优先约束": "Essential-load reserve",
    "滚动决策粒度": "rolling interval",
    "家庭数据私域运行": "private home data",
    "交互体验采用本地模拟数据，不连接真实家庭设备。": "This interactive experience uses local simulated data and does not connect to real household equipment.",
    "本地连接": "Local connection",
    "官方通道": "Official channel",
    "Home Assistant 接口设计": "Home Assistant adapter design",
    "设备协同": "Device orchestration",
    "决策透明": "Transparent decisions",
    "安全接管": "Safe handover",
    "Home Assistant 控制": "Home Assistant control",
    "光伏、电池与家庭负荷": "Solar, battery and home loads",
    "每个动作都有依据": "Evidence behind every action",
    "保守、隔离、人工控制": "Guard, isolate, manual control",
    "把复杂的家庭能源，": "Turn complex home energy",
    "变成一个清楚的决定。": "into one clear decision.",
    "系统先保证家庭安全，再决定什么时候充电、什么时候放电、什么时候保持安静。用户看到的不是算法名词，而是现在发生了什么，以及为什么。": "The system protects the home first, then decides when to charge, discharge or stay quiet. People see what is happening and why — not algorithm jargon.",
    "前瞻计划": "look-ahead plan",
    "滚动更新": "rolling update",
    "家庭数据留在本地": "home data stays local",
    "了解智能管理": "Learn about smart control",
    "不是更多曲线，": "Not more charts,",
    "是更清楚的决定。": "but clearer decisions.",
    "不用猜，": "No need to guess.",
    "它会告诉你为什么。": "It tells you why.",
    "先回答“现在发生什么”，再解释“为什么这样做”，最后说明“是否安全、能否随时接管”。复杂能力只服务于一个目标：让家庭放心。": "See what is happening, understand why, and know whether it is safe and ready for manual control. Every complex capability serves one goal: confidence at home.",
    "首页先回答“现在发生什么”，再说明“为什么这样做”，最后告诉你“当前是否安全、能否随时接管”。复杂能力始终服务于清楚的家庭结果。": "First see what is happening, then why it is happening, and finally whether it is safe and controllable. Complexity stays behind clear household outcomes.",
    "会思考": "Think",
    "会解释": "Explain",
    "会省钱": "Save",
    "会降级": "Fail safely",
    "看见未来，只执行现在。": "See the future. Execute only now.",
    "读取动态电价、光伏、家庭负荷、SOC 与设备状态，规划未来 24 小时，但每次只执行当前时间步，并持续用最新实测滚动重算。": "Plan the next 24 hours from tariffs, solar, demand, SOC and device state — while executing only the current interval and replanning from fresh measurements.",
    "光伏、电池和家庭设备依据实时状态协同运行": "Solar, battery and devices coordinate from live state",
    "效率、功率、SOC 与风险缓冲进入同一约束": "Efficiency, power, SOC and risk share one constraint model",
    "预测不确定时自动提高收益门槛": "Uncertainty automatically raises the action threshold",
    "从客厅到车位，": "From living room to driveway,",
    "让能源决策看得见。": "make energy decisions visible.",
    "自由布置真实尺度家具，切换晴天、阴雨、雷暴、降雪和夜间场景；AI 会同步调整光伏预测、家庭备电与电车充电，并说明每一次取舍。": "Arrange true-scale furniture and switch between sun, rain, storms, snow and night. The system adapts solar forecasts, home reserve and EV charging — and explains every trade-off.",
    "自由布置真实尺度家具，切换晴天、阴雨、雷暴、降雪与夜间场景；滚动优化器调整电池和车充，安全约束优先，解释层回答“为什么”。": "Arrange true-scale furniture and switch between sun, rain, storms, snow and night. A rolling optimizer plans battery and EV charging, safety constraints take priority, and the explanation layer answers why.",
    "场景": "Scenario",
    "模拟时间": "Simulation time",
    "数据更新时间": "Updated",
    "暂停模拟": "Pause",
    "速度": "Speed",
    "实时": "Real time",
    "家庭与车充能源孪生": "Home + EV Energy Twin",
    "住宅 A · 阳台储能": "Home A · Balcony solar",
    "住宅 B · 多云负荷": "Home B · Cloudy load",
    "住宅 C · 低光伏": "Home C · Lower solar",
    "用户原话 → 约束名 → 演示实现状态": "Household request → Constraint → Demo status",
    "用户原话": "Household request",
    "约束名": "Constraint",
    "演示实现状态": "Demo status",
    "“夜里充电要安静”": "“Charge quietly at night”",
    "“冰箱别停”": "“Keep the fridge running”",
    "“负电价不倒贴卖电”": "“Do not pay to export”",
    "“出发前要给车补足电”": "“Charge the car before departure”",
    "“电池别来回折腾”": "“Avoid needless cycling”",
    "方案目标；网页 LP 尚未施加额外夜间功率上限": "Target capability; this web LP has no extra nighttime power cap yet",
    "演示 LP 约束末格存量；单户执行端逐格限制放电": "Demo LP constrains terminal energy; the single-home execution view clamps discharge each slot",
    "出发前 Σ p": "Before departure Σ p",
    "·Δt ≥ 会话需求电量": "·Δt ≥ required session energy",
    "演示目标含 €0.02/kWh 循环成本假设，非官方参数": "Demo objective assumes €0.02/kWh cycling cost; not an official parameter",
    "6h 滚动动作计划 ·": "6h rolling action plan ·",
    "24 个 15 分钟格 · 绿=充电 · 蓝=放电 · 灰=不动": "24 × 15-min slots · green charge · blue discharge · gray hold",
    "光伏": "Solar",
    "电网": "Grid",
    "电池": "Battery",
    "晴朗": "Clear",
    "多云": "Cloudy",
    "雨天": "Rain",
    "雷暴": "Storm",
    "降雪": "Snow",
    "夜间": "Night",
    "能源全景": "Energy site",
    "室内空间": "Interior",
    "室外车充": "EV charging",
    "产品特写": "Product",
    "俯视布置": "Layout",
    "重置布局": "Reset",
    "已选择": "Selected",
    "未选择": "None",
    "车充": "EV",
    "空白拖动旋转 · 物体拖动布置 · 滚轮缩放 · 选中后可旋转": "Drag empty space to orbit · drag objects to arrange · wheel to zoom · select to rotate",
    "此刻，电从哪里来": "Where power comes from now",
    "模拟数据": "SIMULATED",
    "家庭负荷": "Home load",
    "光伏发电": "Solar output",
    "电池功率": "Battery power",
    "电网交换": "Grid exchange",
    "车辆充电": "EV charging",
    "电池状态": "Battery state",
    "模拟容量": "simulated capacity",
    "7.0 kWh 模拟容量": "7.0 kWh simulated capacity",
    "运行策略": "Operating strategy",
    "智能优化": "Smart optimize",
    "滚动优化": "Rolling optimizer",
    "自发自用": "Self-consumption",
    "备电优先": "Backup first",
    "手动": "Manual",
    "最近 120 分钟": "Last 120 minutes",
    "负荷": "Load",
    "优化器掌舵，AI 负责解释": "Optimizer drives. AI explains.",
    "感知": "Sense",
    "预测": "Forecast",
    "优化": "Optimize",
    "安全": "Guard",
    "解释": "Explain",
    "预测置信度": "Forecast confidence",
    "光伏情景系数": "Solar scenario factor",
    "备电目标": "Reserve target",
    "车充策略": "EV policy",
    "车充状态": "EV charging state",
    "计划计算中": "Planning",
    "光伏优先": "Solar first",
    "当前为什么这样做？": "Why this action now?",
    "为什么不多充？": "Why not charge more?",
    "自由配置你的家庭": "Configure your home",
    "设备启停、负载比例、优先级与空间位置会立即进入能源平衡；车辆充电会随天气和电价自动移峰。": "Device state, utilization, priority and spatial placement feed the live balance. EV charging shifts automatically with weather and tariffs.",
    "添加设备": "Add device",
    "导出配置": "Export setup",
    "恢复默认": "Restore defaults",
    "这个家庭还没有用电设备": "No devices in this home yet",
    "添加冰箱、路由器、洗衣机或自定义设备，开始观察能源流。": "Add a fridge, router, washer or custom device to start observing energy flow.",
    "添加第一台设备": "Add first device",
    "复杂留在系统里，": "Keep complexity in the system,",
    "答案留给普通人。": "leave answers for people.",
    "控制链严格区分决策、执行与解释。大模型不能调用设备控制工具，反事实只在影子环境中运行。": "Decision, execution and explanation remain strictly separated. The language model cannot call device controls, and counterfactuals run only in a shadow environment.",
    "感知": "Sense",
    "电价、光伏、负荷、SOC、设备状态与数据新鲜度。": "Tariff, solar, demand, SOC, device state and data freshness.",
    "预测": "Forecast",
    "物理光伏基线、家庭负荷模式与置信区间。": "Physical solar baseline, household demand patterns and confidence ranges.",
    "决策": "Decide",
    "带效率、功率、吞吐和风险缓冲的滚动优化。": "Rolling optimization with efficiency, power, throughput and risk buffers.",
    "执行": "Execute",
    "本地 HA 通道、设备状态管理与实际功率验证。": "Local HA channel, device state machine and delivered-power verification.",
    "结构化日志、约束证据与不影响设备的影子重算。": "Structured logs, constraint evidence and no-impact shadow recomputation.",
    "家庭输入": "Home inputs",
    "光伏 / 电价 / 智能电表": "Solar / Tariff / Smart meter",
    "决策核心": "Decision core",
    "滚动优化 + 安全层": "Rolling optimizer + Safety layer",
    "本地通道": "Local channel",
    "家庭执行": "Home execution",
    "电池与可控设备": "Battery and controllable devices",
    "不是“永不出错”，": "Not ‘never fail’,",
    "而是出错时不失控。": "but fail without losing control.",
    "任何预测、模型或网络都可能失败。安全层在优化器之外运行，持续判断数据是否新鲜、功率是否越界、设备是否响应，并把异常限制在单台设备。": "Forecasts, models and networks can fail. An independent safety layer checks freshness, power limits and device response, containing faults to one device.",
    "在沙盘中切换策略": "Try the strategies",
    "安全接管中": "Safe control active",
    "数据新鲜、功率未越界、家庭设备正常。": "Fresh data, power within limits and household devices responding.",
    "保守模式": "Guarded mode",
    "预测不确定，提高收益门槛，基础控制继续。": "Uncertainty raises the action threshold while baseline control continues.",
    "设备已隔离": "Device isolated",
    "异常设备暂停控制，其他家庭设备继续运行。": "The affected device pauses while the rest of the home keeps operating.",
    "人工已接管": "Manual control active",
    "自动控制暂停，保留设备原生模式，随时可恢复。": "Automation pauses, native device behavior remains, and recovery stays available.",
    "让复杂系统安静地工作，": "Let the complex system work quietly,",
    "在需要时给出证据。": "and show evidence when needed.",
    "真实设备、真实家庭、真实控制。每一次充放电，都有依据、有边界、有退路。": "Real devices, real homes, real control. Every charge and discharge has evidence, limits and a safe way back.",
    "真实家庭问题，清楚的模拟边界。目标是在官方通道验证三站控制，让每一次充放电都有依据、有边界、有退路。": "Real household problems, clearly marked simulation. The goal is verified three-site control through the official channel, with evidence and safety behind every action.",
    "Storm outside.\nLife inside.": "Storm outside.\nLife inside.",
    "Three homes, three storms, three very different days — what they share is proof behind every kilowatt-hour.": "Three homes, three storms, three very different days — what they share is proof behind every kilowatt-hour.",
    "* Illustrative user stories for demo purposes.": "* Illustrative user stories for demo purposes.",
    "重新进入家庭沙盘": "Re-enter the energy twin",
    "家庭能源交互体验页面。所有功率、价格和运行状态均为本地模拟，不连接真实家庭设备。": "Interactive home energy concept. All power, pricing and operating states are simulated locally and do not connect to real equipment.",
    "返回顶部": "Back to top",
    "添加家庭设备": "Add home device",
    "自定义设备": "Custom device",
    "设备名称": "Device name",
    "额定功率": "Rated power",
    "设备类型": "Device type",
    "优先级": "Priority",
    "关键负荷": "Essential",
    "舒适负荷": "Comfort",
    "可移峰负荷": "Flexible",
    "出行充电": "Mobility",
    "取消": "Cancel",
    "添加到家庭": "Add to home"
  };

  const tr = (zh, en) => state.lang === "en" ? en : zh;

  const iconPaths = {
    fridge: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
    router: '<rect x="4" y="10" width="16" height="8" rx="2"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 10V7m8 3V7M6 5c3-3 9-3 12 0"/>',
    washer: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 7h.01M11 7h5"/>',
    tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
    aircon: '<rect x="3" y="5" width="18" height="9" rx="2"/><path d="M7 9h10M8 17c1-2 3-2 4 0s3 2 4 0"/>',
    lamp: '<path d="M9 3h6l2 8H7l2-8ZM12 11v7M8 21h8"/>',
    cpap: '<rect x="4" y="10" width="8" height="7" rx="2"/><path d="M12 13h3c4 0 4-6 1-7-2-1-4 1-3 3M7 17v3m3-3v3"/>',
    ev: '<path d="M5 16V9l2-4h10l2 4v7M5 12h14M8 16v2m8-2v2M8 9h8"/>',
    custom: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/>'
  };

  const iconSvg = (type) => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[type] || iconPaths.custom}</svg>`;

  const presets = [
    { type: "fridge", name: "冰箱", enName: "Refrigerator", power: 110, category: "essential", priority: 1 },
    { type: "router", name: "Wi-Fi 路由器", enName: "Wi-Fi Router", power: 12, category: "essential", priority: 1 },
    { type: "washer", name: "洗衣机", enName: "Washer", power: 520, category: "flexible", priority: 3 },
    { type: "tv", name: "客厅电视", enName: "Living Room TV", power: 95, category: "comfort", priority: 2 },
    { type: "aircon", name: "空调", enName: "Air Conditioner", power: 900, category: "comfort", priority: 2 },
    { type: "lamp", name: "家庭照明", enName: "Home Lighting", power: 36, category: "essential", priority: 1 },
    { type: "cpap", name: "呼吸机", enName: "Respiratory Support", power: 45, category: "essential", priority: 1 },
    { type: "ev", name: "Tesla Model 3 车充", enName: "Tesla Model 3 Charging", power: 7400, category: "mobility", priority: 3 }
  ];

  const defaultDevices = [
    { id: "dev-fridge", type: "fridge", name: "冰箱", ratedPower: 110, category: "essential", priority: 1, utilization: 78, enabled: true },
    { id: "dev-router", type: "router", name: "Wi-Fi 路由器", ratedPower: 12, category: "essential", priority: 1, utilization: 100, enabled: true },
    { id: "dev-washer", type: "washer", name: "洗衣机", ratedPower: 520, category: "flexible", priority: 3, utilization: 42, enabled: false },
    { id: "dev-tv", type: "tv", name: "客厅电视", ratedPower: 95, category: "comfort", priority: 2, utilization: 64, enabled: true },
    { id: "dev-lamp", type: "lamp", name: "家庭照明", ratedPower: 36, category: "essential", priority: 1, utilization: 72, enabled: true },
    { id: "dev-ev", type: "ev", name: "Tesla Model 3 车充", ratedPower: 7400, category: "mobility", priority: 3, utilization: 68, enabled: true }
  ];

  const weatherProfiles = {
    clear: { zh: "晴朗", en: "Clear", solar: 1, load: 1, reserve: 35, confidence: 94, evZh: "光伏优先", evEn: "Solar first" },
    cloudy: { zh: "多云", en: "Cloudy", solar: 0.56, load: 1.03, reserve: 45, confidence: 83, evZh: "余电充车", evEn: "Surplus solar" },
    rain: { zh: "雨天", en: "Rain", solar: 0.27, load: 1.08, reserve: 60, confidence: 74, evZh: "低价补能", evEn: "Off-peak only" },
    storm: { zh: "雷暴", en: "Storm", solar: 0.08, load: 1.14, reserve: 90, confidence: 62, evZh: "暂停·家庭优先", evEn: "Paused · Home first" },
    snow: { zh: "降雪", en: "Snow", solar: 0.16, load: 1.24, reserve: 85, confidence: 67, evZh: "限功率", evEn: "Power limited" },
    night: { zh: "夜间", en: "Night", solar: 0, load: 0.96, reserve: 55, confidence: 91, evZh: "低谷充电", evEn: "Off-peak charging" }
  };

  const experienceContent = {
    think: {
      index: "01",
      title: "电价变化前，先安排好电池。",
      enTitle: "Plan storage before tariffs change.",
      copy: "系统把电价、光伏、家庭负荷和备电目标放在一起，给出当前这一步的充放电建议。这个网页用合成数据演示计划，没有连接家庭设备。",
      enCopy: "Tariffs, solar, home demand and reserve are considered together to suggest the next charging action. This website uses synthetic inputs and is not connected to household devices.",
      list: ["电池与车充使用同一套演示计划", "每次只展示当前建议与接下来的安排", "你可以切换天气和运行策略，观察变化"],
      enList: ["Battery and EV charging share one demo plan", "See the current suggestion and what comes next", "Change weather and strategy to explore the result"]
    },
    explain: {
      index: "02",
      title: "为什么现在充电？直接问它。",
      enTitle: "Why charge now? Just ask.",
      copy: "解释助手引用当前模拟计划。你可以追问为什么不多充，网页会在相同输入下重新求解，展示两种计划的差异。",
      enCopy: "The assistant cites the current simulated plan. Ask why not charge more and the website re-solves the same inputs to compare the two plans.",
      list: ["先给出一句话答案，再展开依据", "语言模型只组织文字，不决定功率", "原始计算和比较都可查看"],
      enList: ["A clear answer comes first; evidence follows", "The language model words explanations, not power decisions", "Inspect the original calculation and comparison"]
    },
    save: {
      index: "03",
      title: "价差不够，就让电池休息。",
      enTitle: "If the spread is too small, let the battery rest.",
      copy: "计划会把充放损耗和演示用循环成本算进去。账本只展示模拟对照；实际节省仍要看接入后的电表和账单。",
      enCopy: "The plan accounts for round-trip loss and an illustrative cycling cost. The ledger is a simulation; measured meters and bills are needed to verify real savings.",
      list: ["负价时不安排倒贴卖电", "没有足够价差就保持待机", "模拟金额和正式结算清楚区分"],
      enList: ["Avoid selling power at a negative export price", "Hold when the price spread is insufficient", "Keep simulated amounts separate from settled value"]
    },
    protect: {
      index: "04",
      title: "坏天气时，先留给家里用。",
      enTitle: "When weather turns, reserve energy for home.",
      copy: "雷暴和降雪情景会提高模拟备电目标，并暂停或限制车充。真实设备上的故障隔离与人工接管仍是后续接入目标。",
      enCopy: "Storm and snow scenarios raise the simulated reserve and pause or limit EV charging. Fault isolation and human takeover on real devices remain integration goals.",
      list: ["关键负荷优先获得备电", "你能看见天气为什么改变建议", "当前页面可切换策略，但不控制真机"],
      enList: ["Keep reserve for essential loads", "See why weather changed the suggestion", "Switch demo strategies without controlling hardware"]
    }
  };

  const state = {
    devices: loadDevices(),
    lang: localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh",
    weather: "clear",
    strategy: "auto",
    deckView: "power",
    simMinute: 10 * 60 + 0, /* 初始 10:00：60x 速度下有 9.5 真实分钟的白天窗口再入夜 */
    speed: 60,
    paused: false,
    soc: 62,
    manualPowerW: 0,
    selectedDeviceId: null,
    metrics: { load: 0, solar: 0, battery: 0, grid: 0, price: 0.18 },
    history: { load: [], solar: [] },
    three: null,
    threeFlows: { solar: 0, battery: 0, grid: 0, ev: 0 }
  };
  const revenueLedger = window.SimulatedRevenueLedger?.createLedger?.() || null;

  function formatEuro(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value < -0.0005 ? "−" : ""}€${Math.abs(value).toFixed(3)}`;
  }

  function renderRevenueMetrics() {
    const totals = revenueLedger?.snapshot();
    setLiveReading("#metric-revenue-total", totals ? formatEuro(totals.cumulativeRevenue) : "—");
    setLiveReading("#metric-revenue-buy", totals ? formatEuro(totals.purchaseCost) : "—");
    setLiveReading("#metric-revenue-sell", totals ? formatEuro(totals.saleIncome) : "—");
    setLiveReading("#metric-revenue-day", totals ? formatEuro(totals.dayRevenue) : "—");
    $("#metric-revenue-settled").textContent = "—";
    $("#revenue-baseline").textContent = totals ? formatEuro(totals.baselineCost) : "—";
    const minutes = Math.floor(totals?.elapsedMinutes || 0);
    $("#revenue-elapsed").textContent = state.lang === "en"
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
  }

  function renderDeckView() {
    const revenue = state.deckView === "revenue";
    const deck = $(".control-deck");
    deck.dataset.view = revenue ? "revenue" : "power";
    $("#power-grid").hidden = revenue;
    $("#revenue-grid").hidden = !revenue;
    $("#revenue-method").hidden = !revenue;
    $(".control-deck .soc-panel").hidden = revenue;
    $(".control-deck .charge-plan-host").hidden = revenue;
    $(".control-deck .live-chart-wrap").hidden = revenue;
    $("#deck-eyebrow").textContent = revenue ? "SIMULATED VALUE" : "LIVE ENERGY";
    $("#deck-title").textContent = revenue
      ? tr("收益，从哪里来", "Where the value comes from")
      : tr("此刻，电从哪里来", "Where power comes from");
    $("#deck-data-badge").textContent = revenue
      ? tr("本地估算", "Local estimate") : tr("模拟数据", "Simulated data");
    $(".deck-view-tabs").setAttribute("aria-label", tr("看板视图", "Dashboard views"));
    $$("[data-deck-view]").forEach((button) => {
      const active = button.dataset.deckView === state.deckView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    if (revenue) renderRevenueMetrics();
  }

  function initDeckView() {
    const tabs = $$("[data-deck-view]");
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => {
        state.deckView = button.dataset.deckView;
        renderDeckView();
      });
      button.addEventListener("keydown", (event) => {
        const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        state.deckView = tabs[nextIndex].dataset.deckView;
        renderDeckView();
      });
    });
    renderDeckView();
  }

  function loadDevices() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(stored) && stored.every((item) => item && typeof item.name === "string")) return stored;
    } catch (_) {
      // Keep defaults when storage is unavailable or malformed.
    }
    return defaultDevices.map((item) => ({ ...item }));
  }

  function saveDevices() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.devices));
    } catch (_) {
      showToast(tr("浏览器没有允许本地保存，本次配置仍可继续使用", "Local storage is unavailable; this session will still work"));
    }
  }

  function applyStaticLanguage() {
    document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
    document.title = state.lang === "en" ? "Anker SOLIX | Home Energy Studio" : "Anker SOLIX｜Home Energy Studio";
    /* 双语属性渲染（data-zh / data-en）：证言区等新增模块走这套机制，
     * innerHTML 是必须的——标题里含 <br> 标签 */
    $$("[data-zh]").forEach((el) => {
      const value = state.lang === "en" ? el.dataset.en : el.dataset.zh;
      if (value !== undefined && el.innerHTML !== value) el.innerHTML = value;
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE"].includes(parent.tagName)) return;
      if (parent.closest("#device-list,#preset-grid,#toast-region,#decision-evidence,#counterfactual,#agent-thread,#agent-evidence-summary,#agent-json")) return;
      if (node.__solixZhSource === undefined) node.__solixZhSource = node.nodeValue;
      const source = node.__solixZhSource;
      const trimmed = source.trim();
      if (state.lang === "en" && staticEnglish[trimmed]) {
        node.nodeValue = source.replace(trimmed, staticEnglish[trimmed]);
      } else {
        node.nodeValue = source;
      }
    });

    const toggle = $("#language-toggle");
    if (toggle) {
      const spans = $$("span", toggle);
      spans[0]?.classList.toggle("is-active", state.lang === "zh");
      spans[1]?.classList.toggle("is-active", state.lang === "en");
      toggle.setAttribute("aria-label", state.lang === "en" ? "切换到中文" : "Switch to English");
    }
    const nameInput = $("#device-name");
    if (nameInput) nameInput.placeholder = state.lang === "en" ? "e.g. Study workstation" : "例如：书房工作站";
    const canvas = $("#home-canvas");
    if (canvas) canvas.setAttribute("aria-label", state.lang === "en" ? "Interactive 3D home and EV energy scene" : "可旋转、缩放并拖动物体的家庭与车充三维能源场景");
    const pipeline = $(".ai-pipeline");
    if (pipeline) pipeline.setAttribute("aria-label", state.lang === "en" ? "How the suggestion is formed" : "建议形成过程");
    const energyLegend = $(".scene-legend");
    if (energyLegend) energyLegend.setAttribute("aria-label", state.lang === "en" ? "Energy flow legend" : "能源流图例");
    const topology = $(".scene-topology");
    if (topology) topology.setAttribute("aria-label", state.lang === "en" ? "Simulated household energy connections" : "模拟家庭能源接线与设备");
    const topologyActions = $(".scene-topology__actions");
    if (topologyActions) topologyActions.setAttribute("aria-label", state.lang === "en" ? "Focus energy equipment" : "查看能源节点");
    const productHotspot = $("#solarbank-hotspot");
    if (productHotspot) productHotspot.setAttribute("aria-label", state.lang === "en" ? "View Solarbank Max AC product detail" : "查看 Solarbank Max AC 产品特写");
    const timeline = $("#tri-timeline");
    if (timeline) timeline.setAttribute("aria-label", state.lang === "en" ? "Six-hour rolling battery charge and discharge timeline" : "未来 6 小时充电放电动作时间线");
    window.EnergyAgent?.setLanguage?.(state.lang);
    window.EnergyLLM?.paint?.();
    const navToggle = $("#nav-toggle");
    if (navToggle) {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      navToggle.setAttribute("aria-label", state.lang === "en"
        ? (isOpen ? "Close menu" : "Open menu")
        : (isOpen ? "关闭菜单" : "打开菜单"));
    }
  }

  function initLanguage() {
    applyStaticLanguage();
    $("#language-toggle").addEventListener("click", () => {
      state.lang = state.lang === "zh" ? "en" : "zh";
      try { localStorage.setItem(LANGUAGE_KEY, state.lang); } catch (_) {}
      applyStaticLanguage();
      renderPresets();
      renderDevices();
      updateSimulationUI();
      renderDeckView();
      updateExperiencePanel();
      if (window.RealisticHomeScene?.setLanguage) window.RealisticHomeScene.setLanguage(state.lang);
    });
  }

  function localizedDeviceName(device) {
    if (state.lang !== "en") return device.name;
    const preset = presets.find((item) => item.type === device.type);
    return preset?.enName || device.name;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function categoryLabel(category) {
    const zh = ({ essential: "关键负荷", comfort: "舒适负荷", flexible: "可移峰负荷", mobility: "出行充电" })[category] || "自定义设备";
    const en = ({ essential: "Essential", comfort: "Comfort", flexible: "Flexible", mobility: "Mobility" })[category] || "Custom device";
    return tr(zh, en);
  }

  function deviceActualPower(device) {
    if (!device.enabled) return 0;
    const minute = state.simMinute;
    const phase = (minute % 60) / 60 * Math.PI * 2;
    const categoryFactor = {
      essential: device.type === "fridge" ? 0.56 + Math.sin(phase) * 0.18 : 0.92,
      comfort: 0.72 + Math.sin(phase * 0.6 + 1.4) * 0.12,
      flexible: 0.78 + Math.sin(phase * 1.2) * 0.16,
      mobility: 0.96
    }[device.category] || 0.8;
    let weatherFactor = 1;
    if (device.category === "mobility") {
      const price = priceForMinute(minute);
      /* 充电会话三件套：EV 功率由 LP 调度核决策（7.4kW wallbox），不再用固定系数。
       * LP 在每 15min 时隙重解，头槽 evKw 就是"此刻应该充多少"。 */
      const lp = window.EnergySession?.session.lastPlan;
      if (lp && state.strategy === "auto" && !["storm", "snow"].includes(state.weather)) {
        // B2修复：LP 头槽决策已含天气/电价约束，这里直接取值——不再二次乘 weatherFactor/snowFactor
        return Math.max(0, (lp.plan[0]?.evKw ?? 0) * 1000);
      }
      if (state.weather === "storm") weatherFactor = 0;
      else if (state.weather === "snow") weatherFactor = 0.32;
      else if (state.strategy === "auto" && price > 0.24) weatherFactor = 0.08;
      else if (state.strategy === "backup" && state.soc < weatherProfiles[state.weather].reserve) weatherFactor = 0;
    }
    return Math.max(0, device.ratedPower * device.utilization / 100 * categoryFactor * weatherFactor);
  }

  function renderDevices() {
    window.EnergySession?.invalidate?.();
    const list = $("#device-list");
    const empty = $("#device-empty");
    if (!state.devices.length) {
      list.innerHTML = "";
      empty.hidden = false;
      sync3DDevices();
      return;
    }
    empty.hidden = true;
    list.innerHTML = state.devices.map((device) => {
      const actual = deviceActualPower(device);
      const displayName = localizedDeviceName(device);
      const selected = device.id === state.selectedDeviceId ? " is-selected" : "";
      return `
        <article class="device-row${selected}" data-device-id="${escapeHTML(device.id)}">
          <div class="device-icon">${iconSvg(device.type)}</div>
          <div class="device-info">
            <div class="device-info__title"><strong>${escapeHTML(displayName)}</strong><span>${categoryLabel(device.category)} · P${device.priority}</span></div>
            <div class="device-power-line">
              <input type="range" min="0" max="100" step="1" value="${device.utilization}" aria-label="${escapeHTML(displayName)} ${tr("负载比例", "utilization")}" data-device-range>
              <output>${Math.round(actual)} W</output>
            </div>
            <div class="device-meta">${tr("额定", "Rated")} ${device.ratedPower} W · ${tr("当前", "Now")} ${device.enabled ? tr("运行", "On") : tr("关闭", "Off")}</div>
          </div>
          <div class="device-controls">
            <label class="device-switch" aria-label="${tr("启停", "Toggle")} ${escapeHTML(displayName)}">
              <input type="checkbox" ${device.enabled ? "checked" : ""} data-device-toggle><span></span>
            </label>
            <button class="remove-device" type="button" data-device-remove>${tr("移除", "Remove")}</button>
          </div>
        </article>`;
    }).join("");

    $$(".device-row", list).forEach((row) => {
      const id = row.dataset.deviceId;
      const device = state.devices.find((item) => item.id === id);
      row.addEventListener("click", (event) => {
        if (event.target.closest("input,button,label")) return;
        state.selectedDeviceId = id;
        renderDevices();
        highlight3DDevice(id);
      });
      $("[data-device-range]", row).addEventListener("input", (event) => {
        device.utilization = Number(event.target.value);
        const output = $("output", row);
        output.textContent = `${Math.round(deviceActualPower(device))} W`;
        $(".device-meta", row).textContent = `${tr("额定", "Rated")} ${device.ratedPower} W · ${tr("当前", "Now")} ${device.enabled ? tr("运行", "On") : tr("关闭", "Off")}`;
        saveDevices();
      });
      $("[data-device-toggle]", row).addEventListener("change", (event) => {
        device.enabled = event.target.checked;
        saveDevices();
        renderDevices();
        showToast(`${localizedDeviceName(device)} ${device.enabled ? tr("已开启", "enabled") : tr("已关闭", "disabled")}`);
      });
      $("[data-device-remove]", row).addEventListener("click", () => {
        state.devices = state.devices.filter((item) => item.id !== id);
        if (state.selectedDeviceId === id) state.selectedDeviceId = null;
        saveDevices();
        renderDevices();
        showToast(`${localizedDeviceName(device)} ${tr("已从家庭中移除", "removed from the home")}`);
      });
    });
    sync3DDevices();
  }

  function addDevice(data) {
    const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    state.devices.push({
      id,
      type: data.type || "custom",
      name: data.name,
      ratedPower: Number(data.power),
      category: data.category,
      priority: Number(data.priority),
      utilization: data.category === "essential" ? 86 : 65,
      enabled: true
    });
    state.selectedDeviceId = id;
    saveDevices();
    renderDevices();
    showToast(`${state.lang === "en" ? (data.enName || data.name) : data.name} ${tr("已接入家庭能源沙盘", "added to the energy twin")}`);
  }

  function renderPresets() {
    const grid = $("#preset-grid");
    grid.innerHTML = presets.map((preset) => `
      <button class="preset-button" type="button" data-preset="${preset.type}">
        ${iconSvg(preset.type)}
        <strong>${escapeHTML(state.lang === "en" ? preset.enName : preset.name)}</strong>
        <small>${preset.power} W · ${categoryLabel(preset.category)}</small>
      </button>`).join("");
    $$("[data-preset]", grid).forEach((button) => {
      button.addEventListener("click", () => {
        const preset = presets.find((item) => item.type === button.dataset.preset);
        addDevice(preset);
        closeDeviceDialog();
      });
    });
  }

  function openDeviceDialog() {
    const dialog = $("#device-dialog");
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("is-locked");
    setTimeout(() => $("#device-name").focus(), 50);
  }

  function closeDeviceDialog() {
    const dialog = $("#device-dialog");
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-locked");
    $("#device-form").reset();
    $("#device-power").value = 120;
    clearFormErrors();
  }

  function clearFormErrors() {
    $("#device-name-error").textContent = "";
    $("#device-power-error").textContent = "";
  }

  function showToast(message) {
    const region = $("#toast-region");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 240);
    }, 2800);
  }

  function initDialog() {
    renderPresets();
    $("#open-device-dialog").addEventListener("click", openDeviceDialog);
    $$('[data-open-device]').forEach((button) => button.addEventListener("click", openDeviceDialog));
    $("#close-device-dialog").addEventListener("click", closeDeviceDialog);
    $("#cancel-device").addEventListener("click", closeDeviceDialog);
    $("#device-dialog").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeDeviceDialog();
    });
    $("#device-dialog").addEventListener("close", () => document.body.classList.remove("is-locked"));
    $("#device-form").addEventListener("submit", (event) => {
      event.preventDefault();
      clearFormErrors();
      const name = $("#device-name").value.trim();
      const power = Number($("#device-power").value);
      let valid = true;
      if (!name) {
        $("#device-name-error").textContent = tr("请填写设备名称", "Enter a device name");
        valid = false;
      }
      if (!Number.isFinite(power) || power < 1 || power > 5000) {
        $("#device-power-error").textContent = tr("功率需要在 1–5000 W 之间", "Power must be between 1 and 5000 W");
        valid = false;
      }
      if (!valid) return;
      addDevice({
        type: "custom",
        name,
        power,
        category: $("#device-category").value,
        priority: Number($("#device-priority").value)
      });
      closeDeviceDialog();
    });
  }

  function initNavigation() {
    const toggle = $("#nav-toggle");
    const links = $("#nav-links");
    const syncState = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", state.lang === "en"
        ? (open ? "Close menu" : "Open menu")
        : (open ? "关闭菜单" : "打开菜单"));
      links.classList.toggle("is-open", open);
    };
    syncState(false);
    links.classList.remove("is-open");
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      syncState(!open);
    });
    $$("a", links).forEach((link) => link.addEventListener("click", () => {
      syncState(false);
    }));
  }

  function initNavigationPresence() {
    if (!("IntersectionObserver" in window)) return;
    const header = $(".site-header");
    const hero = $("#home");
    if (header && hero) {
      const headerObserver = new IntersectionObserver(([entry]) => {
        header.classList.toggle("is-scrolled", !entry.isIntersecting);
      }, { threshold: 0.08 });
      headerObserver.observe(hero);
    }

    const navAnchors = $$("#nav-links a[href^='#']");
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      navAnchors.forEach((anchor) => {
        const active = anchor.getAttribute("href") === `#${visible.target.id}`;
        anchor.classList.toggle("is-current", active);
        if (active) anchor.setAttribute("aria-current", "page");
        else anchor.removeAttribute("aria-current");
      });
    }, { rootMargin: "-34% 0px -56% 0px", threshold: 0 });

    navAnchors.forEach((anchor) => {
      const section = $(anchor.getAttribute("href"));
      if (section) sectionObserver.observe(section);
    });
  }

  function initExperienceTabs() {
    $$(".experience-tab").forEach((button) => {
      button.addEventListener("click", () => {
        $$(".experience-tab").forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-selected", String(active));
        });
        const panel = $("#experience-panel");
        panel.animate([{ opacity: 0.62, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
        updateExperiencePanel();
      });
    });
  }

  function updateExperiencePanel() {
    const active = $(".experience-tab.is-active");
    const content = experienceContent[active?.dataset.panel || "think"];
    $("#panel-index").textContent = content.index;
    $("#panel-title").textContent = state.lang === "en" ? content.enTitle : content.title;
    $("#panel-copy").textContent = state.lang === "en" ? content.enCopy : content.copy;
    const items = state.lang === "en" ? content.enList : content.list;
    $("#panel-list").innerHTML = items.map((item) => `<li>${escapeHTML(item)}</li>`).join("");
    const agentLink = $("#panel-open-agent");
    if (agentLink) agentLink.hidden = active?.dataset.panel !== "explain";
  }

  function initReveal() {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      $$(".reveal").forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index % 3, 2) * 70}ms`;
      observer.observe(item);
    });
  }

  function solarForMinute(minute) {
    const hour = minute / 60;
    if (hour < 6 || hour > 19.5) return 0;
    const daylight = Math.sin(((hour - 6) / 13.5) * Math.PI);
    const cloud = 0.86 + Math.sin(minute * 0.019) * 0.08 + Math.sin(minute * 0.071) * 0.03;
    return Math.max(0, 2.45 * daylight * cloud * weatherProfiles[state.weather].solar);
  }

  /* 15min 电价曲线（energy-session.js 提供，北欧现货风格 96 点/天）
   * 修复：原 2-4h 阶梯曲线与 hero "15 min 滚动决策"承诺不符——懂行用户一对就穿帮 */
  function priceForMinute(minute) {
    if (window.EnergySession) return window.EnergySession.price15ForMinute(minute);
    const hour = minute / 60;
    if (hour >= 2 && hour < 4) return -0.025;
    if (hour < 6) return 0.075;
    if (hour < 9) return 0.19;
    if (hour < 15) return 0.105;
    if (hour < 17) return 0.21;
    if (hour < 21) return 0.385;
    return 0.16;
  }

  function calculateMetrics() {
    const profile = weatherProfiles[state.weather];
    const evW = state.devices.filter((device) => device.category === "mobility").reduce((sum, device) => sum + deviceActualPower(device), 0);
    const homeW = state.devices.filter((device) => device.category !== "mobility").reduce((sum, device) => sum + deviceActualPower(device), 0);
    const loadW = (homeW + 180) * profile.load + evW;
    const load = loadW / 1000;
    const ev = evW / 1000;
    const solar = solarForMinute(state.simMinute);
    const price = priceForMinute(state.simMinute);
    let battery = 0;

    const lpHead = window.EnergySession?.session.lastPlan?.plan?.[0];
    if (state.strategy === "auto" && !["storm", "snow"].includes(state.weather) && lpHead) {
      // The displayed battery direction now comes from the same local LP plan as
      // the EV schedule and shadow comparison, rather than an unrelated threshold rule.
      battery = clamp(lpHead.chargeKw - lpHead.dischargeKw, -2, 2);
      const reserveKw = Math.max(0, (state.soc - profile.reserve) / 100 * 7 / 0.25);
      if (battery < 0) battery = Math.max(battery, -reserveKw);
    } else if (state.strategy === "auto" && ["storm", "snow"].includes(state.weather)) {
      battery = state.soc < profile.reserve
        ? Math.min(2, Math.max(0.9, load - solar + 0.55))
        : solar > load && state.soc < 96 ? Math.min(1.0, solar - load) : 0;
    } else if (state.strategy === "manual") {
      battery = state.manualPowerW / 1000;
    } else if (state.strategy === "backup") {
      if (state.soc < 80) battery = Math.min(1.6, Math.max(0.5, load - solar + 0.4));
      else battery = solar > load && state.soc < 96 ? Math.min(1.5, solar - load) : 0;
    } else if (state.strategy === "self") {
      const surplus = solar - load;
      if (surplus > 0 && state.soc < 96) battery = Math.min(2, surplus);
      else if (surplus < 0 && state.soc > 20) battery = -Math.min(2, -surplus);
    } else {
      if (price < 0.1 && state.soc < 90) battery = Math.min(2, Math.max(0.7, load - solar + 0.65));
      else if (price > 0.3 && state.soc > 25) battery = -Math.min(2, load, (state.soc - 20) / 22);
      else {
        const surplus = solar - load;
        if (surplus > 0 && state.soc < 92) battery = Math.min(1.8, surplus);
        else if (surplus < 0 && state.soc > 35) battery = -Math.min(1.4, -surplus);
      }
    }

    if (state.soc >= 99 && battery > 0) battery = 0;
    if (state.soc <= 6 && battery < 0) battery = 0;
    const netGrid = load + battery - solar;
    // A negative tariff never implies that this demo exports solar at a loss.
    const grid = price < 0 ? Math.max(0, netGrid) : netGrid;
    return { load, solar, battery, grid, price, ev, curtailed: price < 0 ? Math.max(0, -netGrid) : 0 };
  }

  function updateSoc(deltaMinutes) {
    const power = state.metrics.battery;
    if (Math.abs(power) < 0.01) return;
    const energyKwh = Math.abs(power) * deltaMinutes / 60;
    const effective = power > 0 ? energyKwh * 0.95 : energyKwh / 0.95;
    const deltaPercent = effective / 7 * 100 * (power > 0 ? 1 : -1);
    state.soc = clamp(state.soc + deltaPercent, 5, 100);
  }

  function strategyName() {
    const zh = ({ auto: "收益优先 · 风险缓冲", self: "自发自用优先", backup: "关键负荷备电优先", manual: "手动功率控制" })[state.strategy];
    const en = ({ auto: "Value · Risk buffered", self: "Self-consumption first", backup: "Essential backup first", manual: "Manual power" })[state.strategy];
    return tr(zh, en);
  }

  function decisionText(metrics) {
    const profile = weatherProfiles[state.weather];
    if (["storm", "snow"].includes(state.weather)) {
      if (state.soc < profile.reserve) return {
        title: tr("先为家庭保留备电", "Reserve energy for home first"),
        copy: tr(`${profile.zh}模拟情景把备电目标提高到 ${profile.reserve}%；${state.weather === "storm" ? "车辆充电暂停" : "车辆充电受限"}，关键负荷优先。`, `The ${profile.en.toLowerCase()} demo raises the reserve target to ${profile.reserve}%; EV charging is ${state.weather === "storm" ? "paused" : "limited"} while essential loads take priority.`),
        constraint: tr("极端天气备电", "Weather reserve")
      };
      return {
        title: tr("备电目标已满足，继续保留储备", "Reserve target met — keep it available"),
        copy: tr("模拟储备已经达到当前天气情景的目标，计划不会为微小价差随意消耗应急电量。", "The simulated reserve meets this weather scenario's target, so the plan does not spend emergency energy for a marginal price spread."),
        constraint: tr("家庭优先", "Home first")
      };
    }
    if (state.strategy === "backup") {
      if (state.soc < 80) return { title: tr("正在为关键负荷补充备电", "Charging the essential-load reserve"), copy: tr("当前 SOC 低于 80% 备电目标，系统优先充电；预计达到目标后恢复保守待机。", "SOC is below the 80% reserve target. Charging takes priority, then the system returns to guarded standby."), constraint: tr("备电目标", "Reserve target") };
      if (metrics.battery > 0.05) return { title: tr("备电目标已满足，正在吸收光伏余量", "Reserve met — storing surplus solar"), copy: tr("当前充电来自家庭光伏余量，不额外购买高价电；关键负荷储备仍保持在目标线以上。", "Charging comes from surplus solar, without buying expensive grid power. Essential reserve remains protected."), constraint: tr("光伏自用", "Solar use") };
      return { title: tr("备电目标已满足，保持待机", "Reserve met — holding standby"), copy: tr("当前储备已覆盖关键负荷目标，系统暂不为了小价差增加循环。", "The reserve covers essential loads, so the battery will not cycle for a marginal spread."), constraint: tr("循环保护", "Cycle guard") };
    }
    if (state.strategy === "manual") return { title: tr("正在执行手动功率", "Executing manual power"), copy: tr("该动作来自本地沙盘手动输入，不代表自动优化结果；安全边界仍保持生效。", "This action comes from local manual input, not automatic optimization. Safety limits remain active."), constraint: tr("人工设定", "Manual input") };
    if (metrics.price < 0) return {
      title: metrics.battery > 0.05 ? tr("负电价窗口，正在充电", "Negative-price window — charging") : tr("负价窗口，不倒贴卖电", "Negative price — no loss-making export"),
      copy: tr("卖价为负时，演示计划禁止电池放电和向电网出售；电池若有空间，可吸收低价电量。", "When export price is negative, the demo blocks battery discharge and grid sale; spare battery capacity may absorb low-price energy."),
      constraint: tr("只充不卖", "Charge, do not export")
    };
    // 官网设计语言#1：人话旗舰句（对齐 ankersolix.com "Storm Stays Out. Life Stays On." 的句式）
    // B1修复：约束文案与 15min 电价曲线同步（旧逻辑用 0.24 阈值，低价时段会误标"晚峰容量"）
    const tariffBand = (() => {
      const h = state.simMinute / 60;
      if (h >= 16.5 && h < 21) return { label: tr("晚峰容量", "Evening capacity"), note: tr("当前价格处于今日高位", "Price at today's high") };
      if (h >= 6 && h < 9) return { label: tr("早峰容量", "Morning capacity"), note: tr("早高峰负荷上升前补能", "Pre-charge before the morning ramp") };
      if (h >= 2 && h < 4.5) return { label: tr("负价窗", "Negative-price window"), note: tr("电网阶段性倒付", "Grid briefly pays to consume") };
      return { label: tr("光伏低谷", "Solar valley"), note: tr("当前价格处于今日低位", "Price near today's low") };
    })();
    if (metrics.battery > 0.05) return { title: tariffBand.note === tr("当前价格处于今日低位", "Price near today's low") ? tr("现在充电更有价值", "Charging is more valuable now") : tr("低价时段补能，晚峰前满仓", "Charging at low tariff — full before peak"), copy: tr("当前价格相对全天曲线处于低位，且晚高峰负荷预计上升；充电动作已计入效率损失和风险缓冲。", "Price is low on today's curve and evening demand is expected to rise. Round-trip loss and risk are already included."), constraint: tariffBand.label };
    if (metrics.battery < -0.05) return { title: tr("存储电量正在覆盖家庭负荷", "Stored energy is serving the home"), copy: tr("当前计划使用电池减少购电，同时保留天气情景要求的备电下限。", "The current plan reduces grid purchases while preserving this weather scenario's reserve floor."), constraint: tr("SOC 安全线", "SOC floor") };
    if (state.strategy === "self") return { title: tr("自发自用优先，暂不套利", "Self-consumption first — no arbitrage"), copy: tr("当前光伏与家庭负荷接近平衡，系统减少与电网来回交换。", "Solar and home demand are nearly balanced, so unnecessary grid exchange is reduced."), constraint: tr("少倒送", "Low export") };
    return { title: tr("当前计划让电池保持待机", "The current plan holds the battery"), copy: tr("在模拟电价、往返效率、循环成本和备电下限共同作用下，本格不充也不放。想看多充是否值得，可运行影子重算。", "With the simulated tariff, efficiency, cycling cost and reserve floor, this slot neither charges nor discharges. Run the shadow re-solve to test extra charging."), constraint: tr("当前计划", "Current plan") };
  }

  function updateSimulationUI() {
    const metrics = state.metrics;
    const profile = weatherProfiles[state.weather];
    const clockHours = Math.floor(state.simMinute / 60) % 24;
    const clockMinutes = Math.floor(state.simMinute % 60);
    $("#sim-clock").textContent = `${String(clockHours).padStart(2, "0")}:${String(clockMinutes).padStart(2, "0")}`;
    /* 3D 场景同步时间（含暂停时拖时间轴的情况；setTimeOfDay 内部幂等） */
    window.RealisticHomeScene?.setTimeOfDay?.(state.simMinute);
    /* 三站指挥中心（节流：1s 一次足够） */
    if (!window.__triLast || performance.now() - window.__triLast > 1000) {
      window.__triLast = performance.now();
      window.TriSite?.update?.(state.simMinute, state.soc);
    }
    $("#last-update").textContent = state.paused ? tr("模拟已暂停", "Paused") : tr("刚刚", "Just now");
    $("#weather-status").textContent = state.lang === "en" ? profile.en : profile.zh;
    setLiveReading("#metric-load", metrics.load.toFixed(2));
    setLiveReading("#metric-solar", metrics.solar.toFixed(2));
    setLiveReading("#metric-battery", `${metrics.battery > 0.02 ? "+" : metrics.battery < -0.02 ? "−" : ""}${Math.abs(metrics.battery).toFixed(2)}`);
    setLiveReading("#metric-grid", `${metrics.grid > 0.02 ? "+" : metrics.grid < -0.02 ? "−" : ""}${Math.abs(metrics.grid).toFixed(2)}`);
    setLiveReading("#metric-ev", metrics.ev.toFixed(2));
    setLiveReading("#soc-value", `${state.soc.toFixed(1)}%`);
    $("#soc-bar").style.width = `${state.soc}%`;
    $("#soc-bar").style.background = state.soc < 20 ? "#e45c55" : state.soc < 40 ? "#f4b43a" : "#22b7df";
    $("#soc-mode").textContent = strategyName();
    $("#badge-solar").textContent = formatPower(metrics.solar);
    $("#badge-battery").textContent = `${metrics.battery >= 0 ? tr("充 ", "IN ") : tr("放 ", "OUT ")}${formatPower(metrics.battery)}`;
    $("#badge-grid").textContent = `${metrics.grid >= 0 ? tr("买 ", "BUY ") : tr("送 ", "SEND ")}${formatPower(metrics.grid)}`;
    $("#badge-ev").textContent = formatPower(metrics.ev);
    $("#forecast-confidence").textContent = `${Math.round(profile.solar * 100)}%`;
    $("#reserve-target").textContent = `${profile.reserve}%`;
    $("#ev-policy").textContent = state.weather === "storm"
      ? tr("暂停", "Paused") : state.weather === "snow"
        ? tr("限功率", "Power limited") : metrics.ev < 0.05
          ? tr("移峰等待", "Waiting for tariff") : metrics.solar > metrics.load - metrics.ev
            ? tr("光伏余量充电", "Solar surplus charging") : tr("按价窗充电", "Tariff-window charging");
    const sceneTitles = {
      clear: ["晴朗基线", "Clear baseline"],
      cloudy: ["多云预测", "Cloud-aware forecast"],
      rain: ["雨天保守策略", "Rain-aware guard"],
      storm: ["雷暴备电约束", "Storm reserve constraint"],
      snow: ["降雪备电约束", "Snow reserve constraint"],
      night: ["夜间低谷调度", "Night off-peak plan"]
    };
    $("#scene-weather-title").textContent = sceneTitles[state.weather][state.lang === "en" ? 1 : 0];
    $("#scene-weather-effect").textContent = `${tr("光伏预测", "Solar forecast")} ${Math.round(profile.solar * 100)}%`;
    $("#scene-weather-action").textContent = `${tr("备电", "Reserve")} ${profile.reserve}% · ${state.lang === "en" ? profile.evEn : profile.evZh}`;
    $("#scene-stage").dataset.weather = state.weather;
    const explanation = decisionText(metrics);
    $("#decision-title").textContent = explanation.title;
    $("#decision-copy").textContent = explanation.copy;
    const impact = ["storm", "snow"].includes(state.weather)
      ? tr(`备电目标 ${profile.reserve}%；${state.weather === "storm" ? "车充暂停" : "车充限功率"}。`, `Reserve target ${profile.reserve}%; EV charging ${state.weather === "storm" ? "paused" : "limited"}.`)
      : metrics.battery > 0.05
        ? tr(`本格计划充电 ${metrics.battery.toFixed(2)} kW，仍保留 ${profile.reserve}% 模拟备电目标。`, `Planned charge this slot: ${metrics.battery.toFixed(2)} kW, with a ${profile.reserve}% demo reserve target.`)
        : metrics.battery < -0.05
          ? tr(`本格计划用电池供电 ${Math.abs(metrics.battery).toFixed(2)} kW，减少从电网购电。`, `Planned battery output this slot: ${Math.abs(metrics.battery).toFixed(2)} kW, reducing grid purchases.`)
          : tr("本格电池待机，避免没有充分收益时反复充放。", "The battery waits this slot, avoiding needless cycling for a small benefit.");
    $("#decision-impact").textContent = impact;
    $("#decision-control").textContent = state.strategy === "manual"
      ? tr("当前为手动演示策略；可切回滚动优化。", "Manual demo mode is selected; you can return to rolling optimization.")
      : tr("无需确认；你可切换演示策略，本页不下发设备指令。", "No confirmation needed; you can change demo strategies. This page sends no device command.");
    const evidenceNode = $("#decision-evidence");
    const previousPrice = evidenceNode.querySelector("span b")?.textContent;
    const priceText = `${metrics.price.toFixed(3)} €/kWh`;
    const evidenceMarkup = `<span>${tr("价格", "Price")}<b>${priceText}</b></span><span>${tr("当前因素", "Factor")}<b>${explanation.constraint}</b></span><span>${tr("安全", "Safety")}<b>${state.soc > 10 ? tr("功率未越界", "Within limits") : tr("低 SOC 保护", "Low-SOC guard")}</b></span>`;
    if (evidenceNode.innerHTML !== evidenceMarkup) {
      evidenceNode.innerHTML = evidenceMarkup;
      if (previousPrice && previousPrice !== priceText && !readingMotionPreference.matches && !document.hidden) {
        evidenceNode.querySelector("span b")?.classList.add("discrete-value-enter");
      }
    }
    $("#system-state").textContent = state.paused ? tr("模拟已暂停", "Simulation paused") : ["storm", "snow"].includes(state.weather) ? tr("模拟备电约束已抬高", "Simulated reserve raised") : state.soc < 10 ? tr("模拟保守模式", "Simulated guard mode") : tr("本地模拟运行中", "Local simulation running");
    if (state.deckView === "revenue") renderRevenueMetrics();
    state.threeFlows = { solar: metrics.solar, battery: metrics.battery, grid: metrics.grid, ev: metrics.ev, load: metrics.load };
    if (window.RealisticHomeScene && window.RealisticHomeScene.ready) {
      window.RealisticHomeScene.updateFlows(state.threeFlows, state.soc);
      window.RealisticHomeScene.setWeather?.(state.weather);
    }
  }

  function pushHistory() {
    state.history.load.push(state.metrics.load);
    state.history.solar.push(state.metrics.solar);
    if (state.history.load.length > 120) state.history.load.shift();
    if (state.history.solar.length > 120) state.history.solar.shift();
  }

  function drawChart() {
    const canvas = $("#live-chart");
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((ratio) => {
      ctx.beginPath();
      ctx.moveTo(0, height * ratio);
      ctx.lineTo(width, height * ratio);
      ctx.stroke();
    });
    const max = Math.max(2.8, ...state.history.load, ...state.history.solar);
    const drawSeries = (values, color) => {
      if (values.length < 2) return;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = index / Math.max(values.length - 1, 1) * width;
        const y = height - (value / max) * (height - 8) - 4;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    };
    drawSeries(state.history.load, "#9db2c2");
    drawSeries(state.history.solar, "#f58220");
  }

  function simulationTick() {
    // 充电会话：每跨过 15min 时隙边界重解一次滚动 LP（energy_brain 算法核），暂停时也刷新卡片
    if (window.EnergySession) {
      const __lpPlan = window.EnergySession.solveIfDue(state.simMinute, state.soc, weatherProfiles[state.weather].solar,
        Math.max(0.1, state.metrics.load - state.metrics.ev), state.metrics.solar, weatherProfiles[state.weather].reserve);
      /* LP 每次重解后重画三站时间线（修复首画时 plan 未生成的空图） */
      if (__lpPlan && window.TriSite) window.TriSite.update(state.simMinute, state.soc);
    }
    if (!state.paused) {
      const deltaMinutes = state.speed / 60;
      revenueLedger?.accrue(state.metrics, state.simMinute, deltaMinutes, priceForMinute);
      state.simMinute = (state.simMinute + deltaMinutes) % 1440;
      /* 一天时间变化：把模拟时钟推给 3D 场景（太阳弧线/天空色/灯带连续变化） */
      window.RealisticHomeScene?.setTimeOfDay?.(state.simMinute);
      /* 三站指挥中心同步（LP 真数据驱动） */
      window.TriSite?.update?.(state.simMinute, state.soc);
      state.metrics = calculateMetrics();
      updateSoc(deltaMinutes);
      pushHistory();
      updateSimulationUI();
      drawChart();
      $$(".device-row").forEach((row) => {
        const device = state.devices.find((item) => item.id === row.dataset.deviceId);
        if (!device) return;
        const output = $("output", row);
        if (output) output.textContent = `${Math.round(deviceActualPower(device))} W`;
      });
    }
    if (window.EnergySession) window.EnergySession.renderChargePlanCard(state.simMinute, state.lang, state.weather, state.strategy);
  }

  function initWeatherControls() {
    $$('[data-weather]').forEach((button) => {
      button.addEventListener("click", () => {
        const nextWeather = button.dataset.weather;
        if (nextWeather === state.weather) return;
        state.weather = nextWeather;
        /* 切换天气时把模拟时间拨回正午：避免 60x 速跑过黄昏后，用户切任何天气都看到"光伏 0.00"的困惑
         * （光伏只在 6:00-19:30 有输出，夜里为 0 是物理正确，但默认速度下用户几分钟就会跑进黑夜）
         * 夜间场景除外——切夜间就该是夜里 */
        if (state.weather !== "night") {
          state.simMinute = 12 * 60 + 30;
          state.soc = Math.max(state.soc, 55);
          // Only a changed non-night weather rewinds the synthetic clock.
          // Keep the ledger when selecting Night, where the clock continues.
          revenueLedger?.reset();
        }
        window.EnergySession?.invalidate?.();
        $$('[data-weather]').forEach((item) => {
          const active = item === button;
          item.classList.toggle("is-active", active);
          item.setAttribute("aria-pressed", String(active));
        });
        state.metrics = calculateMetrics();
        updateSimulationUI();
        drawChart();
        const profile = weatherProfiles[state.weather];
        if (["storm", "snow"].includes(state.weather)) {
          showToast(tr(`${profile.zh}预警：提高备电目标并限制车辆充电`, `${profile.en} alert: reserve raised and EV charging limited`));
        } else {
          showToast(tr(`场景已切换为${profile.zh}`, `Scenario changed to ${profile.en}`));
        }
      });
    });
    $("#try-storm-story")?.addEventListener("click", () => {
      document.querySelector('[data-weather="storm"]')?.click();
    });
  }

  function initSimulationControls() {
    const manualControl = $("#manual-control");
    manualControl.hidden = true;
    manualControl.style.display = "none";
    state.metrics = calculateMetrics();
    for (let index = 0; index < 54; index += 1) {
      const minute = (state.simMinute - (54 - index)) % 1440;
      state.history.load.push(Math.max(0.25, state.metrics.load * (0.84 + Math.sin(index * 0.31) * 0.12)));
      state.history.solar.push(solarForMinute(minute < 0 ? minute + 1440 : minute));
    }
    updateSimulationUI();
    drawChart();
    setInterval(simulationTick, 1000);
    window.addEventListener("resize", drawChart, { passive: true });

    $("#pause-sim").addEventListener("click", (event) => {
      state.paused = !state.paused;
      event.currentTarget.textContent = state.paused ? tr("继续模拟", "Resume") : tr("暂停模拟", "Pause");
      updateSimulationUI();
      showToast(state.paused ? tr("家庭能源模拟已暂停", "Energy simulation paused") : tr("家庭能源模拟已继续", "Energy simulation resumed"));
    });
    $("#speed-select").addEventListener("change", (event) => {
      state.speed = Number(event.target.value);
      showToast(`${tr("模拟速度", "Simulation speed")}: ${event.target.options[event.target.selectedIndex].text}`);
    });
    $$(".strategy-button").forEach((button) => button.addEventListener("click", () => {
      state.strategy = button.dataset.strategy;
      window.EnergySession?.invalidate?.();
      $$(".strategy-button").forEach((item) => item.classList.toggle("is-active", item === button));
      const showManual = state.strategy === "manual";
      manualControl.hidden = !showManual;
      manualControl.style.display = showManual ? "grid" : "none";
      state.metrics = calculateMetrics();
      updateSimulationUI();
      showToast(`${tr("运行策略已切换为", "Strategy changed to ")}${button.textContent}`);
    }));
    $("#manual-power").addEventListener("input", (event) => {
      state.manualPowerW = Number(event.target.value);
      $("#manual-power-output").textContent = `${state.manualPowerW > 0 ? "+" : ""}${state.manualPowerW} W`;
      state.metrics = calculateMetrics();
      updateSimulationUI();
    });
    $("#run-counterfactual").addEventListener("click", () => {
      const shadow = state.strategy !== "auto" ? { status: "strategy-inactive" } : ["storm", "snow"].includes(state.weather)
        ? { status: "weather-guard" }
        : window.EnergySession?.compareExtraCharge(0.4) || { status: "unavailable" };
      const box = $("#counterfactual");
      box.hidden = false;
      if (shadow.status === "strategy-inactive") {
        box.textContent = tr("当前不是滚动优化策略，影子 LP 结果不会对应正在执行的动作。切回滚动优化后再问“为什么不多充？”。",
          "Rolling optimization is not active, so an LP shadow plan would not match the current action. Switch back to Rolling optimizer before asking why.");
      } else if (shadow.status === "weather-guard") {
        box.textContent = tr("当前情景以关键负荷备电优先，常态套利与车充计划暂停；因此这里不展示常态计划的“多充 0.4 kW”比较。无设备指令。",
          "Essential-load reserve takes priority here; the normal arbitrage and EV plan is paused, so an extra-charge comparison is not shown. No device command.");
      } else if (shadow.status === "power-limit") {
        box.textContent = tr(`本格已触及 ${shadow.powerLimitKw.toFixed(1)} kW 充电功率上限，无法再多充 0.4 kW。此为演示约束，不向设备下发。`,
          `The ${shadow.powerLimitKw.toFixed(1)} kW charging cap binds this slot. Another 0.4 kW is not feasible. Demo constraint only; no device command.`);
      } else if (shadow.status === "infeasible") {
        box.textContent = tr("影子重算发现本格强制多充 0.4 kW 无可行解；当前 SOC、备电目标或出发约束不能同时满足。没有下发设备指令。",
          "The shadow re-solve found no feasible plan with another 0.4 kW now; SOC, reserve or departure constraints conflict. No device command was sent.");
      } else if (shadow.status === "ok") {
        const delta = Math.max(0, shadow.deltaCostEur);
        /* 话术校准（答辩口径）：差额≈0 不是"优化器没用"，恰恰是"当前计划已贴近该约束下的最优"。
         * LP 已在全部可行充放电策略中选了成本最低者，所以强行多充的边际收益必然趋近零；
         * 只有差额为负（多充反而更贵）或显著为正时才说明有改进空间。 */
        const verdict = delta < 0.005
          ? tr("（差额趋近 0 —— 说明当前计划已贴近该约束下的成本最优；LP 在全部可行策略中已选了最省的一种，强行多充没有额外的省钱空间。）",
               "(The near-zero difference means the current plan is already cost-optimal under these constraints; the LP picked the cheapest feasible strategy, so forced extra charging has no additional saving to offer.)")
          : delta >= 0.02
            ? tr("（差额明显为正 —— 说明存在值得吸收的额外低成本电量。）",
                 "(A clearly positive difference means there is additional low-cost energy worth absorbing.)")
            : "";
        box.textContent = tr(
          `同一组模拟输入重新求解：若本格至少多充 0.4 kW，未来 ${shadow.horizonHours} 小时综合模拟成本（含循环假设）由 €${shadow.baselineCostEur.toFixed(3)} 变为 €${shadow.alternativeCostEur.toFixed(3)}（差额 +€${delta.toFixed(3)}）。${verdict}不接触设备。`,
          `Same simulated inputs, re-solved: another 0.4 kW now changes the ${shadow.horizonHours}-hour simulated objective (including cycling assumption) from €${shadow.baselineCostEur.toFixed(3)} to €${shadow.alternativeCostEur.toFixed(3)} (+€${delta.toFixed(3)}). ${verdict} No device access.`
        );
      } else {
        box.textContent = tr("当前优化计划尚未生成，暂不能做同输入影子重算；请稍后重试。",
          "The optimization plan is not ready yet, so a same-input shadow re-solve is unavailable. Please retry shortly.");
      }
      box.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
    });
  }

  function initDeviceActions() {
    $("#reset-home").addEventListener("click", () => {
      if (!window.confirm(tr("恢复默认家庭将清除当前设备配置，是否继续？", "Restoring defaults will clear the current device setup. Continue?"))) return;
      state.devices = defaultDevices.map((item) => ({ ...item }));
      state.selectedDeviceId = null;
      state.soc = 62;
      saveDevices();
      renderDevices();
      showToast(tr("家庭设备已恢复默认配置", "Default home restored"));
    });
    $("#export-config").addEventListener("click", () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        note: tr("每度有据家庭能源沙盘配置，所有运行数据均为模拟", "Home Energy Studio setup; all operating data is simulated"),
        strategy: state.strategy,
        weather: state.weather,
        soc: Number(state.soc.toFixed(2)),
        devices: state.devices
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = state.lang === "en" ? "SOLIX_Home_Energy_Setup.json" : "每度有据_家庭配置.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      showToast(tr("家庭配置已导出为 JSON", "Home setup exported as JSON"));
    });
  }

  function createLabelSprite(THREE, text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(6,18,30,.84)";
    ctx.beginPath();
    ctx.roundRect(2, 2, 252, 60, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.86)";
    ctx.font = "600 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 12), 128, 33);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.2, 0.55, 1);
    return sprite;
  }

  function makeDeviceMesh(THREE, device, index) {
    /* 设备配色去荧光化：用户反馈"绿色建模很丑"——纯色大色块改成低饱和高级灰系，
     * 类别色只用于 LED/标签点缀（scene-realistic 的 indicator 已是绿点），不再整块刷色。 */
    const colors = { essential: 0xb9c2c8, comfort: 0x9fb3bf, flexible: 0xc9b299, mobility: 0xa8b8c4 };
    const material = new THREE.MeshStandardMaterial({ color: colors[device.category] || 0x7793a5, roughness: 0.62, metalness: 0.22 });
    let geometry;
    if (device.type === "fridge") geometry = new THREE.BoxGeometry(0.75, 1.7, 0.68);
    else if (device.type === "router") geometry = new THREE.BoxGeometry(0.72, 0.18, 0.44);
    else if (device.type === "tv") geometry = new THREE.BoxGeometry(1.25, 0.74, 0.12);
    else if (device.type === "lamp") geometry = new THREE.CylinderGeometry(0.12, 0.38, 0.9, 16);
    else if (device.type === "washer") geometry = new THREE.BoxGeometry(0.8, 0.92, 0.72);
    else if (device.type === "aircon") geometry = new THREE.BoxGeometry(1.25, 0.42, 0.36);
    else if (device.type === "ev") geometry = new THREE.BoxGeometry(1.45, 0.48, 0.72);
    else geometry = new THREE.BoxGeometry(0.72, 0.72, 0.72);
    const mesh = new THREE.Mesh(geometry, material);
    const positions = [
      [-2.8, 0.85, -1.65], [-1.4, 0.35, -2.05], [0.2, 0.5, -1.9], [1.6, 0.62, -1.75],
      [-2.6, 0.45, 0.45], [-1.15, 0.5, 0.5], [0.45, 0.48, 0.45], [1.85, 0.48, 0.42],
      [-2.45, 0.45, 2.2], [-0.85, 0.45, 2.05], [0.75, 0.45, 2.1], [2.2, 0.45, 2.0]
    ];
    const p = positions[index % positions.length];
    mesh.position.set(p[0], p[1], p[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.deviceId = device.id;
    mesh.userData.baseColor = material.color.getHex();
    const label = createLabelSprite(THREE, device.name);
    label.visible = window.innerWidth >= 720;
    label.position.set(0, geometry.parameters.height ? geometry.parameters.height / 2 + 0.52 : 1.1, 0);
    mesh.add(label);
    return mesh;
  }

  function disposeObject(object) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
  }

  function sync3DDevices() {
    if (window.RealisticHomeScene && window.RealisticHomeScene.ready) {
      window.RealisticHomeScene.syncDevices(state.devices);
      return;
    }
    if (!state.three) return;
    const { THREE, deviceGroup, deviceMeshes } = state.three;
    deviceGroup.children.slice().forEach((child) => {
      deviceGroup.remove(child);
      disposeObject(child);
    });
    deviceMeshes.clear();
    state.devices.slice(0, 12).forEach((device, index) => {
      const mesh = makeDeviceMesh(THREE, device, index);
      deviceGroup.add(mesh);
      deviceMeshes.set(device.id, mesh);
    });
    highlight3DDevice(state.selectedDeviceId);
  }

  function highlight3DDevice(id) {
    if (window.RealisticHomeScene && window.RealisticHomeScene.ready) {
      window.RealisticHomeScene.highlightDevice(id);
      return;
    }
    if (!state.three) return;
    state.three.deviceMeshes.forEach((mesh, deviceId) => {
      const active = deviceId === id;
      mesh.material.emissive.setHex(active ? 0x143f56 : 0x000000);
      mesh.material.emissiveIntensity = active ? 0.9 : 0;
      mesh.scale.setScalar(active ? 1.08 : 1);
    });
  }

  function createFlow(THREE, scene, points, color, key) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 42, 0.025, 6, false),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42 })
    );
    scene.add(tube);
    const particleMaterial = new THREE.MeshBasicMaterial({ color });
    const particles = Array.from({ length: 8 }, (_, index) => {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), particleMaterial);
      scene.add(particle);
      return { mesh: particle, offset: index / 8 };
    });
    return { curve, particles, key };
  }

  async function init3D() {
    const loader = $("#scene-loader");
    const fallback = $("#scene-fallback");
    try {
      const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js");
      const canvas = $("#home-canvas");
      const stage = $("#scene-stage");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1 : 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x0c2233, 0.035);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.set(10, 7.2, 10.5);
      camera.lookAt(0, 0.75, 0);

      scene.add(new THREE.HemisphereLight(0xbbe6ff, 0x102030, 1.7));
      const keyLight = new THREE.DirectionalLight(0xfff1da, 3.2);
      keyLight.position.set(3, 9, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      scene.add(keyLight);
      const orangeLight = new THREE.PointLight(0xf58220, 5, 11);
      orangeLight.position.set(-4, 2.8, -3);
      scene.add(orangeLight);
      const cyanLight = new THREE.PointLight(0x22b7df, 4, 9);
      cyanLight.position.set(4, 2.2, 1);
      scene.add(cyanLight);

      const homeGroup = new THREE.Group();
      scene.add(homeGroup);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0xcfd6d9, roughness: 0.86, metalness: 0.02 });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.18, 8), floorMat);
      floor.position.y = -0.1;
      floor.receiveShadow = true;
      homeGroup.add(floor);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xe5eaec, roughness: 0.94 });
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(11, 4.4, 0.16), wallMat);
      backWall.position.set(0, 2.1, -4);
      backWall.receiveShadow = true;
      homeGroup.add(backWall);
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 8), wallMat);
      sideWall.position.set(5.5, 2.1, 0);
      sideWall.receiveShadow = true;
      homeGroup.add(sideWall);

      const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.35, 0.12), new THREE.MeshStandardMaterial({ color: 0x163248, roughness: 0.35, metalness: 0.65 }));
      windowFrame.position.set(-2.6, 2.45, -3.86);
      homeGroup.add(windowFrame);
      const windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.98), new THREE.MeshPhysicalMaterial({ color: 0x163f5a, transparent: true, opacity: 0.58, roughness: 0.18, metalness: 0.1 }));
      windowGlass.position.set(-2.6, 2.45, -3.78);
      homeGroup.add(windowGlass);

      const batteryGroup = new THREE.Group();
      const batteryMat = new THREE.MeshStandardMaterial({ color: 0x353c40, roughness: 0.5, metalness: 0.58 });
      for (let index = 0; index < 3; index += 1) {
        const module = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.72, 0.92), batteryMat);
        module.position.y = 0.42 + index * 0.73;
        module.castShadow = true;
        batteryGroup.add(module);
      }
      const batteryLight = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.94), new THREE.MeshBasicMaterial({ color: 0x22b7df }));
      batteryLight.position.set(0, 2.48, 0);
      batteryGroup.add(batteryLight);
      batteryGroup.position.set(3.75, 0, -2.9);
      homeGroup.add(batteryGroup);

      const solarGroup = new THREE.Group();
      for (let index = 0; index < 3; index += 1) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, 1.05), new THREE.MeshStandardMaterial({ color: 0x1d4d6a, roughness: 0.28, metalness: 0.5 }));
        panel.position.set(index * 1.72, 0, 0);
        panel.rotation.x = -0.2;
        solarGroup.add(panel);
      }
      solarGroup.position.set(-4.2, 4.65, -2.5);
      solarGroup.rotation.y = 0.18;
      homeGroup.add(solarGroup);

      const gridNode = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 2.8, 8), new THREE.MeshStandardMaterial({ color: 0x7e929f, roughness: 0.65, metalness: 0.52 }));
      gridNode.position.set(-4.7, 1.4, 2.8);
      homeGroup.add(gridNode);

      const deviceGroup = new THREE.Group();
      homeGroup.add(deviceGroup);
      const deviceMeshes = new Map();

      const flows = [
        createFlow(THREE, homeGroup, [[-2.5, 4.4, -2.4], [0.2, 3.7, -2.6], [3.75, 2.55, -2.75]], 0xf58220, "solar"),
        createFlow(THREE, homeGroup, [[3.75, 1.3, -2.5], [2.1, 1.2, -0.8], [0.2, 0.8, -0.4]], 0x22b7df, "battery"),
        createFlow(THREE, homeGroup, [[-4.7, 2.7, 2.8], [-2.9, 2.2, 1.4], [-1.2, 0.8, 0.5]], 0xa7bdcc, "grid")
      ];

      state.three = { THREE, scene, camera, renderer, homeGroup, deviceGroup, deviceMeshes, flows, rotation: { x: -0.03, y: -0.16 }, targetRotation: { x: -0.03, y: -0.16 } };
      sync3DDevices();

      const resize = () => {
        const rect = stage.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / Math.max(rect.height, 1);
        if (rect.width < 600) camera.position.set(13.5, 9.5, 14);
        else camera.position.set(10, 7.2, 10.5);
        camera.lookAt(0, 0.75, 0);
        camera.updateProjectionMatrix();
      };
      resize();
      new ResizeObserver(resize).observe(stage);

      let dragging = false;
      let moved = false;
      let previous = { x: 0, y: 0 };
      canvas.addEventListener("pointerdown", (event) => {
        dragging = true;
        moved = false;
        previous = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        state.three.targetRotation.y += dx * 0.0045;
        state.three.targetRotation.x = clamp(state.three.targetRotation.x + dy * 0.0025, -0.22, 0.16);
        previous = { x: event.clientX, y: event.clientY };
      });
      canvas.addEventListener("pointerup", (event) => {
        dragging = false;
        if (!moved) selectDeviceFromCanvas(event);
      });
      canvas.addEventListener("pointercancel", () => { dragging = false; });

      const clock = new THREE.Clock();
      const animate = () => {
        requestAnimationFrame(animate);
        if (document.hidden) return;
        const elapsed = clock.getElapsedTime();
        state.three.rotation.x += (state.three.targetRotation.x - state.three.rotation.x) * 0.06;
        state.three.rotation.y += (state.three.targetRotation.y - state.three.rotation.y) * 0.06;
        homeGroup.rotation.x = state.three.rotation.x;
        homeGroup.rotation.y = state.three.rotation.y;
        batteryLight.material.color.setHex(state.soc < 20 ? 0xe45c55 : 0x22b7df);
        flows.forEach((flow) => {
          const amount = flow.key === "solar" ? state.threeFlows.solar : flow.key === "battery" ? Math.abs(state.threeFlows.battery) : Math.abs(state.threeFlows.grid);
          const direction = flow.key === "battery" ? (state.threeFlows.battery >= 0 ? 1 : -1) : flow.key === "grid" ? (state.threeFlows.grid >= 0 ? 1 : -1) : 1;
          flow.particles.forEach((particle) => {
            const rawT = particle.offset + elapsed * (0.035 + amount * 0.018) * direction;
            const t = ((rawT % 1) + 1) % 1;
            particle.mesh.position.copy(flow.curve.getPointAt(t));
            particle.mesh.visible = amount > 0.03;
            particle.mesh.scale.setScalar(0.78 + Math.min(amount, 2.5) * 0.13);
          });
        });
        renderer.render(scene, camera);
      };
      animate();
      loader.hidden = true;
    } catch (error) {
      console.warn("3D scene fallback:", error);
      loader.hidden = true;
      fallback.hidden = false;
    }
  }

  function selectDeviceFromCanvas(event) {
    if (!state.three) return;
    const { THREE, camera, renderer, deviceMeshes } = state.three;
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const meshes = Array.from(deviceMeshes.values());
    const intersections = raycaster.intersectObjects(meshes, false);
    if (!intersections.length) return;
    const id = intersections[0].object.userData.deviceId;
    state.selectedDeviceId = id;
    renderDevices();
    const row = $(`[data-device-id="${CSS.escape(id)}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function init() {
    initNavigation();
    initNavigationPresence();
    initLanguage();
    initDeckView();
    initExperienceTabs();
    initReveal();
    initDialog();
    initDeviceActions();
    renderDevices();
    initWeatherControls();
    initSimulationControls();
    if (window.RealisticHomeScene) {
      window.RealisticHomeScene.init({
        devices: state.devices,
        flows: state.threeFlows,
        soc: state.soc,
        weather: state.weather,
        language: state.lang,
        onSelectDevice: (id) => {
          state.selectedDeviceId = id;
          renderDevices();
        }
      });
      /* 场景就绪后立即同步当前模拟时刻（开场即正确时间的光照） */
      const syncClock = () => { window.RealisticHomeScene.setTimeOfDay?.(state.simMinute); };
      setTimeout(syncClock, 800);
      setTimeout(syncClock, 3000);
    } else {
      init3D();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ================= 三站合成情景（非赛场实时数据） =================
 * 官方三站共享电价；各站独立天气/负荷/SOC。Site 1 取主模拟器，
 * Site 2/3 复用同一 LP 核，但仅作本地合成输入的方案预览。 */
(function initTriSite() {
  const SITES = [
    { id: 1, pvFactor: 1.0, loadFactor: 1.0, capacityKwh: 7.0 },
    { id: 2, pvFactor: 0.72, loadFactor: 1.12, capacityKwh: 7.0, soc: 0.49, plan: null, basePlan: null },
    { id: 3, pvFactor: 0.46, loadFactor: 0.82, capacityKwh: 7.0, soc: 0.73, plan: null, basePlan: null }
  ];
  let lastDrawnPlan = Symbol("timeline-not-drawn");
  let lastMinute = null;

  function planForSite(siteIndex) {
    // Site 2/3 retain the same tariff curve; only synthetic site states differ.
    if (!window.EnergySession || !window.EnergyLP) return null;
    const base = window.EnergySession.getCurrentPlan?.();
    if (!base?.input || !base.plan) return null;
    if (siteIndex === 0) return base;
    const site = SITES[siteIndex];
    if (site.basePlan === base) return site.plan;
    try {
      const inp = JSON.parse(JSON.stringify(base.input));
      inp.capacityKwh = site.capacityKwh;
      inp.soc = site.soc;
      inp.pv = inp.pv.map(v => +(v * site.pvFactor).toFixed(3));
      inp.load = inp.load.map(v => +(v * site.loadFactor).toFixed(3));
      const res = window.EnergyLP.planHorizon(inp);
      site.plan = res.status === "ok" ? res : null;
      site.basePlan = base;
      return site.plan;
    } catch (e) { site.plan = null; site.basePlan = base; return null; }
  }

  function updateTriCards(simMinute, socPct) {
    const rawElapsed = lastMinute == null ? 0 : (simMinute - lastMinute + 1440) % 1440;
    const elapsedMinutes = rawElapsed <= 30 ? rawElapsed : 0;
    SITES.slice(1).forEach(site => {
      const head = site.plan?.plan?.[0];
      if (!head || !elapsedMinutes) return;
      const deltaKwh = (head.chargeKw * 0.95 - head.dischargeKw / 0.95) * elapsedMinutes / 60;
      site.soc = Math.max(0.05, Math.min(0.98, site.soc + deltaKwh / site.capacityKwh));
    });
    lastMinute = simMinute;
    SITES.forEach((site, idx) => {
      const card = document.getElementById(`tri-site-${site.id}`);
      if (!card) return;
      const plan = planForSite(idx);
      const plan0 = plan?.plan?.[0];
      const soc = idx === 0 ? socPct : site.soc * 100;
      const battKw = plan0 ? (plan0.chargeKw - plan0.dischargeKw) : 0;
      card.querySelector(".tri-soc strong").textContent = Number.isFinite(soc) ? `${Math.round(soc)}%` : "—";
      card.querySelector(".tri-soc i").style.setProperty("--soc", `${Number.isFinite(soc) ? Math.round(soc) : 0}%`);
      const dds = card.querySelectorAll("dd");
      dds[0].textContent = plan0 ? `${battKw >= 0 ? "+" : "−"}${Math.abs(battKw).toFixed(2)} kW` : "—";
      if (plan0) {
        const netGrid = (plan0.importKw || 0) - (plan0.exportKw || 0);
        dds[1].textContent = `${netGrid >= 0 ? "+" : "−"}${Math.abs(netGrid).toFixed(2)} kW`;
      } else { dds[1].textContent = "—"; }
    });
  }

  function drawTimeline(simMinute, plan) {
    const cv = document.getElementById("tri-timeline");
    if (!cv) return;
    const nextWidth = Math.max(1, Math.round(cv.clientWidth * 2));
    const nextHeight = Math.max(1, Math.round(cv.clientHeight * 2));
    if (cv.width !== nextWidth) cv.width = nextWidth;
    if (cv.height !== nextHeight) cv.height = nextHeight;
    const x = cv.getContext("2d");
    const w = cv.width;
    const h = cv.height;
    x.clearRect(0, 0, w, h);
    if (!plan?.plan?.length) {
      x.fillStyle = "rgba(205,224,232,.7)";
      x.font = "24px 'Segoe UI', sans-serif";
      x.fillText(document.documentElement.lang === "en" ? "Plan unavailable — waiting for a valid solve" : "计划暂不可用 · 等待有效求解", 28, h / 2);
      return;
    }
    const slots = plan.plan.length;
    const slotW = w / slots;
    const slotMin = 15;
    const planStart = Math.floor(simMinute / slotMin) * slotMin;
    plan.plan.forEach((p, i) => {
      const ch = p.chargeKw || 0, dis = p.dischargeKw || 0;
      let color = "#2a3a4d", height = 0.34;
      const mag = Math.min(1, Math.max(ch, dis) / 3.6);
      if (ch > 0.02) { color = "#00DB84"; height = 0.34 + mag * 0.56; }
      else if (dis > 0.02) { color = "#00A9E0"; height = 0.34 + mag * 0.56; }
      // The first slot is the currently executable action; later slots are
      // forecasts and remain visually subordinate until the next re-solve.
      x.globalAlpha = i === 0 ? 0.96 : 0.58;
      x.fillStyle = color;
      const bh = h * height * (0.55 + mag * 0.45);
      x.fillRect(i * slotW + 2, h - bh - 8, slotW - 4, bh);
    });
    x.globalAlpha = 1;
    // 小时刻度
    x.fillStyle = "rgba(200,220,235,.45)";
    x.font = "18px 'Segoe UI', sans-serif";
    for (let i = 0; i < slots; i += 4) {
      const m = (planStart + i * slotMin) % 1440;
      x.fillText(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, i * slotW + 4, h - 14);
    }
  }

  function updateTimelinePlayhead(simMinute, plan, reset, planFresh) {
    const clock = document.querySelector(".tri-clock");
    if (clock) {
      const hh = String(Math.floor(simMinute / 60) % 24).padStart(2, "0");
      const mm = String(Math.floor(simMinute % 60)).padStart(2, "0");
      clock.textContent = `${hh}:${mm}`;
    }
    const cv = document.getElementById("tri-timeline");
    const frame = cv?.parentElement;
    const head = frame?.querySelector(".tri-playhead");
    const slots = plan?.plan?.length || 0;
    if (!frame || !head) return;
    frame.classList.toggle("has-plan", slots > 0);
    frame.classList.toggle("is-replanning", slots > 0 && !planFresh);
    if (!slots) return;
    frame.style.setProperty("--tri-slot-count", String(slots));
    const slotWidth = cv.clientWidth / slots;
    const progress = planFresh ? ((simMinute % 15) + 15) % 15 / 15 : 1;
    // A rolling six-hour plan is rebased every 15 minutes. The marker moves
    // through its first slot, then resets instead of pretending old slots ran.
    head.style.transitionDuration = reset || !planFresh ? "0ms" : "950ms";
    head.style.transform = `translate3d(${Math.max(2, Math.min(slotWidth - 2, progress * slotWidth))}px, 0, 0)`;
    const label = head.firstElementChild;
    const labelText = planFresh ? "NOW" : (document.documentElement.lang === "en" ? "SOLVING" : "重算中");
    if (label && label.textContent !== labelText) label.textContent = labelText;
  }

  // Reuse the simulation tick: plan bars change on re-solve, while the overlay
  // marker advances once per tick without a new animation loop or canvas resize.
  window.TriSite = {
    update(simMinute, socPct) {
      const slot = Math.floor(simMinute / 15);
      try { updateTriCards(simMinute, socPct); } catch (e) { /* 静默 */ }
      const currentPlan = window.EnergySession?.getCurrentPlan?.();
      const planFresh = window.EnergySession?.session?.lastSolveMinute === slot;
      const planChanged = currentPlan !== lastDrawnPlan;
      if (planChanged) {
        lastDrawnPlan = currentPlan;
        try { drawTimeline(simMinute, currentPlan); } catch (e) { /* 静默 */ }
      }
      updateTimelinePlayhead(simMinute, currentPlan, planChanged, planFresh);
    }
  };
})();
