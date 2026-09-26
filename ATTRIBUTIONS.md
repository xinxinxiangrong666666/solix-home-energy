# 3D 资产与品牌参考说明

本页面是 Anker SOLIX 家庭能源交互概念原型。第三方 3D 资产均保留其许可和署名；Anker SOLIX 产品图仅用于按真实产品外形制作产品体验场景，不作为通用素材再分发。

## Anker SOLIX Solarbank Max AC

- 来源：[Anker SOLIX Solarbank Max AC 官方产品页](https://www.ankersolix.com/fr/products/a17e2)
- 用途：外形、比例、前面板、散热鳍片、接口与银灰材质参考；场景中的主体模型按官方标注尺寸 `670 × 356 × 325 mm` 等比例概念重建，不是官方 CAD。与家具一样在场景中使用米为单位。
- 本地参考图：`assets/official-reference/`
- 权利归属：Anker Innovations / 官方页面对应权利人。

## Anker SOLIX V1 Smart EV Charger

- 来源：[Anker SOLIX V1 官方产品页](https://www.ankersolix.com/uk/smart-ev-charger-v1)
- 用途：室外车充设备的尺寸比例、深色工业材质、触控区与状态光参考；场景模型为本项目程序化重建，不是官方 CAD。
- 权利归属：Anker Innovations / 官方页面对应权利人。

## 家庭电力链路概念设备

- 微型逆变器、配电箱、智能电表/CT 与可选智能插座由本项目使用 Three.js 几何和 PBR 材质制作，为示意模型，不是 Anker 官方 CAD 或已连接的设备。
- Solarbank Max AC 的交流耦合接线依据 [Anker SOLIX 官方产品说明](https://www.ankersolix.com/de/products/a17e2)；[官方 Home Assistant 页面](https://anker-webview-eu.anker.com/home-assistant)列出 Solarbank Max AC、Smart Meter Gen 2 和 Smart Plug 等兼容设备。页面电表数字由浏览器本地模拟生成。

## Tesla 2024 Model 3 Highland

- 文件：`assets/models/tesla-highland/model.glb` 及同目录原始纹理、`CREDITS.md`、`manifest.json`
- 模型作者：RBLXSupercars；公开下载页上传者：brandonleong28
- 原始来源：[Tesla Model 3 2024](https://sketchfab.com/3d-models/tesla-model-3-2024-36c52f3f89f6439c90310f14e8ff33f2)
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 获取与许可核对：[Tesla Studio Highland 资产说明](https://github.com/aditano/tesla-studio/tree/main/public/models/highland)
- 网页处理：保留 179,692 个三角面和原始纹理，采用上游已处理的 Meshopt 压缩版本；运行时按 4.72 m 车长归一化，并以轮胎接地点贴合车位。
- 商标说明：Tesla 与 Model 3 名称及车辆外观相关权利归其权利人所有。本项目为独立的交互原型，与 Tesla 无隶属、赞助或背书关系。

## Legacy Tesla 2018 Model 3（不再由页面加载）

- 文件：`assets/models/tesla-model-3-2018.glb`、`assets/models/tesla-model-3-web.glb`
- 作者：Ameer Studio（Sketchfab 用户 `uchiha.321abc`）
- 来源：[Tesla 2018 Model 3](https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f)
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 状态：因原始场景含异常最低点，容易造成自动贴地错误，已从运行时代码移除，仅保留为历史中间文件。

## Contemporary Upholstered Sofa

- 文件：`assets/models/sofa-contemporary-opt.glb`
- 原始模型：[Modern Sofa](https://sketchfab.com/3d-models/modern-sofa-ac92f6e97eaa43c4ad6cb8f7c65ac43f)
- 作者：3dimentionalben
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 获取：Objaverse 1.0 对应的标准化 GLB；运行版本将纹理限制为 1K，并使用 Meshopt 与 WebP 压缩。

## Modern Arm Chair 01

- 文件：`assets/models/armchair-modern-opt.glb`
- 来源：[Poly Haven](https://polyhaven.com/a/modern_arm_chair_01)
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 网页处理：保留橡木框架与黑色皮革 PBR 材质，转换为单文件 GLB 并进行 Meshopt/WebP 优化。

## Potted Plant 02

- 文件：`assets/models/potted-plant-real-opt.glb`
- 来源：[Poly Haven](https://polyhaven.com/a/potted_plant_02)
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 网页处理：保留盆体、土壤与透明叶片材质；在不破坏轮廓的前提下降面并压缩为 Web GLB。

## Modern Coffee Table 01

- 文件：`assets/models/coffee-table-modern-opt.glb`
- 来源：[Poly Haven](https://polyhaven.com/a/modern_coffee_table_01)
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 网页处理：保留石材台面和橡木框架，统一为真实家庭尺度。

## Wall-mounted Television + TV Stand

- 当前页面的超薄电视为程序化模型，屏幕显示本项目生成的照片级湖景；历史电视文件 `assets/models/_unused_archive/tv-wall-opt.glb` 不再加载。
- 当前文件：`assets/models/tv-console-opt.glb`。
- 原始媒体柜：[TV Stand](https://sketchfab.com/3d-models/tv-stand-55612f6c24dd4b189993ef80f00791c9)，作者 LightSwitch / `edwardlewis450`。
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 获取与处理：Objaverse 1.0 标准化 GLB；页面增加本地生成的屏幕画面、深色木质材质与声音条细节。

## Wood Floor

- 文件：`assets/models/wood-floor/wood_floor_diff_1k.jpg`、`wood_floor_nor_gl_1k.jpg`、`wood_floor_rough_1k.jpg`
- 来源：[Poly Haven — Wood Floor](https://polyhaven.com/a/wood_floor)，作者 Dimitrios Savva
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 用途：室内地板的颜色、法线和粗糙度贴图；不再使用程序化直线木纹。

## Living-room Rug Fabric

- 文件：`assets/models/rug-fabric/poly_wool_herringbone_{diff,nor_gl,rough}_1k.jpg`
- 来源：[Poly Haven — Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone)，作者 Rico Cilliers / colormass
- 许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 用途：客厅地毯的织物颜色、法线与粗糙度；采用 1K 贴图平铺以控制网页加载体积。

## Generated Scene Photography

- 文件：`assets/courtyard-dusk-v2.png`、`assets/tv-alpine-dusk-v2.png`、`assets/hero-solix-max-v2.png`、`assets/night-solix-max-v2.png`
- 生成方式：Codex 内置 imagegen；用于欧洲住宅窗外景观、电视屏幕内容，以及参考官方产品外形编辑的首屏/收尾概念视觉。
- 两张图不是安克或特斯拉官方图，也不包含可验证地点；完整提示词见 `assets/SCENE_ASSETS.md`。

## Drum Shade Floor Lamp

- 文件：`assets/models/floor-lamp-modern-web.glb`
- 原始模型：[Drum shade floor lamp](https://sketchfab.com/3d-models/drum-shade-floor-lamp-1aa6739d774348efa691340e3a12b870)
- 作者：alpaca.
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 获取与处理：Objaverse 1.0 标准化 GLB；缩减几何密度、纹理限制为 768 px，并使用 Meshopt/WebP 压缩。

## Legacy Furniture（不再由页面加载）

- `assets/models/sofa-modern-opt.glb`：Glam Velvet Sofa，Wayfair, LLC / Eric Chadwick，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- `assets/models/chair-opt.glb`：Sheen Chair，Wayfair, LLC / Eric Chadwick，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。
- `assets/models/lamp-opt.glb`：Iridescence Lamp，Wayfair, LLC / Eric Chadwick，[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。

## Commercial Refrigerator

- 文件：`assets/models/refrigerator-opt.glb`
- 来源：[Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CommercialRefrigerator)
- 作者与改进：Darmstadt Graphics Group GmbH / Eric Chadwick；基于 Sean Thomas 的 Commercial Fridge
- 许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Royal Esplanade HDRI

- 文件：`assets/models/royal_esplanade_1k.hdr`
- 来源：[Poly Haven](https://polyhaven.com/a/royal_esplanade)
- 作者：Greg Zaal
- 许可：[CC0](https://creativecommons.org/publicdomain/zero/1.0/)
