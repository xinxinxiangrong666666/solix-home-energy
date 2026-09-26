# 3D 场景贴图与布局说明

本次新增贴图使用 Codex 内置 imagegen 生成，作为 3D 网页里的照片纹理，不是 3D 模型，也不是安克官方授权的产品 CAD。保留原文件，未覆盖旧图。

## 窗外庭院：`courtyard-dusk-v2.png`

提示词要点：照片级、从欧洲住宅二楼平视安静的北欧/中欧住宅庭院，4 层砖与灰泥公寓、真实窗户阳台、白桦树与庭院步道；金色傍晚与冷色天空。画面仅含室外景色，不含窗框、窗帘、室内、文字、商标或水印；镜头平直、适合映射到一整面大窗。生成时原文：

> Photorealistic view from a second-floor apartment over a quiet modern northern European residential courtyard at golden hour. A row of understated 4-story brick-and-stucco apartment buildings at mid distance, believable balconies and windows, mature birch and plane trees, a narrow pedestrian courtyard below, pale blue dusk sky and warm light spilling from a few windows. Straight-on level camera, wide landscape panorama; entire image is only the outdoor view. No visible interior room, window frame, curtain, balcony handrail, close-up facade, fisheye, blur, text, logo, watermark or CGI.

## 电视湖景：`tv-alpine-dusk-v2.png`

提示词要点：高端纪录片式欧洲阿尔卑斯湖泊蓝调时刻实拍，远山和轻微倒影；16:9 边到边屏幕内容，不带电视机、边框、室内、文字或商标。生成时原文：

> High-end documentary landscape photograph of a calm alpine lake in Europe at blue hour, distant layered mountains, subtle reflections, a touch of warm last light at horizon. Natural premium television demo imagery, dark deep blues and soft cool cyan accents. Edge-to-edge widescreen landscape, level horizon; no frame, bezel, room, devices, text, logos, watermark, 3D or vector art.

## 首屏产品图：`hero-solix-max-v2.png`

以原有 `hero-home_c.jpg` 为编辑目标，以 `official-reference/a17e2-main.png` 作为产品外观参考。仅把原图中的黑色立式电池换成低矮横向、银灰壳体、深灰下半部、窄黑显示屏的 Solarbank Max AC 概念合成，保留原图的阳台、光伏板、室内与黄昏光线。约束：单台实物落地、约 670 × 356 × 325 mm 的视觉比例，无额外性能数字或界面文字。此图为合成营销视觉，并非官方产品实拍或 CAD。

## 收尾夜景：`night-solix-max-v2.png`

以原有 `night-home_c.jpg` 为编辑目标、同一官方产品图为外观参考，只替换阳台上的高立式电池为单台低矮 Solarbank Max AC。保留玻璃门、厨房、夜色、灯光与机位。用于收尾区与 WebGL 降级画面，不表示真机现场拍摄。

## 空间组织

从入口镜头可一次读到三层：后方带光伏的实体浅屋顶与落地窗、中间可布置的现代客厅与真实尺度 Solarbank、前方车位/特斯拉/充电桩。产品特写镜头隐藏演示用能量粒子，避免粒子在近距离被放大成“魔法球”。电车 LP 计划放在右侧控制台，不遮挡 3D。家具归一化后以真实网格最低点接地，并在移动时检查边界/碰撞。
