const questions = [
  {
    "id": 1,
    "question": "3 + 5 = ?",
    "options": ["7", "8", "9", "10"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 2,
    "question": "12 - 7 = ?",
    "options": ["4", "5", "6", "7"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 3,
    "question": "6 × 4 = ?",
    "options": ["20", "24", "28", "32"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 4,
    "question": "15 ÷ 3 = ?",
    "options": ["3", "4", "5", "6"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 5,
    "question": "一个三角形有几条边？",
    "options": ["2", "3", "4", "5"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 6,
    "question": "7 + 8 = ?",
    "options": ["14", "15", "16", "17"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 7,
    "question": "20 - 9 = ?",
    "options": ["9", "10", "11", "12"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 8,
    "question": "5 × 6 = ?",
    "options": ["25", "30", "35", "40"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 9,
    "question": "24 ÷ 4 = ?",
    "options": ["5", "6", "7", "8"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 10,
    "question": "一个正方形有几个角？",
    "options": ["3", "4", "5", "6"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 11,
    "question": "9 + 6 = ?",
    "options": ["13", "14", "15", "16"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 12,
    "question": "18 - 5 = ?",
    "options": ["11", "12", "13", "14"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 13,
    "question": "7 × 3 = ?",
    "options": ["18", "19", "20", "21"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 14,
    "question": "36 ÷ 6 = ?",
    "options": ["5", "6", "7", "8"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 15,
    "question": "一天有多少小时？",
    "options": ["20", "22", "24", "26"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 16,
    "question": "4 + 9 = ?",
    "options": ["11", "12", "13", "14"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 17,
    "question": "25 - 8 = ?",
    "options": ["15", "16", "17", "18"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 18,
    "question": "8 × 5 = ?",
    "options": ["35", "40", "45", "50"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 19,
    "question": "42 ÷ 7 = ?",
    "options": ["5", "6", "7", "8"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 20,
    "question": "一个圆有几条边？",
    "options": ["0", "1", "2", "无数"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 21,
    "question": "11 + 7 = ?",
    "options": ["16", "17", "18", "19"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 22,
    "question": "30 - 12 = ?",
    "options": ["16", "17", "18", "19"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 23,
    "question": "9 × 4 = ?",
    "options": ["32", "34", "36", "38"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 24,
    "question": "56 ÷ 8 = ?",
    "options": ["6", "7", "8", "9"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 25,
    "question": "一周有几天？",
    "options": ["5", "6", "7", "8"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 26,
    "question": "13 + 9 = ?",
    "options": ["20", "21", "22", "23"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 27,
    "question": "40 - 15 = ?",
    "options": ["23", "24", "25", "26"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 28,
    "question": "6 × 7 = ?",
    "options": ["40", "41", "42", "43"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 29,
    "question": "63 ÷ 9 = ?",
    "options": ["6", "7", "8", "9"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 30,
    "question": "一年有几个月？",
    "options": ["10", "11", "12", "13"],
    "correct": 2,
    "category": "数学"
  },
  {
    "id": 31,
    "question": "下列哪个字的读音是正确的？",
    "options": ["着(zhuó)急", "着(zháo)急", "着(zhāo)急", "着(zhe)急"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 32,
    "question": "《静夜思》的作者是？",
    "options": ["杜甫", "李白", "白居易", "王维"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 33,
    "question": "下列哪个字的部首是\"氵\"？",
    "options": ["火", "河", "花", "和"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 35,
    "question": "成语\"画龙点睛\"的意思是？",
    "options": ["画画很好", "最后加上关键的一笔", "龙很厉害", "眼睛很亮"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 37,
    "question": "\"春眠不觉晓\"的下一句是？",
    "options": ["处处闻啼鸟", "夜来风雨声", "花落知多少", "鸟语花香来"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 39,
    "question": "下列哪个词语的意思是\"很快\"？",
    "options": ["慢慢吞吞", "风驰电掣", "步步为营", "小心翼翼"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 41,
    "question": "拼音\"zhǔ\"的声调是第几声？",
    "options": ["第一声", "第二声", "第三声", "第四声"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 42,
    "question": "\"桃花潭水深千尺\"出自哪首诗？",
    "options": ["《赠汪伦》", "《静夜思》", "《春晓》", "《咏柳》"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 43,
    "question": "下列哪个字是象形字？",
    "options": ["好", "山", "从", "花"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 45,
    "question": "成语\"守株待兔\"告诉我们什么道理？",
    "options": ["要勤劳工作", "不能有侥幸心理", "兔子很可爱", "树很重要"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 47,
    "question": "\"床前明月光\"中的\"床\"指的是？",
    "options": ["睡觉的床", "井床", "河床", "花床"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 48,
    "question": "下列哪个字的笔画数是8画？",
    "options": ["田", "果", "学", "书"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 49,
    "question": "成语\"亡羊补牢\"的意思是？",
    "options": ["羊跑了", "修补羊圈", "出了问题及时补救", "数羊睡觉"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 50,
    "question": "\"小荷才露尖尖角\"的下一句是？",
    "options": ["早有蜻蜓立上头", "清香阵阵来", "绿叶满池塘", "夏日炎炎时"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 51,
    "question": "下列哪个字的偏旁是\"木\"？",
    "options": ["林", "水", "火", "土"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 53,
    "question": "《咏鹅》的作者是？",
    "options": ["李白", "杜甫", "骆宾王", "王维"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 55,
    "question": "成语\"滥竽充数\"告诉我们？",
    "options": ["要诚实，不能弄虚作假", "竽很好听", "数学很重要", "要多练习"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 56,
    "question": "\"谁知盘中餐，粒粒皆辛苦\"告诉我们要？",
    "options": ["多吃饭", "珍惜粮食", "学会做饭", "种地很累"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 57,
    "question": "下列哪组词语都是反义词？",
    "options": ["大小、高低", "红绿、黑白", "东西、南北", "以上都是"],
    "correct": 3,
    "category": "语文"
  },
  {
    "id": 59,
    "question": "拼音中，下列哪个是韵母？",
    "options": ["b", "p", "a", "m"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 34,
    "question": "下列哪个词语是错误的？",
    "options": ["川流不息", "川流不止", "络绎不绝", "源源不断"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 36,
    "question": "下列哪个字是多音字？",
    "options": ["山", "水", "行", "人"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 38,
    "question": "形容学习勤奋的成语是？",
    "options": ["守株待兔", "凿壁偷光", "画蛇添足", "杯弓蛇影"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 40,
    "question": "下列哪个字的笔画数最多？",
    "options": ["火", "水", "木", "土"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 44,
    "question": "下列哪个字是象形字？",
    "options": ["明", "休", "山", "好"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 46,
    "question": "形容时间过得很快的成语是？",
    "options": ["度日如年", "光阴似箭", "天长地久", "一刻千金"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 52,
    "question": "形容学习进步很快的成语是？",
    "options": ["突飞猛进", "裹足不前", "停滞不前", "原地踏步"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 54,
    "question": "下列哪个字是会意字？",
    "options": ["山", "水", "明", "人"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 58,
    "question": "形容东西很珍贵的成语是？",
    "options": ["一文不值", "价值连城", "分文不取", "不值一提"],
    "correct": 1,
    "category": "语文"
  },
  {
    "id": 60,
    "question": "下列哪个字的声调是第三声？",
    "options": ["妈", "麻", "马", "骂"],
    "correct": 2,
    "category": "语文"
  },
  {
    "id": 61,
    "question": "苹果用英语怎么说？",
    "options": ["Orange", "Apple", "Banana", "Grape"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 62,
    "question": "What color is the sun?",
    "options": ["Blue", "Green", "Yellow", "Red"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 63,
    "question": "\"你好\"用英语怎么说？",
    "options": ["Goodbye", "Hello", "Thank you", "Sorry"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 64,
    "question": "How many days are there in a week?",
    "options": ["Five", "Six", "Seven", "Eight"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 65,
    "question": "猫用英语怎么说？",
    "options": ["Dog", "Cat", "Bird", "Fish"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 66,
    "question": "What do you say when you meet someone?",
    "options": ["Goodbye", "Good night", "Hello", "See you"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 67,
    "question": "书用英语怎么说？",
    "options": ["Book", "Pen", "Paper", "Desk"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 68,
    "question": "I _____ a student.",
    "options": ["am", "is", "are", "be"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 69,
    "question": "红色用英语怎么说？",
    "options": ["Blue", "Green", "Yellow", "Red"],
    "correct": 3,
    "category": "英语"
  },
  {
    "id": 70,
    "question": "What's your name? 的意思是？",
    "options": ["你几岁？", "你叫什么名字？", "你好吗？", "你在哪里？"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 71,
    "question": "狗用英语怎么说？",
    "options": ["Cat", "Dog", "Pig", "Cow"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 72,
    "question": "She _____ from China.",
    "options": ["am", "is", "are", "be"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 73,
    "question": "一到十中，哪个数字是\"three\"？",
    "options": ["2", "3", "4", "5"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 74,
    "question": "Good morning! 是什么意思？",
    "options": ["晚上好", "下午好", "早上好", "晚安"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 75,
    "question": "铅笔用英语怎么说？",
    "options": ["Pen", "Pencil", "Book", "Paper"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 76,
    "question": "They _____ my friends.",
    "options": ["am", "is", "are", "be"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 77,
    "question": "Thank you! 的回答通常是？",
    "options": ["Hello", "Goodbye", "You're welcome", "Good night"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 78,
    "question": "水用英语怎么说？",
    "options": ["Fire", "Water", "Air", "Earth"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 79,
    "question": "What color is grass?",
    "options": ["Red", "Blue", "Green", "Yellow"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 80,
    "question": "妈妈用英语怎么说？",
    "options": ["Father", "Mother", "Sister", "Brother"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 81,
    "question": "I have _____ apple.",
    "options": ["a", "an", "the", "some"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 82,
    "question": "How old are you? 是什么意思？",
    "options": ["你好吗？", "你叫什么？", "你几岁？", "你在哪？"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 83,
    "question": "学校用英语怎么说？",
    "options": ["Home", "School", "Park", "Store"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 84,
    "question": "This _____ a car.",
    "options": ["am", "is", "are", "be"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 85,
    "question": "Goodbye! 是什么意思？",
    "options": ["你好", "再见", "谢谢", "对不起"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 86,
    "question": "鸟用英语怎么说？",
    "options": ["Bird", "Fish", "Pig", "Horse"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 87,
    "question": "We _____ happy.",
    "options": ["am", "is", "are", "be"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 88,
    "question": "What's this? 的意思是？",
    "options": ["这是谁？", "这是什么？", "这在哪？", "这多少？"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 89,
    "question": "椅子用英语怎么说？",
    "options": ["Table", "Chair", "Bed", "Door"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 90,
    "question": "I like _____ play games.",
    "options": ["to", "for", "in", "at"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 91,
    "question": "Please 的意思是？",
    "options": ["谢谢", "请", "对不起", "再见"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 92,
    "question": "太阳用英语怎么说？",
    "options": ["Moon", "Star", "Sun", "Sky"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 93,
    "question": "How are you? 的常用回答是？",
    "options": ["I'm fine", "Good morning", "Thank you", "You're welcome"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 94,
    "question": "手用英语怎么说？",
    "options": ["Foot", "Head", "Hand", "Eye"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 95,
    "question": "There _____ many books on the desk.",
    "options": ["am", "is", "are", "be"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 96,
    "question": "Nice to meet you! 是什么意思？",
    "options": ["很高兴见到你", "你好吗", "再见", "谢谢你"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 97,
    "question": "房子用英语怎么说？",
    "options": ["Car", "Tree", "House", "Road"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 98,
    "question": "My name _____ Tom.",
    "options": ["am", "is", "are", "be"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 99,
    "question": "Where are you from? 是什么意思？",
    "options": ["你去哪里？", "你从哪里来？", "你在哪里？", "你要什么？"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 100,
    "question": "老师用英语怎么说？",
    "options": ["Student", "Teacher", "Doctor", "Driver"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 101,
    "question": "若 x + 3 = 8，则 x 等于？",
    "options": ["3", "5", "8", "11"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 102,
    "question": "解方程：2x - 4 = 6，x = ?",
    "options": ["5", "6", "1", "2"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 103,
    "question": "展开 (a + b)^2 的结果是？",
    "options": ["a² + b²", "a² - b²", "a² - 2ab + b²", "a² + 2ab + b²"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 104,
    "question": "下列哪个是一次函数？",
    "options": ["y = 2x + 1", "y = 1/x", "y = √x", "y = x²"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 105,
    "question": "一个三角形的内角和是多少度？",
    "options": ["180°", "270°", "360°", "90°"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 106,
    "question": "一个圆的周长公式是？",
    "options": ["2πr", "πr²", "πd²", "r²"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 107,
    "question": "直角三角形中，一个锐角最大是几度？",
    "options": ["91", "90", "45", "89"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 108,
    "question": "一个等边三角形每个内角是？",
    "options": ["60°", "30°", "90°", "45°"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 109,
    "question": "下列哪个数是质数？",
    "options": ["7", "9", "15", "21"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 110,
    "question": "-3 的平方是多少？",
    "options": ["6", "9", "-9", "-6"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 111,
    "question": "5 的立方是？",
    "options": ["25", "125", "100", "15"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 112,
    "question": "最大公因数是？",
    "options": ["最大公约数", "两个数的平均值", "所有因数的和", "最大整数"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 113,
    "question": "60千米/小时行驶3小时，行驶多少千米？",
    "options": ["60", "90", "180", "120"],
    "correct": 2,
    "category": "科学"
  },
  {
    "id": 114,
    "question": "一本书400页，小明每天读20页，需要几天读完？",
    "options": ["10", "30", "20", "40"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 115,
    "question": "水池放水管3小时放完，开两个管同时放需要？",
    "options": ["2小时", "3小时", "6小时", "1.5小时"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 116,
    "question": "a与b成正比例，a=2时b=6，则a=4时b=?",
    "options": ["6", "8", "10", "12"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 117,
    "question": "y = 3x 是？",
    "options": ["一次函数", "对数函数", "指数函数", "二次函数"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 118,
    "question": "y = x² 图像是？",
    "options": ["抛物线", "圆", "正弦曲线", "直线"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 119,
    "question": "y = x 的图像通过？",
    "options": ["原点", "(0,1)", "(1,1)", "(1,0)"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 120,
    "question": "函数图像中，y 随 x 增大而减小，函数是？",
    "options": ["反比例函数", "一次函数", "常数函数", "正比例函数"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 121,
    "question": "解不等式：x + 2 < 5",
    "options": ["x = 3", "x > 3", "x < 2", "x < 3"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 122,
    "question": "解一元一次方程：3x = 12",
    "options": ["x = 4", "x = 5", "x = 3", "x = 6"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 123,
    "question": "ax²+bx+c=0的判别式是？",
    "options": ["b² - 4ac", "a² - 4bc", "b² + 4ac", "a² + b² + c²"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 124,
    "question": "不等式组 x > 2 且 x < 5 的解集是？",
    "options": ["2 < x < 5", "x > 5", "x = 3", "x < 2"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 125,
    "question": "100除以4的商是？",
    "options": ["25", "20", "40", "30"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 126,
    "question": "π的近似值是多少？",
    "options": ["3.14", "2.17", "1.73", "3.41"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 127,
    "question": "√81 的值是多少？",
    "options": ["9", "7", "10", "8"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 128,
    "question": "60% 等于多少？",
    "options": ["0.06", "0.6", "6", "60"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 129,
    "question": "-5 + 7 的结果是？",
    "options": ["12", "-2", "1", "2"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 130,
    "question": "一个角是锐角，则它的度数范围是？",
    "options": ["0°~90°", "90°~180°", "90°整", "大于180°"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 131,
    "question": "x² = 16 的正解是？",
    "options": ["-4", "4", "2", "8"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 132,
    "question": "3的倒数是？",
    "options": ["1/3", "0.3", "-3", "3"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 133,
    "question": "10的平方根是？",
    "options": ["√10", "100", "5", "10"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 134,
    "question": "方程x²-1=0的解是？",
    "options": ["x=1或-1", "x=-1", "x=0", "x=1"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 135,
    "question": "一个三角形最多有几个钝角？",
    "options": ["1", "2", "3", "0"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 136,
    "question": "一个角的补角是60°，这个角是？",
    "options": ["120°", "30°", "60°", "90°"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 137,
    "question": "“正方体”有多少个面？",
    "options": ["6", "8", "4", "12"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 138,
    "question": "一个长方体的体积公式是？",
    "options": ["长×宽×高", "长+宽+高", "长×宽", "底×高"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 139,
    "question": "方程组有唯一解的条件是？",
    "options": ["两直线相交", "平行", "重合", "无解"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 140,
    "question": "a² - b² 可表示为？",
    "options": ["(a-b)(a+b)", "(a+b)²", "(a-b)²", "a² + b²"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 141,
    "question": "“绝对值”是？",
    "options": ["数到原点的距离", "相反数", "平方根", "整数倍"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 142,
    "question": "求一组数的平均数，需？",
    "options": ["总和除以个数", "总和乘以个数", "总和加倍", "最大数除最小数"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 143,
    "question": "1小时是几分钟？",
    "options": ["60", "100", "30", "90"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 144,
    "question": "最小的正整数是？",
    "options": ["1", "0", "2", "-1"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 145,
    "question": "小数0.5化为百分数是？",
    "options": ["50%", "5%", "0.5%", "500%"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 146,
    "question": "3米是多少厘米？",
    "options": ["300", "30", "3", "1000"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 147,
    "question": "一个钟表的时针走一圈是几小时？",
    "options": ["12", "24", "6", "1"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 148,
    "question": "等腰三角形有几条边相等？",
    "options": ["2", "1", "3", "0"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 149,
    "question": "一个角是直角，它的度数是？",
    "options": ["90°", "60°", "120°", "180°"],
    "correct": 0,
    "category": "数学"
  },
  {
    "id": 150,
    "question": "20%的小数表示是？",
    "options": ["0.2", "2", "0.02", "20"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 151,
    "question": "成语“画蛇添足”比喻什么？",
    "options": ["多此一举", "画画比赛", "添点装饰", "不劳而获"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 152,
    "question": "成语“井底之蛙”用来形容什么？",
    "options": ["见识狭窄", "顽皮捣蛋", "快乐的青蛙", "处境危险"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 153,
    "question": "成语“爱不释手”形容？",
    "options": ["东西太重", "不愿借出", "拿得太紧", "非常喜欢"],
    "correct": 3,
    "category": "语文"
  },
  {
    "id": 154,
    "question": "成语“一见如故”形容？",
    "options": ["初见就争吵", "互相敌对", "看起来像以前见过", "刚见面就像老朋友"],
    "correct": 3,
    "category": "语文"
  },
  {
    "id": 155,
    "question": "“汉”的拼音是？",
    "options": ["hàn", "hā", "hǎn", "hēn"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 156,
    "question": "下列哪个字的拼音是“shū”？",
    "options": ["书", "数", "树", "属"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 157,
    "question": "“老师”一词中“师”的拼音是？",
    "options": ["shī", "shǐ", "sī", "sì"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 158,
    "question": "“苹果”的“苹”的拼音是？",
    "options": ["píng", "pìng", "bǐng", "bīng"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 159,
    "question": "“白日依山尽，黄河入海流”出自哪位诗人？",
    "options": ["王之涣", "李白", "杜甫", "孟浩然"],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 160,
    "question": "“床前明月光”的下一句是？",
    "options": ["疑是地上霜", "低头思故乡", "月出惊山鸟", "举头望明月"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 161,
    "question": "“桃花潭水深千尺，不及汪伦送我情”是谁写的？",
    "options": ["李白", "杜甫", "白居易", "贺知章"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 162,
    "question": "“劝君更尽一杯酒，西出阳关无故人”中“阳关”是？",
    "options": ["地名", "酒名", "人名", "官名"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 163,
    "question": "“我喜欢画画。”中“喜欢”是？",
    "options": ["动词", "副词", "形容词", "名词"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 164,
    "question": "“他跑得真快！”中“得”是？",
    "options": ["助词", "副词", "形容词", "名词"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 165,
    "question": "“我们正在吃饭。”中的“正在”表示？",
    "options": ["进行时", "过去时", "将来时", "完成时"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 166,
    "question": "“花儿开了。”是？",
    "options": ["陈述句", "感叹句", "疑问句", "祈使句"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 167,
    "question": "下列哪个词语搭配正确？",
    "options": ["明亮的灯光", "温柔的刀", "安静的雷", "高兴的石头"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 168,
    "question": "下列哪个词语使用正确？",
    "options": ["美丽的风景", "美丽的气味", "美丽的声音", "美丽的味道"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 169,
    "question": "“洁白的___”填哪个最合适？",
    "options": ["羽毛", "风格", "声音", "味道"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 170,
    "question": "“飞快地___”填哪个最合适？",
    "options": ["跑", "听", "说", "写"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 171,
    "question": "写人记事要写出？",
    "options": ["人物特点", "作文格式", "风景名胜", "物品价格"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 172,
    "question": "写景文章常用的顺序是？",
    "options": ["空间顺序", "人物顺序", "时间顺序", "逻辑顺序"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 173,
    "question": "日记中应包含？",
    "options": ["日期和天气", "诗歌", "谜语", "广告语"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 174,
    "question": "“我爱我的祖国”属于？",
    "options": ["中心句", "疑问句", "比喻句", "感叹句"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 175,
    "question": "“耳”字的偏旁部首是？",
    "options": ["耳", "口", "又", "目"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 176,
    "question": "“学校”的“校”是什么意思？",
    "options": ["教育机构", "声音", "树木", "植物"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 177,
    "question": "“奔跑”的近义词是？",
    "options": ["疾走", "跳跃", "爬行", "飞翔"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 178,
    "question": "“高兴”的反义词是？",
    "options": ["悲伤", "快乐", "幸福", "喜悦"],
    "correct": 0,
    "category": "语文"
  },
  {
    "id": 179,
    "question": "“风雨交加”的意思是？",
    "options": ["风和雨同时出现", "晴朗无风", "只有雨没有风", "下雪和打雷"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 180,
    "question": "下列哪个不是标点符号？",
    "options": ["句号", "括号", "问号", "字母"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 181,
    "question": "“太阳从东方升起”是？",
    "options": ["事实句", "夸张句", "祈使句", "疑问句"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 182,
    "question": "“我家门前有条小河。”中“有”是？",
    "options": ["动词", "形容词", "代词", "名词"],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 183,
    "question": "“竹林”是？",
    "options": ["合成词", "量词", "代词", "虚词"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 184,
    "question": "“火”字的结构是？",
    "options": ["独体字", "半包围结构", "上下结构", "左右结构"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 185,
    "question": "“青”字的笔画数是？",
    "options": ["8", "9", "6", "7"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 186,
    "question": "“江山如画”比喻？",
    "options": ["风景美丽", "战争激烈", "人物众多", "天气晴朗"],
    "correct": 0,
    "category": "地理"
  },
  {
    "id": 187,
    "question": "“春回大地”的含义是？",
    "options": ["春天来了", "天气变冷", "秋天来临", "地震发生"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 188,
    "question": "“学习雷锋好榜样”这句话的句式是？",
    "options": ["陈述句", "疑问句", "感叹句", "祈使句"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 189,
    "question": "“不耻下问”的含义是？",
    "options": ["虚心向他人请教", "不愿回答问题", "反复发问", "骄傲自大"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 190,
    "question": "“自相矛盾”原意是？",
    "options": ["前后不一致", "拿着矛和盾", "说话冲突", "打仗失败"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 191,
    "question": "“四面楚歌”用来形容？",
    "options": ["孤立无援", "歌声四起", "战斗激烈", "胜券在握"],
    "correct": 0,
    "category": "音乐"
  },
  {
    "id": 192,
    "question": "“掩耳盗铃”说明什么？",
    "options": ["自欺欺人", "小偷行为", "掩盖声音", "敲响警钟"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 193,
    "question": "“囫囵吞枣”比喻？",
    "options": ["不加分析地接受", "吃得太快", "爱吃水果", "误吞东西"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 194,
    "question": "“画龙点睛”的含义是？",
    "options": ["使内容更精彩", "画画技巧", "画龙比赛", "点眼睛动作"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 195,
    "question": "“滥竽充数”的意思是？",
    "options": ["混在其中冒充好", "乐器种类多", "喜欢吹竽", "齐国风俗"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 196,
    "question": "“三心二意”的人是？",
    "options": ["做事不专心", "心地善良", "心思缜密", "心灵手巧"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 197,
    "question": "“闻鸡起舞”的人是？",
    "options": ["刻苦自勉", "睡懒觉", "好打架", "练唱歌"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 198,
    "question": "“守株待兔”讽刺什么？",
    "options": ["不劳而获的想法", "种树养兔", "农夫种地", "爱吃兔肉"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 199,
    "question": "“刻舟求剑”说明？",
    "options": ["方法不当", "在水上刻字", "买剑失败", "造船技术"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 200,
    "question": "“盲人摸象”的寓意是？",
    "options": ["片面了解事物", "眼睛看不见", "动物很大", "大象难摸"],
    "correct": 0,
    "category": "常识"
  },
  {
    "id": 201,
    "question": "She ___ to school every day.",
    "options": ["goes", "go", "went", "going"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 202,
    "question": "I ___ my homework yesterday.",
    "options": ["done", "doing", "did", "do"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 203,
    "question": "They ___ TV now.",
    "options": ["are watching", "will watch", "watch", "watched"],
    "correct": 0,
    "category": "英语"
  },
  {
    "id": 204,
    "question": "We ___ an English movie next weekend.",
    "options": ["watched", "will watch", "are watching", "watch"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 205,
    "question": "There is ___ apple on the table.",
    "options": ["a", "an", "the", "some"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 206,
    "question": "Tom has two ___",
    "options": ["pen", "penes", "pens", "pen's"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 207,
    "question": "My brother is ___ than me.",
    "options": ["tallest", "more tall", "taller", "tall"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 208,
    "question": "This book is ___ than that one.",
    "options": ["most interesting", "more interesting", "interest", "interesting"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 209,
    "question": "This is ___ book.",
    "options": ["I", "mine", "my", "me"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 210,
    "question": "___ is raining outside.",
    "options": ["That", "It", "This", "He"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 211,
    "question": "Do you like apples? — Yes, ___.",
    "options": ["I like", "I do", "I am", "I don’t"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 212,
    "question": "Is this your pen? — No, it isn’t ___.",
    "options": ["me", "mine", "I", "my"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 213,
    "question": "The cat is ___ the table.",
    "options": ["in", "on", "by", "at"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 214,
    "question": "He was born ___ May.",
    "options": ["at", "in", "on", "for"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 215,
    "question": "I like English ___ I don’t like math.",
    "options": ["so", "but", "and", "or"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 216,
    "question": "He didn’t go to school ___ he was ill.",
    "options": ["so", "because", "and", "but"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 217,
    "question": "I usually go to school ___ bus.",
    "options": ["in", "by", "at", "on"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 218,
    "question": "Please ___ the lights before you leave.",
    "options": ["turn over", "turn off", "turn up", "turn on"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 219,
    "question": "Neither Tom nor I ___ a teacher.",
    "options": ["are", "am", "is", "be"],
    "correct": 1,
    "category": "英语"
  },
  {
    "id": 220,
    "question": "Ten years ___ a long time.",
    "options": ["were", "are", "be", "is"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 221,
    "question": "You ___ smoke here. It’s a hospital.",
    "options": ["can", "may", "need", "mustn’t"],
    "correct": 3,
    "category": "英语"
  },
  {
    "id": 222,
    "question": "___ I ask you a question?",
    "options": ["Will", "Should", "Must", "May"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 223,
    "question": "Mount Everest is the ___ mountain.",
    "options": ["tall", "most tall", "taller", "tallest"],
    "correct": 3,
    "category": "英语"
  },
  {
    "id": 224,
    "question": "Jim runs ___ than Tom.",
    "options": ["fast", "fastest", "faster", "more fast"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 225,
    "question": "___ a beautiful day!",
    "options": ["When", "How", "What", "Which"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 226,
    "question": "___ clever the boy is!",
    "options": ["When", "What", "How", "Which"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 227,
    "question": "He is a ___ driver.",
    "options": ["caring", "care", "careful", "carefully"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 228,
    "question": "She sings ___.",
    "options": ["nice", "good", "well", "better"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 229,
    "question": "What time ___ you usually get up?",
    "options": ["does", "will", "do", "are"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 230,
    "question": "How ___ is it from here to the park?",
    "options": ["soon", "near", "far", "long"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 231,
    "question": "—How often do you exercise? — ___.",
    "options": ["For 2 hours", "Very much", "Twice a week", "At 5 o’clock"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 232,
    "question": "—Where is your father? — He is ___.",
    "options": ["teacher", "go to work", "in hospital", "sleep"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 233,
    "question": "We ___ friends since we met in 2020.",
    "options": ["will be", "are", "have been", "were"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 234,
    "question": "She is good at ___.",
    "options": ["sings", "to sing", "singing", "sing"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 235,
    "question": "He didn’t go to the party, ___ he?",
    "options": ["didn’t", "does", "did", "was"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 236,
    "question": "Would you like ___ tea?",
    "options": ["an", "a", "some", "any"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 237,
    "question": "The man ___ helped me is my uncle.",
    "options": ["which", "whom", "who", "where"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 238,
    "question": "Look! The children ___ football.",
    "options": ["play", "played", "are playing", "plays"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 239,
    "question": "Lucy and Lily are ___ the same age.",
    "options": ["to", "on", "about", "in"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 240,
    "question": "My mother asked me ___ up early.",
    "options": ["getting", "got", "to get", "get"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 241,
    "question": "There ___ a book on the desk.",
    "options": ["was", "are", "is", "were"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 242,
    "question": "She was born ___ a cold winter night.",
    "options": ["in", "at", "on", "by"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 243,
    "question": "It’s time ___ home.",
    "options": ["going", "go", "to go", "gone"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 244,
    "question": "He is the ___ of the two boys.",
    "options": ["tallest", "tall", "taller", "more tall"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 245,
    "question": "This question is ___ difficult for me.",
    "options": ["very", "much", "too", "so"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 246,
    "question": "Don’t be afraid ___ making mistakes.",
    "options": ["to", "for", "of", "at"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 247,
    "question": "I have no idea ___ he will come.",
    "options": ["who", "what", "if", "how"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 248,
    "question": "The students stopped ___ .",
    "options": ["to talk", "talk", "talking", "talked"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 249,
    "question": "Not only you but also he ___ wrong.",
    "options": ["be", "are", "is", "am"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 250,
    "question": "English ___ in many countries.",
    "options": ["is speaking", "speaks", "is spoken", "spoke"],
    "correct": 2,
    "category": "英语"
  },
  {
    "id": 251,
    "question": "中国的首都是哪座城市？",
    "options": ["上海", "西安", "北京", "广州"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 252,
    "question": "中国面积最大的省级行政区是？",
    "options": ["内蒙古", "西藏", "青海", "新疆"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 253,
    "question": "长江的源头位于？",
    "options": ["秦岭", "青藏高原", "四川盆地", "云南高原"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 254,
    "question": "中国的第一大河是？",
    "options": ["珠江", "黄河", "长江", "松花江"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 255,
    "question": "中国人口最多的省份是？",
    "options": ["江苏", "广东", "山东", "河南"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 256,
    "question": "“鱼米之乡”主要指？",
    "options": ["云贵高原", "黄土高原", "长江中下游平原", "东北平原"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 257,
    "question": "中国最大的淡水湖是？",
    "options": ["青海湖", "鄱阳湖", "洞庭湖", "太湖"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 258,
    "question": "中国最大的咸水湖是？",
    "options": ["太湖", "鄱阳湖", "青海湖", "柴达木湖"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 259,
    "question": "中国的地势特点是？",
    "options": ["南高北低", "东高西低", "西高东低", "中间高四周低"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 260,
    "question": "黄河注入的海洋是？",
    "options": ["黄海", "渤海", "南海", "东海"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 261,
    "question": "中国最高的山峰是？",
    "options": ["贡嘎山", "珠穆朗玛峰", "乔戈里峰", "梅里雪山"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 262,
    "question": "珠穆朗玛峰位于哪两个国家边界？",
    "options": ["中国和印度", "中国和尼泊尔", "中国和巴基斯坦", "中国和不丹"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 263,
    "question": "中国四大盆地中面积最大的是？",
    "options": ["四川盆地", "塔里木盆地", "柴达木盆地", "准噶尔盆地"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 264,
    "question": "中国四大高原中面积最大的是？",
    "options": ["黄土高原", "青藏高原", "内蒙古高原", "云贵高原"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 265,
    "question": "中国重要的稀土资源集中在？",
    "options": ["贵州", "黑龙江", "云南", "内蒙古"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 266,
    "question": "海南岛位于中国哪个海域？",
    "options": ["东海", "南海", "黄海", "渤海"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 267,
    "question": "中国夏季气温最高的地区常出现在？",
    "options": ["广州", "北京", "武汉", "吐鲁番"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 268,
    "question": "被称为“天府之国”的是？",
    "options": ["东北平原", "华北平原", "四川盆地", "江南丘陵"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 269,
    "question": "中国最长的运河是？",
    "options": ["红旗渠", "京杭大运河", "都江堰", "灵渠"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 270,
    "question": "中国南北气候分界线大致是？",
    "options": ["珠江—浙岭线", "长城—黄河线", "秦岭—淮河线", "南岭—北江线"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 271,
    "question": "舟山渔场位于？",
    "options": ["黄海", "南海", "东海", "渤海"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 272,
    "question": "中国的钢铁工业中心之一是？",
    "options": ["厦门", "昆明", "西安", "鞍山"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 273,
    "question": "中国著名的三峡工程位于？",
    "options": ["澜沧江", "长江", "黄河", "珠江"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 274,
    "question": "我国最南端的领土是？",
    "options": ["南沙群岛", "曾母暗沙", "海南岛", "西沙群岛"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 275,
    "question": "我国降水最丰富的地区是？",
    "options": ["华北平原", "西北内陆", "东南沿海", "东北平原"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 276,
    "question": "九寨沟风景区位于？",
    "options": ["云南", "甘肃", "西藏", "四川"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 277,
    "question": "中国最大的草原位于？",
    "options": ["青藏高原", "黄土高原", "内蒙古高原", "东北平原"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 278,
    "question": "黄土高原主要分布在？",
    "options": ["江苏、安徽、河南", "四川、重庆、贵州", "陕西、山西、甘肃", "黑龙江、吉林、辽宁"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 279,
    "question": "中国沿海线最长的省是？",
    "options": ["山东", "福建", "广东", "海南"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 280,
    "question": "“东方明珠”常用来形容哪座城市？",
    "options": ["深圳", "广州", "香港", "上海"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 281,
    "question": "我国最大的群岛是？",
    "options": ["西沙群岛", "南沙群岛", "澎湖列岛", "舟山群岛"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 282,
    "question": "火焰山位于哪座盆地？",
    "options": ["准噶尔盆地", "四川盆地", "吐鲁番盆地", "塔里木盆地"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 283,
    "question": "黑龙江是哪条边境河？",
    "options": ["中印边境", "中缅边境", "中俄边境", "中朝边境"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 284,
    "question": "西双版纳属于哪个省份？",
    "options": ["广西", "云南", "贵州", "四川"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 285,
    "question": "中国纬度最高的省份是？",
    "options": ["吉林", "黑龙江", "内蒙古", "辽宁"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 286,
    "question": "秦岭的地理意义是？",
    "options": ["山区与平原分界", "东部与西部分界", "南北气候分界", "中原与西南分界"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 287,
    "question": "我国最大的三角洲是？",
    "options": ["黄河三角洲", "长江三角洲", "珠江三角洲", "辽河三角洲"],
    "correct": 1,
    "category": "数学"
  },
  {
    "id": 288,
    "question": "中国降水最少的地方是？",
    "options": ["黄土高原", "内蒙古草原", "柴达木盆地", "塔克拉玛干沙漠"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 289,
    "question": "新疆的主要农作物之一是？",
    "options": ["大豆", "棉花", "玉米", "水稻"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 290,
    "question": "港澳是指？",
    "options": ["台湾和香港", "珠海和厦门", "香港和澳门", "广州和深圳"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 291,
    "question": "云南的地形特点是？",
    "options": ["丘陵为主", "平原为主", "高原山地为主", "盆地为主"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 292,
    "question": "“世界屋脊”是指？",
    "options": ["内蒙古高原", "黄土高原", "青藏高原", "云贵高原"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 293,
    "question": "南水北调的水源地是？",
    "options": ["珠江流域", "黄河流域", "淮河流域", "长江流域"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 294,
    "question": "陇海铁路连接中国的？",
    "options": ["南北", "西南东北", "东西", "东南西北"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 295,
    "question": "台湾海峡位于？",
    "options": ["广东与海南之间", "福建与台湾之间", "台湾与日本之间", "浙江与台湾之间"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 296,
    "question": "中国最大的经济特区是？",
    "options": ["厦门", "深圳", "汕头", "珠海"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 297,
    "question": "四大高原中不包括？",
    "options": ["云贵高原", "华北平原", "黄土高原", "青藏高原"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 298,
    "question": "“天山南北”指的是哪个自治区？",
    "options": ["青海", "西藏", "新疆", "宁夏"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 299,
    "question": "黄河流经以下哪个省份？",
    "options": ["河南", "陕西", "江苏", "山西"],
    "correct": 2,
    "category": "地理"
  },
  {
    "id": 300,
    "question": "纳木错湖位于哪个高原？",
    "options": ["鄱阳湖", "洞庭湖", "太湖", "纳木错"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 301,
    "question": "《青花瓷》的演唱者是？",
    "options": ["林俊杰", "周杰伦", "张学友", "王力宏"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 302,
    "question": "哪首歌曲是李宇春的代表作？",
    "options": ["遥远的她", "下个，路口，见", "淘汰", "当你"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 303,
    "question": "演唱《演员》的歌手是？",
    "options": ["李荣浩", "许嵩", "薛之谦", "张杰"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 304,
    "question": "《匆匆那年》的原唱是？",
    "options": ["田馥甄", "梁静茹", "李宇春", "王菲"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 305,
    "question": "哪位歌手演唱了《平凡之路》？",
    "options": ["汪峰", "朴树", "许巍", "李健"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 306,
    "question": "《遥远的她》是以下哪位歌手的代表作？",
    "options": ["郭富城", "张学友", "黎明", "刘德华"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 307,
    "question": "《突然好想你》的原唱是？",
    "options": ["SHE", "五月天", "林宥嘉", "林俊杰"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 308,
    "question": "哪位歌手演唱了《小幸运》？",
    "options": ["范玮琪", "孙燕姿", "田馥甄", "梁静茹"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 309,
    "question": "歌曲《江南》的演唱者是？",
    "options": ["王力宏", "潘玮柏", "周杰伦", "林俊杰"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 310,
    "question": "《告白气球》的原唱是？",
    "options": ["李荣浩", "张杰", "周杰伦", "林俊杰"],
    "correct": 2,
    "category": "体育"
  },
  {
    "id": 311,
    "question": "《千千阙歌》是哪位女歌手演唱的？",
    "options": ["王菲", "邓丽君", "梅艳芳", "陈慧娴"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 312,
    "question": "《广岛之恋》的对唱组合是？",
    "options": ["王菲和谢霆锋", "李宗盛和林忆莲", "莫文蔚和张洪量", "陈奕迅和容祖儿"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 313,
    "question": "《会呼吸的痛》原唱是？",
    "options": ["萧亚轩", "梁静茹", "孙燕姿", "范玮琪"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 314,
    "question": "演唱《我们的爱》的乐队是？",
    "options": ["五月天", "F.I.R.", "信乐团", "逃跑计划"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 315,
    "question": "《后来》的演唱者是？",
    "options": ["莫文蔚", "刘若英", "王菲", "范晓萱"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 316,
    "question": "《演员》和《丑八怪》是哪位歌手的代表作？",
    "options": ["李荣浩", "许嵩", "薛之谦", "张杰"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 317,
    "question": "哪位歌手以《目不转睛》《雅俗共赏》走红？",
    "options": ["周杰伦", "李荣浩", "许嵩", "林俊杰"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 318,
    "question": "演唱《喜欢你》的是？",
    "options": ["梁静茹", "蔡依林", "邓紫棋", "林忆莲"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 319,
    "question": "《倒带》是哪位女歌手的代表作？",
    "options": ["王心凌", "蔡依林", "萧亚轩", "孙燕姿"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 320,
    "question": "《暗号》是周杰伦与哪位女歌手合唱的？",
    "options": ["徐若瑄", "林俊杰", "蔡依林", "温岚"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 321,
    "question": "歌曲《爱情转移》的演唱者是？",
    "options": ["张学友", "王力宏", "林宥嘉", "陈奕迅"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 322,
    "question": "《匆匆那年》的词作者是？",
    "options": ["方文山", "易家扬", "小寒", "林夕"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 323,
    "question": "哪位歌手演唱了《突然好想你》《温柔》？",
    "options": ["汪峰", "周传雄", "五月天", "信"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 324,
    "question": "歌曲《新不了情》的原唱是？",
    "options": ["那英", "万芳", "王菲", "张惠妹"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 325,
    "question": "哪首歌曲不是周杰伦的作品？",
    "options": ["双截棍", "匆匆那年", "晴天", "夜曲"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 326,
    "question": "哪位女歌手演唱了《梦醒时分》？",
    "options": ["张韶涵", "邓丽君", "陈淑桦", "王菲"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 327,
    "question": "《天黑黑》的原唱是哪位新加坡歌手？",
    "options": ["蔡健雅", "林俊杰", "孙燕姿", "阿杜"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 328,
    "question": "《菊花台》的演唱者是？",
    "options": ["李荣浩", "林俊杰", "薛之谦", "周杰伦"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 329,
    "question": "哪首歌曲不是林俊杰演唱的？",
    "options": ["她说", "不潮不用花钱", "江南", "简单爱"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 330,
    "question": "《爱的主打歌》是哪位歌手的代表作？",
    "options": ["萧亚轩", "王心凌", "杨丞琳", "蔡依林"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 331,
    "question": "歌曲《单车》是哪位男歌手的作品？",
    "options": ["陈奕迅", "林俊杰", "薛之谦", "周杰伦"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 332,
    "question": "《飘洋过海来看你》的原唱是谁？",
    "options": ["林忆莲", "娃娃", "黄莺莺", "李宗盛"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 333,
    "question": "《当你》的演唱者是？",
    "options": ["林宥嘉", "张敬轩", "蔡依林", "林俊杰"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 334,
    "question": "《会有那么一天》是哪位歌手演唱的？",
    "options": ["张信哲", "林俊杰", "范玮琪", "阿桑"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 335,
    "question": "《写给我的歌》是以下哪位歌手的作品？",
    "options": ["黄义达", "谢霆锋", "苏打绿", "许嵩"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 336,
    "question": "《王妃》的演唱者是？",
    "options": ["李荣浩", "信", "林俊杰", "萧敬腾"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 337,
    "question": "哪首不是五月天的歌曲？",
    "options": ["你不是真正的快乐", "星晴", "恋爱ing", "倔强"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 338,
    "question": "《一个像夏天一个像秋天》是谁唱的？",
    "options": ["蔡健雅", "田馥甄", "范玮琪", "梁静茹"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 339,
    "question": "《如果有如果》是哪位歌手演唱的？",
    "options": ["林俊杰", "李荣浩", "张靓颖", "林宥嘉"],
    "correct": 2,
    "category": "音乐"
  },
  {
    "id": 340,
    "question": "《雨一直下》的演唱者是？",
    "options": ["任贤齐", "周传雄", "陶喆", "张宇"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 341,
    "question": "《老男孩》是哪支组合的作品？",
    "options": ["南拳妈妈", "飞儿乐团", "筷子兄弟", "SHE"],
    "correct": 2,
    "category": "常识"
  },
  {
    "id": 342,
    "question": "《洋葱》的原唱是？",
    "options": ["薛之谦", "林俊杰", "李荣浩", "杨宗纬"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 343,
    "question": "《最初的梦想》是哪位女歌手演唱的？",
    "options": ["范玮琪", "杨丞琳", "田馥甄", "张韶涵"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 344,
    "question": "《我怀念的》的演唱者是？",
    "options": ["梁静茹", "张韶涵", "孙楠", "孙燕姿"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 345,
    "question": "《背叛》的演唱者是？",
    "options": ["林志炫", "曹格", "品冠", "光良"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 346,
    "question": "《童话》的原唱是谁？",
    "options": ["曹格", "品冠", "林俊杰", "光良"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 347,
    "question": "《遥远的她》是哪位歌手的代表作？",
    "options": ["刘德华", "张学友", "李克勤", "陈奕迅"],
    "correct": 1,
    "category": "音乐"
  },
  {
    "id": 348,
    "question": "《匆匆那年》是哪位女歌手演唱的？",
    "options": ["那英", "王菲", "邓紫棋", "范晓萱"],
    "correct": 1,
    "category": "历史"
  },
  {
    "id": 349,
    "question": "《不再让你孤单》的演唱者是？",
    "options": ["李宗盛", "王杰", "张宇", "陈升"],
    "correct": 3,
    "category": "音乐"
  },
  {
    "id": 350,
    "question": "《目不转睛》的原唱是？",
    "options": ["李荣浩", "薛之谦", "林俊杰", "许嵩"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 351,
    "question": "奥林匹克运动会每几年举办一次？",
    "options": ["5年", "2年", "3年", "4年"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 352,
    "question": "姚明曾效力于哪支NBA球队？",
    "options": ["迈阿密热火", "休斯顿火箭", "芝加哥公牛", "洛杉矶湖人"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 353,
    "question": "下列哪位是著名的短跑运动员，被称为“飞人”？",
    "options": ["贝克汉姆", "乔丹", "费德勒", "博尔特"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 354,
    "question": "乒乓球起源于哪个国家？",
    "options": ["日本", "英国", "韩国", "中国"],
    "correct": 1,
    "category": "地理"
  },
  {
    "id": 355,
    "question": "2022年冬奥会在哪个城市举行？",
    "options": ["东京", "平昌", "索契", "北京"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 356,
    "question": "足球比赛中，一场正式比赛的时间是？",
    "options": ["45分钟", "120分钟", "60分钟", "90分钟"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 357,
    "question": "网球比赛中获得四大满贯之一的赛事是？",
    "options": ["欧洲杯", "世界杯", "亚洲杯", "温网"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 358,
    "question": "世界上第一个突破百米跑10秒大关的运动员是？",
    "options": ["刘易斯", "黑斯", "鲍威尔", "博尔特"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 359,
    "question": "中国女排第一次获得世界冠军是哪一年？",
    "options": ["2004年", "1990年", "2016年", "1981年"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 360,
    "question": "NBA中“飞人”是指哪位球星？",
    "options": ["杜兰特", "乔丹", "科比", "詹姆斯"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 361,
    "question": "羽毛球比赛中一局是多少分制？",
    "options": ["15分", "11分", "25分", "21分"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 362,
    "question": "刘翔是中国哪项田径项目的奥运冠军？",
    "options": ["三级跳", "跳远", "短跑", "110米栏"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 363,
    "question": "奥运会的五环标志象征什么？",
    "options": ["五年一次", "五国合作", "五个项目", "五大洲团结"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 364,
    "question": "世界杯足球赛每几年举办一次？",
    "options": ["5年", "2年", "3年", "4年"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 365,
    "question": "马拉松比赛全程是多少公里？",
    "options": ["50公里", "10公里", "21.0975公里", "42.195公里"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 366,
    "question": "下列哪位中国运动员是乒乓球“大满贯”得主？",
    "options": ["马龙", "王皓", "刘国梁", "张继科"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 367,
    "question": "NBA现役被称为“詹皇”的球员是？",
    "options": ["保罗", "杜兰特", "库里", "詹姆斯"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 368,
    "question": "中国著名篮球运动员易建联效力过哪支CBA球队？",
    "options": ["辽宁本钢", "新疆飞虎", "北京首钢", "广东宏远"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 369,
    "question": "奥运会最初起源于哪个国家？",
    "options": ["英国", "法国", "意大利", "希腊"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 370,
    "question": "国际奥委会总部位于哪个城市？",
    "options": ["巴黎", "日内瓦", "伦敦", "洛桑"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 371,
    "question": "围棋比赛中最多有多少个黑白棋子？",
    "options": ["324", "361", "400", "289"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 372,
    "question": "足球比赛中，一个球队最多可以换几人？",
    "options": ["4人", "6人", "3人", "5人"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 373,
    "question": "花样滑冰属于哪种比赛项目？",
    "options": ["全运会", "夏季奥运会", "世锦赛", "冬季奥运会"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 374,
    "question": "在田径比赛中，“跳远”是靠什么起跳？",
    "options": ["起跳板", "助跑线", "起跑器", "踏板"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 375,
    "question": "“体操王子”李宁曾获几枚奥运奖牌？",
    "options": ["5枚金牌", "6枚金牌", "9枚金牌", "3枚金牌"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 376,
    "question": "中国获得第一枚奥运金牌的运动员是？",
    "options": ["李宁", "许海峰", "杨扬", "郑凤荣"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 377,
    "question": "网球运动中，四大满贯不包括？",
    "options": ["澳网", "中网", "法网", "美网"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 378,
    "question": "下列哪项不是田径项目？",
    "options": ["跳高", "举重", "标枪", "400米跑"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 379,
    "question": "中国男子足球历史最好成绩是？",
    "options": ["世界杯决赛", "亚洲杯冠军", "世界杯小组出线", "世界杯入围"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 380,
    "question": "世界羽联的简称是？",
    "options": ["FIFA", "BWF", "ATP", "NBA"],
    "correct": 1,
    "category": "常识"
  },
  {
    "id": 381,
    "question": "下列哪位是著名游泳运动员？",
    "options": ["李娜", "孙杨", "马龙", "刘翔"],
    "correct": 1,
    "category": "体育"
  },
  {
    "id": 382,
    "question": "李娜是哪项体育运动的世界冠军？",
    "options": ["体操", "乒乓球", "羽毛球", "网球"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 383,
    "question": "NBA每场比赛一共几节？",
    "options": ["2节", "3节", "5节", "4节"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 384,
    "question": "冬奥会每几年举办一次？",
    "options": ["5年", "2年", "3年", "4年"],
    "correct": 3,
    "category": "历史"
  },
  {
    "id": 385,
    "question": "奥运圣火最后点燃的是？",
    "options": ["观众席", "赛道", "领奖台", "主火炬"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 386,
    "question": "世界足球明星C罗是哪国人？",
    "options": ["巴西", "阿根廷", "西班牙", "葡萄牙"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 387,
    "question": "NBA中最常见的“三双”是指哪三项统计数据？",
    "options": ["得分、盖帽、抢断", "得分、失误、篮板", "得分、三分、罚球", "得分、篮板、助攻"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 388,
    "question": "拳击比赛中，通常每回合几分钟？",
    "options": ["1分钟", "2分钟", "5分钟", "3分钟"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 389,
    "question": "排球中，每队场上最多几名运动员？",
    "options": ["4人", "7人", "5人", "6人"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 390,
    "question": "冬奥会常见项目不包括？",
    "options": ["冰壶", "滑雪", "速滑", "跳水"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 391,
    "question": "中国著名围棋选手柯洁的职业是？",
    "options": ["七段", "初段", "五段", "九段"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 392,
    "question": "围棋棋盘一共有多少个交叉点？",
    "options": ["324", "289", "400", "361"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 393,
    "question": "体操项目中不属于男子项目的是？",
    "options": ["吊环", "鞍马", "单杠", "高低杠"],
    "correct": 3,
    "category": "常识"
  },
  {
    "id": 394,
    "question": "下列哪位是NBA中国第一人？",
    "options": ["易建联", "孙悦", "巴特尔", "姚明"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 395,
    "question": "“飞鱼”菲尔普斯是哪个国家的运动员？",
    "options": ["英国", "加拿大", "澳大利亚", "美国"],
    "correct": 3,
    "category": "地理"
  },
  {
    "id": 396,
    "question": "世界一级方程式赛车简称为？",
    "options": ["A1", "F2", "GP", "F1"],
    "correct": 3,
    "category": "数学"
  },
  {
    "id": 397,
    "question": "CBA是哪个体育项目的职业联赛？",
    "options": ["乒乓球", "足球", "排球", "篮球"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 398,
    "question": "NBA历史上总得分最多的球员是？",
    "options": ["贾巴尔", "乔丹", "科比", "詹姆斯"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 399,
    "question": "奥运金牌的主要材质是？",
    "options": ["纯金", "铜合金", "铁合金", "镀金银牌"],
    "correct": 3,
    "category": "体育"
  },
  {
    "id": 400,
    "question": "篮球比赛中一次罚球最多可得几分？",
    "options": ["0分", "2分", "3分", "1分"],
    "correct": 3,
    "category": "体育"
  }
];

module.exports = questions;
