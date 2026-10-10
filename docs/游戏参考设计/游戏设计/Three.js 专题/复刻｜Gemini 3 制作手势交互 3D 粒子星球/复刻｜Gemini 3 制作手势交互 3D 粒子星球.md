---
title: "复刻｜Gemini 3 制作手势交互 3D 粒子星球"
source: "https://www.xiaohongshu.com/discovery/item/6a5905d8000000000f008ddb?xsec_token=ABBt6bnQ0qeEt1L3xu9NvoKgXxDEF1Tp5b0nzX0b9M-Aw=&xsec_source=pc_search"
author: "景元"
author_uid: "576f77dc6a6a697165af03fa"
date: "07-17"
tags: ["ThreeJS", "Web3D", "Gemini", "手势交互", "MediaPipe", "粒子特效", "网页特效", "3D粒子星球", "Gemini 3"]
platform: "xiaohongshu"
category: "游戏设计"
summary: "本文介绍如何利用 Gemini 3 的 Canvas 模式结合 ThreeJS 与 MediaPipe 技术，零基础复刻手势交互 3D 粒子星球网页。成品包含橙色粒子星球与双层白色星环，支持手掌旋转、握拳拉远、五指张开拉近等手势操控视角，并设有最小安全距离防穿模。文中提供了完整的提示词，可直接复制生"
---

# 复刻｜Gemini 3 制作手势交互 3D 粒子星球

> 作者: 景元 | 日期: 07-17 | 原文: https://www.xiaohongshu.com/discovery/item/6a5905d8000000000f008ddb?xsec_token=ABBt6bnQ0qeEt1L3xu9NvoKgXxDEF1Tp5b0nzX0b9M-Aw=&xsec_source=pc_search

> **摘要**:本文介绍如何利用 Gemini 3 的 Canvas 模式结合 ThreeJS 与 MediaPipe 技术，零基础复刻手势交互 3D 粒子星球网页。成品包含橙色粒子星球与双层白色星环，支持手掌旋转、握拳拉远、五指张开拉近等手势操控视角，并设有最小安全距离防穿模。文中提供了完整的提示词，可直接复制生

复刻｜Gemini 3 制作手势交互 3D 粒子星球
跟着猫学长教程，零基础小白 5 分钟复刻手势操控 3D 粒子星球，完整提示词直接复制丢 AI 即可生成网页！
	
核心用到技术：
Gemini 3 网页版 Canvas 模式
3D 渲染：ThreeJS
手势识别：MediaPipe
	
成品亮点：橙光粒子星球 + 双层白色星环，手势旋转 / 拉近拉远带丝滑缓动，浏览器直接打开运行，无需本地配置依赖！
	
完整提示词：
创建一个webapp，技术选用 vanilla js、html、css、modern threejs、mediapipe；如果mediapipe来自CDN，要用常规的`<script>`标签方式引入。
	
画面中是由大量球形小的粒子构成的一个绚烂的橙色的星球，星球球面应该能显现出来（球面聚集更多粒子）。星球周围环绕着白色粒子，组成两层环绕星环，所有粒子尺寸偏大、亮度很高。
	
交互逻辑： 摄像头中心点始终对准星球中心，依靠用户手部手势控制摄像机视角
1. 手掌旋转：摄像头同步旋转，视觉呈现星球同步顺时针/逆时针转动效果
2. 握拳+手部远离镜头：相机快速拉远星球，移动速度先慢后快
3. 五指张开+手部靠近镜头：相机快速拉近星球，移动速度先快后慢
4. 增加限制：摄像机距离星球中心设置最小安全距离，防止镜头贴穿星球
	
#ThreeJS  #Web3D  #Gemini  #手势交互  #MediaPipe  #粒子特效  #网页特效
07-17

#3D粒子星球 #Gemini 3

## 视频

[视频 1](./video.mp4)

<video controls width="100%"><source src="./video.mp4" type="video/mp4">您的浏览器不支持视频播放。</video>

附件: [音频](./audio/audio.wav) | [处理清单](./video_manifest.json)

## 视频图文总结

> 按关键帧关联完整视频转录；文字保留机器转写原文，时间点仅用于定位。

### 1. 00:00

![关键帧 1 · 0.5s](./img/frame_1.jpg)

- 画面文字（OCR）：0
2
CELESTIAL HAND CONTROLLER

### 2. 00:01

![关键帧 2 · 1.33s](./img/frame_2.jpg)

- 画面文字（OCR）：CELESTIAL HANDCONTROLLER

### 3. 00:02

![关键帧 3 · 2.17s](./img/frame_3.jpg)

- 画面文字（OCR）：111
OOO

### 4. 00:03

![关键帧 4 · 3s](./img/frame_4.jpg)

- 画面文字（OCR）：NDCONTROLLER

### 5. 00:03

![关键帧 5 · 3.83s](./img/frame_5.jpg)

- 该时间点暂无可提取文字。

### 6. 00:04

![关键帧 6 · 4.67s](./img/frame_6.jpg)

- 画面文字（OCR）：TIAL HANDCONTROLLER

### 7. 00:05

![关键帧 7 · 5.5s](./img/frame_7.jpg)

- 画面文字（OCR）：ELESTIALHANDCONTROLLER

### 8. 00:06

![关键帧 8 · 6.33s](./img/frame_8.jpg)

- 画面文字（OCR）：TOHANOO

### 9. 00:07

![关键帧 9 · 7.17s](./img/frame_9.jpg)

- 画面文字（OCR）：NDCONTROLLER

### 10. 00:08

![关键帧 10 · 8s](./img/frame_10.jpg)

- 画面文字（OCR）：#
TOOONOEN

### 11. 00:08

![关键帧 11 · 8.83s](./img/frame_11.jpg)

- 画面文字（OCR）：场
1

### 12. 00:09

![关键帧 12 · 9.67s](./img/frame_12.jpg)

- 画面文字（OCR）：CELESTIAL HAND CONTROLLER

### 13. 00:10

![关键帧 13 · 10.5s](./img/frame_13.jpg)

- 画面文字（OCR）：CELESTIAL HAND CONTROLLER
一

### 14. 00:11

![关键帧 14 · 11.33s](./img/frame_14.jpg)

- 画面文字（OCR）：茶E
CELESTIAL HAND CONTROLLER

### 15. 00:12

![关键帧 15 · 12.17s](./img/frame_15.jpg)

- 画面文字（OCR）：CELESTIAL HANDCONTROLLER

### 16. 00:13

![关键帧 16 · 13s](./img/frame_16.jpg)

- 画面文字（OCR）：CELESTIAL HANDCONTROLLER
三

## 视频画面文字 (OCR)

> OCR 仅供参考，可能包含识别错误；请以视频画面和转写来源为准。

### 关键帧 1 · 0.5s

0
2
CELESTIAL HAND CONTROLLER

### 关键帧 2 · 1.33s

CELESTIAL HANDCONTROLLER

### 关键帧 3 · 2.17s

111
OOO

### 关键帧 4 · 3s

NDCONTROLLER

### 关键帧 6 · 4.67s

TIAL HANDCONTROLLER

### 关键帧 7 · 5.5s

ELESTIALHANDCONTROLLER

### 关键帧 8 · 6.33s

TOHANOO

### 关键帧 9 · 7.17s

NDCONTROLLER

### 关键帧 10 · 8s

#
TOOONOEN

### 关键帧 11 · 8.83s

场
1

### 关键帧 12 · 9.67s

CELESTIAL HAND CONTROLLER

### 关键帧 13 · 10.5s

CELESTIAL HAND CONTROLLER
一

### 关键帧 14 · 11.33s

茶E
CELESTIAL HAND CONTROLLER

### 关键帧 15 · 12.17s

CELESTIAL HANDCONTROLLER

### 关键帧 16 · 13s

CELESTIAL HANDCONTROLLER
三

## 图片

![图 1](./img/img_1.jpg)

## 图片文字 (OCR)

> OCR 仅供参考，可能包含识别错误；请以原图为准。

DCONTROLLIR
Gemini
3
手势交互
粒子效果
