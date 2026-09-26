(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const SceneAPI = {
    ready: false,
    init,
    syncDevices,
    highlightDevice,
    updateFlows,
    setWeather,
    setTimeOfDay,
    rotateSelected,
    setLanguage,
    focusInfrastructure
  };

  let THREE;
  let GLTFLoader;
  let RGBELoader;
  let RoundedBoxGeometry;
  let MeshoptDecoder;
  let EffectComposer;
  let RenderPass;
  let UnrealBloomPass;
  let OutputPass;
  let SMAAPass;
  let composer;
  let bloomPass;
  let saoPass;
  let scene;
  let camera;
  let renderer;
  let root;
  let propsGroup;
  let deviceAccessoryGroup;
  let weatherFxGroup;
  let windowView;
  let windowViewTexture;
  let batteryFrontGlowMaterial;
  let batteryDisplayCanvas;
  let batteryDisplayTexture;
  let meterDisplayCanvas;
  let meterDisplayTexture;
  let rainSpeedsData;
  let rainLengthsData;
  let batteryScreenGlow;
  let batteryObject;
  let sunLight;
  let hemisphereLight;
  let warmInteriorLight;
  let coveLights = [];
  let lightningLight;
  const stormMotionPreference = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: true };
  let stormFlashStart = 0;
  let stormFlashSequence = [];
  let rainLines;
  let snowPoints;
  let drivewaySurface;
  let carObject;
  let evChargerObject;
  let evCable;
  let evPlug;
  let selectionRing;
  let stage;
  let canvas;
  let callback;
  let currentDevices = [];
  let currentFlows = { solar: 0, battery: 0, grid: 0, ev: 0 };
  let currentSoc = 62;
  let currentWeather = "clear";
  // Keep atmospheric haze beyond the cutaway house. A scene-wide fog starting
  // at 7-11 m also covered the furniture and made storm/snow unreadable.
  const WEATHER_STYLES = {
    clear: { background: 0x7895a4, fog: 0x7895a4, near: 30, far: 56, sun: 2.65, hemi: 1.3, warm: 9, exposure: 0.97, wet: 0, ground: 0x7e8587 },
    cloudy: { background: 0x586e79, fog: 0x586e79, near: 30, far: 54, sun: 1.65, hemi: 1.42, warm: 13, exposure: 0.98, wet: 0.08, ground: 0x747c80 },
    rain: { background: 0x273f4e, fog: 0x273f4e, near: 29, far: 52, sun: 0.72, hemi: 1.08, warm: 18, exposure: 0.95, wet: 0.72, ground: 0x59666c },
    storm: { background: 0x111d2a, fog: 0x111d2a, near: 28, far: 50, sun: 0.24, hemi: 0.72, warm: 22, exposure: 0.91, wet: 0.92, ground: 0x46545b },
    snow: { background: 0x9dabb2, fog: 0x9dabb2, near: 30, far: 54, sun: 1.05, hemi: 1.72, warm: 18, exposure: 1.0, wet: 0.4, ground: 0xd9e1e3 },
    night: { background: 0x0a1723, fog: 0x0a1723, near: 30, far: 54, sun: 0.08, hemi: 0.48, warm: 24, exposure: 0.74, wet: 0.1, ground: 0x38434a }
  };
  let currentLanguage = "zh";
  let activeSceneView = "site";
  let flowObjects = [];
  let interactiveObjects = [];
  let draggableEntries = [];
  let draggableMeshes = [];
  let fixedCollisionObjects = [];
  let activeFurnitureDrag = null;
  let selectedFurniture = null;
  let furnitureDragPlane;
  let dragRaycaster;
  let initialFurnitureLayouts = new Map();
  // The previous saved layout used oversized, ungrounded furniture. Do not reapply it to the measured v5 room.
  const FURNITURE_STORAGE_KEY = "solix-home-layout-v5";
  let propByType = new Map();
  let assetProgress = 0;
  let furnitureHydrationStarted = false;
  let furnitureAssetsReady = false;
  let furnitureStatusCopy = null;
  let orbit = { yaw: 0.18, pitch: 0.24, radius: 16.4, targetYaw: 0.18, targetPitch: 0.24, targetRadius: 16.4 };
  let cameraTarget = { x: 0, y: 1.15, z: 2.25, targetX: 0, targetY: 1.15, targetZ: 2.25 };
  let dragging = false;
  let dragMoved = false;
  let previousPointer = { x: 0, y: 0 };

  window.RealisticHomeScene = SceneAPI;
  /* 调试句柄（只读）：供自动化诊断场景内容/相机位置，不改任何行为 */
  window.__sceneDebug = {
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get root() { return root; },
    get orbitState() { return orbit; },
    get composer() { return composer; },
    get bloomPass() { return bloomPass; }
  };

  function paintFurnitureStatus() {
    const status = document.querySelector("#scene-assets-status");
    const hint = document.querySelector(".scene-hint");
    const loading = furnitureStatusCopy?.state !== "error" && Boolean(furnitureStatusCopy);
    if (hint) {
      hint.textContent = loading
        ? (currentLanguage === "en" ? "Models loading · furniture dragging unlocks when ready" : "模型载入中 · 完成后可拖动家具")
        : (currentLanguage === "en" ? "Drag blank space to orbit · drag objects to place · scroll to zoom · select to rotate" : "空白拖动旋转 · 物体拖动布置 · 滚轮缩放 · 选中后可旋转");
    }
    if (!status) return;
    if (!furnitureStatusCopy) { status.hidden = true; return; }
    const copy = currentLanguage === "en" ? furnitureStatusCopy.en : furnitureStatusCopy.zh;
    status.textContent = furnitureStatusCopy.progress == null ? copy : `${copy} · ${furnitureStatusCopy.progress}%`;
    status.dataset.state = furnitureStatusCopy.state || "loading";
    status.hidden = false;
  }

  function setFurnitureStatus(zh, en, progress = null, state = "loading") {
    furnitureStatusCopy = { zh, en, progress, state };
    paintFurnitureStatus();
  }

  function clearFurnitureStatus() {
    furnitureStatusCopy = null;
    paintFurnitureStatus();
  }

  function startFurnitureHydration() {
    if (furnitureHydrationStarted) return;
    furnitureHydrationStarted = true;
    setFurnitureStatus("准备载入客厅与车位模型", "Preparing living-room and driveway models");
    const start = () => { void hydrateFurnitureInPhases(); };
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(start, { timeout: 700 });
    else setTimeout(start, 120);
  }

  async function hydrateFurnitureInPhases() {
    let failures = 0;
    try {
      const heroAssets = new Set(["tesla-model-3", "sofa", "chair", "coffee-table", "tv-console", "tv-wall"]);
      setFurnitureStatus("正在载入客厅与车位模型", "Loading the living room and driveway");
      failures += await loadLicensedFurniture(heroAssets, ["正在载入客厅与车位模型", "Loading the living room and driveway"]);
      syncDevices(currentDevices);
      updateEvCable();

      const supportingAssets = new Set(["plant", "fridge", "lamp"]);
      setFurnitureStatus("正在补齐冰箱、灯具与绿植", "Loading the refrigerator, lamp and plant");
      failures += await loadLicensedFurniture(supportingAssets, ["正在补齐冰箱、灯具与绿植", "Loading the refrigerator, lamp and plant"]);
      syncDevices(currentDevices);
      updateEvCable();
      furnitureAssetsReady = true;

      if (failures) setFurnitureStatus("部分模型未载入，其余场景仍可使用", "Some models did not load; the rest of the scene is available", null, "error");
      else clearFurnitureStatus();
    } catch (error) {
      console.warn("Deferred furniture loading failed; keeping the energy scene available.", error);
      furnitureAssetsReady = true;
      setFurnitureStatus("部分模型未载入，其余场景仍可使用", "Some models did not load; the rest of the scene is available", null, "error");
    }
  }

  async function init(options = {}) {
    if (SceneAPI.ready || renderer) return;
    callback = typeof options.onSelectDevice === "function" ? options.onSelectDevice : () => {};
    currentDevices = Array.isArray(options.devices) ? options.devices : [];
    currentFlows = options.flows || currentFlows;
    currentSoc = Number.isFinite(options.soc) ? options.soc : currentSoc;
    currentWeather = options.weather || currentWeather;
    currentLanguage = options.language === "en" ? "en" : "zh";
    stage = document.querySelector("#scene-stage");
    canvas = document.querySelector("#home-canvas");
    const loaderUI = document.querySelector("#scene-loader");
    const fallbackUI = document.querySelector("#scene-fallback");

    try {
      updateLoaderCopy("正在准备家庭能源空间", "0%");
      const moduleNames = [
        "three",
        "three/addons/loaders/GLTFLoader.js",
        "three/addons/loaders/RGBELoader.js",
        "three/addons/geometries/RoundedBoxGeometry.js",
        "three/addons/libs/meshopt_decoder.module.js",
        "three/addons/postprocessing/EffectComposer.js",
        "three/addons/postprocessing/RenderPass.js",
        "three/addons/postprocessing/UnrealBloomPass.js",
        "three/addons/postprocessing/OutputPass.js",
        "three/addons/postprocessing/SMAAPass.js",
        "three/addons/lights/RectAreaLightUniformsLib.js"
      ];
      const modules = await Promise.all(moduleNames.map(async (name) => {
        try {
          return await import(name);
        } catch (firstError) {
          // Local servers occasionally abort one module while a WebGL-heavy page
          // is reloaded. One bounded retry is preferable to a false fallback.
          console.warn(`Retrying 3D module ${name}:`, firstError);
          await new Promise((resolve) => setTimeout(resolve, 420));
          return import(name === "three" ? name : `${name}?retry=1`);
        }
      }));
      THREE = modules[0];
      GLTFLoader = modules[1].GLTFLoader;
      RGBELoader = modules[2].RGBELoader;
      RoundedBoxGeometry = modules[3].RoundedBoxGeometry;
      MeshoptDecoder = modules[4].MeshoptDecoder;
      EffectComposer = modules[5].EffectComposer;
      RenderPass = modules[6].RenderPass;
      // SAOPass 已随性能优化移除——不再加载，省一次网络请求与解析
      UnrealBloomPass = modules[7].UnrealBloomPass;
      OutputPass = modules[8].OutputPass;
      SMAAPass = modules[9].SMAAPass;
      modules[10].RectAreaLightUniformsLib.init();

      setupRenderer();
      setupScene();
      buildArchitecturalShell();
      buildExteriorEnergyYard();
      buildWeatherEffects();
      await buildBatteryFromOfficialReferences();
      buildDetailedAppliances();
      buildEnergyInfrastructure();
      SceneAPI.ready = true;
      syncDevices(currentDevices);
      bindInteraction();
      resize();
      new ResizeObserver(resize).observe(stage);
      /* 卡顿优化 B：视口可见性用 IntersectionObserver 驱动渲染闸门（替代每帧 getBoundingClientRect） */
      const visibilityObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          // rootMargin 外扩 80px：舞台接近视口就提前恢复渲染，滚入无白帧
          stageVisible = entry.isIntersecting || entry.boundingClientRect.bottom > -80 && entry.boundingClientRect.top < innerHeight + 80;
          window.__stageVis = stageVisible; /* 调试暴露 */
          if (stageVisible) startFurnitureHydration();
        }
      }, { rootMargin: "80px" });
      visibilityObserver.observe(stage);
      /* 兜底：IO 在个别环境（后台 tab/极端驱动）可能延迟 fire——scroll 节流检查补位 */
      let lastScrollCheck = 0;
      window.addEventListener("scroll", () => {
        const now = performance.now();
        if (now - lastScrollCheck < 500) return;
        lastScrollCheck = now;
        const rect = stage.getBoundingClientRect();
        stageVisible = rect.bottom > -80 && rect.top < innerHeight + 80;
        if (stageVisible) startFurnitureHydration();
      }, { passive: true });

      loaderUI.hidden = true;
      fallbackUI.hidden = true;
      updateFlows(currentFlows, currentSoc);
      setWeather(currentWeather);
      setLanguage(currentLanguage);
      paintFurnitureStatus();
      animate();
    } catch (error) {
      console.error("Realistic 3D scene failed:", error);
      /* 韧性修复：init 主体（renderer+场景）成功后、收尾段（updateFlows/setWeather/animate 等）
       * 的瞬态错误不该把整块 3D 判死——那会让用户看到"暂未载入"而实际场景已就绪。
       * renderer 已存在 ⇒ 场景可渲染：隐藏 fallback、确保动画循环启动。 */
      loaderUI.hidden = true;
      if (renderer && THREE) {
        console.warn("Scene init had a non-fatal error after renderer setup; keeping 3D alive.");
        fallbackUI.hidden = true;
        try { updateFlows(currentFlows, currentSoc); } catch (e2) { console.warn(e2); }
        try { setWeather(currentWeather); } catch (e2) { console.warn(e2); }
        try { setLanguage(currentLanguage); } catch (e2) { console.warn(e2); }
        try { animate(); } catch (e2) { console.warn(e2); }
      } else {
        fallbackUI.hidden = false;
        fallbackUI.querySelector("strong").textContent = "高精度 3D 场景暂未载入";
        fallbackUI.querySelector("p").textContent = "产品摄影与实时用电模拟仍可正常使用。";
      }
    }
  }

  function setupRenderer() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    /* 黑屏修复：preserveDrawingBuffer:true。默认 false 时浏览器合成完一帧立即清空 GL 后备缓冲，
     * 在部分驱动/HDR 屏/混合 GPU（用户 Edge 实测）上合成器拿不到帧内容 → 用户看到纯黑画布，
     * 而代码层 readPixels（合成前）却能读到画面——正是"我这边验证正常、用户屏幕黑"的元凶。
     * true 保留后备缓冲，合成器任何时刻都能取到完整帧；代价是微小显存占用，可忽略。 */
    /* 性能修复：pixelRatio 上限从 2 降到 1.5。后期管线(SAO+Bloom+SMAA)的像素量与 pr² 成正比，
     * pr=2 时是 4 倍全屏像素——这是"启动后非常卡"的最大元凶。1.5 在视觉上几乎无差。 */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    /* 性能大刀#1：阴影贴图按需重绘。此前每帧都把全部物体重画进 2048 阴影贴图，
     * 但场景里 99% 时间阴影没变（相机旋转/天气灯强变化都不改变阴影形状）。
     * autoUpdate=false 后只在物体移动/布局变化时置 needsUpdate 重绘一次。 */
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18242b);
    scene.fog = new THREE.Fog(0x18242b, 18, 31);
    camera = new THREE.PerspectiveCamera(39, 1, 0.08, 80);
    root = new THREE.Group();
    propsGroup = new THREE.Group();
    deviceAccessoryGroup = new THREE.Group();
    scene.add(root);
    root.add(propsGroup, deviceAccessoryGroup);

    // P1-3: 后期管线——轻量 Bloom（屏幕/指示灯/能量流辉光）。
    // 【真机黑屏修复 20260925】用户端（Edge/核显 HDR 路径）再次出现"canvas 黑、UI 正常"：
    // 与上次根因同族——EffectComposer 多 pass 中间缓冲在该合成路径下帧不可见。
    // 处置：默认直渲（composer=null），Bloom/SMAA 不再参与首屏；启动后探测到帧健康
    // 且非黑帧 → 800ms 后再挂后期管线（渐进增强）。看门狗保留兜底。
    const wantPost = false;
    if (wantPost) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      composer.addPass(new RenderPass(scene, camera));
      saoPass = null;
      const bloomScale = 0.5;
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(1600 * bloomScale, 1000 * bloomScale), 0.16, 0.42, 0.93);
      composer.addPass(bloomPass);
      composer.addPass(new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()));
      composer.addPass(new OutputPass());
    } else {
      composer = null;
      bloomPass = null;
      saoPass = null;
    }
  }

  function setupScene() {
    /* 黄金时刻氛围（学习安克官方渲染）：暖阳低角度 + 天光微冷对比，暖而不闷 */
    hemisphereLight = new THREE.HemisphereLight(0xbcd8ea, 0x5a4a3c, 1.35);
    scene.add(hemisphereLight);

    sunLight = new THREE.DirectionalLight(0xffd9a8, 3.25);
    sunLight.position.set(-7.5, 6.2, 9.5);
    sunLight.castShadow = true;
    // Bug修复：实时阴影强度减半（三层阴影叠加把车底/家具底压成死黑），保留轮廓但不糊地板
    sunLight.intensity = 2.4;
    sunLight.shadow.intensity = 0.55;
    // 性能修复（卡顿优化 2026-09-25）：阴影贴图 2048→1024（4 倍显存/填充率节省，室内尺度下视觉几乎无差）
    sunLight.shadow.mapSize.set(1024, 1024);
    // 阴影相机范围收紧到实际建筑尺寸（房子 11.4×8.5，±10 足够）——越小阴影分辨率越高
    sunLight.shadow.camera.left = -10;
    sunLight.shadow.camera.right = 10;
    sunLight.shadow.camera.top = 10;
    sunLight.shadow.camera.bottom = -10;
    sunLight.shadow.bias = -0.00045;
    // Bug修复：实车底死黑——半径3blur让阴影边缘柔和过渡，不再是硬边黑块
    sunLight.shadow.radius = 3;
    scene.add(sunLight);

    const windowLight = new THREE.RectAreaLight(0xa9ddff, 5.2, 5.5, 4.2);
    windowLight.position.set(-4.65, 2.7, -0.5);
    windowLight.rotation.y = Math.PI / 2;
    root.add(windowLight);

    warmInteriorLight = new THREE.PointLight(0xffae68, 16, 9, 2);
    warmInteriorLight.position.set(1.1, 3.0, 1.2);
    warmInteriorLight.castShadow = true;
    root.add(warmInteriorLight);
    /* 隐藏灯带（学习官方渲染的 cove lighting）：东/西墙各一条 RectAreaLight 洗墙光，
     * 见光不见灯——墙上没有灯具模型，只有柔和的暖光渐变，高级感主要来源 */
    coveLights = [
      { light: new THREE.RectAreaLight(0xffc386, 2.6, 8.0, 0.5), pos: [0, 4.35, 4.15], rot: [0, Math.PI, 0] },
      { light: new THREE.RectAreaLight(0xffc386, 2.2, 3.2, 0.4), pos: [-5.55, 4.3, 0.4], rot: [0, Math.PI / 2, 0] }
    ];
    coveLights.forEach(({ light, pos, rot }) => {
      light.position.set(...pos);
      light.rotation.set(...rot);
      root.add(light);
    });

    lightningLight = new THREE.PointLight(0xd9efff, 0, 28, 1.35);
    lightningLight.position.set(-4, 10, 7);
    scene.add(lightningLight);

    const productRim = new THREE.SpotLight(0xa9e9ff, 24, 9, 0.48, 0.55, 1.4);
    productRim.position.set(4.4, 4.7, 2.8);
    productRim.target.position.set(2.65, 0.65, -2.7);
    root.add(productRim, productRim.target);

    const pmrem = new THREE.PMREMGenerator(renderer);
    // P0-1: 室外 HDRI（venice sunset）——车漆/玻璃/混凝土反射才符合室外场景
    new RGBELoader().load("assets/models/venice_sunset_1k.hdr", (texture) => {
      const environment = pmrem.fromEquirectangular(texture).texture;
      scene.environment = environment;
      scene.environmentIntensity = 0.9;
      texture.dispose();
      pmrem.dispose();
    });
  }

  function buildArchitecturalShell() {
    const woodLoader = new THREE.TextureLoader();
    const oak = woodLoader.load("assets/models/wood-floor/wood_floor_diff_1k.jpg");
    const oakNormal = woodLoader.load("assets/models/wood-floor/wood_floor_nor_gl_1k.jpg");
    const oakRoughness = woodLoader.load("assets/models/wood-floor/wood_floor_rough_1k.jpg");
    for (const texture of [oak, oakNormal, oakRoughness]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(5.4, 4.1);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    oak.colorSpace = THREE.SRGBColorSpace;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.22, 8.5),
      new THREE.MeshStandardMaterial({ map: oak, normalMap: oakNormal, roughnessMap: oakRoughness, color: 0xc7b7a5, roughness: 0.78, metalness: 0.01 })
    );
    floor.position.y = -0.12;
    floor.receiveShadow = true;
    root.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe5e2dc, roughness: 0.94, metalness: 0.01 });
    // A real opening, not a photograph projected onto an opaque wall.  The old wall
    // occluded the exterior plane and made the window look like white plastic.
    for (const [width, height, x, y] of [
      [5.85, 4.8, 2.775, 2.3],
      [5.55, 0.92, -2.925, 0.4],
      [5.55, 0.64, -2.925, 4.48]
    ]) {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.18), wallMaterial);
      segment.position.set(x, y, -4.2);
      segment.receiveShadow = true;
      root.add(segment);
    }
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4.8, 8.5), wallMaterial);
    sideWall.position.set(5.7, 2.3, 0);
    sideWall.receiveShadow = true;
    root.add(sideWall);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.12, 8.5),
      new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.95 })
    );
    ceiling.position.y = 4.72;
    ceiling.visible = false;
    root.add(ceiling);

    // Restrained joinery and a real sill keep the cutaway legible at every view.
    const skirtingMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d6cd, roughness: 0.62, metalness: 0.04 });
    const backSkirting = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.13, 0.045), skirtingMaterial);
    backSkirting.position.set(0, 0.085, -4.09);
    root.add(backSkirting);
    const sideSkirting = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 8.5), skirtingMaterial);
    sideSkirting.position.set(5.59, 0.085, 0);
    root.add(sideSkirting);

    const sillMaterial = new THREE.MeshStandardMaterial({ color: 0xefece4, roughness: 0.5, metalness: 0.06 });
    const windowSill = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.065, 0.22), sillMaterial);
    windowSill.position.set(-2.85, 0.89, -4.02);
    windowSill.castShadow = true;
    root.add(windowSill);
    const sillLowerTrim = new THREE.Mesh(new THREE.BoxGeometry(5.42, 0.035, 0.17), skirtingMaterial);
    sillLowerTrim.position.set(-2.85, 0.84, -4.0);
    root.add(sillLowerTrim);

    const seamMaterial = new THREE.MeshBasicMaterial({ color: 0xc9c5ba, transparent: true, opacity: 0.24 });
    for (let seamIndex = 0; seamIndex < 2; seamIndex += 1) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, 4.7, 0.02), seamMaterial);
      seam.position.set(1.45 + seamIndex * 2.6, 2.3, -4.105);
      root.add(seam);
    }

    buildWindow();
    buildKitchen();
    buildRug();
    buildBalconySolar();
  }

  function buildExteriorEnergyYard() {
    const exterior = new THREE.Group();
    exterior.name = "exterior-energy-yard";

    const terrainBase = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.34, 18),
      new THREE.MeshStandardMaterial({ color: 0x35434a, roughness: 0.96, metalness: 0.01 })
    );
    terrainBase.position.set(0, -0.34, 3.25);
    terrainBase.receiveShadow = true;
    exterior.add(terrainBase);

    // P1-1: 车道用真实混凝土 PBR 贴图（ambientCG Concrete034，CC0）。setWeather 仍动态改 color/roughness 实现湿地效果。
    const concreteTextureLoader = new THREE.TextureLoader();
    const concreteColor = concreteTextureLoader.load("assets/models/concrete034/Concrete034_2K-JPG_Color.jpg");
    const concreteNormal = concreteTextureLoader.load("assets/models/concrete034/Concrete034_1K-JPG_NormalGL.jpg");
    const concreteRough = concreteTextureLoader.load("assets/models/concrete034/Concrete034_2K-JPG_Roughness.jpg");
    [concreteColor, concreteNormal, concreteRough].forEach((texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2.6, 1.5);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    concreteColor.colorSpace = THREE.SRGBColorSpace;
    const concrete = new THREE.MeshPhysicalMaterial({
      map: concreteColor,
      normalMap: concreteNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: concreteRough,
      color: 0xaeb4b6,
      roughness: 0.82,
      metalness: 0.02,
      clearcoat: 0.05,
      clearcoatRoughness: 0.55
    });
    drivewaySurface = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.18, 6.4), concrete);
    drivewaySurface.position.set(0, -0.09, 7.45);
    drivewaySurface.receiveShadow = true;
    exterior.add(drivewaySurface);

    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.16, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x29343b, roughness: 0.44, metalness: 0.52 })
    );
    threshold.position.set(0, 0.03, 4.25);
    exterior.add(threshold);

    const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x5d6466, transparent: true, opacity: 0.55 });
    for (let index = -4; index <= 4; index += 1) {
      const joint = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 6.12), jointMaterial);
      joint.position.set(index * 1.14, 0.012, 7.46);
      exterior.add(joint);
    }

    const chargerPost = new THREE.Mesh(
      new RoundedBoxGeometry(0.7, 1.62, 0.38, 7, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x162631, roughness: 0.42, metalness: 0.64 })
    );
    chargerPost.position.y = 0.81;
    const charger = new THREE.Group();
    charger.name = "Anker SOLIX V1 Smart EV Charger";
    charger.add(chargerPost);
    const chargerFace = new THREE.Mesh(
      new RoundedBoxGeometry(0.55, 1.04, 0.055, 8, 0.085),
      new THREE.MeshPhysicalMaterial({ color: 0x283944, roughness: 0.24, metalness: 0.46, clearcoat: 0.55, clearcoatRoughness: 0.18 })
    );
    chargerFace.position.set(0, 0.88, 0.218);
    charger.add(chargerFace);
    const touchBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.3, 0.34, 0.018, 8, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x07141d })
    );
    touchBar.position.set(0, 1.01, 0.253);
    charger.add(touchBar);
    const chargeArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.095, 0.012, 10, 42, Math.PI * 1.55),
      new THREE.MeshBasicMaterial({ color: 0x31d5f4, transparent: true, opacity: 0.9 })
    );
    chargeArc.position.set(0, 1.01, 0.266);
    chargeArc.rotation.z = -0.9;
    charger.add(chargeArc);
    const logoPlate = makeTextPlate("ANKER SOLIX", "SMART EV CHARGER");
    logoPlate.scale.setScalar(0.18);
    logoPlate.position.set(0, 1.39, 0.258);
    charger.add(logoPlate);
    charger.position.set(4.75, 0, 6.2);
    charger.rotation.y = -0.16;
    exterior.add(charger);
    evChargerObject = charger;
    registerFixedCollision(charger, "ev-charger");
    // P0-3: 充电桩接触阴影
    addGroundingShadow(charger, 0.52, 0.36, { opacity: 0.44, lift: 0.014 });

    const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1115, roughness: 0.38, metalness: 0.62 });
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.95, 0.65, 6.28),
      new THREE.Vector3(5.12, 0.38, 6.65),
      new THREE.Vector3(4.55, 0.16, 7.45),
      new THREE.Vector3(2.15, 0.58, 7.55)
    ]);
    evCable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 48, 0.035, 8, false), cableMaterial);
    exterior.add(evCable);
    evPlug = new THREE.Group();
    const plugBody = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.13, 0.1, 5, 0.025), cableMaterial);
    const plugLight = new THREE.Mesh(new THREE.RingGeometry(0.025, 0.038, 20), new THREE.MeshBasicMaterial({ color: 0x31d5f4, side: THREE.DoubleSide }));
    plugLight.position.z = 0.056;
    evPlug.add(plugBody, plugLight);
    exterior.add(evPlug);

    // The two rounded green bars at the driveway edge were placeholder hedges,
    // not licensed foliage models. Leave the forecourt clean instead of using
    // unconvincing geometry beside the photoreal car and charger.

    const bollardMaterial = new THREE.MeshStandardMaterial({ color: 0x26343b, roughness: 0.35, metalness: 0.72 });
    [-4.25, 3.85].forEach((x) => {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.64, 18), bollardMaterial);
      bollard.position.set(x, 0.32, 5.1);
      exterior.add(bollard);
      const lamp = new THREE.PointLight(0xffc982, 3.5, 4.2, 2);
      lamp.position.set(x, 0.68, 5.1);
      exterior.add(lamp);
    });

    root.add(exterior);
  }

  function buildWeatherEffects() {
    weatherFxGroup = new THREE.Group();
    weatherFxGroup.name = "weather-effects";

    // P2-1: 雨滴带随机长度/速度/倾角，疏密不均（成簇），不再是均匀"面条雨"。
    const rainCount = 650;
    const rainPositions = new Float32Array(rainCount * 6);
    const rainSpeeds = new Float32Array(rainCount);
    const rainLengths = new Float32Array(rainCount);
    // Precipitation belongs outdoors (driveway/forecourt), never over the sofa.
    const clusterCenters = Array.from({ length: 7 }, () => ({ x: -4.5 + Math.random() * 9, z: 7.4 + Math.random() * 2.6, spread: 1.2 + Math.random() * 2.0 }));
    for (let index = 0; index < rainCount; index += 1) {
      const cluster = clusterCenters[index % clusterCenters.length];
      const inCluster = index % 3 !== 2;
      const x = inCluster
        ? cluster.x + (Math.random() - 0.5) * cluster.spread
        : -7.5 + Math.random() * 15;
      const z = Math.max(7.0, inCluster
        ? cluster.z + (Math.random() - 0.5) * cluster.spread
        : 7.0 + Math.random() * 3.6);
      const y = 0.35 + Math.random() * 1.65;
      const length = 0.2 + Math.random() * 0.42;
      const skew = 0.06 + Math.random() * 0.12;
      const offset = index * 6;
      rainPositions[offset] = x;
      rainPositions[offset + 1] = y;
      rainPositions[offset + 2] = z;
      rainPositions[offset + 3] = x - skew;
      rainPositions[offset + 4] = y - length;
      rainPositions[offset + 5] = z + skew * 0.5;
      rainSpeeds[index] = 0.1 + Math.random() * 0.26;
      rainLengths[index] = length;
    }
    rainSpeedsData = rainSpeeds;
    rainLengthsData = rainLengths;
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
    rainLines = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0x9ad7ef, transparent: true, opacity: 0.24, depthWrite: false }));
    rainLines.visible = false;
    weatherFxGroup.add(rainLines);

    const snowPositions = new Float32Array(450 * 3);
    for (let index = 0; index < 450; index += 1) {
      // Snow is also restricted to the exterior foreground.
      snowPositions[index * 3] = -6 + Math.random() * 12;
      snowPositions[index * 3 + 1] = 0.35 + Math.random() * 1.65;
      snowPositions[index * 3 + 2] = 7.0 + Math.random() * 3.6;
    }
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
    snowPoints = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: 0xeaf7ff, size: 0.055, transparent: true, opacity: 0.82, depthWrite: false }));
    snowPoints.visible = false;
    weatherFxGroup.add(snowPoints);
    scene.add(weatherFxGroup);
  }

  function updateEvCable() {
    if (!evCable || !carObject) return;
    const carEnd = new THREE.Vector3(carObject.position.x + 2.05, 0.63, carObject.position.z + 0.18);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.95, 0.65, 6.28),
      new THREE.Vector3(5.16, 0.32, 6.72),
      new THREE.Vector3((4.95 + carEnd.x) * 0.5, 0.15, (6.55 + carEnd.z) * 0.5),
      carEnd
    ]);
    evCable.geometry.dispose();
    evCable.geometry = new THREE.TubeGeometry(curve, 48, 0.035, 8, false);
    if (evPlug) {
      evPlug.position.copy(carEnd);
      evPlug.rotation.set(0, carObject.rotation.y + Math.PI / 2, 0);
    }
  }

  /* 官网设计语言#14：EV 线缆能量流光——充电时线缆 emissive 随功率呼吸（科技感点睛） */
  function updateEvCableGlow(elapsed, evKw) {
    if (!evCable) return;
    const material = evCable.material;
    if (!material.emissive) return;
    const intensity = Math.min(evKw / 7.4, 1);
    material.emissive.setHex(0x22b7df);
    material.emissiveIntensity = intensity * (0.28 + Math.sin(elapsed * 2.4) * 0.16);
  }

  function buildWindow() {
    const exterior = new THREE.Group();
    exterior.name = "courtyard-window-view";
    const image = new THREE.TextureLoader().load("assets/courtyard-dusk-v2.jpg");
    image.colorSpace = THREE.SRGBColorSpace;
    image.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const photograph = new THREE.Mesh(
      new THREE.PlaneGeometry(5.35, 3.22),
      new THREE.MeshBasicMaterial({ map: image, toneMapped: false, side: THREE.DoubleSide })
    );
    photograph.position.set(-2.85, 2.54, -4.13);
    exterior.add(photograph);
    root.add(exterior);
    windowView = exterior;

    const aluminium = new THREE.MeshStandardMaterial({ color: 0x171e23, metalness: 0.78, roughness: 0.31 });
    const frames = [
      [5.46, 0.085, -2.85, 4.18], [5.46, 0.085, -2.85, 0.9],
      [0.075, 3.36, -5.54, 2.54], [0.075, 3.36, -0.16, 2.54],
      [0.06, 3.28, -3.75, 2.54], [0.06, 3.28, -1.95, 2.54]
    ];
    for (const [width, height, x, y] of frames) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.075), aluminium);
      frame.position.set(x, y, -4.015);
      frame.castShadow = true;
      root.add(frame);
    }
    // Almost invisible glazing: reflections come from the HDRI, not a white opaque plane.
    const glazing = new THREE.Mesh(
      new THREE.PlaneGeometry(5.28, 3.2),
      new THREE.MeshPhysicalMaterial({ color: 0xd5e6ed, transparent: true, opacity: 0.055,
        metalness: 0, roughness: 0.11, side: THREE.DoubleSide, depthWrite: false })
    );
    glazing.position.set(-2.85, 2.54, -3.99);
    root.add(glazing);
  }

  function buildWindowLegacy() {
    /* 官网设计语言#14 重制：落地玻璃幕墙（黑窄框）+ 程序化城市天际线剪影 + 天空渐变。
     * 旧实现贴 night-home_c.jpg 被用户评"窗户贴图劣质"——改为纯程序化：
     * ① 大幅渐变天空（黄昏暖橙→暮蓝） ② 三层视差楼群剪影 ③ 加高透玻璃反射。
     * 楼群带少量亮窗点阵，黄昏氛围与场景暖阳呼应，天气切换时整体变色。 */
    const viewGroup = new THREE.Group();

    // ① 天空渐变幕布（黄昏金 → 暮蓝 → 深蓝顶）
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 512; skyCanvas.height = 512;
    const sctx = skyCanvas.getContext("2d");
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#1c3350");
    grad.addColorStop(0.42, "#4a6a8c");
    grad.addColorStop(0.68, "#c98d5a");
    grad.addColorStop(0.86, "#e8b078");
    grad.addColorStop(1, "#f2c98e");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 512, 512);
    // 柔光太阳
    const sunGlow = sctx.createRadialGradient(150, 400, 10, 150, 400, 190);
    sunGlow.addColorStop(0, "rgba(255,222,170,0.85)");
    sunGlow.addColorStop(1, "rgba(255,222,170,0)");
    sctx.fillStyle = sunGlow;
    sctx.fillRect(0, 0, 512, 512);
    const skyTexture = new THREE.CanvasTexture(skyCanvas);
    skyTexture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 3.25),
      new THREE.MeshBasicMaterial({ map: skyTexture, toneMapped: false })
    );
    sky.position.set(0, 1.66, -0.35);
    viewGroup.add(sky);

    // ② 三层城市剪影（由远及近：淡蓝 → 青灰 → 深蓝黑），配零星亮窗
    const layers = [
      { color: "#7d94ac", baseY: 0.62, hMin: 0.5, hMax: 1.15, n: 14, seed: 7, lit: 0.0, depth: -0.32 },
      { color: "#4f637c", baseY: 0.42, hMin: 0.6, hMax: 1.5, n: 11, seed: 23, lit: 0.06, depth: -0.2 },
      { color: "#26374d", baseY: 0.2, hMin: 0.7, hMax: 1.9, n: 8, seed: 51, lit: 0.12, depth: -0.08 }
    ];
    layers.forEach((L) => {
      const lc = document.createElement("canvas");
      lc.width = 1024; lc.height = 256;
      const ctx = lc.getContext("2d");
      let x = 0;
      let s = L.seed;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      while (x < 1024) {
        const w = 40 + rnd() * 85;
        const h = L.hMin * 100 + rnd() * (L.hMax - L.hMin) * 100;
        ctx.fillStyle = L.color;
        ctx.fillRect(x, 256 - h, w - 6, h);
        // 亮窗点阵（黄昏氛围）
        if (L.lit > 0) {
          ctx.fillStyle = "rgba(255,214,150,0.9)";
          for (let wy = 256 - h + 12; wy < 246; wy += 16) {
            for (let wx = x + 8; wx < x + w - 14; wx += 14) {
              if (rnd() < L.lit) ctx.fillRect(wx, wy, 5, 7);
            }
          }
        }
        x += w;
      }
      const tex = new THREE.CanvasTexture(lc);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 1.55),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
      );
      mesh.position.set(0, L.baseY + 0.28, L.depth);
      viewGroup.add(mesh);
    });

    // 地平线绿化带（远处树影，柔化楼脚）
    const treeCanvas = document.createElement("canvas");
    treeCanvas.width = 1024; treeCanvas.height = 96;
    const tctx = treeCanvas.getContext("2d");
    let tx = 0; let ts = 91;
    const trnd = () => { ts = (ts * 16807) % 2147483647; return ts / 2147483647; };
    while (tx < 1024) {
      const tw = 26 + trnd() * 60;
      const th = 24 + trnd() * 46;
      tctx.fillStyle = `rgba(38,58,48,${0.65 + trnd() * 0.3})`;
      tctx.beginPath();
      tctx.ellipse(tx + tw / 2, 96, tw / 2, th / 2, 0, 0, Math.PI * 2);
      tctx.fill();
      tx += tw * 0.62;
    }
    const treeTex = new THREE.CanvasTexture(treeCanvas);
    const trees = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 0.62),
      new THREE.MeshBasicMaterial({ map: treeTex, transparent: true, toneMapped: false })
    );
    trees.position.set(0, 0.31, -0.055);
    viewGroup.add(trees);

    viewGroup.position.set(-2.85, 0.92, -4.06);
    root.add(viewGroup);
    windowView = viewGroup;

    /* 黑窄框落地幕墙（参考图同款）：顶部/底部横梁 + 两侧立柱 + 三根竖向分隔，全部窄截面金属 */
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.32, metalness: 0.82 });
    const frameParts = [
      [5.42, 0.1, 0.1, -2.85, 4.16, -3.96],
      [5.42, 0.1, 0.1, -2.85, 0.92, -3.96],
      [0.1, 3.42, 0.1, -5.52, 2.54, -3.96],
      [0.1, 3.42, 0.1, -0.18, 2.54, -3.96],
      [0.055, 3.22, 0.08, -4.4, 2.54, -3.94],
      [0.055, 3.22, 0.08, -2.85, 2.54, -3.94],
      [0.055, 3.22, 0.08, -1.3, 2.54, -3.94]
    ];
    frameParts.forEach(([w, h, d, x, y, z]) => {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMaterial);
      part.position.set(x, y, z);
      root.add(part);
    });
    /* 高透玻璃：低着色+强 clearcoat 反射，黄昏天空在玻璃上有柔和倒影 */
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(5.18, 3.22),
      new THREE.MeshPhysicalMaterial({
        color: 0xcfe4ee, transparent: true, opacity: 0.09,
        roughness: 0.05, metalness: 0, transmission: 0.6, thickness: 0.015,
        clearcoat: 1.0, clearcoatRoughness: 0.06, envMapIntensity: 1.8,
        side: THREE.DoubleSide
      })
    );
    glass.position.set(-2.85, 2.54, -3.9);
    root.add(glass);
  }

  function buildKitchen() {
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x9a8069, roughness: 0.68, metalness: 0.02 });
    const counterMat = new THREE.MeshStandardMaterial({ color: 0xd9d3c9, roughness: 0.3, metalness: 0.05 });
    for (let index = 0; index < 4; index += 1) {
      const cabinet = new THREE.Mesh(new RoundedBoxGeometry(1.03, 0.86, 0.62, 5, 0.045), cabinetMat);
      cabinet.position.set(0.38 + index * 1.05, 0.44, -3.78);
      cabinet.castShadow = true;
      root.add(cabinet);
    }
    const counter = new THREE.Mesh(new RoundedBoxGeometry(4.36, 0.09, 0.74, 4, 0.035), counterMat);
    counter.position.set(1.96, 0.92, -3.72);
    counter.castShadow = true;
    root.add(counter);
    registerFixedCollision(counter, "kitchen-counter");
    for (let index = 0; index < 3; index += 1) {
      const upper = new THREE.Mesh(new RoundedBoxGeometry(1.34, 0.9, 0.43, 5, 0.04), cabinetMat);
      upper.position.set(0.65 + index * 1.38, 3.45, -3.86);
      upper.castShadow = true;
      root.add(upper);
    }
    const backsplash = new THREE.Mesh(
      new THREE.PlaneGeometry(4.25, 1.3),
      new THREE.MeshStandardMaterial({ color: 0xd3d0c9, roughness: 0.42, metalness: 0.04 })
    );
    backsplash.position.set(1.96, 1.65, -4.08);
    root.add(backsplash);

    const led = new THREE.Mesh(new THREE.BoxGeometry(4.05, 0.025, 0.035), new THREE.MeshBasicMaterial({ color: 0xffb66e }));
    led.position.set(1.96, 2.92, -3.62);
    root.add(led);
  }

  function buildRug() {
    const fabricLoader = new THREE.TextureLoader();
    const fabricBase = "assets/models/rug-fabric/poly_wool_herringbone_";
    const rugColor = fabricLoader.load(`${fabricBase}diff_1k.jpg`);
    const rugNormal = fabricLoader.load(`${fabricBase}nor_gl_1k.jpg`);
    const rugRoughness = fabricLoader.load(`${fabricBase}rough_1k.jpg`);
    [rugColor, rugNormal, rugRoughness].forEach((texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 6);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });
    rugColor.colorSpace = THREE.SRGBColorSpace;
    const rug = new THREE.Mesh(
      new RoundedBoxGeometry(4.4, 0.035, 3.25, 6, 0.1),
      new THREE.MeshStandardMaterial({
        map: rugColor, normalMap: rugNormal, roughnessMap: rugRoughness,
        normalScale: new THREE.Vector2(0.23, 0.23),
        color: 0xb5aea6, roughness: 0.98, metalness: 0
      })
    );
    rug.position.set(0.25, 0.025, 1.0);
    rug.receiveShadow = true;
    root.add(rug);
  }

  function buildBalconySolar() {
    // A shallow roof over the back-left bay supports the four-panel array.  Its
    // open front preserves the furnished-room cutaway from the default camera.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.12, 3.45),
      new THREE.MeshStandardMaterial({ color: 0x313b40, metalness: 0.18, roughness: 0.76 })
    );
    roof.name = "solar-roof-deck";
    roof.position.set(-3.1, 4.82, -2.53);
    roof.castShadow = true;
    roof.receiveShadow = true;
    root.add(roof);
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 0.15, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x222b30, metalness: 0.34, roughness: 0.62 })
    );
    fascia.position.set(-3.1, 4.82, -0.81);
    root.add(fascia);
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x4b575b, metalness: 0.55, roughness: 0.48 });
    for (const x of [-5.68, -0.54]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.085, 4.8, 0.085), pillarMaterial);
      pillar.position.set(x, 2.4, -0.84);
      pillar.castShadow = true;
      root.add(pillar);
    }

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x9da9af, metalness: 0.78, roughness: 0.3 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x38464c, metalness: 0.64, roughness: 0.42 });
    const panelTextureCanvas = document.createElement("canvas");
    panelTextureCanvas.width = 1024; panelTextureCanvas.height = 576;
    const ctx = panelTextureCanvas.getContext("2d");
    ctx.fillStyle = "#0a1e2b"; ctx.fillRect(0, 0, 1024, 576);
    for (let row = 0; row < 6; row += 1) for (let col = 0; col < 10; col += 1) {
      const gradient = ctx.createLinearGradient(col * 102 + 5, 0, col * 102 + 100, 576);
      gradient.addColorStop(0, "#122f42"); gradient.addColorStop(0.5, "#1a4052"); gradient.addColorStop(1, "#0c2738");
      ctx.fillStyle = gradient;
      ctx.fillRect(col * 102 + 5, row * 96 + 5, 92, 86);
      ctx.strokeStyle = "rgba(154,190,206,.18)";
      ctx.strokeRect(col * 102 + 6, row * 96 + 6, 90, 84);
    }
    const cells = new THREE.CanvasTexture(panelTextureCanvas);
    cells.colorSpace = THREE.SRGBColorSpace;
    cells.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const cellMat = new THREE.MeshPhysicalMaterial({ map: cells, metalness: 0.26, roughness: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.22 });
    const tilt = 0.25;
    for (const x of [-4.55, -2.15]) for (const z of [-3.38, -1.87]) {
      const panel = new THREE.Group();
      panel.name = "roof-mounted-pv-panel";
      const tray = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.07, 1.22, 3, 0.022), frameMat);
      const cellSurface = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.12), cellMat);
      cellSurface.rotation.x = -Math.PI / 2;
      cellSurface.position.y = 0.041;
      panel.add(tray, cellSurface);
      panel.position.set(x, 5.14, z);
      panel.rotation.x = tilt;
      panel.castShadow = true;
      root.add(panel);
      for (const sx of [-0.94, 0.94]) for (const sz of [-0.48, 0.48]) {
        const bottom = 5.14 - sz * Math.sin(tilt) - 0.04;
        const length = Math.max(0.09, bottom - 4.88);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.045, length, 0.045), railMat);
        leg.position.set(x + sx, 4.88 + length / 2, z + sz);
        root.add(leg);
      }
    }
  }

  function buildBalconySolarLegacy() {
    /* 太阳能板重摆（依据 Anker 官方安装指南）：
     * ① 倾角 = 纬度 ≈ 32-35°（北美/欧洲中纬度官方推荐值），不再是 14° 的"快躺平"；
     * ② 贴屋顶安装 + 可见倾角支架，不再是半空漂浮；
     * ③ 阵列位于建筑左半屋顶、居中对齐，朝向正面(+z/南)采光。 */
    const panelGroup = new THREE.Group();
    const panelMaterial = new THREE.MeshPhysicalMaterial({ color: 0x174d69, roughness: 0.24, metalness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.24 });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xc4cbd0, roughness: 0.28, metalness: 0.82 });
    const bracketMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4448, roughness: 0.45, metalness: 0.7 });
    const TILT = -0.58; // ≈33°，Anker 官方推荐纬度倾角
    for (let row = 0; row < 2; row += 1) {
      for (let index = 0; index < 2; index += 1) {
        const unit = new THREE.Group();
        const frame = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.08, 1.28, 4, 0.035), frameMaterial);
        const panel = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.085, 1.13, 4, 0.025), panelMaterial);
        panel.position.y = 0.035;
        const cellLines = new THREE.Group();
        for (let column = -4; column <= 4; column += 1) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 1.08), new THREE.MeshBasicMaterial({ color: 0x7da4b8 }));
          line.position.set(column * 0.21, 0.09, 0);
          cellLines.add(line);
        }
        frame.add(panel, cellLines);
        // 倾角支架：三角撑（后高前低两根立柱）
        const strutBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), bracketMaterial);
        strutBack.position.set(0, 0.12, -0.5);
        strutBack.rotation.x = TILT;
        const strutFront = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), bracketMaterial);
        strutFront.position.set(0, 0.04, 0.5);
        unit.add(frame, strutBack, strutFront);
        unit.rotation.x = TILT;
        unit.position.set(index * 2.34, row * 1.32, -row * 0.62);
        panelGroup.add(unit);
      }
    }
    /* 位置：建筑左半屋顶正上方（屋顶面 y=4.78），阵列中心 (-1.5, 5.0, -2.1)，微偏转风 */
    panelGroup.position.set(-1.5, 5.0, -2.1);
    panelGroup.rotation.y = 0.05;
    root.add(panelGroup);
  }

  async function buildBatteryFromOfficialReferences() {
    // Concept geometry reconstructed from Anker's product photo and published
    // 670 × 356 × 325 mm dimensions.  It is not an official CAD/model file.
    const battery = new THREE.Group();
    battery.name = "Anker SOLIX Solarbank Max AC";
    const servicePanel = new THREE.Mesh(
      new RoundedBoxGeometry(0.92, 0.49, 0.035, 3, 0.009),
      new THREE.MeshStandardMaterial({ color: 0x70797c, metalness: 0.12, roughness: 0.84 })
    );
    servicePanel.name = "solarbank-service-wall-panel";
    servicePanel.position.set(-4.55, 0.39, -4.045);
    servicePanel.receiveShadow = true;
    root.add(servicePanel);
    const shell = new THREE.MeshPhysicalMaterial({ color: 0x9fa7a9, metalness: 0.34, roughness: 0.49,
      clearcoat: 0.18, clearcoatRoughness: 0.45 });
    const upper = new THREE.MeshPhysicalMaterial({ color: 0xb4bdc0, metalness: 0.29, roughness: 0.44 });
    const lower = new THREE.MeshStandardMaterial({ color: 0x4b5053, metalness: 0.35, roughness: 0.65 });
    const black = new THREE.MeshPhysicalMaterial({ color: 0x14191c, metalness: 0.46, roughness: 0.29,
      clearcoat: 0.32 });
    const add = (geometry, material, x, y, z, name) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (name) mesh.name = name;
      battery.add(mesh);
      return mesh;
    };
    add(new RoundedBoxGeometry(0.67, 0.322, 0.325, 6, 0.025), shell, 0, 0.191, 0, "solarbank-main-casing");
    add(new RoundedBoxGeometry(0.636, 0.12, 0.014, 3, 0.009), upper, 0, 0.282, 0.169, "solarbank-upper-facet").rotation.x = -0.11;
    add(new RoundedBoxGeometry(0.638, 0.116, 0.014, 3, 0.009), lower, 0, 0.09, 0.17, "solarbank-lower-facet").rotation.x = 0.13;
    add(new RoundedBoxGeometry(0.54, 0.052, 0.013, 4, 0.007), black, 0, 0.183, 0.181, "solarbank-status-display");
    add(new RoundedBoxGeometry(0.048, 0.31, 0.29, 3, 0.012), black, 0.321, 0.19, -0.011, "solarbank-side-panel");
    add(new RoundedBoxGeometry(0.048, 0.31, 0.29, 3, 0.012), black, -0.321, 0.19, -0.011, "solarbank-side-panel");
    for (let i = 0; i < 13; i += 1) {
      add(new THREE.BoxGeometry(0.003, 0.012, 0.16), black,
        -0.24 + i * 0.04, 0.358, -0.035, "solarbank-top-vent");
    }
    for (const x of [-0.255, 0.255]) for (const z of [-0.115, 0.115]) {
      add(new RoundedBoxGeometry(0.075, 0.034, 0.06, 3, 0.008), black, x, 0.017, z, "solarbank-rubber-foot");
    }

    batteryDisplayCanvas = document.createElement("canvas");
    batteryDisplayCanvas.width = 1024; batteryDisplayCanvas.height = 128;
    batteryDisplayTexture = new THREE.CanvasTexture(batteryDisplayCanvas);
    batteryDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    const readout = add(new THREE.PlaneGeometry(0.511, 0.043),
      new THREE.MeshBasicMaterial({ map: batteryDisplayTexture, toneMapped: false }), 0, 0.183, 0.19, "solarbank-active-screen");
    readout.castShadow = false;
    batteryScreenGlow = add(new THREE.BoxGeometry(0.41, 0.004, 0.002),
      new THREE.MeshBasicMaterial({ color: 0x31d5f4, transparent: true, opacity: 0.66 }),
      0, 0.163, 0.191, "solarbank-status-bar");
    batteryScreenGlow.castShadow = false;

    const brandCanvas = document.createElement("canvas");
    brandCanvas.width = 512; brandCanvas.height = 100;
    const brandCtx = brandCanvas.getContext("2d");
    brandCtx.fillStyle = "#243138";
    brandCtx.font = "700 48px 'Segoe UI', sans-serif";
    brandCtx.textAlign = "center";
    brandCtx.fillText("ANKER", 256, 51);
    brandCtx.font = "600 31px 'Segoe UI', sans-serif";
    brandCtx.letterSpacing = "7px";
    brandCtx.fillText("SOLIX", 256, 89);
    const brandMap = new THREE.CanvasTexture(brandCanvas);
    brandMap.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(0.25, 0.049), new THREE.MeshBasicMaterial({ map: brandMap,
      transparent: true, depthWrite: false }), 0, 0.286, 0.18, "solarbank-brand").castShadow = false;

    batteryFrontGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x3ed6e8, transparent: true, opacity: 0.75 });
    add(new THREE.SphereGeometry(0.006, 10, 8), batteryFrontGlowMaterial,
      -0.287, 0.181, 0.193, "solarbank-led").castShadow = false;
    battery.position.set(-4.55, 0, -3.33);
    batteryObject = battery;
    root.add(battery);
    registerFixedCollision(battery, "solarbank", { width: 0.67, depth: 0.325 });
    addGroundingShadow(battery, 0.37, 0.20, { opacity: 0.3, lift: 0.008 });

    // Solarbank Max AC is AC-coupled. Its cable ends at the household wall
    // connection; rooftop PV reaches the AC bus through the microinverter.
    const conduit = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.82, 0.21, -3.51),
      new THREE.Vector3(-4.82, 0.24, -3.88),
      new THREE.Vector3(-4.55, 0.39, -4.01)
    ]), 24, 0.012, 6, false), black);
    conduit.name = "solarbank-ac-wall-connection";
    root.add(conduit);
    renderBatteryDisplay();
  }

  function renderBatteryDisplay() {
    if (!batteryDisplayCanvas || !batteryDisplayTexture) return;
    const ctx = batteryDisplayCanvas.getContext("2d");
    const reserveMode = currentWeather === "storm" || currentWeather === "snow";
    const power = currentFlows.battery || 0;
    const action = reserveMode ? "RESERVE" : power > 0.05 ? "CHARGING" : power < -0.05 ? "DISCHARGING" : "STANDBY";
    const accent = reserveMode ? "#8ce3bb" : power > 0.05 ? "#f7a353" : "#62c9e4";
    ctx.fillStyle = "#081318";
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = accent;
    ctx.fillRect(30, 108, Math.round(964 * clamp(currentSoc / 100, 0, 1)), 5);
    ctx.font = "700 47px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#e1f0f2";
    ctx.fillText(`SOC ${Math.round(currentSoc)}%`, 42, 77);
    ctx.font = "600 37px 'Segoe UI', sans-serif";
    ctx.fillStyle = accent;
    ctx.textAlign = "right";
    ctx.fillText(action, 980, 77);
    ctx.textAlign = "left";
    batteryDisplayTexture.needsUpdate = true;
  }

  async function buildBatteryFromOfficialReferencesLegacy() {
    const battery = new THREE.Group();
    battery.name = "Anker SOLIX Solarbank Max AC";
    /* 官方配色重制：Solarbank 2 系列暖白哑光壳体（而非工业灰金属） */
    const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe8e6e0, roughness: 0.52, metalness: 0.06, clearcoat: 0.24, clearcoatRoughness: 0.35 });
    const darkMetal = new THREE.MeshStandardMaterial({ color: 0x22272a, roughness: 0.42, metalness: 0.7 });
    const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x05090b, roughness: 0.08, metalness: 0.24, clearcoat: 0.78, clearcoatRoughness: 0.08 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(2.42, 1.17, 1.27, 8, 0.11), bodyMaterial);
    body.position.y = 0.61;
    body.castShadow = true;
    body.receiveShadow = true;
    battery.add(body);

    const upperFacet = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.39, 0.045), bodyMaterial.clone());
    upperFacet.position.set(0, 0.86, 0.652);
    upperFacet.rotation.x = -0.13;
    battery.add(upperFacet);
    const lowerFacet = new THREE.Mesh(new RoundedBoxGeometry(2.15, 0.48, 0.05, 4, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xcfd0cb, roughness: 0.55, metalness: 0.05, clearcoat: 0.18 }));
    lowerFacet.position.set(0, 0.3, 0.652);
    lowerFacet.rotation.x = 0.09;
    battery.add(lowerFacet);

    const screen = new THREE.Mesh(new RoundedBoxGeometry(1.68, 0.23, 0.045, 5, 0.035), blackGlass);
    screen.position.set(0, 0.65, 0.69);
    battery.add(screen);
    batteryScreenGlow = new THREE.Mesh(new RoundedBoxGeometry(1.22, 0.018, 0.012, 3, 0.008), new THREE.MeshBasicMaterial({ color: 0x31d5f4, transparent: true, opacity: 0.95 }));
    batteryScreenGlow.position.set(0, 0.585, 0.721);
    battery.add(batteryScreenGlow);

    const sidePanel = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.94, 1.04, 5, 0.045), new THREE.MeshPhysicalMaterial({ color: 0xd8d7d1, roughness: 0.55, metalness: 0.05, clearcoat: 0.2 }));
    sidePanel.position.set(1.16, 0.61, -0.02);
    battery.add(sidePanel);
    const sideInset = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.36, 0.62, 4, 0.025), new THREE.MeshStandardMaterial({ color: 0x131719, roughness: 0.54, metalness: 0.55 }));
    sideInset.position.set(1.27, 0.63, 0.13);
    battery.add(sideInset);

    const finMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d3cc, roughness: 0.6, metalness: 0.04 });
    const finGeometry = new THREE.BoxGeometry(0.035, 0.9, 0.17);
    const fins = new THREE.InstancedMesh(finGeometry, finMaterial, 31);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < 31; index += 1) {
      matrix.makeTranslation(-1.02 + index * 0.068, 0.61, -0.71);
      fins.setMatrixAt(index, matrix);
    }
    fins.castShadow = true;
    battery.add(fins);

    const topVentGeometry = new THREE.BoxGeometry(0.038, 0.018, 0.97);
    const topVents = new THREE.InstancedMesh(topVentGeometry, finMaterial, 28);
    for (let index = 0; index < 28; index += 1) {
      matrix.makeTranslation(-0.92 + index * 0.068, 1.21, -0.02);
      topVents.setMatrixAt(index, matrix);
    }
    battery.add(topVents);

    const footGeometry = new RoundedBoxGeometry(0.24, 0.08, 0.25, 3, 0.025);
    [[-0.94, 0.04, 0.38], [0.94, 0.04, 0.38], [-0.94, 0.04, -0.38], [0.94, 0.04, -0.38]].forEach((position) => {
      const foot = new THREE.Mesh(footGeometry, darkMetal);
      foot.position.set(...position);
      battery.add(foot);
    });

    try {
      // P1-2: 正面用真建模（高清 canvas 屏幕 + 品牌字板 + 状态灯），不再贴官方 PNG（特写必糊）。
      const screenCanvas = document.createElement("canvas");
      screenCanvas.width = 1024;
      screenCanvas.height = 280;
      const screenContext = screenCanvas.getContext("2d");
      const screenBg = screenContext.createLinearGradient(0, 0, 0, 280);
      screenBg.addColorStop(0, "#04121c");
      screenBg.addColorStop(1, "#0a2230");
      screenContext.fillStyle = screenBg;
      screenContext.fillRect(0, 0, 1024, 280);
      screenContext.fillStyle = "#7ee9ff";
      screenContext.font = "700 92px 'Segoe UI', sans-serif";
      screenContext.fillText("2.35", 64, 150);
      screenContext.font = "500 40px 'Segoe UI', sans-serif";
      screenContext.fillStyle = "rgba(160,222,240,.85)";
      screenContext.fillText("kW  ·  charging", 330, 148);
      screenContext.font = "500 34px monospace";
      screenContext.fillStyle = "rgba(120,180,200,.55)";
      screenContext.fillText("SOLARBANK MAX AC", 64, 232);
      screenContext.fillStyle = "#2bb88a";
      screenContext.beginPath();
      screenContext.arc(936, 88, 16, 0, Math.PI * 2);
      screenContext.fill();
      const screenTexture = new THREE.CanvasTexture(screenCanvas);
      screenTexture.colorSpace = THREE.SRGBColorSpace;
      screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      screen.material = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
      screen.visible = true;

      const brandPlate = makeTextPlate("ANKER SOLIX", "MAX AC  ·  3.84 kWh  ·  HYBRID");
      brandPlate.scale.setScalar(0.24);
      brandPlate.position.set(0, 1.05, 0.665);
      battery.add(brandPlate);

      const statusLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x31d5f4 })
      );
      statusLed.position.set(-1.06, 0.92, 0.668);
      battery.add(statusLed);
      if (batteryFrontGlowMaterial) batteryFrontGlowMaterial.dispose();
      batteryFrontGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x31d5f4, transparent: true, opacity: 0.85 });
      batteryFrontGlowMaterial.userData.pulse = true;
      const statusLedGlow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), batteryFrontGlowMaterial);
      statusLedGlow.position.set(-1.06, 0.92, 0.672);
      battery.add(statusLedGlow);
    } catch (_) {
      // The PBR modeled front remains available if procedural elements fail.
    }

    const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.48, metalness: 0.48 });
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.18, 0.66, -0.25),
      new THREE.Vector3(1.52, 0.73, -0.38),
      new THREE.Vector3(1.58, 1.34, -0.58),
      new THREE.Vector3(1.58, 1.78, -0.75)
    ]);
    battery.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 36, 0.035, 8, false), cableMaterial));
    /* 虚拟链接补全#1：PV 输入电缆。原电缆止于机顶上方 (1.58,1.78,-0.75)（世界系约
     * (3.86,1.78,-3.55)）悬空收尾——用户看到的"电池线没接上"就是这截。
     * 延长段从机顶继续爬升并折向屋顶光伏阵列（阵列右下角在世界系约 (1.6,4.9,-2.2)），
     * 与橙色能量流走同一拓扑：光伏 → 电池。 */
    const pvCableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.58, 1.78, -0.75),
      new THREE.Vector3(1.35, 2.6, -1.35),
      new THREE.Vector3(0.4, 3.7, -1.7),
      new THREE.Vector3(-0.55, 4.62, -1.95)
    ]);
    const pvCable = new THREE.Mesh(new THREE.TubeGeometry(pvCableCurve, 64, 0.032, 8, false), cableMaterial);
    pvCable.castShadow = true;
    battery.add(pvCable);
    // 机顶接线盒：电缆穿出点加个小盖板，避免"线从机器里凭空长出来"
    const pvJunction = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.14, 3, 0.02), darkMetal);
    pvJunction.position.set(1.58, 1.8, -0.72);
    battery.add(pvJunction);

    battery.position.set(2.35, 0, -2.82);
    battery.rotation.y = -0.12;
    root.add(battery);
    registerFixedCollision(battery, "solarbank");
    // P0-3: Solarbank 底座接触阴影
    addGroundingShadow(battery, 1.42, 0.86, { opacity: 0.5, lift: 0.016 });

  }

  function buildDetailedAppliances() {
    const washer = new THREE.Group();
    const washerBody = new THREE.Mesh(new RoundedBoxGeometry(0.88, 1.0, 0.72, 6, 0.065), new THREE.MeshStandardMaterial({ color: 0xe7e9e8, roughness: 0.32, metalness: 0.36 }));
    washerBody.position.y = 0.5;
    washerBody.castShadow = true;
    washer.add(washerBody);
    const doorOuter = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 16, 42), new THREE.MeshStandardMaterial({ color: 0x747d82, roughness: 0.28, metalness: 0.72 }));
    doorOuter.position.set(0, 0.48, 0.385);
    washer.add(doorOuter);
    const doorGlass = new THREE.Mesh(new THREE.CircleGeometry(0.23, 42), new THREE.MeshPhysicalMaterial({ color: 0x173342, transmission: 0.42, transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.05 }));
    doorGlass.position.set(0, 0.48, 0.39);
    washer.add(doorGlass);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.045, 24), new THREE.MeshStandardMaterial({ color: 0x3c4448, roughness: 0.3, metalness: 0.6 }));
    dial.rotation.x = Math.PI / 2;
    dial.position.set(0.22, 0.82, 0.39);
    washer.add(dial);
    washer.position.set(4.25, 0, -1.42);
    washer.rotation.y = -Math.PI / 2;
    propsGroup.add(washer);
    registerDraggable(washer, "washer", currentLanguage === "en" ? "Washer" : "洗衣机", { zone: "room" });
    propByType.set("washer", washer);

    const router = new THREE.Group();
    const routerBody = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.1, 0.34, 5, 0.045), new THREE.MeshStandardMaterial({ color: 0x252a2c, roughness: 0.3, metalness: 0.48 }));
    router.add(routerBody);
    [-0.19, 0.19].forEach((x) => {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x111516, roughness: 0.48 }));
      antenna.position.set(x, 0.3, -0.09);
      router.add(antenna);
    });
    for (let index = 0; index < 3; index += 1) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), new THREE.MeshBasicMaterial({ color: index === 0 ? 0x31d5f4 : 0x2bb88a }));
      led.position.set(-0.08 + index * 0.08, 0.055, 0.173);
      router.add(led);
    }
    router.position.set(5.56, 1.05, -3.1);
    router.rotation.y = -Math.PI / 2;
    // Bug修复：路由器原悬空于房间中央——贴右墙 + 托板，符合真实家用路由器摆放
    const routerShelf = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.035, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xd9d6cd, roughness: 0.6 })
    );
    routerShelf.position.set(0, -0.14, 0);
    router.add(routerShelf);
    propsGroup.add(router);
    propByType.set("router", router);

    const lampProxy = new THREE.Group();
    propByType.set("lamp", lampProxy);
  }

  function buildEnergyInfrastructure() {
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0xd6dcdd, roughness: 0.39, metalness: 0.17, clearcoat: 0.16 });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x303a40, roughness: 0.47, metalness: 0.42 });
    const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x152630, roughness: 0.19, metalness: 0.31, clearcoat: 0.55 });
    const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x22282b, roughness: 0.65, metalness: 0.18 });
    const addCable = (name, points, radius = 0.013) => {
      const route = points.map((point) => new THREE.Vector3(...point));
      const curve = new THREE.CurvePath();
      for (let index = 1; index < route.length; index += 1) curve.add(new THREE.LineCurve3(route[index - 1], route[index]));
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, radius, 7, false), cableMaterial);
      cable.name = name;
      root.add(cable);
    };

    // AC-coupled Solarbank Max AC: PV DC terminates at the microinverter below
    // the roof. Its AC output and the battery meet at the household AC board.
    const inverter = new THREE.Group();
    inverter.name = "pv-microinverter-concept";
    const inverterBody = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.29, 0.18, 5, 0.028), graphite);
    inverterBody.castShadow = true;
    inverter.add(inverterBody);
    const inverterFace = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.20, 0.012, 4, 0.02), darkGlass);
    inverterFace.position.z = 0.096;
    inverter.add(inverterFace);
    const inverterRail = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.035, 0.08), enamel);
    inverterRail.position.set(0, 0.22, -0.065);
    inverter.add(inverterRail);
    for (let index = 0; index < 8; index += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.16, 0.015), enamel);
      rib.position.set(-0.18 + index * 0.052, 0, 0.105);
      inverter.add(rib);
    }
    for (const x of [-0.19, 0.19]) {
      const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.08, 12), graphite);
      gland.position.set(x, -0.18, 0);
      inverter.add(gland);
    }
    const inverterLed = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7ed5b8 }));
    inverterLed.position.set(0.23, 0.085, 0.108);
    inverter.add(inverterLed);
    inverter.position.set(-4.55, 4.49, -1.03);
    root.add(inverter);
    addCable("pv-dc-cable-to-microinverter", [[-4.55, 5.1, -1.87], [-4.55, 4.7, -1.65], [-4.55, 4.36, -1.03]], 0.012);

    // A wall-mounted service cluster replaces the former anonymous meter box.
    // Local +Z faces into the room; its wall anchor is the existing right wall.
    const service = new THREE.Group();
    service.name = "household-ac-meter-and-distribution";
    service.position.set(5.51, 2.12, -2.0);
    service.rotation.y = -Math.PI / 2;
    const meter = new THREE.Group();
    meter.name = "smart-meter-with-ct-concept";
    const meterBody = new THREE.Mesh(new RoundedBoxGeometry(0.41, 0.64, 0.17, 5, 0.035), enamel);
    meterBody.castShadow = true;
    meter.add(meterBody);
    const meterFace = new THREE.Mesh(new RoundedBoxGeometry(0.35, 0.52, 0.014, 4, 0.023), new THREE.MeshStandardMaterial({ color: 0xf1f1ed, roughness: 0.52 }));
    meterFace.position.z = 0.094;
    meter.add(meterFace);
    const meterWindow = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.20, 0.008, 3, 0.013), darkGlass);
    meterWindow.position.set(0, 0.105, 0.106);
    meter.add(meterWindow);
    meterDisplayCanvas = document.createElement("canvas");
    meterDisplayCanvas.width = 320;
    meterDisplayCanvas.height = 144;
    meterDisplayTexture = new THREE.CanvasTexture(meterDisplayCanvas);
    meterDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    const meterReadout = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.118), new THREE.MeshBasicMaterial({ map: meterDisplayTexture, toneMapped: false }));
    meterReadout.position.set(0, 0.105, 0.114);
    meter.add(meterReadout);
    for (const x of [-0.08, 0, 0.08]) {
      const port = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12), graphite);
      port.rotation.x = Math.PI / 2;
      port.position.set(x, -0.21, 0.106);
      meter.add(port);
    }
    service.add(meter);

    const board = new THREE.Group();
    board.name = "household-distribution-board-concept";
    board.position.set(0.82, -0.03, 0);
    const boardBody = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.73, 0.20, 5, 0.034), enamel);
    boardBody.castShadow = true;
    board.add(boardBody);
    const boardInset = new THREE.Mesh(new RoundedBoxGeometry(0.50, 0.49, 0.012, 4, 0.018), new THREE.MeshStandardMaterial({ color: 0xb6c1c2, roughness: 0.52, metalness: 0.2 }));
    boardInset.position.set(0, -0.035, 0.109);
    board.add(boardInset);
    for (let index = 0; index < 4; index += 1) {
      const breaker = new THREE.Mesh(new RoundedBoxGeometry(0.092, 0.22, 0.037, 3, 0.01), new THREE.MeshStandardMaterial({ color: 0xf1f2ee, roughness: 0.55 }));
      breaker.position.set(-0.175 + index * 0.116, -0.045, 0.137);
      board.add(breaker);
      const switchCap = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.055, 0.023, 3, 0.008), graphite);
      switchCap.position.set(breaker.position.x, -0.03, 0.168);
      board.add(switchCap);
    }
    const boardHeader = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.08, 0.013, 3, 0.012), darkGlass);
    boardHeader.position.set(0, 0.27, 0.112);
    board.add(boardHeader);
    service.add(board);

    // The two split-core CT rings surround a visible incoming conductor.
    const conductor = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.58, 10), cableMaterial);
    conductor.position.set(0.38, -0.08, 0.14);
    service.add(conductor);
    for (const y of [-0.22, 0.04]) {
      const clampRing = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.024, 9, 28), graphite);
      clampRing.position.set(0.38, y, 0.17);
      service.add(clampRing);
      const ctWire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.43, y, 0.17), new THREE.Vector3(0.55, y - 0.08, 0.13), new THREE.Vector3(0.56, -0.31, 0.04)
      ]), 14, 0.006, 6, false), cableMaterial);
      service.add(ctWire);
    }
    root.add(service);

    const smartPlug = new THREE.Group();
    smartPlug.name = "optional-smart-plug-concept";
    const wallPlate = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.31, 0.035, 5, 0.027), enamel);
    smartPlug.add(wallPlate);
    const plugBody = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.22, 0.11, 5, 0.028), new THREE.MeshStandardMaterial({ color: 0xeeefeb, roughness: 0.46 }));
    plugBody.position.z = 0.071;
    smartPlug.add(plugBody);
    const socketRim = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 8, 28), graphite);
    socketRim.position.set(0, 0.005, 0.13);
    smartPlug.add(socketRim);
    for (const x of [-0.023, 0.023]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.009, 14), new THREE.MeshBasicMaterial({ color: 0x17242b }));
      hole.position.set(x, 0.005, 0.131);
      smartPlug.add(hole);
    }
    const plugLed = new THREE.Mesh(new THREE.SphereGeometry(0.009, 9, 7), new THREE.MeshBasicMaterial({ color: 0x4dc8aa }));
    plugLed.position.set(0, 0.085, 0.133);
    smartPlug.add(plugLed);
    smartPlug.position.set(5.52, 1.22, 0.05);
    smartPlug.rotation.y = -Math.PI / 2;
    root.add(smartPlug);

    // Route the cable trays along roof/wall edges. The meter screen and all
    // power numbers are local simulation; there is no live device connection.
    addCable("microinverter-ac-conduit", [[-4.55, 4.47, -1.08], [-4.55, 4.48, -3.98], [5.5, 4.48, -3.98], [5.5, 4.48, -1.15], [5.5, 2.50, -1.15]]);
    addCable("solarbank-ac-conduit", [[-4.55, 0.39, -4.01], [-4.55, 0.12, -3.99], [5.46, 0.12, -3.99], [5.46, 0.12, -1.15], [5.46, 1.75, -1.15]]);
    renderMeterDisplay();

    flowObjects = [
      createEnergyFlow("solar-dc", [[-4.55, 5.14, -1.87], [-4.55, 4.73, -1.45], [-4.55, 4.51, -1.03]], 0x7ebbd2),
      createEnergyFlow("solar", [[-4.55, 4.51, -1.03], [-4.55, 4.56, -3.96], [5.46, 4.56, -3.96], [5.46, 4.56, -1.15], [5.46, 2.12, -1.15]], 0xf58220),
      createEnergyFlow("grid", [[5.44, 2.12, -2.0], [5.40, 2.12, -1.56], [5.44, 2.12, -1.15]], 0xa8bdc9),
      createEnergyFlow("battery", [[5.43, 1.94, -1.15], [5.43, 0.17, -1.15], [5.43, 0.12, -3.94], [-4.55, 0.12, -3.94], [-4.55, 0.28, -3.50]], 0x2bc8e9),
      createEnergyFlow("ev", [[5.42, 1.91, -1.15], [5.42, 0.13, -1.15], [5.42, 0.13, 4.18], [4.75, 0.81, 6.2]], 0x31d5f4),
      createEnergyFlow("tv", [[5.41, 1.91, -1.15], [5.41, 0.16, -1.15], [5.41, 0.16, 1.15], [5.41, 1.73, 1.15]], 0x31d5f4),
      createEnergyFlow("kitchen", [[5.41, 1.91, -1.15], [5.41, 0.14, -1.15], [5.41, 0.14, -3.92], [1.8, 0.14, -3.92]], 0x31d5f4),
      createEnergyFlow("fridge", [[5.41, 1.91, -1.15], [5.41, 0.14, -2.60], [4.23, 0.14, -2.60], [4.23, 1.05, -2.60]], 0x31d5f4)
    ];
  }

  function renderMeterDisplay() {
    if (!meterDisplayCanvas || !meterDisplayTexture) return;
    const context = meterDisplayCanvas.getContext("2d");
    const grid = Number(currentFlows.grid) || 0;
    context.fillStyle = "#0a2029";
    context.fillRect(0, 0, 320, 144);
    context.fillStyle = "#86b8c7";
    context.font = "600 24px monospace";
    context.fillText("SIM  /  GRID", 18, 38);
    context.fillStyle = grid > 0.02 ? "#dcebef" : grid < -0.02 ? "#8ddcc0" : "#83abb9";
    context.font = "700 46px 'Segoe UI', sans-serif";
    context.fillText(`${grid >= 0 ? "+" : ""}${grid.toFixed(2)}`, 18, 101);
    context.font = "600 21px monospace";
    context.fillText("kW", 243, 101);
    meterDisplayTexture.needsUpdate = true;
  }

  async function loadLicensedFurniture(onlyKeys = null, phaseCopy = ["正在载入家具模型", "Loading furniture models"]) {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      assetProgress = total ? Math.round((loaded / total) * 100) : 0;
      setFurnitureStatus(phaseCopy[0], phaseCopy[1], assetProgress);
    };
    const loader = new GLTFLoader(manager);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const assets = [
      /* ===== Poly Haven CC0 PBR 模型（diff/nor_gl/rough/arm 2K 全套贴图）=====
       * 欧美风格升级：真实织物/皮革/金属 PBR 材质替换旧低模。
       * 全部 draggable —— 用户要求所有家具/设备可自由布置。 */
      { key: "sofa", label: "现代布艺沙发", enLabel: "Contemporary sofa", draggable: true, zone: "living", url: "assets/models/sofa-contemporary-opt.glb", target: 2.9, axis: "x", position: [-0.45, 0.052, 1.05], rotation: [0, Math.PI / 2, 0] },
      { key: "chair", label: "木框皮革扶手椅", enLabel: "Oak and leather armchair", draggable: true, zone: "living", url: "assets/models/armchair-modern-opt.glb", target: 1.03, axis: "y", position: [1.35, 0, -0.9], rotation: [0, 0.18, 0] },
      { key: "plant", label: "室内绿植", enLabel: "Indoor potted plant", draggable: true, zone: "room", url: "assets/models/potted-plant-real-opt.glb", target: 1.42, axis: "y", position: [-2.8, 0, -2.35], rotation: [0, -0.3, 0] },
      { key: "coffee-table", label: "石材橡木茶几", enLabel: "Stone and oak coffee table", draggable: true, zone: "living", url: "assets/models/coffee-table-modern-opt.glb", target: 1.2, axis: "z", position: [1.25, 0.052, 1.05], rotation: [0, Math.PI / 2, 0] },
      { key: "tv-console", label: "媒体柜", enLabel: "Media console", draggable: false, fixed: true, zone: "room", url: "assets/models/tv-console-opt.glb", target: 2.12, axis: "z", position: [5.2, 0, 1.15], rotation: [0, 0, 0], decorate: "console" },
      { key: "tv-wall", label: "客厅电视", enLabel: "Living room TV", draggable: true, zone: "room", builtin: "modern-tv", target: 1.55, axis: "x", position: [5.53, 1.28, 1.15], rotation: [0, -Math.PI / 2, 0], deviceType: "tv", decorate: "television" },
      { key: "fridge", label: "冰箱", enLabel: "Refrigerator", draggable: true, zone: "room", url: "assets/models/refrigerator-opt.glb", target: 2.02, axis: "y", position: [4.23, 0, -2.55], rotation: [0, -Math.PI / 2, 0], deviceType: "fridge" },
      { key: "lamp", label: "三脚落地灯", enLabel: "Tripod floor lamp", draggable: true, zone: "living", url: "assets/models/floor-lamp-modern-web.glb", target: 1.68, axis: "y", position: [-2.0, 0, -1.1], rotation: [0, 0.35, 0], deviceType: "lamp" },
      { key: "tesla-model-3", label: "Tesla Model 3 Highland", enLabel: "Tesla Model 3 Highland", draggable: true, zone: "driveway", url: "assets/models/tesla-highland/model.glb", normalize: "highland", position: [-0.55, 0.025, 7.35], rotation: [0, Math.PI / 2, 0], deviceType: "ev" }
    ];

    const selectedAssets = onlyKeys ? assets.filter((asset) => onlyKeys.has(asset.key)) : assets;
    const results = await Promise.allSettled(selectedAssets.map(async (asset) => {
      /* 内置高精度模型：不走 GLTF 加载，直接程序化构建（现代超薄电视等） */
      let object;
      if (asset.builtin === "modern-tv") {
        object = buildModernTelevision();
      } else {
        const gltf = await loader.loadAsync(asset.url);
        object = asset.normalize === "highland" ? prepareHighlandModel(gltf.scene) : gltf.scene;
      }
      object.name = asset.key;
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = child.material.clone();
        if (child.material.map) child.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // Poly Haven PBR 材质增强：环境反射强度 + 贴图色彩空间（GLTF 里 color 已是 sRGB，但 AO/法线不该被 sRGB 化）
        if (child.material.aoMap) child.material.aoMap.colorSpace = THREE.NoColorSpace;
        if (child.material.normalMap) child.material.normalMap.colorSpace = THREE.NoColorSpace;
        if (child.material.roughnessMap) child.material.roughnessMap.colorSpace = THREE.NoColorSpace;
        if ("envMapIntensity" in child.material) child.material.envMapIntensity = 1.15;
        if (asset.decorate === "console") {
          child.material.color?.setHex(0x5b4638);
          child.material.roughness = 0.62;
          child.material.metalness = 0.04;
        }
        if (asset.decorate === "television") {
          child.material.color?.setHex(0x111619);
          child.material.roughness = 0.2;
          child.material.metalness = 0.68;
          if ("envMapIntensity" in child.material) child.material.envMapIntensity = 1.45;
        }
        if (asset.key === "tesla-model-3") {
          if ("envMapIntensity" in child.material) child.material.envMapIntensity = 1.35;
          const materialName = child.material.name?.toLowerCase() || "";
          if (materialName.includes("carpaint")) {
            child.material.color.setHex(0xe7e9ea);
            child.material.metalness = 0.58;
            child.material.roughness = 0.22;
            if ("clearcoat" in child.material) {
              child.material.clearcoat = 0.9;
              child.material.clearcoatRoughness = 0.11;
            }
          }
          // P2-2: 车窗玻璃——透射 + 低粗糙度，不再是纯黑不透明。
          const isGlass = materialName.includes("glass") || materialName.includes("window") || materialName.includes("windshield");
          if (isGlass && "transmission" in child.material) {
            child.material.transmission = 0.72;
            child.material.roughness = 0.08;
            child.material.metalness = 0;
            child.material.ior = 1.45;
            child.material.thickness = 0.02;
            child.material.transparent = true;
            child.material.opacity = 0.94;
            if ("envMapIntensity" in child.material) child.material.envMapIntensity = 1.8;
          }
        }
      });
      if (asset.normalize !== "highland") normalizeModel(object, asset.target, asset.axis);
      // Anchor the actual mesh bounds to the floor *before* assigning its world
      // placement.  The old groundModel() offset was overwritten by position.set,
      // leaving the floor lamp 1.55 m below the floor and several pieces floating.
      if (asset.normalize !== "highland") object = makeGroundedAsset(object);
      // Bug修复：groundModel 会把 y 归零抹掉初始抬升——地毯顶面在 y=0.0425，沙发/茶几必须再抬到地毯之上，否则底边穿进地毯。
      // P0-3: 落地物体的椭圆接触阴影，消除"漂浮感"。
      // Bug修复：车位下方不再叠加贴片阴影——实时阴影(2048)+SAO已足够，贴片+实时+SAO+ACES压暗四层叠加把车底压成纯黑矩形。
      if (["sofa", "chair", "coffee-table", "fridge", "lamp", "plant", "tv-console"].includes(asset.key)) {
        const footprint = { sofa: [1.2, 1.55], chair: [0.5, 0.5], "coffee-table": [0.62, 0.4], fridge: [0.45, 0.45], lamp: [0.36, 0.36], plant: [0.38, 0.38], "tv-console": [0.42, 1.12] }[asset.key];
        addGroundingShadow(object, footprint[0], footprint[1], { opacity: 0.25 });
      }
      if (asset.decorate === "television") object = decorateTelevision(object);
      if (asset.decorate === "console") object = decorateMediaConsole(object);
      object.name = asset.key;
      object.position.set(...asset.position);
      object.rotation.set(...asset.rotation);
      root.add(object);
      if (asset.deviceType) {
        propByType.set(asset.deviceType, object);
        const device = currentDevices.find((entry) => entry.type === asset.deviceType);
        if (["fridge", "washer", "tv", "router", "lamp"].includes(asset.deviceType)) object.visible = Boolean(device);
        if (device) markInteractive(object, device.id, device.enabled);
      }
      if (asset.key === "tesla-model-3") carObject = object;
      if (asset.draggable) registerDraggable(object, asset.key, currentLanguage === "en" ? asset.enLabel : asset.label, { zone: asset.zone });
      if (asset.fixed) registerFixedCollision(object, asset.key);
      return object;
    }));

    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) console.warn(`${failures.length} licensed furniture assets could not be loaded.`);
    applyStoredFurnitureLayout();
    updateEvCable();
    return failures.length;
  }

  function createTelevisionArtwork() {
    const texture = new THREE.TextureLoader().load("assets/tv-alpine-dusk-v2.jpg");
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  function createTelevisionArtworkLegacy() {
    const artwork = document.createElement("canvas");
    artwork.width = 1024;
    artwork.height = 576;
    const context = artwork.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, artwork.height);
    sky.addColorStop(0, "#06131f");
    sky.addColorStop(0.54, "#123c50");
    sky.addColorStop(1, "#d27a36");
    context.fillStyle = sky;
    context.fillRect(0, 0, artwork.width, artwork.height);

    const glow = context.createRadialGradient(785, 345, 8, 785, 345, 185);
    glow.addColorStop(0, "rgba(255,211,142,.94)");
    glow.addColorStop(0.25, "rgba(245,130,32,.56)");
    glow.addColorStop(1, "rgba(245,130,32,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, artwork.width, artwork.height);

    context.fillStyle = "#07131c";
    context.beginPath();
    context.moveTo(0, 438);
    context.lineTo(145, 315);
    context.lineTo(275, 398);
    context.lineTo(410, 272);
    context.lineTo(590, 414);
    context.lineTo(760, 328);
    context.lineTo(1024, 449);
    context.lineTo(1024, 576);
    context.lineTo(0, 576);
    context.closePath();
    context.fill();

    const water = context.createLinearGradient(0, 420, 0, 576);
    water.addColorStop(0, "rgba(16,69,86,.72)");
    water.addColorStop(1, "rgba(4,18,28,.96)");
    context.fillStyle = water;
    context.fillRect(0, 438, 1024, 138);
    context.strokeStyle = "rgba(91,213,235,.34)";
    context.lineWidth = 2;
    for (let index = 0; index < 7; index += 1) {
      context.beginPath();
      context.moveTo(90 + index * 34, 482 + index * 8);
      context.bezierCurveTo(340, 454 + index * 7, 680, 510 + index * 4, 938, 470 + index * 10);
      context.stroke();
    }
    const texture = new THREE.CanvasTexture(artwork);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  /* 现代超薄无边框电视（程序化高精度建模，替代老式 television_02.gltf）：
   * 一体式纯平黑面板 + 悬浮金属支架 + 超窄边框高光倒角，正面屏由 decorateTelevision 贴发光画面。 */
  function buildModernTelevision() {
    const group = new THREE.Group();
    // 面板：1.72 x 1.0（约 78"），总厚 4.2cm，四角小圆角
    const panel = new THREE.Mesh(
      new RoundedBoxGeometry(1.72, 1.0, 0.042, 4, 0.012),
      new THREE.MeshPhysicalMaterial({
        color: 0x0b0e10, roughness: 0.32, metalness: 0.62,
        clearcoat: 0.65, clearcoatRoughness: 0.18, envMapIntensity: 1.5
      })
    );
    panel.name = "tv-panel";
    group.add(panel);
    // 屏幕区：比面板略小的纯黑玻璃（发光画面由 decorate 覆盖）
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.676, 0.958),
      new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 2.0 })
    );
    screen.position.z = 0.0225;
    screen.name = "tv-screen-base";
    group.add(screen);
    // 壁挂支架：居中隐藏式细杆（视觉上悬浮贴墙）
    const mount = new THREE.Mesh(
      new RoundedBoxGeometry(0.34, 0.2, 0.05, 3, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x22282c, roughness: 0.42, metalness: 0.74 })
    );
    mount.position.z = -0.038;
    group.add(mount);
    group.traverse((child) => {
      if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    return group;
  }

  function decorateTelevision(source) {
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    wrapper.add(source);
    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 0.91, size.y * 0.84),
      new THREE.MeshBasicMaterial({ map: createTelevisionArtwork(), toneMapped: false })
    );
    display.name = "television-active-display";
    display.position.set(center.x, center.y + size.y * 0.005, bounds.max.z + 0.007);
    wrapper.add(display);

    const ambient = new THREE.RectAreaLight(0x55c9e5, 1.3, size.x * 0.82, size.y * 0.72);
    ambient.position.set(center.x, center.y, bounds.max.z + 0.12);
    ambient.rotation.y = Math.PI;
    wrapper.add(ambient);
    return wrapper;
  }

  function decorateMediaConsole(source) {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    wrapper.add(source);

    const runsAlongX = size.x >= size.z;
    const soundbar = new THREE.Mesh(
      new RoundedBoxGeometry(
        runsAlongX ? size.x * 0.46 : Math.max(0.09, size.x * 0.2),
        0.085,
        runsAlongX ? Math.max(0.09, size.z * 0.2) : size.z * 0.46,
        5,
        0.025
      ),
      new THREE.MeshStandardMaterial({ color: 0x151b1f, roughness: 0.34, metalness: 0.72 })
    );
    soundbar.name = "media-console-soundbar";
    soundbar.position.set(center.x, bounds.max.y + 0.065, center.z);
    soundbar.castShadow = true;
    wrapper.add(soundbar);

    const statusLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x42c6e6, toneMapped: false })
    );
    statusLight.position.set(
      center.x + (runsAlongX ? size.x * 0.19 : 0),
      bounds.max.y + 0.067,
      center.z + (runsAlongX ? 0 : size.z * 0.19)
    );
    wrapper.add(statusLight);
    return wrapper;
  }

  function prepareHighlandModel(source) {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 4.72 / Math.max(bounds.max.x - bounds.min.x, 0.001);
    const transform = new THREE.Matrix4()
      .makeRotationY(Math.PI / 2)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    source.applyMatrix4(transform);
    source.updateMatrixWorld(true);
    const wrapper = new THREE.Group();
    wrapper.name = "Tesla Model 3 Highland normalized";
    wrapper.add(source);
    return wrapper;
  }

  function addContactShadow(object, width, depth) {
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 512;
    shadowCanvas.height = 256;
    const context = shadowCanvas.getContext("2d");
    // Bug修复：原来中心0.58黑+0.78不透明度+实时阴影+SAO三层叠黑，车底地板全黑——全面减淡。
    const gradient = context.createRadialGradient(256, 128, 18, 256, 128, 235);
    gradient.addColorStop(0, "rgba(3,10,14,.34)");
    gradient.addColorStop(0.52, "rgba(3,10,14,.17)");
    gradient.addColorStop(1, "rgba(3,10,14,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    const texture = new THREE.CanvasTexture(shadowCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false })
    );
    shadow.name = "vehicle-contact-shadow";
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.016;
    shadow.renderOrder = 1;
    object.add(shadow);
  }

  // P0-3: 通用接触阴影——为任何落地物体生成椭圆软阴影贴片，消除"漂浮感"。
  function addGroundingShadow(object, radiusX, radiusZ, options = {}) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    const opacity = options.opacity ?? 0.5;
    const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size * 0.48);
    gradient.addColorStop(0, `rgba(6,14,18,${opacity})`);
    gradient.addColorStop(0.55, `rgba(6,14,18,${opacity * 0.52})`);
    gradient.addColorStop(1, "rgba(6,14,18,0)");
    context.save();
    context.translate(size / 2, size / 2);
    context.scale(radiusX / radiusZ, 1);
    context.translate(-size / 2, -size / 2);
    context.fillStyle = gradient;
    context.fillRect(-size, -size, size * 3, size * 3);
    context.restore();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(radiusX * 2.24, radiusZ * 2.24),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    );
    shadow.name = "grounding-shadow";
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = options.lift ?? 0.014;
    shadow.renderOrder = 1;
    object.add(shadow);
    return shadow;
  }

  function normalizeModel(object, target, axis) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const source = axis === "x" ? size.x : axis === "z" ? size.z : size.y;
    const scale = target / Math.max(source, 0.001);
    object.scale.setScalar(scale);
  }

  function makeGroundedAsset(source) {
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const center = bounds.getCenter(new THREE.Vector3());
    source.position.x -= center.x;
    source.position.y -= bounds.min.y;
    source.position.z -= center.z;
    const pivot = new THREE.Group();
    pivot.add(source);
    return pivot;
  }

  function groundModel(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.y -= box.min.y;
  }

  function registerDraggable(object, key, label, options = {}) {
    const entry = { object, key, label, zone: options.zone || "living", dynamic: Boolean(options.dynamic) };
    draggableEntries.push(entry);
    initialFurnitureLayouts.set(key, {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      rotationY: object.rotation.y
    });
    object.userData.furnitureKey = key;
    object.userData.furnitureLabel = label;
    object.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === "grounding-shadow" || child.name === "vehicle-contact-shadow") return;
      child.userData.furnitureKey = key;
      child.userData.furnitureEntry = entry;
      draggableMeshes.push(child);
    });
  }

  function registerFixedCollision(object, key, dimensions = null) {
    fixedCollisionObjects.push({ object, key, dimensions });
  }

  function removeDynamicDraggables() {
    const dynamicEntries = draggableEntries.filter((entry) => entry.dynamic);
    if (!dynamicEntries.length) return;
    const dynamicSet = new Set(dynamicEntries);
    draggableMeshes = draggableMeshes.filter((mesh) => !dynamicSet.has(mesh.userData.furnitureEntry));
    dynamicEntries.forEach((entry) => initialFurnitureLayouts.delete(entry.key));
    draggableEntries = draggableEntries.filter((entry) => !entry.dynamic);
    if (selectedFurniture?.dynamic) {
      selectedFurniture = null;
      if (selectionRing) selectionRing.visible = false;
      updateSelectedObjectLabel();
    }
  }

  function applyStoredFurnitureLayout() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(FURNITURE_STORAGE_KEY) || "{}");
    } catch (_) {
      saved = {};
    }
    draggableEntries.forEach((entry) => {
      const layout = saved[entry.key];
      if (!layout || !Number.isFinite(layout.x) || !Number.isFinite(layout.z)) return;
      // Migrate only the old *default* chair/lamp placements. Custom layouts
      // remain untouched and the user's localStorage record is not deleted.
      const oldDefault = { chair: [-2.45, -0.17], lamp: [-2.65, 2.72] }[entry.key];
      if (oldDefault && Math.abs(layout.x - oldDefault[0]) < 0.03 && Math.abs(layout.z - oldDefault[1]) < 0.03) return;
      const previous = entry.object.position.clone();
      const limits = entry.zone === "driveway"
        ? { minX: -4.45, maxX: 3.7, minZ: 4.8, maxZ: 9.55 }
        : entry.zone === "room"
          ? { minX: -4.65, maxX: 4.55, minZ: -3.6, maxZ: 3.45 }
          : { minX: -4.65, maxX: 4.55, minZ: -1.55, maxZ: 3.45 };
      entry.object.position.x = clamp(layout.x, limits.minX, limits.maxX);
      entry.object.position.z = clamp(layout.z, limits.minZ, limits.maxZ);
      if (Number.isFinite(layout.rotationY)) entry.object.rotation.y = layout.rotationY;
      // Bug修复：挂墙电视恢复布局时锁定贴墙姿态（y 固定 1.52、贴右墙、面朝客厅）
      if (entry.key === "tv-wall") {
        entry.object.position.y = 1.28;
        entry.object.position.x = 5.53;
        entry.object.rotation.y = -Math.PI / 2;
      }
      entry.object.updateMatrixWorld(true);
      if (!isFurniturePlacementValid(entry)) entry.object.position.copy(previous);
    });
    /* 性能配套：初始布局恢复也会改变阴影 → 重绘一次 */
    if (renderer) renderer.shadowMap.needsUpdate = true;
  }

  function saveFurnitureLayout() {
    const payload = {};
    draggableEntries.forEach((entry) => {
      payload[entry.key] = {
        x: Number(entry.object.position.x.toFixed(3)),
        z: Number(entry.object.position.z.toFixed(3)),
        rotationY: Number(entry.object.rotation.y.toFixed(3))
      };
    });
    try {
      localStorage.setItem(FURNITURE_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      // Layout persistence is optional; interaction remains available.
    }
  }

  function resetFurnitureLayout() {
    draggableEntries.forEach((entry) => {
      const initial = initialFurnitureLayouts.get(entry.key);
      if (!initial) return;
      entry.object.position.set(initial.x, initial.y, initial.z);
      entry.object.rotation.y = initial.rotationY;
      entry.object.updateMatrixWorld(true);
    });
    try { localStorage.removeItem(FURNITURE_STORAGE_KEY); } catch (_) {}
    selectedFurniture = null;
    if (selectionRing) selectionRing.visible = false;
    updateSelectedObjectLabel();
    canvas.classList.remove("is-furniture-dragging", "is-placement-blocked");
    updateEvCable();
  }

  function getPhysicalBounds(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    object.traverse((child) => {
      if (!child.isMesh || !child.visible || child.name === "grounding-shadow" || child.name === "vehicle-contact-shadow") return;
      box.expandByObject(child);
    });
    return box;
  }

  function getFootprint(object, padding = 0) {
    const box = getPhysicalBounds(object);
    return {
      minX: box.min.x + padding,
      maxX: box.max.x - padding,
      minZ: box.min.z + padding,
      maxZ: box.max.z - padding
    };
  }

  function footprintsIntersect(a, b, clearance = 0.08) {
    return !(
      a.maxX + clearance <= b.minX ||
      a.minX - clearance >= b.maxX ||
      a.maxZ + clearance <= b.minZ ||
      a.minZ - clearance >= b.maxZ
    );
  }

  function isFurniturePlacementValid(entry) {
    const footprint = getFootprint(entry.object, 0.04);
    const bounds = entry.key === "tv-wall"
      ? { minX: 5.45, maxX: 5.65, minZ: -3.73, maxZ: 3.55 }
      : entry.zone === "driveway"
      ? { minX: -4.95, maxX: 4.15, minZ: 4.55, maxZ: 10.15 }
      : entry.zone === "room"
        ? { minX: -4.95, maxX: 4.95, minZ: -3.74, maxZ: 3.55 }
        : { minX: -4.85, maxX: 4.85, minZ: -1.7, maxZ: 3.55 };
    if (footprint.minX < bounds.minX || footprint.maxX > bounds.maxX || footprint.minZ < bounds.minZ || footprint.maxZ > bounds.maxZ) return false;
    for (const other of draggableEntries) {
      if (other === entry || !other.object.visible) continue;
      if (other.zone !== entry.zone && !(entry.zone !== "driveway" && other.zone !== "driveway")) continue;
      const a = getPhysicalBounds(entry.object), b = getPhysicalBounds(other.object);
      if (a.max.y + 0.05 <= b.min.y || a.min.y - 0.05 >= b.max.y) continue;
      if (footprintsIntersect(footprint, getFootprint(other.object, 0.04), 0.12)) return false;
    }
    for (const fixed of fixedCollisionObjects) {
      if (!fixed.object.visible) continue;
      const a = getPhysicalBounds(entry.object), b = getPhysicalBounds(fixed.object);
      if (a.max.y + 0.05 <= b.min.y || a.min.y - 0.05 >= b.max.y) continue;
      const fixedFootprint = fixed.dimensions ? {
        minX: fixed.object.position.x - fixed.dimensions.width / 2,
        maxX: fixed.object.position.x + fixed.dimensions.width / 2,
        minZ: fixed.object.position.z - fixed.dimensions.depth / 2,
        maxZ: fixed.object.position.z + fixed.dimensions.depth / 2
      } : getFootprint(fixed.object, 0.02);
      if (footprintsIntersect(footprint, fixedFootprint, 0.14)) return false;
    }
    return true;
  }

  function tryMoveFurniture(entry, nextX, nextZ) {
    const previousX = entry.object.position.x;
    const previousZ = entry.object.position.z;
    entry.object.position.x = entry.key === "tv-wall" ? 5.53 : Math.round(nextX / 0.05) * 0.05;
    entry.object.position.z = Math.round(nextZ / 0.05) * 0.05;
    if (entry.key === "tv-wall") {
      entry.object.position.y = 1.28;
      entry.object.rotation.y = -Math.PI / 2;
    }
    entry.object.updateMatrixWorld(true);
    const valid = isFurniturePlacementValid(entry);
    if (!valid) {
      entry.object.position.x = previousX;
      entry.object.position.z = previousZ;
      entry.object.updateMatrixWorld(true);
    }
    /* 性能大刀#1配套：家具移动/旋转会改变阴影形状 → 触发一次阴影重绘 */
    renderer.shadowMap.needsUpdate = true;
    if (valid && entry.key === "tesla-model-3") updateEvCable();
    canvas.classList.toggle("is-placement-blocked", !valid);
    if (selectionRing) selectionRing.material.color.setHex(valid ? 0x2bc8e9 : 0xe45c55);
    return valid;
  }

  function rotateSelected(direction = 1) {
    if (!selectedFurniture) return false;
    const entry = selectedFurniture;
    if (entry.key === "tv-wall") return false; // Wall-mounted screen slides; it cannot turn through the wall.
    const previous = entry.object.rotation.y;
    entry.object.rotation.y += direction * Math.PI / 12;
    entry.object.updateMatrixWorld(true);
    /* 性能配套：旋转改变阴影形状 → 触发一次阴影重绘 */
    if (renderer) renderer.shadowMap.needsUpdate = true;
    if (!isFurniturePlacementValid(entry)) {
      entry.object.rotation.y = previous;
      entry.object.updateMatrixWorld(true);
      canvas?.classList.add("is-placement-blocked");
      setTimeout(() => canvas?.classList.remove("is-placement-blocked"), 360);
      return false;
    }
    saveFurnitureLayout();
    highlightFurniture(entry);
    return true;
  }

  function setLanguage(language = "zh") {
    currentLanguage = language === "en" ? "en" : "zh";
    const labels = {
      sofa: ["现代布艺沙发", "Contemporary sofa"],
      chair: ["木框皮革扶手椅", "Oak and leather armchair"],
      fridge: ["冰箱", "Refrigerator"],
      lamp: ["三脚落地灯", "Tripod floor lamp"],
      washer: ["洗衣机", "Washer"],
      plant: ["室内绿植", "Indoor potted plant"],
      "coffee-table": ["石材橡木茶几", "Stone and oak coffee table"],
      "tv-console": ["悬浮媒体柜", "Media console"],
      "tv-wall": ["客厅电视", "Living room TV"],
      "tesla-model-3": ["Tesla Model 3 Highland", "Tesla Model 3 Highland"]
    };
    draggableEntries.forEach((entry) => {
      const pair = labels[entry.key];
      if (pair) entry.label = pair[currentLanguage === "en" ? 1 : 0];
    });
    paintFurnitureStatus();
    updateSelectedObjectLabel();
  }

  function updateSelectedObjectLabel() {
    const label = document.querySelector("#selected-object-name");
    if (!label) return;
    label.textContent = selectedFurniture?.label || (currentLanguage === "en" ? "None" : "未选择");
    document.querySelector(".scene-editor")?.classList.toggle("is-active", Boolean(selectedFurniture));
  }

  function setWeather(weather = "clear") {
    const previousWeather = currentWeather;
    currentWeather = ["clear", "cloudy", "rain", "storm", "snow", "night"].includes(weather) ? weather : "clear";
    if (currentWeather === "storm" && previousWeather !== "storm" && !stormMotionPreference.matches) {
      // Two or three brief exterior lightning reflections on scenario entry.
      // The household lighting remains stable: backup should look reassuring.
      stormFlashStart = performance.now();
      stormFlashSequence = [
        { at: 180 + Math.random() * 90, duration: 105, peak: 24 },
        { at: 880 + Math.random() * 160, duration: 90, peak: 16 }
      ];
      if (Math.random() < 0.35) stormFlashSequence.push({ at: 1490, duration: 75, peak: 10 });
    } else if (currentWeather !== "storm") {
      stormFlashSequence = [];
    }
    renderBatteryDisplay();
    if (!scene || !rainLines || !snowPoints) return;
    const style = WEATHER_STYLES[currentWeather];
    scene.background.setHex(style.background);
    scene.fog.color.setHex(style.fog);
    scene.fog.near = style.near;
    scene.fog.far = style.far;
    sunLight.intensity = style.sun;
    hemisphereLight.intensity = style.hemi;
    warmInteriorLight.intensity = style.warm;
    renderer.toneMappingExposure = style.exposure;
    rainLines.visible = ["rain", "storm"].includes(currentWeather);
    rainLines.material.opacity = currentWeather === "storm" ? 0.38 : 0.22;
    snowPoints.visible = currentWeather === "snow";
    lightningLight.intensity = 0;
    // P0-2 重制版：窗外=程序化天际线 Group（视差剪影）。天气切换改为整体色调滤镜——
    // 用 group 内各 mesh 的 material.color tint 实现（晴=原色，雨=压暗去暖，夜=深蓝调），
    // 不再整幅换贴图，剪影/亮窗/树影全部保留。
    if (windowView?.isGroup) {
      const tint = {
        clear: [1, 1, 1], cloudy: [0.82, 0.85, 0.9], rain: [0.55, 0.62, 0.72],
        storm: [0.38, 0.44, 0.55], snow: [0.88, 0.92, 1.0], night: [0.3, 0.38, 0.58]
      }[currentWeather] || [1, 1, 1];
      windowView.traverse((child) => {
        if (child.isMesh && child.material?.color) {
          const key = "__baseColor";
          if (!child.userData[key]) child.userData[key] = child.material.color.clone();
          child.material.color.copy(child.userData[key]);
          child.material.color.multiply(new (child.material.color.constructor)(tint[0], tint[1], tint[2]));
        }
      });
    }
    if (drivewaySurface?.material) {
      drivewaySurface.material.color.setHex(style.ground);
      drivewaySurface.material.roughness = 0.76 - style.wet * 0.55;
      drivewaySurface.material.clearcoat = 0.05 + style.wet * 0.62;
      drivewaySurface.material.clearcoatRoughness = 0.55 - style.wet * 0.4;
      drivewaySurface.material.needsUpdate = true;
    }
    // 天气切换后按当前时刻重算光照（时刻与天气叠加生效）
    if (timeOfDay !== null) applyTimeOfDay(timeOfDay);
  }

  /* ====== 完整一天时间变化系统 ======
   * 把 app.js 的模拟时钟（simMinute 0-1440）接进 3D 场景：
   * 太阳高度角/方位角、色温、强度，天空/雾色，室内灯带随时刻连续插值——
   * 拖动时间轴或 60× 模拟跑一天，能看到日出→正午→黄昏→夜晚的全过程。 */
  let timeOfDay = null; // 0-1440 分钟，null=未接管（用天气默认光照）

  function setTimeOfDay(minute) {
    if (!Number.isFinite(minute)) return;
    timeOfDay = ((minute % 1440) + 1440) % 1440;
    if (!scene || !sunLight) return;
    applyTimeOfDay(timeOfDay);
  }

  function applyTimeOfDay(minute) {
    const hour = minute / 60;
    /* 太阳弧线：6:00 日出（东 z+），12:00 正午（顶），18:00 日落（西 x-），夜间沉入地平线下。
     * elevation 用 cos 半波（6-18 时为正），azimuth 线性扫过 180°。 */
    const dayT = (hour - 6) / 12; // 0..1 白天进度
    const elevation = Math.sin(Math.PI * Math.min(Math.max(dayT, 0), 1)) ; // 0..1..0
    const isDay = hour > 5.6 && hour < 18.4;
    const twilight = Math.exp(-Math.pow((hour - 6.4) / 0.9, 2)) + Math.exp(-Math.pow((hour - 17.6) / 0.9, 2)); // 晨昏峰值
    const nightFactor = isDay ? Math.pow(Math.max(0, 1 - elevation), 1.4) : 1;

    // 太阳位置：上午在东（z 正）→ 午后向西（x 负）
    const azimuth = Math.PI * (1 - Math.min(Math.max(dayT, 0), 1));
    const sunHeight = 1.2 + elevation * 10.5;
    const sunDist = 14;
    sunLight.position.set(
      Math.cos(azimuth) * sunDist * 0.85 - 3,
      isDay ? sunHeight : -4,
      Math.sin(azimuth) * sunDist + 5
    );

    // 太阳色温：正午白 → 晨昏金橙 → 夜间熄灭
    const dayColor = new (sunLight.color.constructor)();
    dayColor.setHex(0xfff3e0);
    const dawnColor = new (sunLight.color.constructor)();
    dawnColor.setHex(0xff9a4d);
    sunLight.color.copy(dayColor).lerp(dawnColor, Math.min(1, twilight * 1.25));
    const sunScale = { clear: 1, cloudy: 0.72, rain: 0.35, storm: 0.12, snow: 0.65, night: 0 }[currentWeather] ?? 1;
    sunLight.intensity = isDay ? (0.7 + elevation * 2.1) * sunScale : 0.05;

    // Time controls the clear-sky palette; adverse weather keeps its own sky.
    // Otherwise the simulation clock paints storm/snow bright blue every tick.
    const skyKey = !isDay && (hour < 5.2 || hour > 19.2) ? "night"
      : twilight > 0.42 ? "golden"
      : "day";
    const skyPalettes = {
      night: { bg: 0x0a1723, fog: 0x0a1723, hemi: 0.48, warm: 24, exposure: 0.76 },
      golden: { bg: 0xc98d5a, fog: 0xd8a874, hemi: 0.95, warm: 14, exposure: 0.95 },
      day: { bg: 0x8fb0c4, fog: 0x8fb0c4, hemi: 1.32, warm: 9, exposure: 0.99 }
    };
    const pal = skyPalettes[skyKey];
    const weatherStyle = WEATHER_STYLES[currentWeather] || WEATHER_STYLES.clear;
    const adverseWeather = ["cloudy", "rain", "storm", "snow"].includes(currentWeather);
    scene.background.setHex(adverseWeather ? weatherStyle.background : pal.bg);
    scene.fog.color.setHex(adverseWeather ? weatherStyle.fog : pal.fog);
    scene.fog.near = weatherStyle.near;
    scene.fog.far = weatherStyle.far;
    const ambientScale = { clear: 1, cloudy: 0.92, rain: 0.82, storm: 0.72, snow: 1.04, night: 0.76 }[currentWeather] || 1;
    hemisphereLight.intensity = pal.hemi * ambientScale;
    warmInteriorLight.intensity = 9 + nightFactor * 16 + ({ rain: 5, storm: 10, snow: 4 }[currentWeather] || 0);
    renderer.toneMappingExposure = adverseWeather ? weatherStyle.exposure : pal.exposure;
    if (coveLights?.length) coveLights.forEach(({ light }) => { light.intensity = 1.2 + nightFactor * 2.2; });

    // 窗外城市：夜晚亮窗全亮（tint 蓝调+提亮窗点由贴图 alpha 呈现），白天恢复
    if (windowView?.isGroup) {
      const timeTint = skyKey === "night" ? [0.3, 0.38, 0.58]
        : skyKey === "golden" ? [1.08, 0.95, 0.82]
        : [1, 1, 1];
      const weatherTint = {
        cloudy: [0.82, 0.85, 0.9], rain: [0.65, 0.72, 0.8],
        storm: [0.45, 0.55, 0.68], snow: [0.92, 0.95, 1]
      }[currentWeather] || [1, 1, 1];
      windowView.traverse((child) => {
        if (child.isMesh && child.material?.color) {
          const key = "__baseColor";
          if (!child.userData[key]) child.userData[key] = child.material.color.clone();
          child.material.color.copy(child.userData[key]);
          child.material.color.multiply(new (child.material.color.constructor)(
            timeTint[0] * weatherTint[0], timeTint[1] * weatherTint[1], timeTint[2] * weatherTint[2]
          ));
        }
      });
    }
  }

  function syncDevices(devices = []) {
    currentDevices = devices;
    if (!SceneAPI.ready) return;

    interactiveObjects = [];
    propByType.forEach((object, type) => {
      const device = devices.find((entry) => entry.type === type);
      if (!device) {
        if (["fridge", "washer", "tv", "router", "lamp"].includes(type)) object.visible = false;
        return;
      }
      object.visible = true;
      markInteractive(object, device.id, device.enabled);
    });

    removeDynamicDraggables();
    clearGroup(deviceAccessoryGroup);
    const modeledTypes = new Set(["fridge", "washer", "tv", "router", "lamp", "ev"]);
    const unmodeled = devices.filter((device) => !modeledTypes.has(device.type));
    unmodeled.slice(0, 7).forEach((device, index) => {
      const object = createAccessoryForDevice(device, index);
      deviceAccessoryGroup.add(object);
      registerDraggable(object, `device-${device.id}`, device.name, { zone: device.type === "aircon" ? "room" : "living", dynamic: true });
      markInteractive(object, device.id, device.enabled);
    });
    applyStoredFurnitureLayout();
  }

  function createAccessoryForDevice(device, index) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({ color: device.enabled ? 0xd9dde0 : 0x70797e, roughness: 0.34, metalness: 0.48, clearcoat: 0.16 });
    if (device.type === "aircon") {
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.38, 0.44, 0.38, 6, 0.075), material);
      const vent = new THREE.Mesh(new RoundedBoxGeometry(1.13, 0.08, 0.025, 3, 0.02), new THREE.MeshStandardMaterial({ color: 0x1e2427, roughness: 0.5 }));
      vent.position.set(0, -0.1, 0.205);
      group.add(body, vent);
      group.position.set(3.7, 3.45, -3.96);
    } else if (device.type === "cpap") {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.28, 0.4, 6, 0.06), material);
      const screen = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.09, 0.015, 3, 0.015), new THREE.MeshBasicMaterial({ color: 0x20bce0 }));
      screen.position.set(0, 0.04, 0.21);
      group.add(body, screen);
      group.position.set(-2.8, 0.82, 1.45);
    } else if (device.type === "ev") {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.72, 0.24, 6, 0.06), material);
      const indicator = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.105, 28), new THREE.MeshBasicMaterial({ color: device.enabled ? 0x2bb88a : 0x777777, side: THREE.DoubleSide }));
      indicator.position.set(0, 0.12, 0.13);
      group.add(body, indicator);
      group.position.set(-5.58, 1.28, 1.9);
      group.rotation.y = Math.PI / 2;
    } else {
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.2, 0.29, 5, 0.045), material);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: device.enabled ? 0x2bb88a : 0x6e777c }));
      led.position.set(0.08, 0.05, 0.15);
      group.add(body, led);
      group.position.set(0.6 + (index % 4) * 0.46, 1.06, -3.32);
    }
    group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return group;
  }

  function markInteractive(object, id, enabled) {
    object.userData.deviceId = id;
    object.userData.enabled = enabled;
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.userData.deviceId = id;
      interactiveObjects.push(child);
      if (child.material && "opacity" in child.material) {
        child.material.transparent = !enabled;
        child.material.opacity = enabled ? 1 : 0.42;
      }
    });
  }

  function highlightDevice(id) {
    if (!SceneAPI.ready || !selectionRing) return;
    const target = interactiveObjects.find((object) => object.userData.deviceId === id);
    if (!target) {
      selectionRing.visible = false;
      return;
    }
    // Bug修复：选中圈按包围盒算，但隐形接触阴影贴片(2.24倍大小)也被算进去了，导致蓝圈远大于物体。
    let anchor = target.parent && target.parent.userData.deviceId === id ? target.parent : target;
    const box = new THREE.Box3();
    anchor.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === "grounding-shadow" || child.name === "vehicle-contact-shadow") return;
      if (!child.visible) return;
      child.updateWorldMatrix(true, false);
      box.expandByObject(child);
    });
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Bug修复#3c：环固定y=0.025会被地毯(顶0.0425)和接触阴影片(0.059)埋住不可见——抬到0.065并置顶渲染
    selectionRing.position.set(center.x, 0.065, center.z);
    selectionRing.renderOrder = 2;
    // Bug修复#3b(修正): 系数回到0.72——外缘(0.84×scale)应超出物体边缘21%形成贴边光晕；
    // 0.6会让外缘恰好贴边→俯视时环藏在物体底下不可见。"圈过大"的真正元凶是隐形阴影贴片(已排除)。
    selectionRing.scale.set(Math.max(0.38, size.x * 0.72), Math.max(0.38, size.z * 0.72), 1);
    selectionRing.visible = true;
  }

  function updateFlows(flows = {}, soc = 62) {
    currentFlows = { ...currentFlows, ...flows };
    currentSoc = Number.isFinite(soc) ? soc : currentSoc;
    renderBatteryDisplay();
    renderMeterDisplay();
    if (batteryScreenGlow) {
      batteryScreenGlow.material.color.set(currentSoc < 18 ? 0xe45c55 : currentSoc < 38 ? 0xf4b43a : 0x31d5f4);
    }
  }

  function createEnergyFlow(key, rawPoints, color) {
    const route = rawPoints.map((point) => new THREE.Vector3(...point));
    const curve = new THREE.CurvePath();
    for (let index = 1; index < route.length; index += 1) curve.add(new THREE.LineCurve3(route[index - 1], route[index]));
    const tubeMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 74, 0.018, 8, false), tubeMaterial);
    root.add(tube);
    const particleMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthWrite: false });
    const particles = Array.from({ length: 12 }, (_, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), particleMaterial);
      mesh.visible = false;
      root.add(mesh);
      return { mesh, offset: index / 12 };
    });
    return { key, curve, tube, particles };
  }

  function makeTextPlate(title, subtitle) {
    const plate = new THREE.Group();
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 220;
    const context = canvas.getContext("2d");
    context.fillStyle = "rgba(9,21,30,.84)";
    context.beginPath();
    context.roundRect(4, 4, 760, 212, 24);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.18)";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "rgba(255,255,255,.94)";
    context.font = "700 46px sans-serif";
    context.fillText(title, 42, 94);
    context.fillStyle = "rgba(255,255,255,.48)";
    context.font = "500 24px monospace";
    context.fillText(subtitle, 42, 152);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 0.79), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    plate.add(plane);
    return plate;
  }

  // P0-2: 按天气生成窗外画面。晴=天空渐变+远景城市剪影+太阳；雨=灰蒙+雨幕；夜=保留原夜景贴图。
  function makeDayWindowTexture(weather) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 640;
    const context = canvas.getContext("2d");
    const sky = context.createLinearGradient(0, 0, 0, canvas.height);
    if (weather === "cloudy") {
      sky.addColorStop(0, "#9fb4c2");
      sky.addColorStop(0.62, "#c3d2da");
      sky.addColorStop(1, "#dfe5e5");
    } else if (weather === "rain" || weather === "storm") {
      const dark = weather === "storm";
      sky.addColorStop(0, dark ? "#17222e" : "#3c505f");
      sky.addColorStop(0.6, dark ? "#233240" : "#5c707c");
      sky.addColorStop(1, dark ? "#2c3a45" : "#7b8a90");
    } else if (weather === "snow") {
      sky.addColorStop(0, "#c9d7dd");
      sky.addColorStop(0.65, "#dee7e9");
      sky.addColorStop(1, "#eef2f0");
    } else {
      sky.addColorStop(0, "#8fc4e8");
      sky.addColorStop(0.55, "#bfe0f2");
      sky.addColorStop(1, "#e9f2f0");
    }
    context.fillStyle = sky;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (weather === "clear" || weather === "cloudy" || weather === "snow") {
      // 太阳（晴天才明显）
      if (weather === "clear") {
        const sun = context.createRadialGradient(790, 130, 6, 790, 130, 120);
        sun.addColorStop(0, "rgba(255,246,214,.98)");
        sun.addColorStop(0.16, "rgba(255,238,190,.72)");
        sun.addColorStop(1, "rgba(255,238,190,0)");
        context.fillStyle = sun;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      // 云
      context.fillStyle = weather === "clear" ? "rgba(255,255,255,.5)" : "rgba(236,242,244,.85)";
      for (let cloud = 0; cloud < 6; cloud += 1) {
        const cx = 60 + cloud * 170 + (cloud % 2) * 40;
        const cy = 70 + (cloud % 3) * 52;
        const cw = 120 + (cloud % 3) * 46;
        context.beginPath();
        context.ellipse(cx, cy, cw, 24 + (cloud % 2) * 12, 0, 0, Math.PI * 2);
        context.ellipse(cx + cw * 0.42, cy - 14, cw * 0.55, 19, 0, 0, Math.PI * 2);
        context.fill();
      }
    }

    // 远景城市剪影（三层视差）——增强真实感：楼体加窗户点阵、加绿化带与道路层，破"平面剪纸"感
    const silhouetteLayers = [
      { base: 470, height: 120, color: weather === "night" ? "#1b2735" : weather === "clear" ? "rgba(116,144,162,.40)" : "rgba(104,122,134,.45)", step: 96, windows: false },
      { base: 500, height: 92, color: weather === "clear" ? "rgba(88,114,134,.58)" : "rgba(84,100,112,.62)", step: 74, windows: true, winColor: "rgba(220,235,240,.28)" },
      { base: 545, height: 64, color: weather === "clear" ? "rgba(56,78,94,.85)" : "rgba(58,72,84,.85)", step: 56, windows: true, winColor: "rgba(225,238,242,.34)" }
    ];
    silhouetteLayers.forEach((layer, layerIndex) => {
      context.fillStyle = layer.color;
      let x = -20 + layerIndex * 17;
      let seed = layerIndex * 7 + 3;
      while (x < canvas.width + 40) {
        seed = (seed * 9301 + 49297) % 233280;
        const w = 26 + (seed % layer.step);
        const h = layer.height * (0.4 + (seed % 100) / 140);
        context.fillRect(x, layer.base - h, w, h + 130);
        // 近层楼体加窗户点阵（间距化格点，营造真实立面）
        if (layer.windows) {
          context.fillStyle = layer.winColor;
          for (let wy = layer.base - h + 10; wy < layer.base - 8; wy += 13) {
            for (let wx = x + 5; wx < x + w - 5; wx += 11) {
              if ((seed + wx * wy) % 7 < 3) context.fillRect(wx, wy, 5, 6);
            }
          }
          context.fillStyle = layer.color;
        }
        x += w + 6 + (seed % 12);
      }
    });
    // 城市绿化带（前景楼前的树冠层，暖灰绿色，破"全是灰色楼房"的单调）
    context.fillStyle = weather === "clear" ? "rgba(88,116,84,.5)" : "rgba(74,92,76,.55)";
    for (let tree = 0; tree < 14; tree += 1) {
      const tx = 20 + tree * 74 + (tree % 3) * 18;
      const ty = 528 + (tree % 2) * 8;
      context.beginPath();
      context.ellipse(tx, ty, 20 + (tree % 3) * 6, 14 + (tree % 2) * 5, 0, 0, Math.PI * 2);
      context.fill();
    }
    // 前景屋顶线
    context.fillStyle = weather === "clear" ? "rgba(42,56,66,.94)" : "rgba(44,56,66,.94)";
    context.fillRect(0, 545, canvas.width, 95);
    for (let chimney = 0; chimney < 5; chimney += 1) {
      const cx = 90 + chimney * 210;
      context.fillRect(cx, 505 + (chimney % 2) * 14, 26, 44);
    }

    if (weather === "rain" || weather === "storm") {
      // 雨幕
      context.strokeStyle = weather === "storm" ? "rgba(190,214,230,.2)" : "rgba(190,214,230,.13)";
      context.lineWidth = 1.4;
      for (let drop = 0; drop < 240; drop += 1) {
        const dx = Math.random() * canvas.width;
        const dy = Math.random() * canvas.height;
        context.beginPath();
        context.moveTo(dx, dy);
        context.lineTo(dx - 5, dy + 17);
        context.stroke();
      }
    }
    if (weather === "snow") {
      context.fillStyle = "rgba(255,255,255,.75)";
      for (let flake = 0; flake < 160; flake += 1) {
        context.beginPath();
        context.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1.4 + Math.random() * 2.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  function makeOakTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 1024, 0);
    gradient.addColorStop(0, "#cfa776");
    gradient.addColorStop(0.5, "#ddb98b");
    gradient.addColorStop(1, "#c59b6a");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 1024);
    context.strokeStyle = "rgba(92,57,31,.22)";
    context.lineWidth = 3;
    for (let row = 0; row < 8; row += 1) {
      const y = row * 128;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(1024, y);
      context.stroke();
      for (let knot = 0; knot < 10; knot += 1) {
        const x = (knot * 123 + row * 41) % 1024;
        context.strokeStyle = "rgba(91,56,31,.09)";
        context.beginPath();
        context.ellipse(x, y + 54 + Math.sin(knot) * 19, 60, 7, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  async function loadCroppedTexture(url) {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    let minX = source.width;
    let minY = source.height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < source.height; y += 3) {
      for (let x = 0; x < source.width; x += 3) {
        if (pixels[(y * source.width + x) * 4 + 3] > 18) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxX <= minX || maxY <= minY) throw new Error("No visible pixels in official product reference");
    const padding = Math.round(Math.max(maxX - minX, maxY - minY) * 0.025);
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(source.width, maxX + padding);
    maxY = Math.min(source.height, maxY + padding);
    const cropped = document.createElement("canvas");
    cropped.width = maxX - minX;
    cropped.height = maxY - minY;
    cropped.getContext("2d").drawImage(source, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    const texture = new THREE.CanvasTexture(cropped);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function clearGroup(group) {
    group.children.slice().forEach((child) => {
      group.remove(child);
      child.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => material.dispose());
        }
      });
    });
  }

  function bindInteraction() {
    document.querySelector("#solarbank-hotspot")?.addEventListener("click", () => {
      document.querySelector('[data-scene-view="product"]')?.click();
    });
    document.querySelectorAll("[data-infrastructure-focus]").forEach((button) => {
      button.addEventListener("click", () => focusInfrastructure(button.dataset.infrastructureFocus));
    });
    selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.84, 64),
      new THREE.MeshBasicMaterial({ color: 0x2bc8e9, transparent: true, opacity: 0.64, side: THREE.DoubleSide, depthWrite: false })
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.visible = false;
    root.add(selectionRing);

    dragRaycaster = new THREE.Raycaster();
    furnitureDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    canvas.addEventListener("pointerdown", (event) => {
      dragMoved = false;
      previousPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      const furnitureHit = furnitureAssetsReady ? findDraggableFurniture(event) : null;
      if (furnitureHit) {
        const floorPoint = getFloorIntersection(event);
        if (floorPoint) {
          activeFurnitureDrag = {
            entry: furnitureHit,
            offsetX: furnitureHit.object.position.x - floorPoint.x,
            offsetZ: furnitureHit.object.position.z - floorPoint.z
          };
          selectedFurniture = furnitureHit;
          dragging = false;
          canvas.classList.add("is-furniture-dragging");
          highlightFurniture(furnitureHit);
          return;
        }
      }
      dragging = true;
      canvas.classList.add("is-camera-dragging");
    });
    canvas.addEventListener("pointermove", (event) => {
      if (activeFurnitureDrag) {
        const floorPoint = getFloorIntersection(event);
        if (!floorPoint) return;
        const nextX = floorPoint.x + activeFurnitureDrag.offsetX;
        const nextZ = floorPoint.z + activeFurnitureDrag.offsetZ;
        if (Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y) > 2) dragMoved = true;
        tryMoveFurniture(activeFurnitureDrag.entry, nextX, nextZ);
        highlightFurniture(activeFurnitureDrag.entry);
        return;
      }
      if (!dragging) return;
      const dx = event.clientX - previousPointer.x;
      const dy = event.clientY - previousPointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
      /* 丝滑修复#5：拖拽灵敏度从 0.004/0.0022 提到 0.0052/0.0029——同样手势转得更多，
       * 减少用户"拖了很多圈才动一点"的体感卡顿；yaw 不再每步做双段 clamp 归一（原本
       * 超出 ±π 时先 ±2π 再 clamp，等价于把转角吸回边界，快速甩动会有回弹感）。 */
      orbit.targetYaw -= dx * 0.0052;
      if (orbit.targetYaw > Math.PI) orbit.targetYaw -= Math.PI * 2;
      else if (orbit.targetYaw < -Math.PI) orbit.targetYaw += Math.PI * 2;
      orbit.targetPitch = clamp(orbit.targetPitch + dy * 0.0029, -0.05, 1.35);
      previousPointer = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointerup", (event) => {
      if (activeFurnitureDrag) {
        const entry = activeFurnitureDrag.entry;
        activeFurnitureDrag = null;
        canvas.classList.remove("is-furniture-dragging", "is-placement-blocked");
        selectionRing.material.color.setHex(0x2bc8e9);
        saveFurnitureLayout();
        if (!dragMoved && entry.object.userData.deviceId) callback(entry.object.userData.deviceId);
        return;
      }
      dragging = false;
      canvas.classList.remove("is-camera-dragging");
      if (!dragMoved) pickDevice(event);
    });
    canvas.addEventListener("pointercancel", () => {
      dragging = false;
      activeFurnitureDrag = null;
      canvas.classList.remove("is-camera-dragging", "is-furniture-dragging", "is-placement-blocked");
    });
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      console.warn("[3D watchdog] WebGL 上下文丢失，5s 后自动恢复");
      setTimeout(() => location.reload(), 5000);
    });
    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      /* 丝滑修复#4：滚轮缩放从 ±0.55 台阶改为 delta 比例——鼠标一格 ≈ 0.42，
       * 触控板微滚也能得到连续小步长，配合相机指数插值就是顺滑的推拉。 */
      const step = clamp(event.deltaY * 0.0042, -1.1, 1.1);
      orbit.targetRadius = clamp(orbit.targetRadius + step, 2.0, 24);
    }, { passive: false });

    document.querySelectorAll("[data-scene-view]").forEach((button) => {
      button.addEventListener("click", () => {
        activeSceneView = button.dataset.sceneView || "site";
        document.querySelectorAll("[data-scene-view]").forEach((item) => item.classList.toggle("is-active", item === button));
        document.querySelectorAll("[data-infrastructure-focus]").forEach((item) => {
          item.classList.remove("is-active");
          item.setAttribute("aria-pressed", "false");
        });
        if (button.dataset.sceneView === "product") {
          orbit.targetYaw = 0.12;
          orbit.targetPitch = 0.08;
          orbit.targetRadius = 2.0;
          cameraTarget.targetX = -4.55;
          cameraTarget.targetY = 0.22;
          cameraTarget.targetZ = -3.33;
        } else if (button.dataset.sceneView === "drive") {
          orbit.targetYaw = -0.32;
          orbit.targetPitch = 0.12;
          orbit.targetRadius = stage.getBoundingClientRect().width < 600 ? 14.8 : 12.6;
          cameraTarget.targetX = 1.1;
          cameraTarget.targetY = 0.62;
          cameraTarget.targetZ = 7.0;
        } else if (button.dataset.sceneView === "top") {
          orbit.targetYaw = 0.05;
          orbit.targetPitch = 1.02;
          orbit.targetRadius = stage.getBoundingClientRect().width < 600 ? 22 : 18.2;
          cameraTarget.targetX = -0.25;
          cameraTarget.targetY = 0;
          cameraTarget.targetZ = 2.7;
        } else if (button.dataset.sceneView === "room") {
          orbit.targetYaw = 0.2;
          orbit.targetPitch = 0.13;
          orbit.targetRadius = stage.getBoundingClientRect().width < 600 ? 14.5 : 10.8;
          cameraTarget.targetX = 0;
          cameraTarget.targetY = 1.25;
          cameraTarget.targetZ = -0.35;
        } else {
          orbit.targetYaw = 0.18;
          orbit.targetPitch = 0.24;
          orbit.targetRadius = stage.getBoundingClientRect().width < 600 ? 21 : 16.4;
          cameraTarget.targetX = 0;
          cameraTarget.targetY = 1.15;
          cameraTarget.targetZ = 2.25;
        }
      });
    });

    document.querySelectorAll("[data-scene-action='reset']").forEach((button) => {
      button.addEventListener("click", () => {
        activeSceneView = "site";
        resetFurnitureLayout();
        document.querySelectorAll("[data-scene-view]").forEach((item) => item.classList.toggle("is-active", item.dataset.sceneView === "site"));
        document.querySelectorAll("[data-infrastructure-focus]").forEach((item) => {
          item.classList.remove("is-active");
          item.setAttribute("aria-pressed", "false");
        });
        orbit.targetYaw = 0.18;
        orbit.targetPitch = 0.24;
        orbit.targetRadius = stage.getBoundingClientRect().width < 600 ? 21 : 16.4;
        cameraTarget.targetX = 0;
        cameraTarget.targetY = 1.15;
        cameraTarget.targetZ = 2.25;
      });
    });

    document.querySelectorAll("[data-scene-action='rotate-left']").forEach((button) => button.addEventListener("click", () => rotateSelected(-1)));
    document.querySelectorAll("[data-scene-action='rotate-right']").forEach((button) => button.addEventListener("click", () => rotateSelected(1)));
  }

  function focusInfrastructure(key) {
    if (!camera || !stage) return;
    const views = {
      inverter: { yaw: 0.14, pitch: -0.12, radius: 3.3, x: -4.55, y: 4.47, z: -1.12 },
      meter: { yaw: -0.95, pitch: 0.08, radius: 3.5, x: 5.48, y: 2.10, z: -1.55 },
      plug: { yaw: -0.98, pitch: 0.06, radius: 2.7, x: 5.48, y: 1.20, z: 0.05 }
    };
    const view = views[key];
    if (!view) return;
    activeSceneView = "infrastructure";
    document.querySelectorAll("[data-scene-view]").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll("[data-infrastructure-focus]").forEach((item) => {
      const active = item.dataset.infrastructureFocus === key;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    orbit.targetYaw = view.yaw;
    orbit.targetPitch = view.pitch;
    orbit.targetRadius = stage.clientWidth < 600 ? view.radius * 1.3 : view.radius;
    cameraTarget.targetX = view.x;
    cameraTarget.targetY = view.y;
    cameraTarget.targetZ = view.z;
  }

  function pointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function findDraggableFurniture(event) {
    dragRaycaster.setFromCamera(pointerFromEvent(event), camera);
    const hits = dragRaycaster.intersectObjects(draggableMeshes, false);
    const hit = hits.find((entry) => entry.object.userData.furnitureEntry?.object.visible !== false);
    return hit ? hit.object.userData.furnitureEntry : null;
  }

  function getFloorIntersection(event) {
    dragRaycaster.setFromCamera(pointerFromEvent(event), camera);
    return dragRaycaster.ray.intersectPlane(furnitureDragPlane, new THREE.Vector3());
  }

  function highlightFurniture(entry) {
    // Bug修复：同 highlightDevice——排除隐形接触阴影贴片再算包围盒，蓝圈不再虚大。
    const box = new THREE.Box3();
    entry.object.traverse((child) => {
      if (!child.isMesh) return;
      if (child.name === "grounding-shadow" || child.name === "vehicle-contact-shadow") return;
      if (!child.visible) return;
      child.updateWorldMatrix(true, false);
      box.expandByObject(child);
    });
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    // Bug修复#3c：同上——环抬到地毯之上(0.065)并置顶渲染
    selectionRing.position.set(center.x, 0.065, center.z);
    selectionRing.renderOrder = 2;
    // Bug修复#3b(修正): 同 highlightDevice——系数0.72形成贴边光晕（外缘超物体21%）
    selectionRing.scale.set(Math.max(0.36, size.x * 0.72), Math.max(0.36, size.z * 0.72), 1);
    selectionRing.visible = true;
    selectedFurniture = entry;
    updateSelectedObjectLabel();
  }

  function pickDevice(event) {
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveObjects, false);
    if (!hits.length) {
      selectionRing.visible = false;
      selectedFurniture = null;
      updateSelectedObjectLabel();
      return;
    }
    const id = hits[0].object.userData.deviceId;
    highlightDevice(id);
    callback(id);
  }

  function resize() {
    if (!renderer || !stage) return;
    const rect = stage.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    if (composer) composer.setSize(rect.width, rect.height);
    if (bloomPass) bloomPass.resolution.set(rect.width, rect.height);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    const activeView = activeSceneView === "infrastructure" ? activeSceneView
      : document.querySelector("[data-scene-view].is-active")?.dataset.sceneView || "site";
    if (activeView === "site") orbit.targetRadius = rect.width < 600 ? 21 : rect.width < 900 ? 18.6 : 16.4;
    else if (activeView === "drive") orbit.targetRadius = rect.width < 600 ? 14.8 : 12.6;
    else if (activeView === "product") orbit.targetRadius = 2.0;
    else if (activeView === "top") orbit.targetRadius = rect.width < 600 ? 22 : 18.2;
    else if (activeView === "infrastructure") return;
    else orbit.targetRadius = rect.width < 600 ? 14.5 : rect.width < 900 ? 12.8 : 10.8;
  }

  function updateCamera(delta) {
    /* 丝滑修复#3：相机插值提速 + 帧率无关阻尼。0.065 的固定系数在 60fps 下要 ~0.5s
     * 才追上目标，拖拽时明显"拖泥带水"；改用 1 - exp(-k·dt) 形式，任何帧率下手感一致，
     * k=14 约两三帧贴合，旋转缩放跟手且仍保留一点惯性余韵。
     * 黑屏根因修复：delta 必须由 animate 的帧循环传入——此前引用了未定义的 delta，
     * 每帧 ReferenceError 使 updateCamera 及其后的渲染语句全部中断，画布永远黑屏。 */
    const smoothing = 1 - Math.exp(-14 * Math.max(delta ?? 0.016, 0.001));
    orbit.yaw += (orbit.targetYaw - orbit.yaw) * smoothing;
    orbit.pitch += (orbit.targetPitch - orbit.pitch) * smoothing;
    orbit.radius += (orbit.targetRadius - orbit.radius) * smoothing;
    cameraTarget.x += (cameraTarget.targetX - cameraTarget.x) * smoothing;
    cameraTarget.y += (cameraTarget.targetY - cameraTarget.y) * smoothing;
    cameraTarget.z += (cameraTarget.targetZ - cameraTarget.z) * smoothing;
    const target = new THREE.Vector3(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.position.set(
      target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius,
      target.y + Math.sin(orbit.pitch) * orbit.radius,
      target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.radius
    );
    camera.lookAt(target);
  }

  let hotspotEl = null;
  let stageVisible = true; /* 渲染闸门：由 IntersectionObserver 驱动（卡顿优化 B） */
  function positionProductHotspot(frameSkip) {
    if (frameSkip % 3 !== 0) return; /* 性能优化 B：DOM 定位降频到每 3 帧，视觉无感 */
    if (!hotspotEl) hotspotEl = document.querySelector("#solarbank-hotspot");
    const hotspot = hotspotEl;
    if (!hotspot || !batteryObject || !camera || !stage) return;
    if (activeSceneView === "product" || activeSceneView === "infrastructure" || stage.clientWidth < 720) {
      hotspot.hidden = true;
      return;
    }
    camera.updateMatrixWorld();
    const point = new THREE.Vector3(batteryObject.position.x, 0.58, batteryObject.position.z).project(camera);
    const visible = point.z < 1 && point.z > -1 && Math.abs(point.x) < 0.93 && Math.abs(point.y) < 0.86;
    hotspot.hidden = !visible;
    if (!visible) return;
    const x = (point.x + 1) * 0.5 * stage.clientWidth;
    const y = (1 - point.y) * 0.5 * stage.clientHeight;
    hotspot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  function animate() {
    const clock = new THREE.Clock();
    /* 丝滑修复#1：解除 40fps 硬限流。固定 1000/40 的帧闸门在 60Hz 屏上会与 rAF 节拍
     * 拍频冲突（16.6/33.3ms 交替），旋转缩放必然顿挫；改成每帧都渲染，帧率自然跟住
     * 显示器刷新率，GPU 负载已由 SAO 移除 + pixelRatio 上限兜住。 */
    const loop = (now) => {
      requestAnimationFrame(loop);
      if (document.hidden) return;
      /* 性能优化 A（视口外停渲）+ 卡顿优化 B：可见性改由 IntersectionObserver 驱动——
       * 每帧 getBoundingClientRect 会强制同步布局（滚动时尤其贵），观察器零成本且同样准确。 */
      if (stage && !stageVisible) return;
      const delta = Math.min((now - (loop.last ?? now)) / 1000, 0.1);
      loop.last = now;
      const elapsed = clock.getElapsedTime();
      updateCamera(delta);
      positionProductHotspot(++loop.hotspotTick);
      flowObjects.forEach((flow) => {
        flow.tube.visible = activeSceneView !== "product";
        /* 能量流取数：新增 tv/kitchen/fridge 三条负载流，跟随家庭负荷亮度 */
        const amount = flow.key === "solar" || flow.key === "solar-dc"
          ? currentFlows.solar
          : flow.key === "battery"
            ? Math.abs(currentFlows.battery)
            : flow.key === "ev"
              ? Math.abs(currentFlows.ev || 0)
              : flow.key === "tv" || flow.key === "kitchen" || flow.key === "fridge"
                ? Math.max(0.15, Math.abs(currentFlows.load || 0) * (flow.key === "tv" ? 0.35 : flow.key === "kitchen" ? 0.45 : 0.3))
                : Math.abs(currentFlows.grid);
        const direction = flow.key === "battery" ? (currentFlows.battery >= 0 ? 1 : -1) : flow.key === "grid" ? (currentFlows.grid >= 0 ? 1 : -1) : 1;
        flow.tube.material.opacity = amount > 0.03 ? 0.23 + Math.min(amount, 2.5) * 0.08 : 0.06;
        flow.particles.forEach((particle) => {
          const rawT = particle.offset + elapsed * (0.034 + amount * 0.017) * direction;
          const t = ((rawT % 1) + 1) % 1;
          particle.mesh.position.copy(flow.curve.getPointAt(t));
          particle.mesh.visible = activeSceneView !== "product" && amount > 0.025;
          particle.mesh.scale.setScalar(0.82 + Math.min(amount, 2.4) * 0.14);
        });
      });
      if (selectionRing && selectionRing.visible) {
        selectionRing.material.opacity = 0.48 + Math.sin(elapsed * 2.7) * 0.17;
      }
      if (rainLines?.visible) {
        const attribute = rainLines.geometry.getAttribute("position");
        const stormBoost = currentWeather === "storm" ? 1.8 : 1;
        // B5修复：加风偏——storm 强风 1.6、rain 中风 0.6，x 超界回绕，雨线整体倾斜不再直坠
        const windX = currentWeather === "storm" ? 1.6 : 0.6;
        for (let index = 0; index < attribute.count / 2; index += 1) {
          const speed = (rainSpeedsData?.[index] ?? 0.16) * stormBoost;
          const length = rainLengthsData?.[index] ?? 0.34;
          const pair = index * 2;
          let yTop = attribute.getY(pair) - speed;
          if (yTop < 0.15) yTop += 1.9;
          let xTop = attribute.getX(pair) + windX * speed * 0.35;
          if (xTop > 8) xTop -= 16;
          attribute.setX(pair, xTop);
          attribute.setX(pair + 1, xTop - windX * length * 0.35);
          attribute.setY(pair, yTop);
          attribute.setY(pair + 1, yTop - length);
        }
        attribute.needsUpdate = true;
      }
      if (snowPoints?.visible) {
        const attribute = snowPoints.geometry.getAttribute("position");
        for (let index = 0; index < attribute.count; index += 1) {
          let y = attribute.getY(index) - 0.018;
          if (y < 0.08) y += 1.9;
          attribute.setY(index, y);
          attribute.setX(index, attribute.getX(index) + Math.sin(elapsed * 0.8 + index) * 0.0015);
        }
        attribute.needsUpdate = true;
      }
      if (currentWeather === "storm" && !stormMotionPreference.matches) {
        const age = now - stormFlashStart;
        let level = 0;
        for (const pulse of stormFlashSequence) {
          const phase = age - pulse.at;
          if (phase < 0 || phase >= pulse.duration) continue;
          const rise = Math.min(1, phase / 18);
          const fall = Math.max(0, (pulse.duration - phase) / (pulse.duration - 18));
          level = Math.max(level, pulse.peak * Math.min(rise, fall));
        }
        lightningLight.intensity = level;
      } else lightningLight.intensity = 0;
      // P1-2: Solarbank 状态灯呼吸 + P1-3 后期合成输出
      if (batteryFrontGlowMaterial) {
        batteryFrontGlowMaterial.opacity = 0.55 + Math.sin(elapsed * 2.2) * 0.3;
      }
      if (batteryScreenGlow) {
        batteryScreenGlow.material.opacity = 0.72 + Math.sin(elapsed * 1.6) * 0.2;
      }
      // Task14: EV 线缆能量流光（随实时车充功率呼吸）
      updateEvCableGlow(elapsed, currentFlows.ev || 0);
      if (composer) composer.render();
      else renderer.render(scene, camera);
      /* 黑屏看门狗（两级）：init 后第 90 帧读画布中心像素。
       * 用户 Edge 出现"UI 正常但画布全黑"——核显驱动对后期管线/HDR 中间缓冲的兼容问题。
       * L1 黑帧 → 关 Bloom/SMAA 直渲；再 90 帧仍黑 → L2 用最大兼容参数重建 WebGL 上下文。 */
      if (loop.healthCheck !== false && loop.checked !== true) {
        loop.frames = (loop.frames || 0) + 1;
        if (loop.frames >= 90) {
          try {
            const gl = renderer.getContext();
            const px = new Uint8Array(4);
            gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const isBlack = px[0] < 8 && px[1] < 8 && px[2] < 8;
            if (!isBlack) {
              loop.checked = true; // 画面健康，看门狗退役
            } else if (loop.stage !== "L1") {
              loop.stage = "L1";
              loop.frames = 0;
              console.warn("[3D watchdog] L1 黑帧命中 → 关闭后期管线直渲");
              try { composer?.dispose?.(); } catch (e) { /* ignore */ }
              composer = null;
              renderer.toneMapping = THREE.NoToneMapping;
              renderer.toneMappingExposure = 1.0;
            } else if (loop.stage === "L1") {
              loop.checked = true;
              console.warn("[3D watchdog] L2 直渲仍黑 → 最大兼容模式重建上下文");
              fallbackUI2Shown();
            }
          } catch (err) {
            loop.checked = true;
            console.warn("[3D watchdog] 像素检测失败：", err?.message);
          }
        }
      }
    };
    loop(0);
  }

  function updateLoaderCopy(label, progress) {
    const loader = document.querySelector("#scene-loader");
    if (!loader) return;
    const text = loader.querySelector("p");
    if (text) text.textContent = `${label} · ${progress}`;
  }

  /* 看门狗 L2 兜底 UI：两级自动修复都没救回来 → 这是驱动级黑屏，给用户可操作出口 */
  function fallbackUI2Shown() {
    try { loader?.hide; } catch (e) { /* noop */ }
    const stage = document.querySelector("#scene-stage");
    const loaderUI = document.querySelector("#scene-loader");
    if (loaderUI) loaderUI.hidden = true;
    if (!stage) return;
    if (document.querySelector("#scene-black-recovery")) return;
    const box = document.createElement("div");
    box.id = "scene-black-recovery";
    box.style.cssText = "position:absolute;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;background:rgba(8,17,27,.92);color:#eaf2f8;border-radius:20px";
    box.innerHTML = `
      <strong style="font-size:18px">3D 画面被显卡驱动拦截了</strong>
      <p style="max-width:420px;opacity:.8;line-height:1.6;margin:0">自动修复（两级渲染降级）已尝试但未成功。这几乎总是 Edge「硬件加速」被关闭/驱动兼容导致，按下面任一步即可恢复：</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
        <button id="blackfix-open-setting" style="padding:10px 18px;border-radius:10px;border:0;background:#f58220;color:#fff;font-weight:600;cursor:pointer">打开 Edge 硬件加速设置</button>
        <button id="blackfix-copy" style="padding:10px 18px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#eaf2f8;cursor:pointer">复制软件渲染启动命令</button>
      </div>
      <p id="blackfix-hint" style="font-size:12px;opacity:.6;margin:0"></p>`;
    stage.appendChild(box);
    box.querySelector("#blackfix-open-setting").addEventListener("click", () => { window.open("edge://settings/system", "_blank"); });
    box.querySelector("#blackfix-copy").addEventListener("click", (event) => {
      const cmd = 'cmd /c start msedge --use-angle=swiftshader --use-gl=angle "http://127.0.0.1:4173/"';
      navigator.clipboard?.writeText(cmd).then(
        () => { event.target.textContent = "已复制 ✓"; document.querySelector("#blackfix-hint").textContent = "Win+R 粘贴回车，将以软件渲染重启 Edge（不依赖显卡）"; },
        () => { document.querySelector("#blackfix-hint").textContent = cmd; }
      );
    });
  }
})();
