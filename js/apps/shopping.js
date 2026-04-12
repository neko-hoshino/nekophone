// shopping.js
import { store } from '../store.js';

// 1. 初始化独立的作用域状态
let currentStore = null; // 缓存当前 store 实例，供全局动作调用

// ==========================================
// 🌟 静态热销商品库 (0 Token 消耗！)
// ==========================================
const defaultProducts = {
    '服装': [
        // 女装/女鞋
        { name: 'Lululemon Align 高腰裸感瑜伽裤', price: '750.00', sales: '已售1万+', desc: '发货地: 上海', type: 'shop' },
        { name: '波司登 极寒系列鹅绒中长款羽绒服', price: '1899.00', sales: '已售5000+', desc: '发货地: 常熟', type: 'shop' },
        { name: '优衣库 U系列 女装圆领纯棉短袖T恤', price: '79.00', sales: '已售10万+', desc: '发货地: 上海', type: 'shop' },
        { name: '太平鸟 软糯垂坠感高腰阔腿休闲裤女', price: '259.00', sales: '已售2万+', desc: '发货地: 宁波', type: 'shop' },
        { name: '蕉下 防紫外线冰丝透气防晒衣女款', price: '199.00', sales: '已售5万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '维多利亚的秘密 纯欲冰丝深V吊带睡衣', price: '358.00', sales: '已售8000+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Zara 秋季新款法式复古收腰西装外套', price: '499.00', sales: '已售3000+', desc: '发货地: 昆山', type: 'shop' },
        { name: '乌丫UOOYAA 织锦缎复古刺绣改良马面裙', price: '1299.00', sales: '已售1000+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Charles&Keith 经典粗跟法式小皮鞋', price: '369.00', sales: '已售1万+', desc: '发货地: 东莞', type: 'shop' },
        { name: '鄂尔多斯 100%纯羊绒半高领修身打底衫女', price: '1590.00', sales: '已售4000+', desc: '发货地: 呼和浩特', type: 'shop' },
        // 男装/男鞋
        { name: '始祖鸟 Arc\'teryx Beta LT 防水硬壳冲锋衣', price: '4500.00', sales: '已售2000+', desc: '发货地: 北京', type: 'shop' },
        { name: 'Ralph Lauren 拉夫劳伦经典小马标Polo衫', price: '990.00', sales: '已售3万+', desc: '发货地: 上海', type: 'shop' },
        { name: '罗蒙 免烫抗皱商务长袖白衬衫男', price: '129.00', sales: '已售5万+', desc: '发货地: 宁波', type: 'shop' },
        { name: '优衣库 赤耳原色修身直筒牛仔裤男', price: '299.00', sales: '已售8万+', desc: '发货地: 上海', type: 'shop' },
        { name: '迪卡侬 运动速干冰丝透气短袖T恤男', price: '49.90', sales: '已售20万+', desc: '发货地: 昆山', type: 'shop' },
        { name: '海澜之家 秋季立领商务休闲夹克外套', price: '258.00', sales: '已售1万+', desc: '发货地: 无锡', type: 'shop' },
        { name: 'Champion 冠军经典刺绣Logo连帽卫衣', price: '359.00', sales: '已售4万+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Nike Air Force 1 空军一号纯白板鞋', price: '749.00', sales: '已售10万+', desc: '发货地: 莆田', type: 'shop' },
        { name: '添柏岚 Timberland 经典大黄靴防水男靴', price: '1490.00', sales: '已售1万+', desc: '发货地: 东莞', type: 'shop' },
        { name: '恒源祥 100%纯羊毛V领针织衫商务男装', price: '398.00', sales: '已售3万+', desc: '发货地: 嘉兴', type: 'shop' },
        // 情侣款
        { name: '蕉内 301A半截袖纯棉情侣睡衣套装', price: '198.00', sales: '已售5万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'MLB 经典NY老花满印情侣款羊羔绒外套', price: '1199.00', sales: '已售8000+', desc: '发货地: 上海', type: 'shop' },
    ],
    '饰品': [
        { name: 'Swarovski 施华洛世奇 经典黑天鹅项链', price: '899.00', sales: '已售5万+', desc: '发货地: 上海', type: 'shop' },
        { name: '周大福 传承系列 古法黄金素面手镯', price: '12800.00', sales: '已售1万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'Van Cleef & Arpels 梵克雅宝 红玉髓四叶草项链', price: '13800.00', sales: '已售2000+', desc: '发货地: 北京', type: 'shop' },
        { name: 'DW Daniel Wellington 经典流金表盘女士腕表', price: '1290.00', sales: '已售8万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Casio 卡西欧 G-SHOCK 黑金系列运动男表', price: '990.00', sales: '已售10万+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Armani 阿玛尼 满天星满钻镶嵌女士石英表', price: '2190.00', sales: '已售3万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Pandora 潘多拉 漫漫桃花系列基础手链', price: '698.00', sales: '已售6万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'APM Monaco 经典六芒星镶钻纯银项链', price: '850.00', sales: '已售4万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Ray-Ban 雷朋 飞行员系列偏光太阳眼镜', price: '1180.00', sales: '已售2万+', desc: '发货地: 东莞', type: 'shop' },
        { name: 'Cartier 卡地亚 LOVE系列 18K玫瑰金戒指', price: '9200.00', sales: '已售5000+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Tissot 天梭 力洛克系列 经典自动机械男表', price: '4500.00', sales: '已售1万+', desc: '发货地: 北京', type: 'shop' },
        { name: 'Bvlgari 宝格丽 Divas Dream 扇子贝母项链', price: '16500.00', sales: '已售1000+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Chrome Hearts 克罗心 十字架纯银泰银项链', price: '3500.00', sales: '已售3000+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'Jellycat 邦尼兔 经典毛绒碎花挂件钥匙扣', price: '199.00', sales: '已售8万+', desc: '发货地: 宁波', type: 'shop' }
    ],
    '美妆': [
        { name: 'YSL圣罗兰 细管小金条口红 #1966哑光砖红', price: '380.00', sales: '已售10万+', desc: '发货地: 上海', type: 'shop' },
        { name: '雅诗兰黛 第七代小棕瓶特润修护精华50ml', price: '950.00', sales: '已售8万+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'SK-II 护肤精华露 神仙水230ml 提亮维稳', price: '1590.00', sales: '已售5万+', desc: '发货地: 广州', type: 'shop' },
        { name: '迪奥 Dior 旷野男士淡香水EDT 100ml', price: '990.00', sales: '已售3万+', desc: '发货地: 上海', type: 'shop' },
        { name: '兰蔻 菁纯臻颜焕亮眼霜20ml 淡化细纹', price: '1150.00', sales: '已售4万+', desc: '发货地: 昆山', type: 'shop' },
        { name: '娇韵诗 黄金双萃焕活精华露50ml 紧致抗老', price: '980.00', sales: '已售6万+', desc: '发货地: 杭州', type: 'shop' },
        { name: '阿玛尼 权力无瑕持妆粉底液 控油遮瑕', price: '650.00', sales: '已售5万+', desc: '发货地: 上海', type: 'shop' },
        { name: '资生堂 安热沙小金瓶防晒霜60ml SPF50+', price: '198.00', sales: '已售20万+', desc: '发货地: 宁波', type: 'shop' },
        { name: '纪梵希 明星四宫格散粉 #1慕斯淡粉 定妆', price: '590.00', sales: '已售7万+', desc: '发货地: 广州', type: 'shop' },
        { name: '完美日记 探险家十二色动物眼影盘 锦鲤盘', price: '129.00', sales: '已售30万+', desc: '发货地: 广州', type: 'shop' },
        { name: '植村秀 琥珀臻萃洁颜油450ml 卸妆养肤', price: '890.00', sales: '已售2万+', desc: '发货地: 上海', type: 'shop' },
        { name: '香奈儿 蔚蓝男士香水EDP 100ml 木质香调', price: '1150.00', sales: '已售4万+', desc: '发货地: 北京', type: 'shop' },
        { name: 'MAC魅可 经典子弹头口红 #Ruby Woo', price: '190.00', sales: '已售15万+', desc: '发货地: 杭州', type: 'shop' },
        { name: '赫莲娜 绿宝瓶强韧修护精华PRO 50ml', price: '1680.00', sales: '已售1万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Tom Ford 汤姆福特 乌木沉香香水50ml', price: '2150.00', sales: '已售5000+', desc: '发货地: 广州', type: 'shop' },
        { name: '科颜氏 亚马逊白泥净致面膜125ml 清洁毛孔', price: '340.00', sales: '已售8万+', desc: '发货地: 上海', type: 'shop' },
        { name: '碧欧泉 男士水动力保湿乳液75ml 补水清爽', price: '450.00', sales: '已售3万+', desc: '发货地: 昆山', type: 'shop' },
        { name: '欧舒丹 甜蜜樱花润肤露身体乳250ml', price: '270.00', sales: '已售5万+', desc: '发货地: 杭州', type: 'shop' },
        { name: '祖玛珑 蓝风铃香水30ml 清新花香调', price: '650.00', sales: '已售6万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'NARS 炫色腮红 #Orgasm高潮 细闪提亮', price: '300.00', sales: '已售8万+', desc: '发货地: 广州', type: 'shop' }
    ],
    '箱包': [
        { name: 'Louis Vuitton LV Neverfull经典老花大号托特包', price: '14800.00', sales: '已售1000+', desc: '发货地: 上海', type: 'shop' },
        { name: '新秀丽 Samsonite 20寸铝框登机箱 PC材质', price: '1299.00', sales: '已售2万+', desc: '发货地: 宁波', type: 'shop' },
        { name: 'Coach 蔻驰 City经典标志印花大号托特包', price: '1550.00', sales: '已售3万+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Longchamp 珑骧 经典尼龙折叠水饺包大号', price: '1050.00', sales: '已售5万+', desc: '发货地: 广州', type: 'shop' },
        { name: '小米 极简都市双肩包 男士商务电脑包', price: '149.00', sales: '已售10万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '始祖鸟 Mantis 26L 通勤户外运动双肩背包', price: '1400.00', sales: '已售5000+', desc: '发货地: 北京', type: 'shop' },
        { name: 'Dior 迪奥 老花帆布马鞍包 Saddle Bag', price: '28500.00', sales: '已售500+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Fendi 芬迪 经典双F印花Baguette法棍包', price: '22500.00', sales: '已售800+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Gucci 古驰 Marmont系列小号绗缝链条包', price: '17500.00', sales: '已售2000+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Hermes 爱马仕 Picotin菜篮子18 大象灰', price: '23500.00', sales: '已售300+', desc: '发货地: 北京', type: 'shop' },
        { name: 'TUMI 途明 Alpha系列 弹道尼龙商务双肩包', price: '4500.00', sales: '已售3000+', desc: '发货地: 上海', type: 'shop' },
        { name: '卡西欧 G-SHOCK 黑金系列防水防震运动手表', price: '990.00', sales: '已售4万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'JaneBeauty 简佰格 法式复古高级感腋下包', price: '199.00', sales: '已售8万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'CHARLES&KEITH 小CK 链条半月马鞍包', price: '439.00', sales: '已售3万+', desc: '发货地: 东莞', type: 'shop' },
        { name: '迪卡侬 大容量干湿分离运动健身包 30L', price: '89.90', sales: '已售5万+', desc: '发货地: 昆山', type: 'shop' },
        { name: 'MCM 经典干邑色印花铆钉双肩包 中号', price: '6500.00', sales: '已售2000+', desc: '发货地: 杭州', type: 'shop' },
        { name: 'Givenchy 纪梵希 Antigona 黑色亮面手提包', price: '13500.00', sales: '已售800+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Herschel 赫歇尔 复古纯色双肩帆布书包', price: '528.00', sales: '已售1万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'RIMOWA 日默瓦 Classic 经典铝镁合金登机箱', price: '11500.00', sales: '已售1000+', desc: '发货地: 北京', type: 'shop' },
        { name: 'BVLGARI 宝格丽 Serpenti 珐琅蛇头翻盖包', price: '21000.00', sales: '已售1000+', desc: '发货地: 上海', type: 'shop' }
    ],
    '数码': [
        { name: 'Apple iPhone 15 Pro Max 256GB 原色钛金属', price: '9999.00', sales: '已售20万+', desc: '发货地: 上海', type: 'shop' },
        { name: '华为 Mate 60 Pro 12GB+512GB 雅川青 卫星通话', price: '6999.00', sales: '已售15万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '大疆 DJI Mini 4 Pro 迷你航拍机 长续航套装', price: '5999.00', sales: '已售2万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'Sony 索尼 PlayStation 5 光驱版游戏主机', price: '3599.00', sales: '已售8万+', desc: '发货地: 上海', type: 'shop' },
        { name: '任天堂 Nintendo Switch OLED 日版便携游戏机', price: '2199.00', sales: '已售10万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Apple AirPods Pro 2代 主动降噪无线蓝牙耳机', price: '1899.00', sales: '已售30万+', desc: '发货地: 上海', type: 'shop' },
        { name: '微软 Xbox Series X 1TB 次世代4K游戏主机', price: '3899.00', sales: '已售4万+', desc: '发货地: 北京', type: 'shop' },
        { name: '罗技 G502 LIGHTSPEED 无线游戏鼠标', price: '499.00', sales: '已售10万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'Apple iPad Pro 11英寸 M2芯片 128GB 平板电脑', price: '6799.00', sales: '已售5万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Sony 索尼 WH-1000XM5 头戴式主动降噪耳机', price: '2499.00', sales: '已售2万+', desc: '发货地: 上海', type: 'shop' },
        { name: '极米 Z6X Pro 家用便携智能投影仪 1080P', price: '2699.00', sales: '已售3万+', desc: '发货地: 成都', type: 'shop' },
        { name: '华为 Watch GT4 46mm 曜石黑 智能运动手表', price: '1488.00', sales: '已售6万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '洛斐 小翘68键 蓝牙无线机械键盘 茶轴', price: '459.00', sales: '已售2万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '戴森 Dyson HD15 新一代吹风机 防飞翘顺发风嘴', price: '3199.00', sales: '已售4万+', desc: '发货地: 上海', type: 'shop' },
        { name: 'Kindle Paperwhite 5 电子书阅读器 8GB 墨水屏', price: '1099.00', sales: '已售3万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'Apple Watch Ultra 2 钛金属表壳 户外智能手表', price: '6499.00', sales: '已售1万+', desc: '发货地: 上海', type: 'shop' },
        { name: '雷蛇 黑寡妇蜘蛛V3 绿轴有线机械键盘', price: '599.00', sales: '已售5万+', desc: '发货地: 深圳', type: 'shop' },
        { name: 'B&O Beoplay A1 2代 便携防水蓝牙音箱', price: '1898.00', sales: '已售1万+', desc: '发货地: 北京', type: 'shop' },
        { name: '小米 小米手环8 NFC版 运动心率血氧监测', price: '279.00', sales: '已售50万+', desc: '发货地: 北京', type: 'shop' },
        { name: 'Sony 索尼 Alpha 7 IV (A7M4) 全画幅微单机身', price: '16599.00', sales: '已售5000+', desc: '发货地: 上海', type: 'shop' }
    ],
    '日用': [
        { name: '野兽派 桂花乌龙 室内无火香薰 150ml', price: '269.00', sales: '已售3万+', desc: '发货地: 上海', type: 'shop' },
        { name: '全棉时代 100%纯棉柔巾洗脸巾 6包家庭装', price: '99.00', sales: '已售100万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '戴森 Dyson V12 Detect Slim 轻量无绳吸尘器', price: '3999.00', sales: '已售2万+', desc: '发货地: 上海', type: 'shop' },
        { name: '飞利浦 钻石亮白智能声波电动牙刷 HX9996', price: '1899.00', sales: '已售1万+', desc: '发货地: 珠海', type: 'shop' },
        { name: '水星家纺 100%长绒棉 纯色全棉四件套 1.8m床', price: '499.00', sales: '已售8万+', desc: '发货地: 南通', type: 'shop' },
        { name: '舒洁 Kleenex 羊绒感四层抽纸 20包整箱', price: '69.90', sales: '已售50万+', desc: '发货地: 南京', type: 'shop' },
        { name: '狮王 LION 酵素美白牙膏 薄荷味 130g*3支', price: '45.00', sales: '已售30万+', desc: '发货地: 广州', type: 'shop' },
        { name: '汰渍 护色防串色 全效除菌洗衣凝珠 50颗装', price: '89.90', sales: '已售40万+', desc: '发货地: 天津', type: 'shop' },
        { name: '维达 立体美4层压花卷纸 提帕装', price: '59.90', sales: '已售200万+', desc: '发货地: 江门', type: 'shop' },
        { name: '象印 ZOJIRUSHI 304不锈钢保温杯 480ml 一键开合', price: '189.00', sales: '已售10万+', desc: '发货地: 广州', type: 'shop' },
        { name: 'MUJI无印良品 超声波大容量香薰机 加湿器', price: '390.00', sales: '已售5万+', desc: '发货地: 上海', type: 'shop' },
        { name: '花王 蒸汽眼罩 缓解眼部疲劳 薰衣草香型12片', price: '59.00', sales: '已售100万+', desc: '发货地: 杭州', type: 'shop' },
        { name: '滴露 Dettol 松木衣物除菌液 1.5L*2瓶装', price: '129.90', sales: '已售80万+', desc: '发货地: 广州', type: 'shop' },
        { name: '小米 米家智能护眼台灯1S 减蓝光支持HomeKit', price: '169.00', sales: '已售30万+', desc: '发货地: 深圳', type: 'shop' },
        { name: '蓝月亮 深层洁净护理洗衣液 薰衣草香 3kg装', price: '49.90', sales: '已售150万+', desc: '发货地: 广州', type: 'shop' },
        { name: '护舒宝 极护液体卫生巾 日夜组合装 7盒装', price: '119.00', sales: '已售60万+', desc: '发货地: 天津', type: 'shop' },
        { name: '宝莹 Persil 全效深层清洁除菌洗衣液 2.7L', price: '89.00', sales: '已售10万+', desc: '发货地: 宁波', type: 'shop' },
        { name: '洁柔 Face黑Face 4层加厚大规格抽纸 16包', price: '65.90', sales: '已售100万+', desc: '发货地: 中山', type: 'shop' },
        { name: '小林制药 卫生间下水道除臭管道疏通丸', price: '35.00', sales: '已售8万+', desc: '发货地: 杭州', type: 'shop' },
        { name: '大卫 拖把桶 旋转免手洗家用拖地神器', price: '128.00', sales: '已售20万+', desc: '发货地: 金华', type: 'shop' }
    ],
    '情趣': [
        { name: '大人糖 逗豆鸟女性C点唤醒震动玩具', price: '359.00', sales: '已售20万+', desc: '发货地: 深圳 | 极速保密发货', type: 'shop' },
        { name: '网易春风 TryFun 女用小鸟内外双重刺激玩具', price: '299.00', sales: '已售15万+', desc: '发货地: 杭州 | 极速保密发货', type: 'shop' },
        { name: '杜蕾斯 AiR 空气套 隐薄超薄避孕套 16只装', price: '129.90', sales: '已售300万+', desc: '发货地: 青岛 | 极速保密发货', type: 'shop' },
        { name: '冈本 001 至尊极薄 聚氨酯避孕套 3只装', price: '99.00', sales: '已售100万+', desc: '发货地: 广州 | 极速保密发货', type: 'shop' },
        { name: '雷霆暴风 男用全自动电动旋转飞机杯 极乐之门', price: '399.00', sales: '已售8万+', desc: '发货地: 广州 | 极速保密发货', type: 'shop' },
        { name: '杰士派 激爽延时喷剂 男士外用持久液 15ml', price: '118.00', sales: '已售30万+', desc: '发货地: 上海 | 极速保密发货', type: 'shop' },
        { name: '谜姬 狐狸尾巴金属后庭塞 角色扮演金属肛塞', price: '69.00', sales: '已售10万+', desc: '发货地: 东莞 | 极速保密发货', type: 'shop' },
        { name: '对子哈特 R20 二代榨汁机 男用名器硅胶倒模', price: '188.00', sales: '已售20万+', desc: '发货地: 上海 | 极速保密发货', type: 'shop' },
        { name: '醉清风 性感蕾丝透明吊带睡裙 情趣内衣诱惑装', price: '89.00', sales: '已售15万+', desc: '发货地: 连云港 | 极速保密发货', type: 'shop' },
        { name: '维多利亚的秘密 极度诱惑深V绑带半透文胸套装', price: '458.00', sales: '已售3万+', desc: '发货地: 杭州 | 极速保密发货', type: 'shop' },
        { name: 'LEA乐爱 薰衣草全身润滑按摩精油 延缓免洗', price: '59.00', sales: '已售8万+', desc: '发货地: 广州 | 极速保密发货', type: 'shop' },
        { name: '杜蕾斯 Ky 水溶性人体润滑液 玻尿酸保湿 100ml', price: '69.90', sales: '已售100万+', desc: '发货地: 青岛 | 极速保密发货', type: 'shop' },
        { name: '司米亚 食用级水溶性润滑剂 水蜜桃果味 200ml', price: '45.00', sales: '已售10万+', desc: '发货地: 深圳 | 极速保密发货', type: 'shop' },
        { name: '霏慕 性感女仆装制服诱惑 露背透视围裙套装', price: '68.00', sales: '已售12万+', desc: '发货地: 连云港 | 极速保密发货', type: 'shop' },
        { name: '花花公子 情侣款高级冰丝薄款性感睡袍浴袍', price: '139.00', sales: '已售5万+', desc: '发货地: 嘉兴 | 极速保密发货', type: 'shop' },
        { name: '根沐 男用负压拉伸物理锻炼器 增大延时器', price: '258.00', sales: '已售6万+', desc: '发货地: 深圳 | 极速保密发货', type: 'shop' },
        { name: '斯帕克 Spank 字母圈高级皮革软拍打器 SM鞭子', price: '75.00', sales: '已售3万+', desc: '发货地: 东莞 | 极速保密发货', type: 'shop' },
        { name: 'YUU 男用仿真通道软胶倒模 虚拟偶像联动款', price: '349.00', sales: '已售4万+', desc: '发货地: 上海 | 极速保密发货', type: 'shop' },
        { name: '欲之鸟 调情羽毛逗猫棒 敏感点撩拨逗弄棒', price: '35.00', sales: '已售8万+', desc: '发货地: 广州 | 极速保密发货', type: 'shop' },
        { name: '夜火 极度诱惑开裆免脱连体网衣 黑色紧身衣', price: '45.00', sales: '已售20万+', desc: '发货地: 义乌 | 极速保密发货', type: 'shop' }
    ]
};
// ==========================================
// 🍔 静态同城外卖/本地生活库 (0 Token 消耗！)
// ==========================================
const defaultFoodStores = {
    '美食': [
        {
            storeName: '海底捞火锅', desc: '品牌火锅 极速送达', rating: '4.9', sales: '月售5000+',
            items: [
                { name: '招牌虾滑(整份)', price: '68.00' }, { name: '捞派毛肚(半份)', price: '42.00' },
                { name: '捞派生鸭血', price: '28.00' }, { name: '精品肥牛(整份)', price: '72.00' },
                { name: '无刺巴沙鱼片', price: '48.00' }, { name: '海底捞扯面', price: '12.00' },
                { name: '番茄火锅底料', price: '25.00' }, { name: '小酥肉(现炸)', price: '38.00' },
                { name: '红糖糍粑', price: '26.00' }, { name: '自选小料套餐', price: '10.00' }
            ]
        },
        {
            storeName: '麦当劳', desc: '西式快餐 汉堡薯条', rating: '4.8', sales: '月售2万+',
            items: [
                { name: '麦辣鸡腿堡套餐(含中薯+中可)', price: '32.00' }, { name: '板烧鸡腿堡', price: '22.00' },
                { name: '巨无霸汉堡', price: '25.00' }, { name: '麦乐鸡块(5块)', price: '14.00' },
                { name: '那么大鸡排', price: '15.00' }, { name: '麦脆鸡(原味/香辣)', price: '16.00' },
                { name: '大份薯条', price: '16.00' }, { name: '奥利奥麦旋风', price: '15.50' },
                { name: '香芋派', price: '9.00' }, { name: '冰雪碧(大杯)', price: '11.00' }
            ]
        },
        {
            storeName: '费大厨', desc: '全国连锁 正宗湘菜', rating: '4.9', sales: '月售8000+',
            items: [
                { name: '招牌辣椒炒肉(送土猪肉汤)', price: '68.00' }, { name: '香煎大鲫鱼', price: '58.00' },
                { name: '皮蛋青椒擂茄子', price: '28.00' }, { name: '小炒黄牛肉', price: '78.00' },
                { name: '干锅肥肠', price: '68.00' }, { name: '清炒土豆丝', price: '18.00' },
                { name: '蒜蓉粉丝蒸虾', price: '88.00' }, { name: '费大厨特色大米饭', price: '3.00' },
                { name: '冰镇酸梅汤(扎)', price: '22.00' }, { name: '大盆花菜', price: '32.00' }
            ]
        },
        {
            storeName: '村上一屋', desc: '精致日料 鲜活刺身', rating: '4.8', sales: '月售4000+',
            items: [
                { name: '芒果鳗鱼加州卷(8粒)', price: '48.00' }, { name: '三文鱼刺身(厚切5片)', price: '58.00' },
                { name: '招牌蒲烧鳗鱼饭', price: '68.00' }, { name: '地狱豚骨拉面', price: '38.00' },
                { name: '芝士厚蛋烧', price: '22.00' }, { name: '火炙三文鱼握寿司(2贯)', price: '18.00' },
                { name: '日式炸猪排', price: '32.00' }, { name: '芥末章鱼', price: '15.00' },
                { name: '大福(抹茶/草莓)', price: '16.00' }, { name: '可尔必思', price: '12.00' }
            ]
        },
        {
            storeName: '蓝蛙 bluefrog', desc: '经典汉堡 臻选牛排', rating: '4.9', sales: '月售3000+',
            items: [
                { name: '经典美式芝士牛肉汉堡', price: '78.00' }, { name: '黑松露风味蘑菇汉堡', price: '88.00' },
                { name: '澳洲肉眼牛排(250g)', price: '198.00' }, { name: '香烤三文鱼配奶油意面', price: '88.00' },
                { name: '经典凯撒沙拉(配烤鸡肉)', price: '58.00' }, { name: '黑松露粗薯条', price: '38.00' },
                { name: '碳烤BBQ猪肋排(半份)', price: '128.00' }, { name: '奶油蘑菇汤', price: '32.00' },
                { name: '纽约芝士蛋糕', price: '42.00' }, { name: '鲜榨橙汁', price: '28.00' }
            ]
        },
        {
            storeName: '点都德', desc: '非遗点心 匠心传承', rating: '4.9', sales: '月售1万+',
            items: [
                { name: '金牌虾饺皇(1笼4只)', price: '32.00' }, { name: '金沙海虾红米肠', price: '38.00' },
                { name: '百合酱蒸凤爪', price: '28.00' }, { name: '蜜汁叉烧包(3只)', price: '22.00' },
                { name: '荔湾明火艇仔粥', price: '26.00' }, { name: '香芒夹心椰汁糕', price: '22.00' },
                { name: '沙爹蒸金钱肚', price: '30.00' }, { name: '豉油皇炒面', price: '28.00' },
                { name: '明虾蟹子烧卖', price: '28.00' }, { name: '传统陈皮牛肉丸', price: '26.00' }
            ]
        }
    ],
    '饮品': [
        {
            storeName: '霸王茶姬 (现泡原叶)', desc: '原叶鲜奶茶 伯牙绝弦', rating: '4.9', sales: '月售3万+',
            items: [
                { name: '伯牙绝弦(大杯/去冰/少糖)', price: '20.00' }, { name: '寻香山茶(中杯/热)', price: '18.00' },
                { name: '桂馥兰香(大杯)', price: '22.00' }, { name: '青青糯山(中杯)', price: '18.00' },
                { name: '花田乌龙(大杯)', price: '20.00' }, { name: '春日桃桃(大杯雪顶)', price: '26.00' },
                { name: '万里木兰(大杯)', price: '22.00' }, { name: '夏梦玫珑(大杯/冰沙)', price: '24.00' },
                { name: '霸王原叶茶包礼盒', price: '58.00' }, { name: '定制保温袋+冰袋', price: '2.00' }
            ]
        },
        {
            storeName: '喜茶 HEYTEA', desc: '灵感之茶 芝士果茶', rating: '4.8', sales: '月售2万+',
            items: [
                { name: '多肉葡萄(大杯/少冰)', price: '28.00' }, { name: '芝芝芒芒(大杯)', price: '29.00' },
                { name: '烤黑糖波波牛乳', price: '19.00' }, { name: '轻芒芒甘露', price: '18.00' },
                { name: '绿妍轻乳茶', price: '15.00' }, { name: '芝芝莓莓(大杯)', price: '29.00' },
                { name: '多肉青提(大杯)', price: '28.00' }, { name: '生打椰椰冻', price: '22.00' },
                { name: '喜茶无糖气泡水(瓶装)', price: '6.00' }, { name: '芒芒冰淇淋', price: '15.00' }
            ]
        },
        {
            storeName: '瑞幸咖啡 luckin coffee', desc: '专业咖啡 现磨拿铁', rating: '4.8', sales: '月售5万+',
            items: [
                { name: '生椰拿铁(大杯/冰)', price: '18.00' }, { name: '酱香拿铁(大杯)', price: '19.00' },
                { name: '陨石拿铁(大杯)', price: '18.00' }, { name: '厚乳拿铁(大杯/热)', price: '18.00' },
                { name: '标准美式(大杯/冰)', price: '13.00' }, { name: '丝绒拿铁(大杯)', price: '18.00' },
                { name: '柚C美式(大杯)', price: '16.00' }, { name: '抹茶瑞纳冰', price: '21.00' },
                { name: '提拉米苏大福', price: '12.00' }, { name: '火腿芝士牛角包', price: '15.00' }
            ]
        }
    ],
    '烧烤': [
        {
            storeName: '木屋烧烤 (直营连锁)', desc: '正宗中式烧烤 聚会首选', rating: '4.8', sales: '月售9000+',
            items: [
                { name: '招牌烤羔羊肉串(10串)', price: '38.00' }, { name: '烤蜜汁鸡翅(2串)', price: '16.00' },
                { name: '香辣烤猪蹄(半个)', price: '18.00' }, { name: '烤原汁生蚝(半打)', price: '48.00' },
                { name: '碳烤大茄子(加蒜蓉)', price: '15.00' }, { name: '烤韭菜(份)', price: '12.00' },
                { name: '烤鲜鱿鱼(大串)', price: '22.00' }, { name: '木屋特制炒米粉', price: '25.00' },
                { name: '香烤五花肉(5串)', price: '25.00' }, { name: '冰镇青岛原浆(扎)', price: '28.00' }
            ]
        },
        {
            storeName: '秋田烧鸟居酒屋 (Yakitori)', desc: '日式炭火烧鸟 宵夜微醺', rating: '4.9', sales: '月售2000+',
            items: [
                { name: '酱烤京葱鸡腿肉(2本)', price: '22.00' }, { name: '盐烤黑猪五花肉(2本)', price: '24.00' },
                { name: '提灯(限量1本)', price: '18.00' }, { name: '明太子烤西葫芦(2本)', price: '16.00' },
                { name: '炭烤鸡皮(2本)', price: '12.00' }, { name: '紫苏梅子鸡胸肉(2本)', price: '22.00' },
                { name: '汁烧脆骨香菇鸡肉丸(1本)', price: '15.00' }, { name: '厚切牛舌串(1本)', price: '28.00' },
                { name: '日式烤饭团', price: '18.00' }, { name: '朝日生啤(大杯)', price: '25.00' }
            ]
        },
        {
            storeName: 'Firestone 美式德州烤肉', desc: '果木慢烤 纯正德州风味', rating: '4.8', sales: '月售1500+',
            items: [
                { name: '德州慢烤牛胸肉 Brisket(150g)', price: '98.00' }, { name: '苹果木烟熏猪肋排(半扇)', price: '128.00' },
                { name: '手撕猪肉汉堡 Pulled Pork', price: '58.00' }, { name: '美式秘制烤香肠(2根)', price: '48.00' },
                { name: '德州烤肉经典拼盘(单人份)', price: '168.00' }, { name: '经典芝士通心粉 Mac&Cheese', price: '38.00' },
                { name: '南方卷心菜沙拉 Coleslaw', price: '22.00' }, { name: '脆皮粗炸薯条', price: '25.00' },
                { name: '黄油烤玉米棒', price: '18.00' }, { name: '精酿 IPA 啤酒(听装)', price: '35.00' }
            ]
        }
    ],
    '甜点': [
        {
            storeName: '鲍师傅糕点', desc: '网红肉松小贝', rating: '4.9', sales: '月售1万+',
            items: [
                { name: '海苔风味肉松小贝(4个)', price: '32.00' }, { name: '蟹黄风味肉松小贝(4个)', price: '35.00' },
                { name: '柠檬酸奶小贝(4个)', price: '30.00' }, { name: '爆浆巧克力泡芙(盒装)', price: '25.00' },
                { name: '原味手工蛋挞(4个)', price: '20.00' }, { name: '无糖全麦吐司', price: '18.00' },
                { name: '盘挞(原味/抹茶2个)', price: '24.00' }, { name: '黑芝麻薄脆', price: '15.00' },
                { name: '雪媚娘(芒果/榴莲组合)', price: '28.00' }, { name: '法式流心绿豆糕(盒)', price: '38.00' }
            ]
        },
        {
            storeName: '好利来 Holiland', desc: '半熟芝士 冰山熔岩', rating: '4.8', sales: '月售8000+',
            items: [
                { name: '半熟芝士(原味5枚装)', price: '39.00' }, { name: '冰山熔岩巧克力蛋糕', price: '42.00' },
                { name: '蜂蜜蛋糕(整条)', price: '35.00' }, { name: '北海道双层芝士蛋糕', price: '78.00' },
                { name: '玫瑰鲜花饼(盒装)', price: '45.00' }, { name: '海盐黄油牛角包', price: '18.00' },
                { name: '奥利奥半熟芝士(5枚)', price: '42.00' }, { name: '牛乳吐司面包', price: '22.00' },
                { name: '水果奶油切件', price: '28.00' }, { name: '生日蛋糕(6寸预定)', price: '198.00' }
            ]
        }
    ],
    '药品': [
        {
            storeName: '美团买药直营店', desc: '极速送药 24小时', rating: '5.0', sales: '月售5万+',
            items: [
                { name: '布洛芬缓释胶囊(芬必得)', price: '28.50' }, { name: '999感冒灵颗粒(10袋)', price: '18.00' },
                { name: '连花清瘟胶囊(36粒)', price: '29.80' }, { name: '蒙脱石散(思密达)', price: '35.00' },
                { name: '健胃消食片(江中)', price: '15.50' }, { name: '氯雷他定片(开瑞坦)抗过敏', price: '45.00' },
                { name: '创可贴(云南白药100片)', price: '22.00' }, { name: '红霉素软膏(10g)', price: '8.50' },
                { name: '达喜铝碳酸镁咀嚼片(胃药)', price: '38.00' }, { name: '医疗级体温计', price: '12.00' }
            ]
        },
        {
            storeName: '叮当快药大药房', desc: '医保可用 专业药师', rating: '4.8', sales: '月售3万+',
            items: [
                { name: '左炔诺孕酮片(紧急避孕药)', price: '65.00' }, { name: '短效避孕药(优思明)', price: '138.00' },
                { name: '早孕试纸/验孕棒(可丽蓝)', price: '39.00' }, { name: '维生素C泡腾片(力度伸)', price: '48.00' },
                { name: '人工泪液滴眼液(海露)', price: '78.00' }, { name: '双氯芬酸二乙胺乳胶剂(扶他林)', price: '36.00' },
                { name: '口腔溃疡散(同仁堂)', price: '18.00' }, { name: '阿莫西林胶囊(抗生素需处方)', price: '25.00' },
                { name: '医用外科口罩(50只)', price: '19.90' }, { name: '生理盐水(洗鼻用)', price: '15.00' }
            ]
        }
    ]
};

if (!window.shoppingState) {
    window.shoppingState = {
        tab: 'home',         
        homeTab: 'shop',     
        homeCategory: '服装', 
        foodCategory: '美食',      
        activeFoodStore: null,     
        showFoodCartDetail: false, 
        searchQuery: '',
        searchResults: null,
        isSearching: false,
        isFetchingMenu: false,
        customLocation: '',
        showSharePopup: false,
        showCheckoutPopup: false,
        checkoutStep: 1,
        checkoutData: {}
    };
}

// 2. 初始化全局动作 (挂载到 window 供 onclick 调用)
if (!window.shoppingActions) {
    window.shoppingActions = {
        manualAddToCart: () => {
            window.shoppingState.customItemData = { name: '', price: '', desc: '' };
            window.shoppingState.showAddCustomItemPopup = true;
            if (window.render) window.render();
        },
        closeAddCustomItemPopup: () => {
            window.shoppingState.showAddCustomItemPopup = false;
            if (window.render) window.render();
        },
        updateCustomItemField: (field, value) => {
            if (!window.shoppingState.customItemData) window.shoppingState.customItemData = {};
            window.shoppingState.customItemData[field] = value;
        },
        confirmAddCustomItem: () => {
            const data = window.shoppingState.customItemData || {};
            const name = (data.name || '').trim();
            const priceVal = parseFloat(data.price);
            
            if (!name) return window.actions?.showToast('请输入商品名称哦');
            if (isNaN(priceVal) || priceVal < 0) return window.actions?.showToast('请输入有效的价格 (纯数字)');

            const item = { 
                name: name, 
                price: priceVal.toFixed(2), 
                desc: (data.desc || '').trim() || '自定义添加', 
                type: 'shop', 
                selected: true, 
                qty: 1 
            };
            
            if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
            currentStore.shoppingData.cart.unshift(item); 
            
            window.shoppingState.showAddCustomItemPopup = false; 
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.render) window.render();
            if (window.actions?.showToast) window.actions.showToast('✅ 已手动加入购物车');
        },

        clearSearch: () => {
            window.shoppingState.searchResults = null;
            window.shoppingState.searchQuery = '';
            window.shoppingState.isSearching = false;
            if (window.render) window.render();
        },
        switchFoodCategory: (cat) => {
            window.shoppingState.foodCategory = cat;
            window.shoppingState.activeFoodStore = null;
            if (window.render) window.render();
        },
        openFoodStore: (cat, storeIndex) => {
            window.shoppingState.activeFoodStore = { cat, storeIndex };
            if (window.render) window.render();
        },
        closeFoodStore: () => {
            window.shoppingState.activeFoodStore = null;
            if (window.render) window.render();
        },
        
        updateFoodQty: (itemStr, delta) => {
            const item = JSON.parse(decodeURIComponent(itemStr));
            if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
            const cart = currentStore.shoppingData.cart;
            
            const existingIdx = cart.findIndex(i => i.name === item.name && i.desc === item.desc && i.type === 'food');
            if (existingIdx >= 0) {
                cart[existingIdx].qty = (cart[existingIdx].qty || 1) + delta;
                if (cart[existingIdx].qty <= 0) cart.splice(existingIdx, 1); 
            } else if (delta > 0) {
                item.qty = 1;
                item.selected = true; 
                cart.push(item);
            }
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.render) window.render();
        },
        toggleFoodCartDetail: () => {
            window.shoppingState.showFoodCartDetail = !window.shoppingState.showFoodCartDetail;
            if (window.render) window.render();
        },
        clearFoodCart: (storeName) => {
            if (confirm('确定要清空已选的菜品吗？')) {
                currentStore.shoppingData.cart = currentStore.shoppingData.cart.filter(i => !(i.type === 'food' && i.desc === storeName));
                window.shoppingState.showFoodCartDetail = false;
                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.render) window.render();
            }
        },
        checkoutFoodStore: (storeName) => {
            currentStore.shoppingData.cart.forEach(i => {
                i.selected = (i.type === 'food' && i.desc === storeName);
            });
            window.shoppingState.showFoodCartDetail = false;
            window.shoppingActions.openCheckoutPopup();
        },
        switchTab: (tab) => { 
            window.shoppingState.tab = tab; 
            if (window.render) window.render(); 
        },
        switchHomeTab: (tab) => { 
            window.shoppingState.homeTab = tab; 
            window.shoppingState.searchResults = null; 
            window.shoppingState.searchQuery = '';
            if (window.render) window.render(); 
        },
        updateSearch: (val) => { 
            window.shoppingState.searchQuery = val; 
        },
        setLocation: () => {
            const loc = prompt("请输入你要定位的城市/区域（如：上海市陆家嘴）：", currentStore.shoppingData?.customLocation || window.shoppingState.customLocation || '');
            if (loc !== null) {
                window.shoppingState.customLocation = loc.trim();
                if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
                currentStore.shoppingData.customLocation = loc.trim(); 
                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.render) window.render();
                if (window.actions?.showToast) window.actions.showToast('✅ 定位已更新');
            }
        },

        searchItems: async () => {
            const state = window.shoppingState;
            if (!state.searchQuery.trim()) return;
            state.isSearching = true;
            state.searchResults = null; 
            if (window.render) window.render();

            try {
                const apiKey = currentStore.apiConfig.apiKey;
                const baseUrl = currentStore.apiConfig.baseUrl.replace(/\/+$/, '');
                const model = currentStore.apiConfig.model;
                
                if (state.homeTab === 'food') {
                    const loc = currentStore.shoppingData?.customLocation || window.shoppingState.customLocation || '当前位置';
                    const promptStr = `用户在“${loc}”搜索外卖：“${state.searchQuery}”。请生成3到5家相关的本地外卖店铺。
返回严格的JSON数组格式：[{"storeName": "店名(不要有特殊符号)", "desc": "一句话描述(如: 品牌火锅 极速送达)", "rating": "4.8", "sales": "月售1000+"}]。绝不输出其他文字！`;
                    
                    const res = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: promptStr }], temperature: 0.5 })
                    });
                    const data = await res.json();
                    const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                    
                    let parsed = JSON.parse(reply);
                    if (!Array.isArray(parsed)) parsed = [];
                    state.searchResults = parsed.map(s => ({ ...s, isDynamic: true }));
                    
                } else {
                    const promptStr = `用户搜索淘宝商品：“${state.searchQuery}”。请生成6个相关商品。
返回严格的JSON数组：[{"name": "商品标题(尽量详细)", "price": "价格(纯数字)", "sales": "月售100+", "desc": "发货地"}]。绝不输出其他文字！`;
                    const res = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                        body: JSON.stringify({ model: model, messages: [{ role: 'user', content: promptStr }], temperature: 0.5 })
                    });
                    const data = await res.json();
                    const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                    
                    let parsed = JSON.parse(reply);
                    state.searchResults = Array.isArray(parsed) ? parsed : [];
                }
            } catch (e) {
                if (window.actions?.showToast) window.actions.showToast('搜索失败，请重试');
            } finally {
                state.isSearching = false;
                if (window.render) window.render();
            }
        },

        openSearchedFoodStore: async (storeStr) => {
            const storeObj = JSON.parse(decodeURIComponent(storeStr));
            const state = window.shoppingState;
            
            state.activeFoodStore = { isDynamic: true, storeName: storeObj.storeName, desc: storeObj.desc, sales: storeObj.sales, items: [] };
            state.isFetchingMenu = true;
            if (window.render) window.render();

            try {
                const promptStr = `你是一家名为“${storeObj.storeName}”的外卖店(${storeObj.desc})。请生成10个你店里的招牌菜品/主食/饮品。
返回严格的JSON数组格式：[{"name": "菜品名称(不带店名)", "price": "价格(纯数字，如28.50)"}]。绝不输出其他文字！`;
                
                const res = await fetch(`${currentStore.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentStore.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: currentStore.apiConfig.model, messages: [{ role: 'user', content: promptStr }], temperature: 0.5 })
                });
                const data = await res.json();
                const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                
                let parsed = JSON.parse(reply);
                state.activeFoodStore.items = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                if (window.actions?.showToast) window.actions.showToast('菜单获取失败');
                state.activeFoodStore = null; 
            } finally {
                state.isFetchingMenu = false;
                if (window.render) window.render();
            }
        },

        toggleCartItem: (index) => {
            const cart = currentStore.shoppingData.cart;
            if (cart[index]) {
                cart[index].selected = !cart[index].selected;
                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.render) window.render();
            }
        },
        toggleSelectAll: () => {
            const cart = currentStore.shoppingData.cart;
            const allSelected = cart.every(i => i.selected);
            cart.forEach(i => i.selected = !allSelected);
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.render) window.render();
        },
        deleteSelected: () => {
            const cart = currentStore.shoppingData.cart;
            const selectedCount = cart.filter(i => i.selected).length;
            if (selectedCount === 0) return window.actions?.showToast('请先勾选要删除的商品');
            
            if (confirm(`确定要删除选中的 ${selectedCount} 件商品吗？`)) {
                currentStore.shoppingData.cart = cart.filter(i => !i.selected);
                if (window.actions?.saveStore) window.actions.saveStore();
                if (window.render) window.render();
                if (window.actions?.showToast) window.actions.showToast('✅ 删除成功');
            }
        },
        deleteOrder: (orderNum) => {
            if (!confirm('确定要删除这条订单记录吗？删除后将不再有物流提醒哦。')) return;
            const orders = currentStore.shoppingData.orders || [];
            currentStore.shoppingData.orders = orders.filter(o => o.orderNum !== orderNum);
            
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.render) window.render();
            if (window.actions?.showToast) window.actions.showToast('✅ 订单已删除');
        },

        openSharePopup: () => {
            const selectedItems = currentStore.shoppingData?.cart?.filter(i => i.selected) || [];
            if (selectedItems.length === 0) return window.actions?.showToast('请先勾选要转发的心愿商品哦！');
            window.shoppingState.showSharePopup = true;
            if (window.render) window.render();
        },
        closeSharePopup: () => {
            window.shoppingState.showSharePopup = false;
            if (window.render) window.render();
        },
        executeShareCart: (charId) => {
            const items = currentStore.shoppingData.cart.filter(i => i.selected);
            if (items.length === 0) return;

            const totalPrice = items.reduce((a,b)=>a+(parseFloat(b.price)||0)*(b.qty||1), 0).toFixed(2);
            const itemNames = items.map(i => i.name).join('、');

            const chat = currentStore.chats.find(c => c.charId === charId);
            const char = currentStore.contacts.find(c => c.id === charId);
            
            const boundPersona = currentStore.personas.find(p => String(p.id) === String(char?.boundPersonaId)) || currentStore.personas.find(p => p.isCurrent) || currentStore.personas[0];
            const userName = boundPersona.name;

            if (chat && char) {
                const cartCardHtml = `
                <div style="width: 240px; background: #fff; border-radius: 12px; border: 1px solid #f0f0f0; overflow: hidden; font-family: sans-serif; text-align: left;">
                    <div style="padding: 12px; background: #FFF5F0; border-bottom: 1px solid #FFE4D6;">
                        <div style="font-size: 13px; color: #FF4E00; font-weight: bold; display: flex; align-items: center;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                            ${userName} 的淘宝购物车
                        </div>
                    </div>
                    <div style="padding: 12px;">
                        <div style="font-size: 14px; color: #333; margin-bottom: 8px; line-height: 1.4;">共 ${items.length} 件心愿商品<br>总计: <span style="color:#FF4E00; font-weight:bold; font-size: 16px;">¥${totalPrice}</span></div>
                        <div style="font-size: 11px; color: #999; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">包含：${itemNames}</div>
                    </div>
                </div>`;

                chat.messages.push({ id: Date.now(), sender: userName, text: cartCardHtml, isMe: true, msgType: 'html_card', time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}), timestamp: Date.now() });

                if (window.actions?.saveStore) window.actions.saveStore();
                window.shoppingState.showSharePopup = false; 
                if (window.actions?.showToast) window.actions.showToast(`✅ 成功转发给 ${char.name}！`);
                if (typeof window.wxActions?.openChat === 'function') {
                    window.actions.setCurrentApp('wechat');
                    setTimeout(() => window.wxActions.openChat(char.id), 100);
                }
            }
        },

        openCheckoutPopup: () => {
            const selectedItems = currentStore.shoppingData?.cart?.filter(i => i.selected) || [];
            if (selectedItems.length === 0) return window.actions?.showToast('请先勾选要结算的商品哦');
            window.shoppingState.showCheckoutPopup = true;
            window.shoppingState.checkoutStep = 1;
            window.shoppingState.checkoutData = { buyFor: null, buyForCharId: null, payMethod: null, payCharId: null, shareCharId: null };
            if (window.render) window.render();
        },
        closeCheckoutPopup: () => {
            window.shoppingState.showCheckoutPopup = false;
            if (window.render) window.render();
        },
        setCheckoutBuyFor: (type) => {
            window.shoppingState.checkoutData.buyFor = type;
            if (type === 'self') window.shoppingState.checkoutStep = 2; 
            if (window.render) window.render();
        },
        setCheckoutBuyForChar: (charId) => {
            window.shoppingState.checkoutData.buyForCharId = charId;
            window.shoppingState.checkoutData.payMethod = 'balance'; 
            window.shoppingActions.executeCheckout(); 
        },
        setCheckoutPayMethod: (type) => {
            const state = window.shoppingState;
            state.checkoutData.payMethod = type;
            if (type === 'balance') state.checkoutStep = 3; 
            if (window.render) window.render();
        },
        setCheckoutPayChar: (charId) => {
            const state = window.shoppingState;
            state.checkoutData.payCharId = charId;
            window.shoppingActions.executeCheckout(); 
        },
        setCheckoutShareChar: (charId) => {
            window.shoppingState.checkoutData.shareCharId = charId;
            window.shoppingActions.executeCheckout();
        },

        // 🚀 终极斩杀：执行多步结算逻辑 (修复 AI 幻觉脑补问题！)
        executeCheckout: () => {
            const state = window.shoppingState;
            const data = state.checkoutData;
            const cart = currentStore.shoppingData.cart;
            const itemsToBuy = cart.filter(i => i.selected);
            if (itemsToBuy.length === 0) return;

            const total = itemsToBuy.reduce((a,b)=>a+(parseFloat(b.price)||0)* (b.qty||1), 0);
            const isUnpaid = data.payMethod === 'ta'; 
            const isFoodOrder = itemsToBuy[0].type === 'food';

            let customNote = '无';
            if (isFoodOrder) {
                const noteInput = prompt("请输入外卖订单备注（选填，留空则默认为无）：");
                if (noteInput === null) return; 
                customNote = noteInput.trim() !== '' ? noteInput.trim() : '无';
            }

            if (!isUnpaid) {
                if ((currentStore.wallet?.balance || 0) < total) {
                    return window.actions?.showToast('余额不足，请充值或选择代付！');
                }
                currentStore.wallet.balance -= total;
                currentStore.wallet.transactions.push({ type: 'out', amount: total, title: isFoodOrder ? '外卖订单' : '淘宝购物', date: new Date().toISOString() });
            }

            let targetChar = null; 
            if (data.buyFor === 'ta') {
                targetChar = currentStore.contacts.find(c => c.id === data.buyForCharId);
            } else {
                if (data.shareCharId) targetChar = currentStore.contacts.find(c => c.id === data.shareCharId);
            }
            
            const payChar = currentStore.contacts.find(c => c.id === data.payCharId);

            const referenceChar = targetChar || payChar || currentStore.contacts[0];
            const boundPersona = currentStore.personas.find(p => String(p.id) === String(referenceChar?.boundPersonaId)) || currentStore.personas.find(p => p.isCurrent) || currentStore.personas[0];
            const myName = boundPersona.name;

            let recipientName = myName; 
            if (data.buyFor === 'ta' && targetChar) recipientName = targetChar.name;

            const orderNum = (isFoodOrder ? 'WM' : 'TB') + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
            const nowTime = Date.now();
            const deliveryMs = isFoodOrder ? (20 * 60 * 1000) : (2 * 24 * 60 * 60 * 1000); 

            const newOrder = {
                orderNum: orderNum,
                time: new Date(nowTime).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}),
                timestamp: nowTime,
                deliveryTime: nowTime + deliveryMs,
                type: isFoodOrder ? 'food' : 'shop',
                storeName: isFoodOrder ? (itemsToBuy[0].desc || '神秘美食') : '淘宝合并订单',
                items: itemsToBuy.map(i => ({ name: i.name.replace(/^【.*?】/, ''), price: parseFloat(i.price).toFixed(2), qty: i.qty || 1 })),
                totalPrice: total.toFixed(2),
                status: isUnpaid ? '未结账' : (isFoodOrder ? '骑手赶往中' : '卖家已发货'),
                recipient: recipientName,
                targetCharId: targetChar ? targetChar.id : null,
                buyFor: data.buyFor 
            };

            currentStore.shoppingData.orders = [newOrder, ...(currentStore.shoppingData.orders || [])];
            currentStore.shoppingData.cart = cart.filter(i => !i.selected); 
            state.showCheckoutPopup = false;

            const deliveryDate = new Date(nowTime + deliveryMs);
            let orderMsg = {
                id: Date.now(), sender: myName, isMe: true,
                time: new Date(nowTime).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}), timestamp: Date.now()
            };

            let intentLabel = '';
            if (isUnpaid) intentLabel = '【请求代付】(需你付款)';
            else if (data.buyFor === 'ta') intentLabel = '【赠送给你的礼物】(用户已付款，买给你的)';
            else intentLabel = '【纯分享】(用户买给自己的，已付款，仅分享喜悦)';

            // 🌟 终极防幻觉指令：明确告诉 AI 还没送到，不允许拆箱或脑补！
            if (isFoodOrder) {
                const itemNamesText = newOrder.items.map(i => i.name).join('、');
                const aiReadableText = `[系统向你展示了一张外卖卡片：\n- 意图：${intentLabel}\n- 店铺：${newOrder.storeName}\n- 收件人：${recipientName}\n- 菜品：${itemNamesText}\n- 总计：¥${total.toFixed(2)}\n- 给你的备注：${customNote}\n\n⚠️【绝对系统指令】：外卖刚刚下单，预计需要 20 分钟送达。在收到系统明确提示“外卖已送达”之前，【绝对不可】在聊天中提前脑补外卖到了、假装去拿外卖，否则逻辑将彻底崩坏！现在请自然地和用户聊天，打发等外卖的时间。]`;

                orderMsg = { ...orderMsg, msgType: 'takeaway_card', text: aiReadableText, 
                    takeawayData: {
                        storeName: newOrder.storeName, totalPriceStr: total.toFixed(2),
                        personalNote: customNote, foodItemsArr: newOrder.items, 
                        paymentState: isUnpaid ? 'unpaid' : 'paid', orderNum: orderNum,
                        recipient: recipientName 
                    }
                };
            } else {
                const itemNamesText = newOrder.items.map(i => i.name).join('、');
                const aiReadableText = `[系统向你展示了一张购物卡片：\n- 意图：${intentLabel}\n- 收件人：${recipientName}\n- 物品：${itemNamesText}\n- 总计：¥${total.toFixed(2)}\n\n⚠️【绝对系统指令】：包裹刚刚下单，预计需要 2-3 天送达。在收到系统提示“包裹已签收”之前，【绝对不可】提前脑补快递到了或拆开快递！现在请自然地对买的东西发表看法即可。]`;

                orderMsg = { ...orderMsg, msgType: 'taobao_card', text: aiReadableText, 
                    taobaoData: {
                        items: newOrder.items, totalPrice: total.toFixed(2), orderNum: orderNum, 
                        orderTime: new Date(nowTime).toLocaleString('zh-CN', { hour12: false }),
                        deliveryDateStr: `${deliveryDate.getMonth() + 1}月${deliveryDate.getDate()}日`,
                        paymentState: isUnpaid ? 'unpaid' : 'paid', recipient: recipientName
                    }
                };
            }

            if (isUnpaid) {
                if (payChar) {
                    const payChat = currentStore.chats.find(c => c.charId === payChar.id);
                    if (payChat) {
                        payChat.messages.push({ ...orderMsg }); 
                        payChat.messages.push({
                            id: Date.now()+2, sender: 'system', text: `[系统/动作记录：用户刚刚发来一张代付订单卡片（详情见上）。请你查看收件人是谁，结合你们的关系回复用户。若同意付款，请在回复末尾独占一行输出 [付款] 指令！绝不许向用户复述这些系统提示。]`, isMe: true, isHidden: true, msgType: 'text', time: orderMsg.time, timestamp: Date.now()+2
                        });
                    }
                }
            } else if (targetChar) {
                const chat = currentStore.chats.find(c => c.charId === targetChar.id);
                if (chat) {
                    chat.messages.push({ ...orderMsg }); 
                    let intentPrompt = data.buyFor === 'ta'
                        ? `[系统/动作记录：用户刚刚给你买了一份惊喜（已付款），并发来了订单卡片。请表现出收到礼物的反应，自然地回复用户！]`
                        : `[系统/动作记录：用户刚刚给自己买了东西（已付款），并发来卡片分享喜悦。请顺着ta的话题，自然地给出评价或关心！]`;
                    chat.messages.push({
                        id: Date.now()+2, sender: 'system', text: intentPrompt, isMe: true, isHidden: true, msgType: 'text', time: orderMsg.time, timestamp: Date.now()+2
                    });
                }
            }

            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(isUnpaid ? '✅ 代付订单已发送！' : '✅ 订单分享成功！');
            window.shoppingActions.switchTab('me');
        },

        addToCart: (itemStr) => {
            const item = JSON.parse(decodeURIComponent(itemStr));
            item.selected = true; item.qty = 1;
            if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
            currentStore.shoppingData.cart.push(item);
            if (window.actions?.saveStore) window.actions.saveStore();
            if (window.actions?.showToast) window.actions.showToast(`✅ 已加入购物车`);
            if (window.render) window.render();
        },
        importCartLink: async () => {
            const link = prompt("请在此粘贴【完整的淘宝购物车分享文案】（必须包含商品名字哦！）：\n(或者你也可以直接手打你想要的商品，比如：紫藤汉服、YSL口红、机械键盘)");
            if (!link || link.trim() === '') return;
            const state = window.shoppingState;
            state.isSearching = true; if (window.render) window.render();

            const promptStr = `用户刚刚粘贴了一段想买的商品清单或淘宝分享文本："${link}"。\n请你作为一个极其聪明的解析器，从这段文字中提取出用户真正想买的【真实商品】。\n如果文本里有具体的商品名词，请提取出来，并利用你的常识为它们分配合理的预估价格。\n如果文本里只有一个空洞的 url 链接而没有任何商品名字，请直接返回空数组 []！\n返回格式必须是：[{"name": "商品标题(尽量保留原名并补全细节)", "price": "价格(纯数字，如298.00)", "sales": "默认规格", "desc": "来源: 你的心愿单", "type": "shop"}]\n只返回 JSON 数组，绝不输出其他文字或思考过程！`;

            try {
                const res = await fetch(`${currentStore.apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentStore.apiConfig.apiKey}` },
                    body: JSON.stringify({ model: currentStore.apiConfig.model, messages: [{ role: 'user', content: promptStr }], temperature: 0.2 })
                });
                const data = await res.json();
                const reply = data.choices[0].message.content.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/```json/gi, '').replace(/```/g, '').trim();
                
                const items = JSON.parse(reply).map(item => ({ ...item, selected: true, qty: 1 }));
                if (!items || items.length === 0) return window.actions?.showToast('⚠️ 解析失败：没有看到具体的商品名');

                if (!currentStore.shoppingData) currentStore.shoppingData = { cart: [], orders: [] };
                currentStore.shoppingData.cart = [...items, ...currentStore.shoppingData.cart]; 
                if (window.actions?.saveStore) window.actions.saveStore();
                if(window.actions?.showToast) window.actions.showToast(`✅ 成功导入 ${items.length} 件心愿商品！`);
            } catch (e) {
                if(window.actions?.showToast) window.actions.showToast('解析失败，请检查网络或文案格式');
            } finally {
                state.isSearching = false; if (window.render) window.render();
            }
        },
    };
}

// 3. 核心渲染函数
export function renderShoppingApp(store) {
    currentStore = store; 
    const state = window.shoppingState;
    if (!store.shoppingData) store.shoppingData = { cart: [], orders: [] };
    const shopData = store.shoppingData;

    const isHome = state.tab === 'home';
    const isCart = state.tab === 'cart';
    const isMe = state.tab === 'me';
    
    let pageContentHtml = '';

    if (isHome) {
        if (!window.shoppingActions.switchHomeCategory) {
            window.shoppingActions.switchHomeCategory = (cat) => {
                window.shoppingState.homeCategory = cat;
                window.shoppingState.searchResults = null;
                window.shoppingState.searchQuery = '';
                if (window.render) window.render();
            };
        }

        const isFood = state.homeTab === 'food';
        const currentCat = state.homeCategory || '服饰';
        const currentFoodCat = state.foodCategory || '美食';
        const hotItemsToRender = defaultProducts[currentCat] || [];
        
        const isSearchingView = (state.isSearching || (state.searchResults !== null && state.searchQuery !== '')) && !state.activeFoodStore;

        let topBarCenterHtml = '';
        let handleBack = `window.actions.setCurrentApp(null)`;
        let topBarRightHtml = '';

        const customLoc = currentStore.shoppingData?.customLocation || state.customLocation || '手动定位';

        if (isSearchingView) {
            topBarCenterHtml = `<div class="text-[16px] font-black text-gray-900">搜索结果</div>`;
            topBarRightHtml = `<div class="text-[13px] font-bold text-[#ff5000] cursor-pointer active:opacity-50" onclick="window.shoppingActions.clearSearch()">退出</div>`;
            handleBack = `window.shoppingActions.clearSearch()`; 
        } else if (isFood && state.activeFoodStore) {
            const sData = state.activeFoodStore.isDynamic ? state.activeFoodStore : defaultFoodStores[state.activeFoodStore.cat][state.activeFoodStore.storeIndex];
            topBarCenterHtml = `<div class="text-[17px] font-black text-gray-900">${sData.storeName}</div>`;
            handleBack = `window.shoppingActions.closeFoodStore()`;
            topBarRightHtml = '';
        } else {
            topBarCenterHtml = `
                <div class="cursor-pointer pb-1 px-1 transition-all ${!isFood ? 'text-[#ff5000] border-b-[3px] border-[#ff5000]' : 'text-gray-500 hover:text-gray-800'}" onclick="window.shoppingActions.switchHomeTab('shop')">淘宝购物</div>
                <div class="cursor-pointer pb-1 px-1 transition-all ${isFood ? 'text-[#ff5000] border-b-[3px] border-[#ff5000]' : 'text-gray-500 hover:text-gray-800'}" onclick="window.shoppingActions.switchHomeTab('food')">同城外卖</div>
            `;
            topBarRightHtml = isFood ? `
                <div class="flex items-center text-gray-600 cursor-pointer active:scale-95" onclick="window.shoppingActions.setLocation()">
                    <span class="text-[12px] font-bold mr-1 truncate max-w-[60px]">${customLoc}</span>
                    <i data-lucide="map-pin" class="w-4 h-4 ${currentStore.shoppingData?.customLocation ? 'text-[#ff5000]' : ''}"></i>
                </div>
            ` : '';
        }

        const categoryBarHtml = `
            <div class="w-full bg-[#fff] px-3 pb-2 pt-1 border-b border-gray-100 z-10 shrink-0 overflow-x-auto hide-scrollbar">
                <div class="flex space-x-3 w-max">
                    ${Object.keys(defaultProducts).map(cat => `
                        <div class="px-4 py-1.5 rounded-full text-[13px] font-bold cursor-pointer transition-colors ${currentCat === cat ? 'bg-[#ff5000] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="window.shoppingActions.switchHomeCategory('${cat}')">${cat}</div>
                    `).join('')}
                </div>
            </div>
        `;

        const foodCategoryBarHtml = `
            <div class="w-full bg-[#fff] px-3 pb-2 pt-1 border-b border-gray-100 z-10 shrink-0 overflow-x-auto hide-scrollbar">
                <div class="flex space-x-3 w-max">
                    ${Object.keys(defaultFoodStores).map(cat => `
                        <div class="px-4 py-1.5 rounded-full text-[13px] font-bold cursor-pointer transition-colors ${currentFoodCat === cat ? 'bg-[#ff5000] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}" onclick="window.shoppingActions.switchFoodCategory('${cat}')">${cat}</div>
                    `).join('')}
                </div>
            </div>
        `;

        const renderProductGrid = (items) => {
            return `
            <div class="grid grid-cols-2 gap-3">
                ${items.map(item => {
                    const itemName = item.name || item.title || '神秘惊喜';
                    const itemPrice = item.price || '99.00';
                    
                    const safeItem = { ...item, name: itemName, price: itemPrice };
                    const encodedItem = encodeURIComponent(JSON.stringify(safeItem));
                    
                    return `
                    <div class="bg-[#fff] rounded-[12px] overflow-hidden shadow-sm border border-gray-100 flex flex-col cursor-pointer active:scale-95 transition-transform">
                        <div class="w-full aspect-square bg-[#f9fafb] flex items-center justify-center border-b border-[#f0f0f0] relative">
                            <i data-lucide="package" class="w-10 h-10 text-gray-300"></i>
                        </div>
                        <div class="p-2 flex flex-col flex-1">
                            <div class="text-[13px] text-gray-800 font-medium line-clamp-2 leading-snug mb-1 flex-1">${itemName}</div>
                            <div class="text-[10px] text-gray-400 mb-1">${item.sales || '已售100+'}</div>
                            <div class="flex justify-between items-end">
                                <span class="text-[15px] font-black text-[#ff5000]"><span class="text-[11px]">¥</span>${itemPrice}</span>
                                <div class="w-6 h-6 border border-[#ff5000] text-[#ff5000] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#ff5000] hover:text-white transition-colors" onclick="event.stopPropagation(); window.shoppingActions.addToCart('${encodedItem}')"><i data-lucide="shopping-cart" class="w-3 h-3"></i></div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        };

        let foodContentHtml = '';
        let bottomFoodCartHtml = ''; 

        if (state.activeFoodStore) {
            if (state.isFetchingMenu) {
                foodContentHtml = `
                    <div class="flex flex-col items-center justify-center pt-32 text-gray-400">
                        <i data-lucide="loader" class="w-8 h-8 animate-spin text-[#ff5000] mb-3"></i>
                        <span class="text-[13px] font-bold">正在向商家索取菜单...</span>
                    </div>
                `;
            } else {
                const sData = state.activeFoodStore.isDynamic ? state.activeFoodStore : defaultFoodStores[state.activeFoodStore.cat][state.activeFoodStore.storeIndex];
                const storeCart = (currentStore.shoppingData?.cart || []).filter(i => i.type === 'food' && i.desc === sData.storeName);
                const storeTotalQty = storeCart.reduce((acc, item) => acc + (item.qty || 1), 0);
                const storeTotalPrice = storeCart.reduce((acc, item) => acc + (parseFloat(item.price) || 0) * (item.qty || 1), 0).toFixed(2);

                foodContentHtml = `
                    <div class="p-4 bg-[#fff] mb-2 flex items-center shadow-sm">
                        <div class="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 mr-3"><i data-lucide="${sData.cat === '药品'?'pill':'store'}" class="w-8 h-8"></i></div>
                        <div>
                            <div class="text-[18px] font-black text-gray-800">${sData.storeName}</div>
                            <div class="text-[11px] text-gray-500 mt-1">${sData.desc || '为您现做的美味'} | ${sData.sales || '月售999+'}</div>
                        </div>
                    </div>
                    <div class="text-[13px] font-black text-gray-800 mb-2 px-2 pt-2">热销商品</div>
                    <div class="flex flex-col space-y-3 px-2">
                        ${(sData.items || []).map(item => {
                            const cartItem = { name: `【${sData.storeName}】${item.name}`, price: item.price, type: 'food', desc: sData.storeName };
                            const encodedItem = encodeURIComponent(JSON.stringify(cartItem));
                            const inCart = storeCart.find(i => i.name === cartItem.name);
                            const qty = inCart ? (inCart.qty || 1) : 0;

                            return `
                            <div class="bg-[#fff] rounded-[12px] p-3 flex shadow-sm border border-gray-100">
                                <div class="w-20 h-20 bg-orange-50 rounded-[8px] flex items-center justify-center flex-shrink-0 text-orange-400"><i data-lucide="${sData.cat === '药品'?'cross':'coffee'}" class="w-8 h-8"></i></div>
                                <div class="ml-3 flex-1 flex flex-col justify-between overflow-hidden">
                                    <div class="font-bold text-gray-900 text-[15px] truncate">${item.name}</div>
                                    <div class="text-[11px] text-gray-500 truncate mt-1">月售999+ | 好评度99%</div>
                                    <div class="flex justify-between items-end mt-2">
                                        <span class="text-[14px] font-black text-[#ff5000]"><span class="text-[10px]">¥</span>${item.price}</span>
                                        ${qty > 0 ? `
                                            <div class="flex items-center space-x-2.5">
                                                <div class="w-6 h-6 border border-gray-300 rounded-full flex items-center justify-center text-gray-500 cursor-pointer active:bg-gray-100" onclick="window.shoppingActions.updateFoodQty('${encodedItem}', -1)"><i data-lucide="minus" class="w-3.5 h-3.5"></i></div>
                                                <span class="text-[13px] font-bold text-gray-800 w-3 text-center">${qty}</span>
                                                <div class="w-6 h-6 bg-[#ff5000] rounded-full flex items-center justify-center text-white cursor-pointer active:scale-95 shadow-sm" onclick="window.shoppingActions.updateFoodQty('${encodedItem}', 1)"><i data-lucide="plus" class="w-3.5 h-3.5"></i></div>
                                            </div>
                                        ` : `
                                            <div class="w-6 h-6 bg-[#ff5000] rounded-full flex items-center justify-center text-white cursor-pointer shadow-sm active:scale-95" onclick="window.shoppingActions.updateFoodQty('${encodedItem}', 1)"><i data-lucide="plus" class="w-4 h-4"></i></div>
                                        `}
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="h-[100px]"></div>
                `;

                bottomFoodCartHtml = `
                    ${state.showFoodCartDetail && storeTotalQty > 0 ? `
                        <div class="absolute inset-0 z-[50] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onclick="window.shoppingActions.toggleFoodCartDetail()"></div>
                        <div class="absolute bottom-[60px] left-0 right-0 bg-[#f4f4f4] rounded-t-[16px] z-[51] flex flex-col max-h-[60vh] shadow-[0_-10px_20px_rgba(0,0,0,0.1)] pb-2 animate-in slide-in-from-bottom-8 duration-200" onclick="event.stopPropagation()">
                            <div class="px-4 py-3 bg-orange-50 rounded-t-[16px] flex justify-between items-center border-b border-orange-100">
                                <span class="text-[12px] text-gray-600 font-bold">已选商品</span>
                                <div class="flex items-center text-gray-500 cursor-pointer active:opacity-50" onclick="window.shoppingActions.clearFoodCart('${sData.storeName}')">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5 mr-1"></i><span class="text-[12px]">清空</span>
                                </div>
                            </div>
                            <div class="flex-1 overflow-y-auto px-4 py-2 space-y-4 bg-[#fff]">
                                ${storeCart.map(i => {
                                    const iEncoded = encodeURIComponent(JSON.stringify({name: i.name, price: i.price, type: 'food', desc: i.desc}));
                                    return `
                                    <div class="flex justify-between items-center">
                                        <div class="flex flex-col flex-1 truncate pr-4">
                                            <span class="text-[14px] font-bold text-gray-800 truncate">${i.name.replace(`【${sData.storeName}】`, '')}</span>
                                            <span class="text-[14px] font-black text-[#ff5000]">¥${i.price}</span>
                                        </div>
                                        <div class="flex items-center space-x-2.5 shrink-0">
                                            <div class="w-6 h-6 border border-gray-300 rounded-full flex items-center justify-center text-gray-500 cursor-pointer" onclick="window.shoppingActions.updateFoodQty('${iEncoded}', -1)"><i data-lucide="minus" class="w-3.5 h-3.5"></i></div>
                                            <span class="text-[13px] font-bold text-gray-800 w-3 text-center">${i.qty}</span>
                                            <div class="w-6 h-6 bg-[#ff5000] rounded-full flex items-center justify-center text-white cursor-pointer" onclick="window.shoppingActions.updateFoodQty('${iEncoded}', 1)"><i data-lucide="plus" class="w-3.5 h-3.5"></i></div>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div class="absolute bottom-0 left-0 right-0 h-[60px] bg-[#fff] border-t border-gray-200 flex items-center justify-between px-4 z-[52] pb-safe shadow-[0_-4px_15px_rgba(0,0,0,0.06)]">
                        <div class="relative flex-1 flex items-center cursor-pointer h-full" onclick="window.shoppingActions.toggleFoodCartDetail()">
                            <div class="relative w-12 h-12 rounded-full flex items-center justify-center -mt-6 border-[3px] border-[#fff] shadow-md z-10 transition-colors ${storeTotalQty > 0 ? 'bg-[#ff5000]' : 'bg-gray-700'}">
                                <i data-lucide="shopping-bag" class="w-6 h-6 text-white ${storeTotalQty > 0 ? '' : 'opacity-60'}"></i>
                                ${storeTotalQty > 0 ? `<div class="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center border border-[#fff] shadow-sm">${storeTotalQty}</div>` : ''}
                            </div>
                            <div class="ml-3 flex flex-col justify-center">
                                ${storeTotalQty > 0 ? `
                                    <span class="text-[18px] font-black text-gray-900 leading-none mb-1">¥${storeTotalPrice}</span>
                                    <span class="text-[10px] text-gray-500 leading-none">另需配送费 ¥0 | 支持自取</span>
                                ` : `
                                    <span class="text-[13px] text-gray-400 font-bold mb-1">未选购商品</span>
                                    <span class="text-[10px] text-gray-400 leading-none">另需配送费 ¥0</span>
                                `}
                            </div>
                        </div>
                        ${storeTotalQty > 0 ? `
                            <button class="bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white h-[42px] px-7 rounded-full font-bold text-[15px] active:scale-95 transition-transform shadow-md ml-2" onclick="window.shoppingActions.checkoutFoodStore('${sData.storeName}')">去结算</button>
                        ` : `
                            <button class="bg-gray-200 text-gray-400 h-[42px] px-6 rounded-full font-bold text-[14px] cursor-not-allowed ml-2">¥15起送</button>
                        `}
                    </div>
                `;
            }
        } else {
            const storesToRender = isSearchingView ? (state.searchResults || []) : (defaultFoodStores[currentFoodCat] || []);
            
            foodContentHtml = `
                <div class="flex flex-col space-y-3">
                    ${storesToRender.map((store, idx) => {
                        const sName = store.storeName || store.name || store.title || '未知店铺';
                        const safeStore = { ...store, storeName: sName };
                        
                        const storeStr = encodeURIComponent(JSON.stringify(safeStore));
                        const onclickAction = isSearchingView ? `window.shoppingActions.openSearchedFoodStore('${storeStr}')` : `window.shoppingActions.openFoodStore('${currentFoodCat}', ${idx})`;

                        const iconName = sName.includes('药') ? 'pill' : 'store';

                        return `
                        <div class="bg-[#fff] rounded-[12px] p-3 flex shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="${onclickAction}">
                            <div class="w-20 h-20 bg-orange-50 rounded-[8px] flex items-center justify-center flex-shrink-0 text-orange-500"><i data-lucide="${iconName}" class="w-8 h-8"></i></div>
                            <div class="ml-3 flex-1 flex flex-col justify-center overflow-hidden">
                                <div class="font-bold text-gray-900 text-[16px] truncate mb-1">${sName}</div>
                                <div class="text-[11px] text-gray-500 truncate mb-1">${store.desc || '为您提供美味'}</div>
                                <div class="text-[11px] text-orange-500 bg-orange-50 self-start px-1.5 py-0.5 rounded">评分 ${store.rating || '4.8'} | ${store.sales || '月售999+'}</div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            `;
        }

        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 flex items-center bg-[#fff] z-40 relative shadow-sm shrink-0">
                <div class="w-[80px] flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="${handleBack}">
                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                </div>
                <div class="flex-1 flex justify-center space-x-8 font-bold">
                    ${topBarCenterHtml}
                </div>
                <div class="w-[80px] flex justify-end items-center">
                    ${topBarRightHtml}
                </div>
            </div>
            
            ${(!isFood || !state.activeFoodStore) ? `
            <div class="bg-[#fff] px-4 py-2 pb-2 shadow-sm z-10 relative shrink-0">
                <div class="flex items-center bg-[#f4f4f4] rounded-full border border-gray-200 overflow-hidden pr-1">
                    <i data-lucide="search" class="w-5 h-5 text-gray-400 ml-3"></i>
                    <input type="text" value="${state.searchQuery}" oninput="window.shoppingActions.updateSearch(this.value)" onkeydown="if(event.key==='Enter') window.shoppingActions.searchItems()" placeholder="${isFood ? '搜附近美食...' : '搜索惊喜礼物...'}" class="flex-1 bg-transparent h-10 px-2 outline-none text-[14px] text-gray-800" />
                    <button class="bg-[#ff5000] text-white px-4 h-8 rounded-full text-[13px] font-bold active:scale-95 transition-transform" onclick="window.shoppingActions.searchItems()">搜索</button>
                </div>
            </div>
            ` : ''}

            ${(!isSearchingView && !state.activeFoodStore) ? (!isFood ? categoryBarHtml : foodCategoryBarHtml) : ''}

            <div id="shopping-home-scroll" class="flex-1 overflow-y-auto bg-[#f4f4f4] px-0 pt-0 pb-0 hide-scrollbar relative">
                ${state.isSearching ? `
                    <div class="flex flex-col items-center justify-center pt-20 text-gray-400">
                        <i data-lucide="loader" class="w-8 h-8 animate-spin text-[#ff5000] mb-3"></i><span class="text-[13px]">正在寻找目标...</span>
                    </div>
                ` : (isSearchingView ? `
                    <div class="p-3">
                        <div class="text-[12px] text-gray-400 mb-2 font-bold flex items-center"><i data-lucide="search" class="w-3.5 h-3.5 mr-1"></i>"${state.searchQuery}" 的搜索结果</div>
                        ${(state.searchResults && state.searchResults.length > 0) ? (!isFood ? renderProductGrid(state.searchResults) : foodContentHtml) : '<div class="text-center text-gray-400 mt-20 text-[13px]">未找到相关商品或店铺</div>'}
                    </div>
                ` : `
                    ${!isFood ? `<div class="p-3"><div class="text-[13px] font-black text-gray-800 mb-3 flex items-center"><div class="w-1 h-3 bg-[#ff5000] rounded-full mr-2"></div>${currentCat} 热销好物榜</div>${renderProductGrid(hotItemsToRender)}</div>` : `<div class="p-3 pb-0">${foodContentHtml}</div>`}
                `)}
            </div>
            ${bottomFoodCartHtml}
        `;
    }
    // 🛒 2. 购物车区域
    else if (isCart) {
        shopData.cart.forEach(item => { if (item.selected === undefined) item.selected = true; if(!item.qty) item.qty = 1; });
        const selectedCount = shopData.cart.filter(i => i.selected).length;
        const allSelected = shopData.cart.length > 0 && selectedCount === shopData.cart.length;
        const selectedTotal = shopData.cart.filter(i => i.selected).reduce((a,b)=>a+(parseFloat(b.price)||0)*(b.qty||1), 0).toFixed(2);

        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 flex items-center bg-[#fff] z-40 relative shadow-sm shrink-0">
                <div class="w-12 flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="window.actions.setCurrentApp(null)">
                    <i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i>
                </div>
                <div class="flex-1 text-center text-[18px] font-black text-gray-900">购物车 (${shopData.cart.length})</div>
                <div class="w-12 flex justify-end items-center cursor-pointer active:scale-90" onclick="window.shoppingActions.manualAddToCart()">
                    <i data-lucide="plus" class="w-6 h-6 text-[#ff5000]"></i>
                </div>
            </div>
            
            <div id="shopping-cart-scroll" class="flex-1 overflow-y-auto bg-[#f4f4f4] px-3 pt-3 pb-[100px] hide-scrollbar relative">
                <div class="bg-gradient-to-r from-orange-100 to-[#ffedd5] border border-orange-200 rounded-[12px] p-3 mb-4 flex justify-between items-center shadow-sm cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.importCartLink()">
                    <div class="flex flex-col">
                        <span class="text-[14px] font-black text-[#ff5000] mb-0.5">导入淘宝心愿单</span>
                        <span class="text-[11px] text-orange-600 font-medium">粘贴分享文案，一键自动解析成商品</span>
                    </div>
                    <div class="w-8 h-8 bg-[#ff5000] rounded-full text-white flex items-center justify-center shadow-md shrink-0 ${state.isSearching ? 'animate-spin' : ''}">
                        <i data-lucide="${state.isSearching ? 'loader' : 'link'}" class="w-4 h-4"></i>
                    </div>
                </div>

                ${shopData.cart.length > 0 ? shopData.cart.map((item, idx) => `
                    <div class="bg-[#fff] rounded-[12px] p-3 mb-3 flex items-center shadow-sm border ${item.selected ? 'border-orange-200' : 'border-gray-100'} transition-colors cursor-pointer" onclick="window.shoppingActions.toggleCartItem(${idx})">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center mr-3 shrink-0 border transition-colors ${item.selected ? 'bg-[#ff5000] border-[#ff5000]' : 'border-gray-300'}">
                            ${item.selected ? `<i data-lucide="check" class="w-4 h-4 text-white"></i>` : ''}
                        </div>
                        <div class="w-20 h-20 bg-gray-50 rounded-[8px] flex items-center justify-center shrink-0 mr-3 text-gray-300 border border-gray-100"><i data-lucide="${item.type==='food'?'store':'package'}" class="w-8 h-8"></i></div>
                        <div class="flex-1 flex flex-col justify-between min-w-0 h-20">
                            <div>
                                <div class="text-[14px] font-bold text-gray-800 line-clamp-2 leading-snug mb-1">${item.name}</div>
                                <div class="text-[11px] text-gray-400 bg-gray-50 self-start px-1.5 py-0.5 rounded truncate max-w-full inline-block">${item.desc || item.sales || '默认规格'}</div>
                            </div>
                            <div class="flex justify-between items-end">
                                <span class="text-[16px] font-black text-[#ff5000]">¥${item.price}</span>
                                <span class="text-[12px] text-gray-400 font-bold">x${item.qty||1}</span>
                            </div>
                        </div>
                    </div>
                `).join('') : '<div class="text-center text-gray-400 mt-20 text-[13px] font-medium">购物车空空如也</div>'}
            </div>

            ${shopData.cart.length > 0 ? `
                <div class="absolute bottom-[52px] left-0 right-0 bg-[#fff] border-t border-gray-200 px-4 pt-2 pb-2.5 flex flex-col shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20 pb-safe">
                    <div class="w-full flex justify-end space-x-3 mb-2 pt-1">
                        <button class="bg-[#fff] border border-gray-300 text-gray-700 ${selectedCount===0 ? 'opacity-50' : ''} px-4 py-1.5 rounded-full text-[12px] font-bold active:scale-95 transition-all shadow-sm" onclick="window.shoppingActions.openSharePopup()">转发分享</button>
                        <button class="bg-[#ef4444] border border-[#ef4444] text-white ${selectedCount===0 ? 'opacity-50' : ''} px-4 py-1.5 rounded-full text-[12px] font-bold active:scale-95 transition-all shadow-sm" onclick="window.shoppingActions.deleteSelected()">删除商品</button>
                    </div>
                    <div class="w-full flex justify-between items-center pb-1">
                        <div class="flex items-center cursor-pointer" onclick="window.shoppingActions.toggleSelectAll()">
                            <div class="w-5 h-5 rounded-full flex items-center justify-center mr-2 border transition-colors ${allSelected ? 'bg-[#ff5000] border-[#ff5000]' : 'border-gray-300'}">
                                ${allSelected ? `<i data-lucide="check" class="w-3.5 h-3.5 text-white"></i>` : ''}
                            </div>
                            <span class="text-[13px] text-gray-600 font-bold">全选</span>
                        </div>
                        <div class="flex items-center">
                            <div class="flex flex-col items-end mr-3">
                                <span class="text-[12px] text-gray-800 font-bold">合计: <span class="font-black text-[#ff5000] text-[16px]">¥${selectedTotal}</span></span>
                            </div>
                            <button class="bg-gradient-to-r from-[#ff9000] to-[#ff5000] ${selectedCount===0 ? 'opacity-50' : ''} text-white px-6 py-2.5 rounded-full text-[14px] font-bold active:scale-95 transition-transform shadow-md" onclick="window.shoppingActions.openCheckoutPopup()">结算(${selectedCount})</button>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    } 
    // 👤 3. 我的(订单)区域
    else if (isMe) {
        const activePersona = store.personas.find(p => p.isCurrent) || store.personas[0];

        pageContentHtml = `
            <div class="pt-12 pb-3 px-4 bg-[#fff] z-40 relative shadow-sm border-b border-gray-100 flex items-center shrink-0">
                <div class="w-10 flex items-center cursor-pointer active:opacity-50 text-gray-800" onclick="window.actions.setCurrentApp(null)"><i data-lucide="chevron-left" class="w-7 h-7 -ml-2"></i></div>
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 rounded-full border border-gray-200 overflow-hidden shrink-0"><img src="${activePersona.avatar}" class="w-full h-full object-cover"></div>
                    <div class="flex flex-col"><span class="text-[18px] font-black text-gray-900">${activePersona.name}</span></div>
                </div>
            </div>
            
            <div id="shopping-orders-scroll" class="flex-1 overflow-y-auto bg-[#f4f4f4] px-3 pt-4 pb-20 hide-scrollbar">
                <div class="text-[14px] font-bold text-gray-800 mb-3 ml-1 flex items-center"><i data-lucide="file-text" class="w-4 h-4 mr-1.5 text-[#ff5000]"></i>近三天订单</div>
                ${shopData.orders.length > 0 ? shopData.orders.map(order => `
                    <div class="bg-[#fff] rounded-[12px] p-4 mb-3 shadow-sm border border-gray-100">
                        <div class="flex justify-between items-center border-b border-gray-50 pb-2 mb-3">
                            <div class="flex items-center space-x-2">
                                <span class="text-[11px] text-gray-400 font-mono">${order.time}</span>
                                <span class="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded-sm border border-gray-100">收件人: ${order.recipient}</span>
                            </div>
                            <div class="flex items-center space-x-3">
                                <span class="text-[12px] font-bold ${order.status === '未结账' ? 'text-rose-500' : (order.status.includes('已送达') || order.status.includes('已完成') ? 'text-green-500' : 'text-[#ff5000]')}">${order.status}</span>
                                <i data-lucide="trash-2" class="w-4 h-4 text-gray-300 hover:text-rose-400 cursor-pointer active:scale-90 transition-colors" onclick="window.shoppingActions.deleteOrder('${order.orderNum}')"></i>
                            </div>
                        </div>
                        
                        <div class="text-[14px] font-black text-gray-800 mb-2.5 flex items-center"><i data-lucide="${order.type==='food'?'store':'box'}" class="w-4 h-4 mr-1 text-gray-400"></i>${order.storeName}</div>
                        
                        <div class="space-y-2 mb-3">
                            ${(order.items || []).map(item => `
                                <div class="flex justify-between items-center">
                                    <div class="flex flex-1 items-center min-w-0">
                                        <div class="w-9 h-9 bg-gray-50 rounded-[6px] flex items-center justify-center shrink-0 mr-2 text-gray-300"><i data-lucide="${order.type==='food'?'coffee':'image'}" class="w-4 h-4"></i></div>
                                        <div class="flex-1 min-w-0 pr-2">
                                            <div class="text-[12px] font-bold text-gray-800 line-clamp-1">${item.name}</div>
                                            <div class="text-[10px] text-gray-400 mt-0.5">x${item.qty}</div>
                                        </div>
                                    </div>
                                    <div class="text-[13px] font-black text-gray-800 shrink-0">¥${item.price}</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="flex justify-end items-center border-t border-gray-50 pt-2.5">
                            <span class="text-[12px] text-gray-500 mr-2">共 ${(order.items || []).reduce((a,b)=>a+(b.qty||1), 0)} 件</span>
                            <span class="text-[14px] font-black text-gray-900">实付 ¥${order.totalPrice}</span>
                        </div>
                    </div>
                `).join('') : '<div class="text-center text-gray-400 mt-20 text-[13px] font-medium">最近没有订单记录哦</div>'}
            </div>
        `;
    }

    const shouldHideBottomTab = (state.tab === 'home' && state.homeTab === 'food' && state.activeFoodStore);

    const globalPopupsHtml = `
        ${state.showSharePopup ? `
            <div class="absolute inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200" onclick="window.shoppingActions.closeSharePopup()">
                <div class="w-[85%] max-w-[320px] bg-[#fff] rounded-[24px] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300" onclick="event.stopPropagation()">
                    <div class="p-4 font-black text-center text-[16px] text-gray-900 border-b border-gray-100 relative bg-[#fff]">
                        选择分享对象
                        <i data-lucide="x" class="absolute right-4 top-4 w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.shoppingActions.closeSharePopup()"></i>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4 space-y-3 max-h-[50vh] bg-[#f9fafb]">
                        ${store.contacts.map(c => `
                            <div class="flex items-center p-3 bg-[#fff] rounded-[14px] shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.executeShareCart('${c.id}')">
                                <img src="${c.avatar}" class="w-10 h-10 rounded-[10px] object-cover border border-gray-100 mr-3 shrink-0" />
                                <span class="flex-1 font-bold text-gray-800 text-[15px] truncate">${c.name}</span>
                                <div class="w-7 h-7 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center shrink-0">
                                    <i data-lucide="send" class="w-3.5 h-3.5 -ml-0.5"></i>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        ` : ''}

        ${state.showAddCustomItemPopup ? `
            <div class="absolute inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200" onclick="window.shoppingActions.closeAddCustomItemPopup()">
                <div class="w-[85%] max-w-[320px] bg-[#fff] rounded-[24px] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300" onclick="event.stopPropagation()">
                    <div class="p-4 font-black text-center text-[16px] text-gray-900 border-b border-gray-100 relative bg-[#fff]">
                        添加自定义商品
                        <i data-lucide="x" class="absolute right-4 top-4 w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.shoppingActions.closeAddCustomItemPopup()"></i>
                    </div>
                    <div class="p-5 space-y-4 bg-[#f9fafb]">
                        <div>
                            <label class="block text-[12px] font-bold text-gray-600 mb-1.5 ml-1">商品名称 <span class="text-rose-500">*</span></label>
                            <input type="text" placeholder="输入你买的东西" class="w-full bg-[#fff] border border-gray-200 rounded-[12px] px-3 py-2.5 text-[14px] outline-none focus:border-[#ff5000] transition-colors shadow-sm" value="${state.customItemData?.name || ''}" oninput="window.shoppingActions.updateCustomItemField('name', this.value)">
                        </div>
                        <div class="flex space-x-3">
                            <div class="flex-1">
                                <label class="block text-[12px] font-bold text-gray-600 mb-1.5 ml-1">预估价格 (¥) <span class="text-rose-500">*</span></label>
                                <input type="number" placeholder="99.00" class="w-full bg-[#fff] border border-gray-200 rounded-[12px] px-3 py-2.5 text-[14px] outline-none focus:border-[#ff5000] transition-colors shadow-sm" value="${state.customItemData?.price || ''}" oninput="window.shoppingActions.updateCustomItemField('price', this.value)">
                            </div>
                            <div class="flex-1">
                                <label class="block text-[12px] font-bold text-gray-600 mb-1.5 ml-1">规格描述</label>
                                <input type="text" placeholder="如: 默认规格" class="w-full bg-[#fff] border border-gray-200 rounded-[12px] px-3 py-2.5 text-[14px] outline-none focus:border-[#ff5000] transition-colors shadow-sm" value="${state.customItemData?.desc || ''}" oninput="window.shoppingActions.updateCustomItemField('desc', this.value)">
                            </div>
                        </div>
                        <button class="w-full bg-gradient-to-r from-[#ff9000] to-[#ff5000] text-white font-bold text-[15px] py-3 rounded-full mt-2 active:scale-95 transition-transform shadow-md" onclick="window.shoppingActions.confirmAddCustomItem()">确认添加</button>
                    </div>
                </div>
            </div>
        ` : ''}

        ${state.showCheckoutPopup ? `
            <div class="absolute inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200" onclick="window.shoppingActions.closeCheckoutPopup()">
                <div class="w-full bg-[#fff] rounded-t-[24px] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300 pb-safe" onclick="event.stopPropagation()">
                    <div class="p-4 font-black text-center text-[16px] text-gray-900 border-b border-gray-100 relative bg-[#fff]">
                        ${state.checkoutStep === 1 ? '1. 为谁购买？' : state.checkoutStep === 2 ? '2. 结算方式' : '3. 将订单分享给'}
                        <i data-lucide="x" class="absolute right-4 top-4 w-5 h-5 text-gray-400 cursor-pointer active:scale-90" onclick="window.shoppingActions.closeCheckoutPopup()"></i>
                    </div>
                    <div class="p-5 max-h-[60vh] overflow-y-auto bg-[#f9fafb]">
                        ${state.checkoutStep === 1 ? `
                            ${!state.checkoutData.buyFor ? `
                                <div class="flex space-x-4 mb-4">
                                    <div class="flex-1 bg-orange-50 border border-orange-200 text-orange-600 rounded-[16px] p-5 text-center font-bold text-[16px] active:scale-95 transition-transform cursor-pointer shadow-sm" onclick="window.shoppingActions.setCheckoutBuyFor('self')">给自己买</div>
                                    <div class="flex-1 bg-rose-50 border border-rose-200 text-rose-600 rounded-[16px] p-5 text-center font-bold text-[16px] active:scale-95 transition-transform cursor-pointer shadow-sm" onclick="window.shoppingActions.setCheckoutBuyFor('ta')">给 TA 买</div>
                                </div>
                            ` : `
                                <div class="text-[13px] font-bold text-gray-500 mb-3">请选择要送给谁：</div>
                                <div class="space-y-3">
                                    ${store.contacts.map(c => `
                                        <div class="flex items-center p-3 bg-[#fff] rounded-[14px] shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.setCheckoutBuyForChar('${c.id}')">
                                            <img src="${c.avatar}" class="w-10 h-10 rounded-[10px] object-cover border border-gray-100 mr-3 shrink-0" />
                                            <span class="flex-1 font-bold text-gray-800 text-[15px] truncate">${c.name}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        ` : ''}
                        ${state.checkoutStep === 2 ? `
                            ${!state.checkoutData.payMethod ? `
                                <div class="space-y-4 mb-4">
                                    <div class="bg-[#fff] border border-gray-200 rounded-[16px] p-4 flex justify-between items-center active:scale-95 transition-transform cursor-pointer shadow-sm" onclick="window.shoppingActions.setCheckoutPayMethod('balance')">
                                        <div class="flex items-center"><i data-lucide="wallet" class="w-5 h-5 text-orange-500 mr-3"></i><span class="font-bold text-gray-800">余额结账</span></div>
                                        <span class="text-gray-500 font-medium text-[13px]">可用: ¥${store.wallet?.balance?.toFixed(2) || '0.00'}</span>
                                    </div>
                                    <div class="bg-[#fff] border border-gray-200 rounded-[16px] p-4 flex justify-between items-center active:scale-95 transition-transform cursor-pointer shadow-sm" onclick="window.shoppingActions.setCheckoutPayMethod('ta')">
                                        <div class="flex items-center"><i data-lucide="credit-card" class="w-5 h-5 text-rose-500 mr-3"></i><span class="font-bold text-gray-800">请 TA 代付</span></div>
                                        <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400"></i>
                                    </div>
                                </div>
                            ` : `
                                <div class="text-[13px] font-bold text-gray-500 mb-3">请选择谁来代付：</div>
                                <div class="space-y-3">
                                    ${store.contacts.map(c => `
                                        <div class="flex items-center p-3 bg-[#fff] rounded-[14px] shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.setCheckoutPayChar('${c.id}')">
                                            <img src="${c.avatar}" class="w-10 h-10 rounded-[10px] object-cover border border-gray-100 mr-3 shrink-0" />
                                            <span class="flex-1 font-bold text-gray-800 text-[15px] truncate">${c.name}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        ` : ''}
                        ${state.checkoutStep === 3 ? `
                            <div class="text-[13px] font-bold text-gray-500 mb-3">将自己买的宝贝分享给：</div>
                            <div class="space-y-3">
                                ${store.contacts.map(c => `
                                    <div class="flex items-center p-3 bg-[#fff] rounded-[14px] shadow-sm border border-gray-100 cursor-pointer active:scale-95 transition-transform" onclick="window.shoppingActions.setCheckoutShareChar('${c.id}')">
                                        <img src="${c.avatar}" class="w-10 h-10 rounded-[10px] object-cover border border-gray-100 mr-3 shrink-0" />
                                        <span class="flex-1 font-bold text-gray-800 text-[15px] truncate">${c.name}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        ` : ''}
    `;

    return `
        <div class="w-full h-full relative overflow-hidden animate-in fade-in duration-300 select-none bg-[#fff] flex flex-col">
            
            ${pageContentHtml}

            ${shouldHideBottomTab ? '' : `
            <div class="h-[52px] bg-[#fff] border-t border-gray-200 flex items-center justify-around pb-safe z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.02)] shrink-0">
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isHome ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('home')">
                    <i data-lucide="home" class="w-[22px] h-[22px] mb-0.5 ${isHome ? 'fill-current' : ''}"></i>
                    <span class="text-[10px] font-bold">首页</span>
                </div>
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isCart ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('cart')">
                    <div class="relative">
                        <i data-lucide="shopping-cart" class="w-[22px] h-[22px] mb-0.5 ${isCart ? 'fill-current' : ''}"></i>
                        ${shopData.cart.length > 0 ? `<div class="absolute -top-1.5 -right-2 bg-[#ff5000] text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center border border-white shadow-sm">${shopData.cart.length}</div>` : ''}
                    </div>
                    <span class="text-[10px] font-bold">购物车</span>
                </div>
                <div class="flex flex-col items-center justify-center cursor-pointer w-16 transition-colors ${isMe ? 'text-[#ff5000]' : 'text-gray-400 hover:text-gray-600'}" onclick="window.shoppingActions.switchTab('me')">
                    <i data-lucide="user" class="w-[22px] h-[22px] mb-0.5 ${isMe ? 'fill-current' : ''}"></i>
                    <span class="text-[10px] font-bold">我的</span>
                </div>
            </div>
            `}
            
            ${globalPopupsHtml}
        </div>
    `;
}

// ==========================================
// 📡 全局后台静默雷达：高精 GPS 用户周边盲盒库 (专供 AI 给用户点餐)
// ==========================================
setTimeout(async () => {
    if (!store) {
        console.log("📡 [外卖雷达] 未找到全局状态，雷达静默...");
        return;
    }
    
    if (!store.enableLocation) {
        console.log("📡 [外卖雷达] 用户已关闭定位权限，AI 将使用幻觉点餐。");
        return; 
    }

    try {
        console.log("📡 [外卖雷达] 正在探测用户高精度真实定位...");

        let realLoc = '';
        
        const getGPS = () => new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject('No GPS');
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
        });

        try {
            const pos = await getGPS();
            const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&localityLanguage=zh`);
            const geoData = await geoRes.json();
            
            const city = geoData.city || geoData.principalSubdivision || '';
            const district = geoData.locality || ''; 
            
            realLoc = `${city}${district !== city ? district : ''}` || '未知区域';
            console.log(`📍 [GPS成功] 探测到用户真实物理位置：${realLoc}`);
        } catch (gpsErr) {
            console.warn("📍 [GPS失败/拒绝] 降级使用 IP 定位...");
            try {
                const ipRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
                const ipData = await ipRes.json();
                realLoc = ipData.city ? ipData.city + '市' : '上海市';
            } catch (ipErr) {
                realLoc = '上海市';
            }
        }

        if (!store.shoppingData) store.shoppingData = { cart: [], orders: [] };
        store.shoppingData.userRealLocation = realLoc;

        const cachedInfo = store.foodPoolInfo;
        
        if (!cachedInfo || cachedInfo.city !== realLoc) {
            console.log(`📡 [外卖雷达] 锁定用户所在区域 (${cachedInfo?.city || '无'} -> ${realLoc})，开始搜刮周边外卖...`);
            
            const categories = ['美食', '奶茶', '烧烤', '甜点'];
            const fetchPromises = categories.map(kw => 
                fetch('https://neko-hoshino.duckdns.org/search-food', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-secret-token': 'EAAF99' },
                    body: JSON.stringify({ keyword: kw, location: realLoc }) 
                })
                .then(res => res.json())
                .then(data => ({ kw, items: (data.items || []).slice(0, 10) })) 
                .catch(err => ({ kw, items: [] })) 
            );

            const results = await Promise.all(fetchPromises);
            const newItems = {};
            results.forEach(r => { newItems[r.kw] = r.items; });

            store.foodPoolInfo = {
                city: realLoc,
                items: newItems
            };
            if (window.actions?.saveStore) window.actions.saveStore();
            console.log(`🍔 [外卖雷达] [${realLoc}] 周边动态盲盒库更新完毕，可供 AI 随时调用！`);
        } else {
            console.log(`📡 [外卖雷达] 用户位置未变 (${realLoc})，继续使用缓存周边外卖库。`);
        }
    } catch (e) {
        console.warn("📡 [外卖雷达] 探测受阻，将使用兜底数据", e);
    }
}, 3000);

// ==========================================
// 🚚 全局异步物流巡逻员 & 内存回收机制 (🌟 终极修复版！)
// ==========================================
setInterval(() => {
    // 🌟 直接使用文件顶部引入的全局 store 对象，不再依赖必须打开过 App 才能获取的 currentStore！
    if (!store || !store.shoppingData || !store.shoppingData.orders) return;
    
    const now = Date.now();
    let needsSave = false;
    
    // 1. 到货状态流转与微信暗语通知
    store.shoppingData.orders.forEach(order => {
        // 如果是未结账、已经送达或者已经完成的，直接跳过
        if (order.status === '未结账' || order.status.includes('已送达') || order.status.includes('已完成')) return;
        
        // 如果当前时间已经超过了预计送达时间
        if (now >= order.deliveryTime) {
            order.status = order.type === 'food' ? '已送达' : '已完成';
            needsSave = true; // 🌟 必须写盘保存！

            if (order.targetCharId) {
                const chat = store.chats.find(c => c.charId === order.targetCharId);
                if (chat) {
                    // 🌟 提取商品名称，让 AI 知道具体买了什么
                    const itemNames = (order.items || []).slice(0, 3).map(item => item.name).join('、');
                    const moreHint = (order.items && order.items.length > 3) ? '等' : '';
                    const goodsDetail = itemNames ? `（${itemNames}${moreHint}）` : '';

                    let noticeMsg = '';
                    if (order.buyFor === 'ta') {
                        noticeMsg = `用户给你买的【${order.storeName}${goodsDetail}】刚刚已经送达/签收了！请你马上主动发消息告诉ta，并表达你的喜悦、感动和感谢！`;
                    } else if (order.buyFor === 'self') {
                        noticeMsg = `用户自己买的【${order.storeName}${goodsDetail}】刚刚已经送达/外卖到了！请你像个贴心的男友/女友一样，马上主动发消息提醒ta去拿，别让东西放凉了或丢了。`;
                    } else if (order.buyFor === 'user_by_ta') {
                        noticeMsg = `你给用户买的【${order.storeName}${goodsDetail}】刚刚已经送达/签收了！请你马上主动发消息提醒ta去拿，并趁机邀功、调侃或关心ta一下。`;
                    }

                    if (noticeMsg) {
                        const historyContext = `[系统/动作记录：${noticeMsg}]`;
                        chat.messages.push({
                            id: Date.now(), sender: 'system', text: historyContext, isMe: true, isHidden: true, msgType: 'text',
                            time: new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}), timestamp: Date.now()
                        });

                        if (typeof window.scheduleCloudTask === 'function') {
                            window.scheduleCloudTask(order.targetCharId, 
                                `(系统强制指令：严重物流/外卖状态更新！\n\n${historyContext}\n\n请你立刻结合该事件，主动给用户发消息！严格符合你的人设，自然地开口说话，绝不允许输出任何系统标签或这句指令本身！)`
                            );
                        }
                    }
                }
            }
        }
    });
    
    // 2. 过期订单自动销毁 (释放内存, 仅保留3天内)
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const oldLength = store.shoppingData.orders.length;
    store.shoppingData.orders = store.shoppingData.orders.filter(o => (now - o.timestamp) < threeDaysMs);
    
    if (store.shoppingData.orders.length !== oldLength) needsSave = true;
    
    if (needsSave) {
        // 🌟 核心破局：确保数据死死钉在手机底层硬盘里！
        if (window.actions && typeof window.actions.saveStore === 'function') {
            window.actions.saveStore();
        } else if (window.DB) {
            // 如果 actions 不存在（比如应用刚启动还没完成渲染绑定），直接调用 DB 最底层强行刷入！
            window.DB.set(JSON.parse(JSON.stringify(store))).catch(e => console.log('巡逻员底层硬盘写入失败', e));
        }
        
        // 只有当你正好在看着订单页面时，才帮你无缝刷新 UI
        if (window.shoppingState && window.shoppingState.tab === 'me' && typeof window.render === 'function') {
            window.render(); 
        }
    }
}, 15000); // 每 15 秒巡逻一次