# Decisions

- 本切片只处理 Penguin Adventure（book=3），后续书逐本续接同一 Owner。
- 书籍、页图和同名 MP3 采用 exact-basename 身份；不把 Slime King 配给 Slime Jail。
- 视觉证据优先于 OCR/ASR：speaker 必须来自页内角色位置、气泡尾巴和可见文字；无法确认就停止。
- 句子必须按真实语音边界切分；词级时间是句片段内偏移，不得把绝对时间直接交给播放器。
- 新标注文件使用 `speaking-annotations-book3.json`，Water House 的 `speaking-annotations.json` 仅作 legacy 输入，不覆盖。
- 执行身份锁定为 `opencode-go/deepseek-v4-flash` + `danger-full-access`，写入范围仅限任务卡白名单。
