const questions = [
  {
    "id": 1,
    "question": "3 + 5 = ?",
    "options": [
      "7",
      "8",
      "9",
      "10"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 2,
    "question": "下列哪个字的读音是正确的？",
    "options": [
      "着(zhuó)急",
      "着(zháo)急", 
      "着(zhāo)急",
      "着(zhe)急"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 3,
    "question": "澳大利亚的首都？",
    "options": [
      "悉尼",
      "墨尔本",
      "堪培拉",
      "布里斯班"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 4,
    "question": "加州的首府是？",
    "options": [
      "洛杉矶",
      "旧金山",
      "萨克拉门托",
      "圣迭戈"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 5,
    "question": "美国面积最大的州？",
    "options": [
      "德克萨斯",
      "加利福尼亚",
      "阿拉斯加",
      "蒙大拿"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 6,
    "question": "美国的独立日是哪一天？",
    "options": [
      "6月4日",
      "7月4日",
      "8月4日",
      "9月4日"
    ],
    "correct": 1,
    "category": "历史"
  },
  {
    "id": 7,
    "question": "加拿大的官方语言是哪两种？",
    "options": [
      "英语和西班牙语",
      "英语和法语",
      "法语和德语",
      "英语和德语"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 8,
    "question": "美国的货币单位是？",
    "options": [
      "欧元",
      "比索",
      "美元",
      "英镑"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 9,
    "question": "尼亚加拉大瀑布位于哪两个国家之间？",
    "options": [
      "美国和加拿大",
      "美国和墨西哥",
      "加拿大和英国",
      "美国和英国"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 10,
    "question": "美国的第一任总统是？",
    "options": [
      "林肯",
      "华盛顿",
      "杰斐逊",
      "罗斯福"
    ],
    "correct": 1,
    "category": "历史"
  },
  {
    "id": 11,
    "question": "加拿大使用的电压标准是多少？",
    "options": [
      "110V",
      "220V",
      "240V",
      "12V"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 12,
    "question": "哪一个城市是美国人口最多的城市？",
    "options": [
      "洛杉矶",
      "芝加哥",
      "纽约",
      "休斯顿"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 13,
    "question": "加拿大国旗中枫叶的颜色是？",
    "options": [
      "绿色",
      "红色",
      "黄色",
      "白色"
    ],
    "correct": 1,
    "category": "文化"
  },
  {
    "id": 14,
    "question": "哪一座桥连接旧金山与马林县？",
    "options": [
      "布鲁克林大桥",
      "金门大桥",
      "维多利亚大桥",
      "皇后大桥"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 15,
    "question": "美国一共有多少个州？",
    "options": [
      "48",
      "49",
      "50",
      "51"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 16,
    "question": "美国的首都是哪座城市？",
    "options": [
      "纽约",
      "华盛顿特区",
      "洛杉矶",
      "芝加哥"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 17,
    "question": "加拿大最大的省份是？",
    "options": [
      "安大略省",
      "魁北克省",
      "不列颠哥伦比亚省",
      "努纳武特"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 18,
    "question": "美国国旗上有多少颗星星？",
    "options": [
      "50",
      "48",
      "52",
      "51"
    ],
    "correct": 0,
    "category": "文化"
  },
  {
    "id": 19,
    "question": "美国的独立宣言签署于哪一年？",
    "options": [
      "1776年",
      "1789年",
      "1812年",
      "1492年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 20,
    "question": "蒙特利尔位于哪个省份？",
    "options": [
      "安大略省",
      "魁北克省",
      "艾伯塔省",
      "曼尼托巴省"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 21,
    "question": "美国国鸟是什么？",
    "options": [
      "秃鹰",
      "白头海雕",
      "红尾鹰",
      "金雕"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 22,
    "question": "加拿大最大的城市是？",
    "options": [
      "多伦多",
      "蒙特利尔",
      "温哥华",
      "卡尔加里"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 23,
    "question": "美国的国家象征是什么？",
    "options": [
      "自由女神像",
      "金门大桥",
      "白宫",
      "大峡谷"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 24,
    "question": "北美最长的河流是？",
    "options": [
      "密西西比河",
      "圣劳伦斯河",
      "科罗拉多河",
      "俄亥俄河"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 25,
    "question": "加拿大使用的官方货币是？",
    "options": [
      "美元",
      "加元",
      "英镑",
      "欧元"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 26,
    "question": "美国的最高峰是？",
    "options": [
      "华盛顿山",
      "麦金利山（丹纳利峰）",
      "落基山",
      "阿巴拉契亚山"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 27,
    "question": "多伦多位于哪个湖畔？",
    "options": [
      "安大略湖",
      "密歇根湖",
      "休伦湖",
      "伊利湖"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 28,
    "question": "美国的总统官邸叫什么名字？",
    "options": [
      "白宫",
      "国会大厦",
      "林肯纪念堂",
      "自由女神像"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 29,
    "question": "加拿大的国庆日是哪一天？",
    "options": [
      "7月1日",
      "6月1日",
      "5月1日",
      "8月1日"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 30,
    "question": "美国著名的自由女神像位于哪座城市？",
    "options": [
      "纽约",
      "华盛顿特区",
      "洛杉矶",
      "波士顿"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 31,
    "question": "美国参议院共有多少名议员？",
    "options": [
      "100",
      "435",
      "50",
      "535"
    ],
    "correct": 0,
    "category": "政治"
  },
  {
    "id": 32,
    "question": "加拿大哪个城市被称为“枫叶之都”？",
    "options": [
      "魁北克市",
      "多伦多",
      "温哥华",
      "蒙特利尔"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 33,
    "question": "美国国歌的名字是？",
    "options": [
      "星条旗永不落",
      "自由进行曲",
      "美国进行曲",
      "战斗进行曲"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 34,
    "question": "美国的货币单位“美元”符号是？",
    "options": [
      "$",
      "€",
      "£",
      "¥"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 35,
    "question": "加拿大的国鸟是？",
    "options": [
      "加拿大雁",
      "白头海雕",
      "鸽子",
      "麻雀"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 36,
    "question": "美国第一位总统是谁？",
    "options": [
      "乔治·华盛顿",
      "亚伯拉罕·林肯",
      "托马斯·杰斐逊",
      "西奥多·罗斯福"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 37,
    "question": "北美最大的国家是？",
    "options": [
      "美国",
      "加拿大",
      "墨西哥",
      "格陵兰"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 38,
    "question": "美国的国花是什么？",
    "options": [
      "玫瑰",
      "牡丹",
      "向日葵",
      "郁金香"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 39,
    "question": "加拿大的首都渥太华位于哪条河流旁？",
    "options": [
      "渥太华河",
      "圣劳伦斯河",
      "尼亚加拉河",
      "密西西比河"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 40,
    "question": "美国的独立日是？",
    "options": [
      "7月4日",
      "6月4日",
      "5月4日",
      "8月4日"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 41,
    "question": "北美自由贸易协定（NAFTA）成员国不包括？",
    "options": [
      "加拿大",
      "美国",
      "墨西哥",
      "巴西"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 42,
    "question": "加拿大的官方语言中不包括？",
    "options": [
      "英语",
      "法语",
      "西班牙语",
      "以上都包括"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 43,
    "question": "美国的国鸟白头海雕的象征意义是？",
    "options": [
      "自由和力量",
      "和平和友谊",
      "财富和繁荣",
      "智慧和勇气"
    ],
    "correct": 0,
    "category": "文化"
  },
  {
    "id": 44,
    "question": "加拿大枫叶旗的颜色主要是？",
    "options": [
      "红色和白色",
      "蓝色和白色",
      "绿色和黄色",
      "橙色和黑色"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 45,
    "question": "美国国旗上红色条纹的象征是？",
    "options": [
      "勇气和坚韧",
      "和平和友谊",
      "财富和繁荣",
      "自由和力量"
    ],
    "correct": 0,
    "category": "文化"
  },
  {
    "id": 46,
    "question": "北美最大的湖泊是？",
    "options": [
      "苏必利尔湖",
      "密歇根湖",
      "休伦湖",
      "伊利湖"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 47,
    "question": "加拿大的国石是？",
    "options": [
      "翡翠",
      "石英",
      "钻石",
      "玛瑙"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 48,
    "question": "美国总统就职典礼通常在哪座建筑前举行？",
    "options": [
      "国会大厦",
      "白宫",
      "华盛顿纪念碑",
      "林肯纪念堂"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 49,
    "question": "美国有多少个州？",
    "options": [
      "50",
      "48",
      "51",
      "52"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 50,
    "question": "加拿大最长的河流是？",
    "options": [
      "麦肯齐河",
      "圣劳伦斯河",
      "尼亚加拉河",
      "渥太华河"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 51,
    "question": "北美洲三大国家中人口最少的是？",
    "options": [
      "美国",
      "墨西哥",
      "加拿大",
      "古巴"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 52,
    "question": "洛杉矶所在的州是？",
    "options": [
      "德克萨斯",
      "加利福尼亚",
      "佛罗里达",
      "华盛顿"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 53,
    "question": "美墨边境著名的围栏被称为？",
    "options": [
      "自由墙",
      "防御墙",
      "边境墙",
      "墨西哥屏障"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 54,
    "question": "美墨边境著名的围栏被称为？",
    "options": [
      "边境墙",
      "防御墙",
      "自由墙",
      "墨西哥屏障"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 55,
    "question": "加拿大的国旗上是什么植物？",
    "options": [
      "枫叶",
      "松叶",
      "白桦叶",
      "橡叶"
    ],
    "correct": 0,
    "category": "文化"
  },
  {
    "id": 56,
    "question": "下列哪一个城市是美国首都？",
    "options": [
      "纽约",
      "华盛顿特区",
      "芝加哥",
      "洛杉矶"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 57,
    "question": "加拿大的国庆日是哪一天？",
    "options": [
      "7月1日",
      "6月1日",
      "5月1日",
      "8月1日"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 58,
    "question": "魁北克省的主要语言是？",
    "options": [
      "英语",
      "西班牙语",
      "法语",
      "德语"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 59,
    "question": "美国共有多少个州？",
    "options": [
      "48",
      "49",
      "50",
      "52"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 60,
    "question": "哪一年美国宣布独立？",
    "options": [
      "1776年",
      "1789年",
      "1801年",
      "1754年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 61,
    "question": "加拿大最西部的省是？",
    "options": [
      "不列颠哥伦比亚",
      "艾伯塔",
      "马尼托巴",
      "纽芬兰"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 62,
    "question": "美国的国家语言是？",
    "options": [
      "英语",
      "英语和西班牙语",
      "没有官方语言",
      "英语和法语"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 63,
    "question": "加拿大国会所在地是？",
    "options": [
      "温哥华",
      "渥太华",
      "多伦多",
      "蒙特利尔"
    ],
    "correct": 1,
    "category": "政治"
  },
  {
    "id": 64,
    "question": "墨西哥首都是哪一座城市？",
    "options": [
      "瓜达拉哈拉",
      "墨西哥城",
      "提华纳",
      "坎昆"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 65,
    "question": "美国国旗有多少颗星？",
    "options": [
      "48",
      "49",
      "50",
      "52"
    ],
    "correct": 2,
    "category": "文化"
  },
  {
    "id": 66,
    "question": "北美大陆上的最高山峰是？",
    "options": [
      "麦金利山（丹纳利峰）",
      "落基山",
      "阿巴拉契亚山",
      "圣海伦斯火山"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 67,
    "question": "下列哪座城市以电影工业闻名？",
    "options": [
      "纽约",
      "波士顿",
      "洛杉矶",
      "迈阿密"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 68,
    "question": "安大略湖位于哪个国家？",
    "options": [
      "美国",
      "加拿大",
      "美国和加拿大",
      "墨西哥"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 69,
    "question": "加拿大的货币单位是？",
    "options": [
      "加元",
      "美元",
      "英镑",
      "欧元"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 70,
    "question": "美国的第一任总统是谁？",
    "options": [
      "乔治·华盛顿",
      "托马斯·杰斐逊",
      "林肯",
      "富兰克林"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 71,
    "question": "下列哪座城市不在美国？",
    "options": [
      "温哥华",
      "洛杉矶",
      "西雅图",
      "丹佛"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 72,
    "question": "美国国徽上的鸟是什么？",
    "options": [
      "白头鹰",
      "金雕",
      "红隼",
      "秃鹰"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 73,
    "question": "哪条河流贯穿美国中部？",
    "options": [
      "密西西比河",
      "哈德逊河",
      "科罗拉多河",
      "圣劳伦斯河"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 74,
    "question": "多伦多位于哪一个湖？",
    "options": [
      "安大略湖",
      "伊利湖",
      "密歇根湖",
      "苏必利尔湖"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 75,
    "question": "下列哪个国家属于北美洲？",
    "options": [
      "加拿大",
      "巴西",
      "哥伦比亚",
      "秘鲁"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 76,
    "question": "美国最高法院设在哪座城市？",
    "options": [
      "纽约",
      "芝加哥",
      "华盛顿特区",
      "洛杉矶"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 77,
    "question": "以下哪个是加拿大城市？",
    "options": [
      "蒙特利尔",
      "奥斯汀",
      "底特律",
      "巴尔的摩"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 78,
    "question": "美国的自由女神像是谁赠送的？",
    "options": [
      "英国",
      "法国",
      "加拿大",
      "意大利"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 79,
    "question": "美国的两大主要政党是？",
    "options": [
      "共和党和民主党",
      "保守党和自由党",
      "绿党和工党",
      "自由党和新民主党"
    ],
    "correct": 0,
    "category": "政治"
  },
  {
    "id": 80,
    "question": "哪一座城市有CN塔？",
    "options": [
      "渥太华",
      "卡尔加里",
      "温哥华",
      "多伦多"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 81,
    "question": "哪条河是加拿大的主要河流？",
    "options": [
      "圣劳伦斯河",
      "密西西比河",
      "哥伦比亚河",
      "科罗拉多河"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 82,
    "question": "美加边境最长的省是？",
    "options": [
      "魁北克",
      "安大略",
      "卑诗",
      "新斯科舍"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 83,
    "question": "美国著名的赌城是？",
    "options": [
      "迈阿密",
      "洛杉矶",
      "拉斯维加斯",
      "芝加哥"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 84,
    "question": "加拿大的官方语言是？",
    "options": [
      "英语和法语",
      "英语",
      "法语",
      "英语和德语"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 85,
    "question": "加拿大的枫叶旗是哪一年启用的？",
    "options": [
      "1965年",
      "1867年",
      "1901年",
      "1982年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 86,
    "question": "美国五大湖中唯一完全位于美国的是？",
    "options": [
      "伊利湖",
      "密歇根湖",
      "苏必利尔湖",
      "安大略湖"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 87,
    "question": "加拿大第一大岛屿是？",
    "options": [
      "巴芬岛",
      "维多利亚岛",
      "纽芬兰岛",
      "爱德华王子岛"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 88,
    "question": "美国的独立战争主要对抗哪个国家？",
    "options": [
      "法国",
      "西班牙",
      "英国",
      "荷兰"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 89,
    "question": "纽约证券交易所位于哪条街？",
    "options": [
      "第五大道",
      "百老汇",
      "华尔街",
      "第七大道"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 90,
    "question": "北美洲地理上与南美洲连接的地方是？",
    "options": [
      "巴拿马地峡",
      "墨西哥湾",
      "尤卡坦半岛",
      "危地马拉高原"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 91,
    "question": "加拿大建国于哪一年？",
    "options": [
      "1867年",
      "1776年",
      "1901年",
      "1945年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 92,
    "question": "以下哪一个是墨西哥的著名旅游城市？",
    "options": [
      "提华纳",
      "坎昆",
      "瓜达拉哈拉",
      "墨西哥城"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 93,
    "question": "美国第一任总统乔治·华盛顿出生在哪个州？",
    "options": [
      "弗吉尼亚",
      "宾夕法尼亚",
      "马萨诸塞",
      "纽约"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 94,
    "question": "五大湖中最大的是哪一个？",
    "options": [
      "密歇根湖",
      "伊利湖",
      "安大略湖",
      "苏必利尔湖"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 95,
    "question": "北美洲的面积大约是多少？",
    "options": [
      "2400万平方公里",
      "1900万平方公里",
      "1000万平方公里",
      "3000万平方公里"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 96,
    "question": "以下哪个节日是美国的法定假日？",
    "options": [
      "感恩节",
      "中秋节",
      "复活节",
      "国际劳动节"
    ],
    "correct": 0,
    "category": "文化"
  },
  {
    "id": 97,
    "question": "美国的国会由哪两部分组成？",
    "options": [
      "参议院和众议院",
      "总统和最高法院",
      "州议会和联邦议会",
      "地方议会和中央议会"
    ],
    "correct": 0,
    "category": "政治"
  },
  {
    "id": 98,
    "question": "加拿大是在哪个女王统治时期成立联邦的？",
    "options": [
      "维多利亚女王",
      "伊丽莎白一世",
      "伊丽莎白二世",
      "安妮女王"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 99,
    "question": "美国的建国文件《独立宣言》签署于哪年？",
    "options": [
      "1776年",
      "1789年",
      "1801年",
      "1754年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 100,
    "question": "加拿大的官方君主是哪国的国家元首？",
    "options": [
      "英国",
      "法国",
      "加拿大本国",
      "澳大利亚"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 101,
    "question": "若 x + 3 = 8，则 x 等于？",
    "options": [
      "3",
      "5",
      "8",
      "11"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 102,
    "question": "解方程：2x - 4 = 6，x = ?",
    "options": [
      "5",
      "6",
      "1",
      "2"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 103,
    "question": "展开 (a + b)^2 的结果是？",
    "options": [
      "a² + b²",
      "a² - b²",
      "a² - 2ab + b²",
      "a² + 2ab + b²"
    ],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 104,
    "question": "下列哪个是一次函数？",
    "options": [
      "y = 2x + 1",
      "y = 1/x",
      "y = √x",
      "y = x²"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 105,
    "question": "一个三角形的内角和是多少度？",
    "options": [
      "180°",
      "270°",
      "360°",
      "90°"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 106,
    "question": "一个圆的周长公式是？",
    "options": [
      "2πr",
      "πr²",
      "πd²",
      "r²"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 107,
    "question": "直角三角形中，一个锐角最大是几度？",
    "options": [
      "91",
      "90",
      "45",
      "89"
    ],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 108,
    "question": "一个等边三角形每个内角是？",
    "options": [
      "60°",
      "30°",
      "90°",
      "45°"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 109,
    "question": "下列哪个数是质数？",
    "options": [
      "7",
      "9",
      "15",
      "21"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 110,
    "question": "-3 的平方是多少？",
    "options": [
      "6",
      "9",
      "-9",
      "-6"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 111,
    "question": "5 的立方是？",
    "options": [
      "25",
      "125",
      "100",
      "15"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 112,
    "question": "最大公因数是？",
    "options": [
      "能整除多个数的最大数",
      "两个数的平均值",
      "所有因数的和",
      "最大整数"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 113,
    "question": "一辆车以60千米/小时的速度行驶3小时，行驶了多少千米？",
    "options": [
      "60",
      "90",
      "180",
      "120"
    ],
    "correct": 2,
    "category": "科学"
  },
  {
    "id": 114,
    "question": "一本书400页，小明每天读20页，需要几天读完？",
    "options": [
      "10",
      "30",
      "20",
      "40"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 115,
    "question": "水池放水管3小时放完，开两个管同时放需要？",
    "options": [
      "2小时",
      "3小时",
      "6小时",
      "1.5小时"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 116,
    "question": "a与b成正比例，a=2时b=6，则a=4时b=?",
    "options": [
      "6",
      "8",
      "10",
      "12"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 117,
    "question": "y = 3x 是？",
    "options": [
      "一次函数",
      "对数函数",
      "指数函数",
      "二次函数"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 118,
    "question": "y = x² 图像是？",
    "options": [
      "抛物线",
      "圆",
      "正弦曲线",
      "直线"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 119,
    "question": "y = x 的图像通过？",
    "options": [
      "原点",
      "(0,1)",
      "(1,1)",
      "(1,0)"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 120,
    "question": "函数图像中，y 随 x 增大而减小，函数是？",
    "options": [
      "反比例函数",
      "一次函数",
      "常数函数",
      "正比例函数"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 121,
    "question": "解不等式：x + 2 < 5",
    "options": [
      "x = 3",
      "x > 3",
      "x < 2",
      "x < 3"
    ],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 122,
    "question": "解一元一次方程：3x = 12",
    "options": [
      "x = 4",
      "x = 5",
      "x = 3",
      "x = 6"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 123,
    "question": "一元二次方程 ax² + bx + c = 0 的根的判别式是？",
    "options": [
      "b² - 4ac",
      "a² - 4bc",
      "b² + 4ac",
      "a² + b² + c²"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 124,
    "question": "不等式组 x > 2 且 x < 5 的解集是？",
    "options": [
      "2 < x < 5",
      "x > 5",
      "x = 3",
      "x < 2"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 125,
    "question": "100除以4的商是？",
    "options": [
      "25",
      "20",
      "40",
      "30"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 126,
    "question": "π的近似值是多少？",
    "options": [
      "3.14",
      "2.17",
      "1.73",
      "3.41"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 127,
    "question": "√81 的值是多少？",
    "options": [
      "9",
      "7",
      "10",
      "8"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 128,
    "question": "60% 等于多少？",
    "options": [
      "0.06",
      "0.6",
      "6",
      "60"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 129,
    "question": "-5 + 7 的结果是？",
    "options": [
      "12",
      "-2",
      "1",
      "2"
    ],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 130,
    "question": "一个角是锐角，则它的度数范围是？",
    "options": [
      "0°~90°",
      "90°~180°",
      "90°整",
      "大于180°"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 131,
    "question": "x² = 16 的正解是？",
    "options": [
      "-4",
      "4",
      "2",
      "8"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 132,
    "question": "3的倒数是？",
    "options": [
      "1/3",
      "0.3",
      "-3",
      "3"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 133,
    "question": "10的平方根是？",
    "options": [
      "√10",
      "100",
      "5",
      "10"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 134,
    "question": "方程x²-1=0的解是？",
    "options": [
      "x=1或-1",
      "x=-1",
      "x=0",
      "x=1"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 135,
    "question": "一个三角形最多有几个钝角？",
    "options": [
      "1",
      "2",
      "3",
      "0"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 136,
    "question": "一个角的补角是60°，这个角是？",
    "options": [
      "120°",
      "30°",
      "60°",
      "90°"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 137,
    "question": "“正方体”有多少个面？",
    "options": [
      "6",
      "8",
      "4",
      "12"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 138,
    "question": "一个长方体的体积公式是？",
    "options": [
      "长×宽×高",
      "长+宽+高",
      "长×宽",
      "底×高"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 139,
    "question": "方程组有唯一解的条件是？",
    "options": [
      "两直线相交",
      "平行",
      "重合",
      "无解"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 140,
    "question": "a² - b² 可表示为？",
    "options": [
      "(a-b)(a+b)",
      "(a+b)²",
      "(a-b)²",
      "a² + b²"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 141,
    "question": "“绝对值”是？",
    "options": [
      "数到原点的距离",
      "相反数",
      "平方根",
      "整数倍"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 142,
    "question": "求一组数的平均数，需？",
    "options": [
      "总和除以个数",
      "总和乘以个数",
      "总和加倍",
      "最大数除最小数"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 143,
    "question": "1小时是几分钟？",
    "options": [
      "60",
      "100",
      "30",
      "90"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 144,
    "question": "最小的正整数是？",
    "options": [
      "1",
      "0",
      "2",
      "-1"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 145,
    "question": "小数0.5化为百分数是？",
    "options": [
      "50%",
      "5%",
      "0.5%",
      "500%"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 146,
    "question": "3米是多少厘米？",
    "options": [
      "300",
      "30",
      "3",
      "1000"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 147,
    "question": "一个钟表的时针走一圈是几小时？",
    "options": [
      "12",
      "24",
      "6",
      "1"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 148,
    "question": "等腰三角形有几条边相等？",
    "options": [
      "2",
      "1",
      "3",
      "0"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 149,
    "question": "一个角是直角，它的度数是？",
    "options": [
      "90°",
      "60°",
      "120°",
      "180°"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 150,
    "question": "20%的小数表示是？",
    "options": [
      "0.2",
      "2",
      "0.02",
      "20"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 151,
    "question": "成语“画蛇添足”比喻什么？",
    "options": [
      "多此一举",
      "画画比赛",
      "添点装饰",
      "不劳而获"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 152,
    "question": "成语“井底之蛙”用来形容什么？",
    "options": [
      "见识狭窄",
      "顽皮捣蛋",
      "快乐的青蛙",
      "处境危险"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 153,
    "question": "成语“爱不释手”形容？",
    "options": [
      "东西太重",
      "不愿借出",
      "拿得太紧",
      "非常喜欢"
    ],
    "correct": 3,
    "category": "语文"
  },
  {
    "id": 154,
    "question": "成语“一见如故”形容？",
    "options": [
      "初见就争吵",
      "互相敌对",
      "看起来像以前见过",
      "刚见面就像老朋友"
    ],
    "correct": 3,
    "category": "语文"
  },
  {
    "id": 155,
    "question": "“汉”的拼音是？",
    "options": [
      "hàn",
      "hā",
      "hǎn",
      "hēn"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 156,
    "question": "下列哪个字的拼音是“shū”？",
    "options": [
      "书",
      "数",
      "树",
      "属"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 157,
    "question": "“老师”一词中“师”的拼音是？",
    "options": [
      "shī",
      "shǐ",
      "sī",
      "sì"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 158,
    "question": "“苹果”的“苹”的拼音是？",
    "options": [
      "píng",
      "pìng",
      "bǐng",
      "bīng"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 159,
    "question": "“白日依山尽，黄河入海流”出自哪位诗人？",
    "options": [
      "王之涣",
      "李白",
      "杜甫",
      "孟浩然"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 160,
    "question": "“床前明月光”的下一句是？",
    "options": [
      "疑是地上霜",
      "低头思故乡",
      "月出惊山鸟",
      "举头望明月"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 161,
    "question": "“桃花潭水深千尺，不及汪伦送我情”是谁写的？",
    "options": [
      "李白",
      "杜甫",
      "白居易",
      "贺知章"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 162,
    "question": "“劝君更尽一杯酒，西出阳关无故人”中“阳关”是？",
    "options": [
      "地名",
      "酒名",
      "人名",
      "官名"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 163,
    "question": "“我喜欢画画。”中“喜欢”是？",
    "options": [
      "动词",
      "副词",
      "形容词",
      "名词"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 164,
    "question": "“他跑得真快！”中“得”是？",
    "options": [
      "助词",
      "副词",
      "形容词",
      "名词"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 165,
    "question": "“我们正在吃饭。”中的“正在”表示？",
    "options": [
      "进行时",
      "过去时",
      "将来时",
      "完成时"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 166,
    "question": "“花儿开了。”是？",
    "options": [
      "陈述句",
      "感叹句",
      "疑问句",
      "祈使句"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 167,
    "question": "下列哪个词语搭配正确？",
    "options": [
      "明亮的灯光",
      "温柔的刀",
      "安静的雷",
      "高兴的石头"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 168,
    "question": "下列哪个词语使用正确？",
    "options": [
      "美丽的风景",
      "美丽的气味",
      "美丽的声音",
      "美丽的味道"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 169,
    "question": "“洁白的___”填哪个最合适？",
    "options": [
      "羽毛",
      "风格",
      "声音",
      "味道"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 170,
    "question": "“飞快地___”填哪个最合适？",
    "options": [
      "跑",
      "听",
      "说",
      "写"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 171,
    "question": "写人记事要写出？",
    "options": [
      "人物特点",
      "作文格式",
      "风景名胜",
      "物品价格"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 172,
    "question": "写景文章常用的顺序是？",
    "options": [
      "空间顺序",
      "人物顺序",
      "时间顺序",
      "逻辑顺序"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 173,
    "question": "日记中应包含？",
    "options": [
      "日期和天气",
      "诗歌",
      "谜语",
      "广告语"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 174,
    "question": "“我爱我的祖国”属于？",
    "options": [
      "中心句",
      "疑问句",
      "比喻句",
      "感叹句"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 175,
    "question": "“耳”字的偏旁部首是？",
    "options": [
      "耳",
      "口",
      "又",
      "目"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 176,
    "question": "“学校”的“校”是什么意思？",
    "options": [
      "教育机构",
      "声音",
      "树木",
      "植物"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 177,
    "question": "“奔跑”的近义词是？",
    "options": [
      "疾走",
      "跳跃",
      "爬行",
      "飞翔"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 178,
    "question": "“高兴”的反义词是？",
    "options": [
      "悲伤",
      "快乐",
      "幸福",
      "喜悦"
    ],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 179,
    "question": "“风雨交加”的意思是？",
    "options": [
      "风和雨同时出现",
      "晴朗无风",
      "只有雨没有风",
      "下雪和打雷"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 180,
    "question": "下列哪个不是标点符号？",
    "options": [
      "句号",
      "括号",
      "问号",
      "字母"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 181,
    "question": "“太阳从东方升起”是？",
    "options": [
      "事实句",
      "夸张句",
      "祈使句",
      "疑问句"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 182,
    "question": "“我家门前有条小河。”中“有”是？",
    "options": [
      "动词",
      "形容词",
      "代词",
      "名词"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 183,
    "question": "“竹林”是？",
    "options": [
      "合成词",
      "量词",
      "代词",
      "虚词"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 184,
    "question": "“火”字的结构是？",
    "options": [
      "独体字",
      "半包围结构",
      "上下结构",
      "左右结构"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 185,
    "question": "“青”字的笔画数是？",
    "options": [
      "8",
      "9",
      "6",
      "7"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 186,
    "question": "“江山如画”比喻？",
    "options": [
      "风景美丽",
      "战争激烈",
      "人物众多",
      "天气晴朗"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 187,
    "question": "“春回大地”的含义是？",
    "options": [
      "春天来了",
      "天气变冷",
      "秋天来临",
      "地震发生"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 188,
    "question": "“学习雷锋好榜样”这句话的句式是？",
    "options": [
      "陈述句",
      "疑问句",
      "感叹句",
      "祈使句"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 189,
    "question": "“不耻下问”的含义是？",
    "options": [
      "虚心向他人请教",
      "不愿回答问题",
      "反复发问",
      "骄傲自大"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 190,
    "question": "“自相矛盾”原意是？",
    "options": [
      "前后不一致",
      "拿着矛和盾",
      "说话冲突",
      "打仗失败"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 191,
    "question": "“四面楚歌”用来形容？",
    "options": [
      "孤立无援",
      "歌声四起",
      "战斗激烈",
      "胜券在握"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 192,
    "question": "“掩耳盗铃”说明什么？",
    "options": [
      "自欺欺人",
      "小偷行为",
      "掩盖声音",
      "敲响警钟"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 193,
    "question": "“囫囵吞枣”比喻？",
    "options": [
      "不加分析地接受",
      "吃得太快",
      "爱吃水果",
      "误吞东西"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 194,
    "question": "“画龙点睛”的含义是？",
    "options": [
      "使内容更精彩",
      "画画技巧",
      "画龙比赛",
      "点眼睛动作"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 195,
    "question": "“滥竽充数”的意思是？",
    "options": [
      "混在其中冒充好",
      "乐器种类多",
      "喜欢吹竽",
      "齐国风俗"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 196,
    "question": "“三心二意”的人是？",
    "options": [
      "做事不专心",
      "心地善良",
      "心思缜密",
      "心灵手巧"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 197,
    "question": "“闻鸡起舞”的人是？",
    "options": [
      "刻苦自勉",
      "睡懒觉",
      "好打架",
      "练唱歌"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 198,
    "question": "“守株待兔”讽刺什么？",
    "options": [
      "不劳而获的想法",
      "种树养兔",
      "农夫种地",
      "爱吃兔肉"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 199,
    "question": "“刻舟求剑”说明？",
    "options": [
      "方法不当",
      "在水上刻字",
      "买剑失败",
      "造船技术"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 200,
    "question": "“盲人摸象”的寓意是？",
    "options": [
      "片面了解事物",
      "眼睛看不见",
      "动物很大",
      "大象难摸"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 201,
    "question": "She ___ to school every day.",
    "options": [
      "goes",
      "go",
      "went",
      "going"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 202,
    "question": "I ___ my homework yesterday.",
    "options": [
      "done",
      "doing",
      "did",
      "do"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 203,
    "question": "They ___ TV now.",
    "options": [
      "are watching",
      "will watch",
      "watch",
      "watched"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 204,
    "question": "We ___ an English movie next weekend.",
    "options": [
      "will watch",
      "watched",
      "are watching",
      "watch"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 205,
    "question": "There is ___ apple on the table.",
    "options": [
      "an",
      "a",
      "the",
      "some"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 206,
    "question": "Tom has two ___",
    "options": [
      "pen",
      "penes",
      "pens",
      "pen's"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 207,
    "question": "My brother is ___ than me.",
    "options": [
      "tallest",
      "more tall",
      "taller",
      "tall"
    ],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 208,
    "question": "This book is ___ than that one.",
    "options": [
      "most interesting",
      "more interesting",
      "interest",
      "interesting"
    ],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 209,
    "question": "This is ___ book.",
    "options": [
      "mine",
      "I",
      "my",
      "me"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 210,
    "question": "___ is raining outside.",
    "options": [
      "It",
      "That",
      "This",
      "He"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 211,
    "question": "Do you like apples? — Yes, ___.",
    "options": [
      "I like",
      "I do",
      "I am",
      "I don’t"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 212,
    "question": "Is this your pen? — No, it isn’t ___.",
    "options": [
      "me",
      "mine",
      "I",
      "my"
    ],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 213,
    "question": "The cat is ___ the table.",
    "options": [
      "on",
      "in",
      "by",
      "at"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 214,
    "question": "He was born ___ May.",
    "options": [
      "in",
      "at",
      "on",
      "for"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 215,
    "question": "I like English ___ I don’t like math.",
    "options": [
      "so",
      "but",
      "and",
      "or"
    ],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 216,
    "question": "He didn’t go to school ___ he was ill.",
    "options": [
      "because",
      "so",
      "and",
      "but"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 217,
    "question": "I usually go to school ___ bus.",
    "options": [
      "by",
      "in",
      "at",
      "on"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 218,
    "question": "Please ___ the lights before you leave.",
    "options": [
      "turn off",
      "turn over",
      "turn up",
      "turn on"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 219,
    "question": "Neither Tom nor I ___ a teacher.",
    "options": [
      "am",
      "are",
      "is",
      "be"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 220,
    "question": "Ten years ___ a long time.",
    "options": [
      "is",
      "are",
      "be",
      "were"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 221,
    "question": "You ___ smoke here. It’s a hospital.",
    "options": [
      "mustn’t",
      "may",
      "need",
      "can"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 222,
    "question": "___ I ask you a question?",
    "options": [
      "May",
      "Should",
      "Must",
      "Will"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 223,
    "question": "Mount Everest is the ___ mountain in the world.",
    "options": [
      "tallest",
      "most tall",
      "taller",
      "tall"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 224,
    "question": "Jim runs ___ than Tom.",
    "options": [
      "faster",
      "fastest",
      "fast",
      "more fast"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 225,
    "question": "___ a beautiful day!",
    "options": [
      "What",
      "How",
      "When",
      "Which"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 226,
    "question": "___ clever the boy is!",
    "options": [
      "How",
      "What",
      "When",
      "Which"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 227,
    "question": "He is a ___ driver.",
    "options": [
      "careful",
      "care",
      "caring",
      "carefully"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 228,
    "question": "She sings ___.",
    "options": [
      "well",
      "good",
      "nice",
      "better"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 229,
    "question": "What time ___ you usually get up?",
    "options": [
      "do",
      "will",
      "does",
      "are"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 230,
    "question": "How ___ is it from here to the park?",
    "options": [
      "far",
      "near",
      "soon",
      "long"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 231,
    "question": "—How often do you exercise? — ___.",
    "options": [
      "Twice a week",
      "Very much",
      "For 2 hours",
      "At 5 o’clock"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 232,
    "question": "—Where is your father? — He is ___.",
    "options": [
      "in hospital",
      "go to work",
      "teacher",
      "sleep"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 233,
    "question": "We ___ friends since we met in 2020.",
    "options": [
      "have been",
      "are",
      "will be",
      "were"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 234,
    "question": "She is good at ___.",
    "options": [
      "singing",
      "to sing",
      "sings",
      "sing"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 235,
    "question": "He didn’t go to the party, ___ he?",
    "options": [
      "did",
      "does",
      "didn’t",
      "was"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 236,
    "question": "Would you like ___ tea?",
    "options": [
      "some",
      "a",
      "an",
      "any"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 237,
    "question": "The man ___ helped me is my uncle.",
    "options": [
      "who",
      "whom",
      "which",
      "where"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 238,
    "question": "Look! The children ___ football.",
    "options": [
      "are playing",
      "played",
      "play",
      "plays"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 239,
    "question": "Lucy and Lily are ___ the same age.",
    "options": [
      "about",
      "on",
      "to",
      "in"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 240,
    "question": "My mother asked me ___ up early.",
    "options": [
      "to get",
      "got",
      "getting",
      "get"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 241,
    "question": "There ___ a book and two pens on the desk.",
    "options": [
      "is",
      "are",
      "was",
      "were"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 242,
    "question": "She was born ___ a cold winter night.",
    "options": [
      "on",
      "at",
      "in",
      "by"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 243,
    "question": "It’s time ___ home.",
    "options": [
      "to go",
      "go",
      "going",
      "gone"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 244,
    "question": "He is the ___ of the two boys.",
    "options": [
      "taller",
      "tall",
      "tallest",
      "more tall"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 245,
    "question": "This question is ___ difficult for me.",
    "options": [
      "too",
      "much",
      "very",
      "so"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 246,
    "question": "Don’t be afraid ___ making mistakes.",
    "options": [
      "of",
      "for",
      "to",
      "at"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 247,
    "question": "I have no idea ___ he will come.",
    "options": [
      "if",
      "what",
      "who",
      "how"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 248,
    "question": "The students stopped ___ when the teacher came in.",
    "options": [
      "talking",
      "talk",
      "to talk",
      "talked"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 249,
    "question": "Not only you but also he ___ wrong.",
    "options": [
      "is",
      "are",
      "be",
      "am"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 250,
    "question": "English ___ in many countries.",
    "options": [
      "is spoken",
      "speaks",
      "is speaking",
      "spoke"
    ],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 251,
    "question": "中国的首都是哪座城市？",
    "options": [
      "上海",
      "西安",
      "北京",
      "广州"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 252,
    "question": "中国面积最大的省级行政区是？",
    "options": [
      "内蒙古",
      "西藏",
      "青海",
      "新疆"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 253,
    "question": "长江的源头位于？",
    "options": [
      "秦岭",
      "青藏高原",
      "四川盆地",
      "云南高原"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 254,
    "question": "中国的第一大河是？",
    "options": [
      "长江",
      "黄河",
      "珠江",
      "松花江"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 255,
    "question": "中国人口最多的省份是？",
    "options": [
      "江苏",
      "广东",
      "山东",
      "河南"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 256,
    "question": "“鱼米之乡”主要指？",
    "options": [
      "长江中下游平原",
      "黄土高原",
      "云贵高原",
      "东北平原"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 257,
    "question": "中国最大的淡水湖是？",
    "options": [
      "青海湖",
      "鄱阳湖",
      "洞庭湖",
      "太湖"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 258,
    "question": "中国最大的咸水湖是？",
    "options": [
      "青海湖",
      "鄱阳湖",
      "太湖",
      "柴达木湖"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 259,
    "question": "中国的地势特点是？",
    "options": [
      "西高东低",
      "东高西低",
      "南高北低",
      "中间高四周低"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 260,
    "question": "黄河注入的海洋是？",
    "options": [
      "黄海",
      "渤海",
      "南海",
      "东海"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 261,
    "question": "中国最高的山峰是？",
    "options": [
      "贡嘎山",
      "珠穆朗玛峰",
      "乔戈里峰",
      "梅里雪山"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 262,
    "question": "珠穆朗玛峰位于哪两个国家边界？",
    "options": [
      "中国和印度",
      "中国和尼泊尔",
      "中国和巴基斯坦",
      "中国和不丹"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 263,
    "question": "中国四大盆地中面积最大的是？",
    "options": [
      "四川盆地",
      "塔里木盆地",
      "柴达木盆地",
      "准噶尔盆地"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 264,
    "question": "中国四大高原中面积最大的是？",
    "options": [
      "黄土高原",
      "青藏高原",
      "内蒙古高原",
      "云贵高原"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 265,
    "question": "中国重要的稀土资源集中在？",
    "options": [
      "贵州",
      "黑龙江",
      "云南",
      "内蒙古"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 266,
    "question": "海南岛位于中国哪个海域？",
    "options": [
      "东海",
      "南海",
      "黄海",
      "渤海"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 267,
    "question": "中国夏季气温最高的地区常出现在？",
    "options": [
      "广州",
      "北京",
      "武汉",
      "吐鲁番"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 268,
    "question": "被称为“天府之国”的是？",
    "options": [
      "四川盆地",
      "华北平原",
      "东北平原",
      "江南丘陵"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 269,
    "question": "中国最长的运河是？",
    "options": [
      "红旗渠",
      "京杭大运河",
      "都江堰",
      "灵渠"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 270,
    "question": "中国南北气候分界线大致是？",
    "options": [
      "秦岭—淮河线",
      "长城—黄河线",
      "珠江—浙岭线",
      "南岭—北江线"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 271,
    "question": "舟山渔场位于？",
    "options": [
      "黄海",
      "南海",
      "东海",
      "渤海"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 272,
    "question": "中国的钢铁工业中心之一是？",
    "options": [
      "厦门",
      "昆明",
      "西安",
      "鞍山"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 273,
    "question": "中国著名的三峡工程位于？",
    "options": [
      "澜沧江",
      "长江",
      "黄河",
      "珠江"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 274,
    "question": "我国最南端的领土是？",
    "options": [
      "南沙群岛",
      "曾母暗沙",
      "海南岛",
      "西沙群岛"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 275,
    "question": "我国降水最丰富的地区是？",
    "options": [
      "东南沿海",
      "西北内陆",
      "华北平原",
      "东北平原"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 276,
    "question": "九寨沟风景区位于？",
    "options": [
      "云南",
      "甘肃",
      "西藏",
      "四川"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 277,
    "question": "中国最大的草原位于？",
    "options": [
      "青藏高原",
      "黄土高原",
      "内蒙古高原",
      "东北平原"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 278,
    "question": "黄土高原主要分布在？",
    "options": [
      "江苏、安徽、河南",
      "四川、重庆、贵州",
      "陕西、山西、甘肃",
      "黑龙江、吉林、辽宁"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 279,
    "question": "中国沿海线最长的省是？",
    "options": [
      "山东",
      "福建",
      "广东",
      "海南"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 280,
    "question": "“东方明珠”常用来形容哪座城市？",
    "options": [
      "深圳",
      "广州",
      "香港",
      "上海"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 281,
    "question": "我国最大的群岛是？",
    "options": [
      "西沙群岛",
      "南沙群岛",
      "澎湖列岛",
      "舟山群岛"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 282,
    "question": "火焰山位于哪座盆地？",
    "options": [
      "准噶尔盆地",
      "四川盆地",
      "吐鲁番盆地",
      "塔里木盆地"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 283,
    "question": "黑龙江是哪条边境河？",
    "options": [
      "中俄边境",
      "中缅边境",
      "中印边境",
      "中朝边境"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 284,
    "question": "西双版纳属于哪个省份？",
    "options": [
      "广西",
      "云南",
      "贵州",
      "四川"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 285,
    "question": "中国纬度最高的省份是？",
    "options": [
      "吉林",
      "黑龙江",
      "内蒙古",
      "辽宁"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 286,
    "question": "秦岭的地理意义是？",
    "options": [
      "南北气候分界",
      "东部与西部分界",
      "山区与平原分界",
      "中原与西南分界"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 287,
    "question": "我国最大的三角洲是？",
    "options": [
      "黄河三角洲",
      "长江三角洲",
      "珠江三角洲",
      "辽河三角洲"
    ],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 288,
    "question": "中国降水最少的地方是？",
    "options": [
      "黄土高原",
      "内蒙古草原",
      "柴达木盆地",
      "塔克拉玛干沙漠"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 289,
    "question": "新疆的主要农作物之一是？",
    "options": [
      "大豆",
      "棉花",
      "玉米",
      "水稻"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 290,
    "question": "港澳是指？",
    "options": [
      "台湾和香港",
      "珠海和厦门",
      "香港和澳门",
      "广州和深圳"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 291,
    "question": "云南的地形特点是？",
    "options": [
      "高原山地为主",
      "平原为主",
      "丘陵为主",
      "盆地为主"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 292,
    "question": "“世界屋脊”是指？",
    "options": [
      "内蒙古高原",
      "黄土高原",
      "青藏高原",
      "云贵高原"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 293,
    "question": "南水北调的水源地是？",
    "options": [
      "珠江流域",
      "黄河流域",
      "淮河流域",
      "长江流域"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 294,
    "question": "陇海铁路连接中国的？",
    "options": [
      "南北",
      "西南东北",
      "东西",
      "东南西北"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 295,
    "question": "台湾海峡位于？",
    "options": [
      "广东与海南之间",
      "福建与台湾之间",
      "台湾与日本之间",
      "浙江与台湾之间"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 296,
    "question": "中国最大的经济特区是？",
    "options": [
      "厦门",
      "深圳",
      "汕头",
      "珠海"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 297,
    "question": "四大高原中不包括？",
    "options": [
      "云贵高原",
      "华北平原",
      "黄土高原",
      "青藏高原"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 298,
    "question": "“天山南北”指的是哪个自治区？",
    "options": [
      "青海",
      "西藏",
      "新疆",
      "宁夏"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 299,
    "question": "黄河流经以下哪个省份？",
    "options": [
      "江苏",
      "陕西",
      "河南",
      "山西"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 300,
    "question": "纳木错湖位于哪个高原？",
    "options": [
      "鄱阳湖",
      "洞庭湖",
      "太湖",
      "纳木错"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 301,
    "question": "《青花瓷》的演唱者是？",
    "options": [
      "林俊杰",
      "周杰伦",
      "张学友",
      "王力宏"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 302,
    "question": "哪首歌曲是李宇春的代表作？",
    "options": [
      "遥远的她",
      "下个，路口，见",
      "淘汰",
      "当你"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 303,
    "question": "演唱《演员》的歌手是？",
    "options": [
      "李荣浩",
      "许嵩",
      "薛之谦",
      "张杰"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 304,
    "question": "《匆匆那年》的原唱是？",
    "options": [
      "田馥甄",
      "梁静茹",
      "李宇春",
      "王菲"
    ],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 305,
    "question": "哪位歌手演唱了《平凡之路》？",
    "options": [
      "汪峰",
      "朴树",
      "许巍",
      "李健"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 306,
    "question": "《遥远的她》是以下哪位歌手的代表作？",
    "options": [
      "郭富城",
      "张学友",
      "黎明",
      "刘德华"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 307,
    "question": "《突然好想你》的原唱是？",
    "options": [
      "SHE",
      "五月天",
      "林宥嘉",
      "林俊杰"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 308,
    "question": "哪位歌手演唱了《小幸运》？",
    "options": [
      "田馥甄",
      "孙燕姿",
      "范玮琪",
      "梁静茹"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 309,
    "question": "歌曲《江南》的演唱者是？",
    "options": [
      "王力宏",
      "潘玮柏",
      "周杰伦",
      "林俊杰"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 310,
    "question": "《告白气球》的原唱是？",
    "options": [
      "李荣浩",
      "张杰",
      "周杰伦",
      "林俊杰"
    ],
    "correct": 2,
    "category": "体育"
  },
  {
    "id": 311,
    "question": "《千千阙歌》是哪位女歌手演唱的？",
    "options": [
      "王菲",
      "邓丽君",
      "梅艳芳",
      "陈慧娴"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 312,
    "question": "《广岛之恋》的对唱组合是？",
    "options": [
      "莫文蔚和张洪量",
      "李宗盛和林忆莲",
      "王菲和谢霆锋",
      "陈奕迅和容祖儿"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 313,
    "question": "《会呼吸的痛》原唱是？",
    "options": [
      "萧亚轩",
      "梁静茹",
      "孙燕姿",
      "范玮琪"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 314,
    "question": "演唱《我们的爱》的乐队是？",
    "options": [
      "五月天",
      "F.I.R.",
      "信乐团",
      "逃跑计划"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 315,
    "question": "《后来》的演唱者是？",
    "options": [
      "莫文蔚",
      "刘若英",
      "王菲",
      "范晓萱"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 316,
    "question": "《演员》和《丑八怪》是哪位歌手的代表作？",
    "options": [
      "薛之谦",
      "许嵩",
      "李荣浩",
      "张杰"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 317,
    "question": "哪位歌手以《目不转睛》《雅俗共赏》走红？",
    "options": [
      "周杰伦",
      "李荣浩",
      "许嵩",
      "林俊杰"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 318,
    "question": "演唱《喜欢你》的是？",
    "options": [
      "邓紫棋",
      "蔡依林",
      "梁静茹",
      "林忆莲"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 319,
    "question": "《倒带》是哪位女歌手的代表作？",
    "options": [
      "王心凌",
      "蔡依林",
      "萧亚轩",
      "孙燕姿"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 320,
    "question": "《暗号》是周杰伦与哪位女歌手合唱的？",
    "options": [
      "蔡依林",
      "林俊杰",
      "徐若瑄",
      "温岚"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 321,
    "question": "歌曲《爱情转移》的演唱者是？",
    "options": [
      "陈奕迅",
      "王力宏",
      "林宥嘉",
      "张学友"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 322,
    "question": "《匆匆那年》的词作者是？",
    "options": [
      "方文山",
      "易家扬",
      "小寒",
      "林夕"
    ],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 323,
    "question": "哪位歌手演唱了《突然好想你》《温柔》？",
    "options": [
      "汪峰",
      "周传雄",
      "五月天",
      "信"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 324,
    "question": "歌曲《新不了情》的原唱是？",
    "options": [
      "那英",
      "万芳",
      "王菲",
      "张惠妹"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 325,
    "question": "哪首歌曲不是周杰伦的作品？",
    "options": [
      "双截棍",
      "匆匆那年",
      "晴天",
      "夜曲"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 326,
    "question": "哪位女歌手演唱了《梦醒时分》？",
    "options": [
      "张韶涵",
      "邓丽君",
      "陈淑桦",
      "王菲"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 327,
    "question": "《天黑黑》的原唱是哪位新加坡歌手？",
    "options": [
      "蔡健雅",
      "林俊杰",
      "孙燕姿",
      "阿杜"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 328,
    "question": "《菊花台》的演唱者是？",
    "options": [
      "李荣浩",
      "林俊杰",
      "薛之谦",
      "周杰伦"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 329,
    "question": "哪首歌曲不是林俊杰演唱的？",
    "options": [
      "她说",
      "不潮不用花钱",
      "江南",
      "简单爱"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 330,
    "question": "《爱的主打歌》是哪位歌手的代表作？",
    "options": [
      "蔡依林",
      "王心凌",
      "杨丞琳",
      "萧亚轩"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 331,
    "question": "歌曲《单车》是哪位男歌手的作品？",
    "options": [
      "周杰伦",
      "林俊杰",
      "薛之谦",
      "陈奕迅"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 332,
    "question": "《飘洋过海来看你》的原唱是谁？",
    "options": [
      "林忆莲",
      "娃娃",
      "黄莺莺",
      "李宗盛"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 333,
    "question": "《当你》的演唱者是？",
    "options": [
      "林俊杰",
      "张敬轩",
      "蔡依林",
      "林宥嘉"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 334,
    "question": "《会有那么一天》是哪位歌手演唱的？",
    "options": [
      "张信哲",
      "林俊杰",
      "范玮琪",
      "阿桑"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 335,
    "question": "《写给我的歌》是以下哪位歌手的作品？",
    "options": [
      "许嵩",
      "谢霆锋",
      "苏打绿",
      "黄义达"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 336,
    "question": "《王妃》的演唱者是？",
    "options": [
      "李荣浩",
      "信",
      "林俊杰",
      "萧敬腾"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 337,
    "question": "哪首不是五月天的歌曲？",
    "options": [
      "你不是真正的快乐",
      "星晴",
      "恋爱ing",
      "倔强"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 338,
    "question": "《一个像夏天一个像秋天》是谁唱的？",
    "options": [
      "蔡健雅",
      "田馥甄",
      "范玮琪",
      "梁静茹"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 339,
    "question": "《如果有如果》是哪位歌手演唱的？",
    "options": [
      "林俊杰",
      "李荣浩",
      "张靓颖",
      "林宥嘉"
    ],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 340,
    "question": "《雨一直下》的演唱者是？",
    "options": [
      "张宇",
      "周传雄",
      "陶喆",
      "任贤齐"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 341,
    "question": "《老男孩》是哪支组合的作品？",
    "options": [
      "南拳妈妈",
      "飞儿乐团",
      "筷子兄弟",
      "SHE"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 342,
    "question": "《洋葱》的原唱是？",
    "options": [
      "薛之谦",
      "林俊杰",
      "李荣浩",
      "杨宗纬"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 343,
    "question": "《最初的梦想》是哪位女歌手演唱的？",
    "options": [
      "范玮琪",
      "杨丞琳",
      "田馥甄",
      "张韶涵"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 344,
    "question": "《我怀念的》的演唱者是？",
    "options": [
      "梁静茹",
      "张韶涵",
      "孙楠",
      "孙燕姿"
    ],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 345,
    "question": "《背叛》的演唱者是？",
    "options": [
      "林志炫",
      "曹格",
      "品冠",
      "光良"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 346,
    "question": "《童话》的原唱是谁？",
    "options": [
      "曹格",
      "品冠",
      "林俊杰",
      "光良"
    ],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 347,
    "question": "《遥远的她》是哪位歌手的代表作？",
    "options": [
      "刘德华",
      "张学友",
      "李克勤",
      "陈奕迅"
    ],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 348,
    "question": "《匆匆那年》是哪位女歌手演唱的？",
    "options": [
      "那英",
      "王菲",
      "邓紫棋",
      "范晓萱"
    ],
    "correct": 1,
    "category": "历史"
  },
  {
    "id": 349,
    "question": "《不再让你孤单》的演唱者是？",
    "options": [
      "陈升",
      "王杰",
      "张宇",
      "李宗盛"
    ],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 350,
    "question": "《目不转睛》的原唱是？",
    "options": [
      "李荣浩",
      "薛之谦",
      "许嵩",
      "林俊杰"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 351,
    "question": "奥林匹克运动会每几年举办一次？",
    "options": [
      "4年",
      "2年",
      "3年",
      "5年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 352,
    "question": "姚明曾效力于哪支NBA球队？",
    "options": [
      "迈阿密热火",
      "休斯顿火箭",
      "芝加哥公牛",
      "洛杉矶湖人"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 353,
    "question": "下列哪位是著名的短跑运动员，被称为“飞人”？",
    "options": [
      "贝克汉姆",
      "乔丹",
      "博尔特",
      "费德勒"
    ],
    "correct": 2,
    "category": "体育"
  },
  {
    "id": 354,
    "question": "乒乓球起源于哪个国家？",
    "options": [
      "日本",
      "英国",
      "韩国",
      "中国"
    ],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 355,
    "question": "2022年冬奥会在哪个城市举行？",
    "options": [
      "东京",
      "平昌",
      "索契",
      "北京"
    ],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 356,
    "question": "足球比赛中，一场正式比赛的时间是？",
    "options": [
      "90分钟",
      "120分钟",
      "60分钟",
      "45分钟"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 357,
    "question": "网球比赛中获得四大满贯之一的赛事是？",
    "options": [
      "温网",
      "世界杯",
      "亚洲杯",
      "欧洲杯"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 358,
    "question": "世界上第一个突破百米跑10秒大关的运动员是？",
    "options": [
      "刘易斯",
      "黑斯",
      "鲍威尔",
      "博尔特"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 359,
    "question": "中国女排第一次获得世界冠军是哪一年？",
    "options": [
      "1981年",
      "1990年",
      "2016年",
      "2004年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 360,
    "question": "NBA中“飞人”是指哪位球星？",
    "options": [
      "杜兰特",
      "乔丹",
      "科比",
      "詹姆斯"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 361,
    "question": "羽毛球比赛中一局是多少分制？",
    "options": [
      "21分",
      "11分",
      "25分",
      "15分"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 362,
    "question": "刘翔是中国哪项田径项目的奥运冠军？",
    "options": [
      "110米栏",
      "跳远",
      "短跑",
      "三级跳"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 363,
    "question": "奥运会的五环标志象征什么？",
    "options": [
      "五大洲团结",
      "五国合作",
      "五个项目",
      "五年一次"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 364,
    "question": "世界杯足球赛每几年举办一次？",
    "options": [
      "4年",
      "2年",
      "3年",
      "5年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 365,
    "question": "马拉松比赛全程是多少公里？",
    "options": [
      "42.195公里",
      "10公里",
      "21.0975公里",
      "50公里"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 366,
    "question": "下列哪位中国运动员是乒乓球“大满贯”得主？",
    "options": [
      "马龙",
      "王皓",
      "张继科",
      "刘国梁"
    ],
    "correct": 2,
    "category": "体育"
  },
  {
    "id": 367,
    "question": "NBA现役被称为“詹皇”的球员是？",
    "options": [
      "詹姆斯",
      "杜兰特",
      "库里",
      "保罗"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 368,
    "question": "中国著名篮球运动员易建联效力过哪支CBA球队？",
    "options": [
      "广东宏远",
      "新疆飞虎",
      "北京首钢",
      "辽宁本钢"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 369,
    "question": "奥运会最初起源于哪个国家？",
    "options": [
      "希腊",
      "法国",
      "意大利",
      "英国"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 370,
    "question": "国际奥委会总部位于哪个城市？",
    "options": [
      "巴黎",
      "日内瓦",
      "洛桑",
      "伦敦"
    ],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 371,
    "question": "围棋比赛中最多有多少个黑白棋子？",
    "options": [
      "324",
      "361",
      "400",
      "289"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 372,
    "question": "足球比赛中，一个球队最多可以换几人？",
    "options": [
      "5人",
      "6人",
      "3人",
      "4人"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 373,
    "question": "花样滑冰属于哪种比赛项目？",
    "options": [
      "冬季奥运会",
      "夏季奥运会",
      "世锦赛",
      "全运会"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 374,
    "question": "在田径比赛中，“跳远”是靠什么起跳？",
    "options": [
      "踏板",
      "助跑线",
      "起跑器",
      "起跳板"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 375,
    "question": "“体操王子”李宁曾获几枚奥运奖牌？",
    "options": [
      "3枚金牌",
      "6枚金牌",
      "9枚金牌",
      "5枚金牌"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 376,
    "question": "中国获得第一枚奥运金牌的运动员是？",
    "options": [
      "李宁",
      "许海峰",
      "杨扬",
      "郑凤荣"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 377,
    "question": "网球运动中，四大满贯不包括？",
    "options": [
      "澳网",
      "中网",
      "法网",
      "美网"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 378,
    "question": "下列哪项不是田径项目？",
    "options": [
      "跳高",
      "举重",
      "标枪",
      "400米跑"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 379,
    "question": "中国男子足球历史最好成绩是？",
    "options": [
      "世界杯入围",
      "亚洲杯冠军",
      "世界杯小组出线",
      "世界杯决赛"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 380,
    "question": "世界羽联的简称是？",
    "options": [
      "FIFA",
      "BWF",
      "ATP",
      "NBA"
    ],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 381,
    "question": "下列哪位是著名游泳运动员？",
    "options": [
      "李娜",
      "孙杨",
      "马龙",
      "刘翔"
    ],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 382,
    "question": "李娜是哪项体育运动的世界冠军？",
    "options": [
      "网球",
      "乒乓球",
      "羽毛球",
      "体操"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 383,
    "question": "NBA每场比赛一共几节？",
    "options": [
      "4节",
      "3节",
      "5节",
      "2节"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 384,
    "question": "冬奥会每几年举办一次？",
    "options": [
      "4年",
      "2年",
      "3年",
      "5年"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 385,
    "question": "奥运圣火最后点燃的是？",
    "options": [
      "主火炬",
      "赛道",
      "领奖台",
      "观众席"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 386,
    "question": "世界足球明星C罗是哪国人？",
    "options": [
      "葡萄牙",
      "阿根廷",
      "西班牙",
      "巴西"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 387,
    "question": "NBA中最常见的“三双”是指哪三项统计数据？",
    "options": [
      "得分、篮板、助攻",
      "得分、失误、篮板",
      "得分、三分、罚球",
      "得分、盖帽、抢断"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 388,
    "question": "拳击比赛中，通常每回合几分钟？",
    "options": [
      "3分钟",
      "2分钟",
      "5分钟",
      "1分钟"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 389,
    "question": "排球中，每队场上最多几名运动员？",
    "options": [
      "6人",
      "7人",
      "5人",
      "4人"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 390,
    "question": "冬奥会常见项目不包括？",
    "options": [
      "跳水",
      "滑雪",
      "速滑",
      "冰壶"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 391,
    "question": "中国著名围棋选手柯洁的职业是？",
    "options": [
      "九段",
      "初段",
      "五段",
      "七段"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 392,
    "question": "围棋棋盘一共有多少个交叉点？",
    "options": [
      "361",
      "289",
      "400",
      "324"
    ],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 393,
    "question": "体操项目中不属于男子项目的是？",
    "options": [
      "吊环",
      "鞍马",
      "高低杠",
      "单杠"
    ],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 394,
    "question": "下列哪位是NBA中国第一人？",
    "options": [
      "姚明",
      "孙悦",
      "巴特尔",
      "易建联"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 395,
    "question": "“飞鱼”菲尔普斯是哪个国家的运动员？",
    "options": [
      "美国",
      "加拿大",
      "澳大利亚",
      "英国"
    ],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 396,
    "question": "世界一级方程式赛车简称为？",
    "options": [
      "F1",
      "F2",
      "GP",
      "A1"
    ],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 397,
    "question": "CBA是哪个体育项目的职业联赛？",
    "options": [
      "篮球",
      "足球",
      "排球",
      "乒乓球"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 398,
    "question": "NBA历史上总得分最多的球员是？",
    "options": [
      "詹姆斯",
      "乔丹",
      "科比",
      "贾巴尔"
    ],
    "correct": 0,
    "category": "历史"
  },
  {
    "id": 399,
    "question": "奥运金牌的主要材质是？",
    "options": [
      "镀金银牌",
      "铜合金",
      "铁合金",
      "纯金"
    ],
    "correct": 0,
    "category": "体育"
  },
  {
    "id": 400,
    "question": "篮球比赛中一次罚球最多可得几分？",
    "options": [
      "1分",
      "2分",
      "3分",
      "0分"
    ],
    "correct": 0,
    "category": "体育"
  }
];

module.exports = questions;