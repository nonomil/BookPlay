# 豆豆龙老师资产复核

## 已验证

- CliproxAPI `gpt-image-2` 返回两张正式源图，真实格式均为 PNG RGB、实际尺寸均为 1254×1254；标准母版统一为 1024×1024，运行图为 512×512。
- `idle` 为闭嘴友善教学姿态；正式 `talk` 为张嘴讲解与单手示意姿态。两者都保留绿色中国龙、黄色腹部/背鳍、金色鹿角、奶油色眉须、大棕眼、橙色腮红、两颗小牙、粉蓝耳机和空白教学平板。
- 透明母版与运行图均为 RGBA PNG，alpha 范围 0–255，四角 alpha 均为 0；在深棕和浅灰底的 `review-contact-sheet.jpg` 中未见明显洋红残边。
- 512×512 运行图在 170px 桌面头像、86px 横屏头像和 72px 手机头像规格下仍能读出鹿角、耳机、眼睛、平板和口型。
- 课程页继续使用独立 `doudou-teacher` 路径，不会误用故事旁白 `narrator` 素材。

## 拒绝项

- `source/doudou-teacher-talk-front.png` 未采用：全口出现四颗牙，平板边框漂成金色。
- `source/doudou-teacher-talk-front-v2.png` 修正为全口两颗牙和浅蓝平板边框，作为正式 talk 来源。

## 已知限制

- 两个状态由 generations 接口独立生成，没有二进制参考图输入；签名特征一致，但身体盘绕和局部比例并非逐像素相同。
- 接口未返回 seed，无法依靠 seed 精确复现。
- 两个状态由 generations 接口独立生成，没有逐帧插值；当前课程页只做离散的 idle/talk 状态切换，不声称是连续口型动画。

## 运行验证（2026-08-31）

- EP1、EP108 在 1280×800 桌面视口加载成功：运行图自然尺寸 512×512，圆形头像实际约 159×159；每页均正常显示 3 个当前题目选项。
- EP1、EP108 在 390×844 手机视口加载成功：圆形头像为 72×72，无横向溢出；浏览器控制台 0 条 warning/error。
- `python -X utf8 -m pytest prj/tests -q`：155 passed。
- `node --test <全部 *.test.mjs>`：43 passed、0 failed。
- `validate_data.py`：0 个错误、0 个警告；`validate_storybooks.py`：108 storybooks 通过。
- 资产合同复验：manifest 可解析；idle/talk 运行图尺寸、真实 PNG/RGBA、alpha、四角透明和 SHA-256 均匹配。
- Git 媒体边界：`content/` 命中忽略规则，暂存媒体 0。
- 课程交互复验：初始题目为 `idle`，作答反馈切换为 `talk`，点击“下一题”恢复 `idle`；两个状态自然尺寸均为 512×512，控制台 0 条 warning/error。
