# 降妖记 c01 主题地图（Grok Imagine）

风格锁定 ep1 v2：平涂粗线、16:9、实心 JPG、无角色、无烧字。运行时：`content/assets/game-backgrounds/<theme>.jpg`。

| 集 | theme | 采用文件 | 本集参考 | 字幕/地点 |
|---|---|---|---|---|
| 1 | flower-fruit-mountain | ep1/flower-fruit-mountain-v2.jpg | adv_frames f3/f4 | 神石、瀑布 |
| 2 | water-curtain-cave | ep2/water-curtain-cave-v2.jpg | video n001/n020 | 水帘洞 |
| 3 | three-star-cave | ep3.jpg ← three-star-cave-v1 | ep3 f1 | 山林道场 |
| 4 | three-star-cave 布局 / ep4 雪景图 | ep4.jpg ← three-star-snow-v1 | ep4 f1/f3 | 雪中道场 |
| 5 | water-dirty-cave | ep5/water-dirty-cave-v2.jpg | adv_frames f1/f3 | 岩崖妖洞 |
| 6 | dragon-palace | ep6/dragon-palace-v1.jpg | ep6 f2 | 龙宫大殿 |
| 7 | underworld | ep7/underworld-v1.jpg | video n040、f2 | 幽冥宫门 |

已知缺陷：路径与引擎横向可行走带不是像素级对齐。旧 GPT 俯视图备份在 `_qc/*.prev`。

2026-09-09 续：ep2 出生格改到第 3 行中央（region 9），落在亮处石地；`walkTo` 改为满速方向，点击词球可捡。

c02（ep8–13）已出 6 张本集背景并生成关卡 JSON。布局暂复用 dragon-palace 下半场可走带。天兵/佛祖精灵仍用现有 imp / subodhi，未新做四向。

c03（ep14–23）按本集空镜出 10 张 16:9 地图，运行时 `ep14.jpg`–`ep23.jpg`。关卡 JSON 已生成。猪八戒/黑熊/强盗仍复用现有精灵，未新做四向。ep19 寺内挂轴有人像装饰；路径与可行走带仍非像素级对齐。

c04（ep24–31）按本集空镜出 8 张：黄风岭土路、枯树黄岭、流沙河滩、林中空地、五庄观人参果树（活/倒）、油锅大殿。镇元/黄风仍复用菩提/混世魔王精灵。ep29 倒树图里多了一道花果山式瀑布。

c05（ep32–39）按本集空镜出 8 张：白骨岭骷髅山、路边巨石、牢房铁门、宝象国宫殿、龙柱庭院、殿内地板、春日山路、林中草地。白骨/黄袍/金角仍复用混世魔王精灵。ep33 草地上留了一只行囊。

c07（ep49–54）按本集空镜出 6 张：枯谷、火山地、金莲云台、净瓶海、空莲台、黑水河岸。Boss 用红孩儿/观音/龙王。ep54 河岸图里留了标题卡水滴装饰。

c06（ep40–48）按本集空镜出 9 张：平顶山妖洞、南天门云路、洞口红幔、林边石坪、井底、乌鸡国庭院、丹房、龙纹大殿、红云山脊。Boss 用金角/天将/唐僧/镇元/红孩儿。

四向站立（2026-09-09）：bajie / whitebone / yellowwind / shawujing / goldenhorn / blackwind / zhenyuan / whitedragonhorse / tang / hundredflowers 已用 Grok 出东、北向，西向由东向镜像。走路 GIF 仍是单向。沙僧北向斧、唐僧/镇元东向经卷手位有偏差。

角色接入（2026-09-09）：把已有 walk GIF/首帧接到 Boss 与 NPC。bajie / whitebone / yellowwind / zhenyuan / blackwind / goldenhorn / shawujing / whitedragonhorse / tang / heaven-captain。小怪仍用通用兵。这些 walk 资源是单向，攻击暂用站立帧。黄袍怪仍无专属图。

选关完成贴纸：Grok Imagine 按 13 辑各出一张模切贴纸（桃、云殿、白马、人参果、花骷髅、宝葫芦、火、金鲤、金环、芭蕉扇、莲、狮、灵山亭），运行时 `assets/game-stickers/c01.png`–`c13.png`。未完成用灰度。c12 狮头上多了一片桃叶。
