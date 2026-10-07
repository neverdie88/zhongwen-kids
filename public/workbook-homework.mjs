// Short interactive adaptations of exercises in the revised Book 2 A/B workbooks.
// Pages are the printed workbook page numbers, not PDF page indices (PDF page = printed page + 4).
const source = {
  1: {
    days: [1, 3, 6, 8, 11], endPage: 13, pages: [1, 1, 4, 2, 2, 8, 13], strokes: 6,
    parts: { pieces: ['讠', '吾'], answer: '语', options: ['语', '说', '读'] },
    spell: { answer: '汉字', options: ['汉字', '汉子', '汉宇'] },
    cloze: { prefix: '老师在学校教我们', answer: '写', suffix: '汉字。', options: ['写', '说', '画'], english: 'The teacher teaches us to write Chinese characters at school.' },
    order: { answer: ['爸爸', '在', '家', '写', '汉字', '。'], english: 'Dad writes Chinese characters at home.' }, readPhrase: 0,
  },
  2: {
    days: [1, 4, 8, 11, 14], endPage: 15, pages: [1, 2, 5, 2, 12, 10, 15], strokes: 4,
    parts: { pieces: ['讠', '井'], answer: '讲', options: ['讲', '认', '说'], meaning: 'to speak or tell' },
    spell: { answer: '本子', options: ['本子', '木子', '本了'] },
    cloze: { prefix: '我', answer: '坐', suffix: '校车去学校。', options: ['坐', '画', '讲'], english: 'I take the school bus to school.' },
    order: { answer: ['这', '是', '老师', '的', '书', '。'], english: 'This is the teacher’s book.' }, readPhrase: 3,
  },
  3: {
    days: [14, 16, 18, 22, 24], endPage: 27, pages: [14, 14, 20, 17, 24, 15, 27], strokes: 8,
    parts: { pieces: ['日', '生'], answer: '星', options: ['星', '朋', '明'], meaning: 'star' },
    spell: { answer: '朋友', options: ['朋友', '朋有', '月友'] },
    cloze: { prefix: '今天', answer: '星期', suffix: '五，放学了。', options: ['星期', '朋友', '放学'], english: 'Today is Friday, and school is over.' },
    order: { answer: ['这', '是', '我的', '好', '朋友', '。'], english: 'This is my good friend.' }, readPhrase: 3,
  },
  4: {
    days: [16, 19, 22, 25, 27], endPage: 30, pages: [16, 17, 25, 28, 28, 21, 30], strokes: 5,
    parts: { pieces: ['讠', '射'], answer: '谢', options: ['谢', '说', '请'] },
    spell: { answer: '没关系', options: ['没关系', '没关糸', '没关东'] },
    cloze: { prefix: '我', answer: '在', suffix: '中文学校学习。', options: ['在', '再', '坐'], english: 'I study at Chinese school.' },
    order: { answer: ['今天', '是', '星期五', '吗', '？'], english: 'Is today Friday?' }, readPhrase: 1,
  },
  5: {
    days: [28, 30, 33, 37, 39], endPage: 42, pages: [28, 30, 29, 34, 35, 29, 42], strokes: 6,
    parts: { pieces: ['乛', '头'], answer: '买', options: ['买', '卖', '头'], meaning: 'to buy' },
    spell: { answer: '买东西', options: ['买东西', '卖东西', '买东酉'] },
    cloze: { prefix: '我', answer: '真', suffix: '高兴。', options: ['真', '具', '很'], english: 'I am really happy.' },
    order: { answer: ['今天', '是', '谁', '的', '生日', '？'], english: 'Whose birthday is today?' }, readPhrase: 3,
  },
  6: {
    days: [31, 33, 37, 40, 44], endPage: 47, pages: [31, 32, 37, 38, 33, 39, 47], strokes: 6,
    parts: { pieces: ['扌', '合'], answer: '拾', options: ['拾', '收', '会'] },
    spell: { answer: '收拾', options: ['收拾', '收十', '手拾'] },
    cloze: { prefix: '我会', answer: '做', suffix: '的事真不少。', options: ['做', '洗', '买'], english: 'I can do quite a lot of things.' },
    order: { answer: ['姐姐', '会', '讲', '中文', '。'], english: 'Older sister can speak Chinese.' }, readPhrase: 1,
  },
  7: {
    days: [43, 46, 48, 50, 53], endPage: 55, pages: [43, 43, 44, 49, 47, 50, 55], strokes: 4,
    parts: { pieces: ['亻', '乍'], answer: '作', options: ['作', '做', '件'], meaning: 'to do or make' },
    spell: { answer: '双手', options: ['双手', '双收', '又手'] },
    cloze: { prefix: '我会', answer: '收', suffix: '拾房间。', options: ['收', '手', '又'], english: 'I can tidy the room.' },
    order: { answer: ['我', '会', '收拾', '小房间', '。'], english: 'I can tidy the little room.' }, readPhrase: 1,
  },
  8: {
    days: [48, 50, 53, 55, 59], endPage: 61, pages: [48, 49, 59, 53, 49, 51, 61], strokes: 4,
    parts: { pieces: ['日', '月'], answer: '明', options: ['明', '朋', '亮'] },
    spell: { answer: '月亮', options: ['月亮', '月两', '月高'] },
    cloze: { prefix: '晚上天上有月', answer: '亮', suffix: '。', options: ['亮', '跟', '很'], english: 'There is a moon in the sky at night.' },
    order: { answer: ['月亮', '不', '会', '跟', '人', '走', '。'], english: 'The moon does not follow people.' }, readPhrase: 2,
  },
  9: {
    days: [56, 58, 61, 64, 67], endPage: 69, pages: [56, 56, 59, 67, 57, 65, 69], strokes: 4,
    parts: { pieces: ['氵', '可'], answer: '河', options: ['河', '何', '流'] },
    spell: { answer: '河水', options: ['河水', '何水', '可水'] },
    cloze: { prefix: '河水会', answer: '流', suffix: '动。', options: ['流', '游', '飞'], english: 'River water can flow.' },
    order: { answer: ['他', '为什么', '学', '画画儿', '？'], english: 'Why does he learn to draw?' }, readPhrase: 2,
  },
  10: {
    days: [62, 65, 68, 72, 74], endPage: 76, pages: [62, 62, 63, 73, 63, 67, 76], strokes: 8,
    parts: { pieces: ['艹', '牙'], answer: '芽', options: ['芽', '花', '草'] },
    spell: { answer: '下雨', options: ['下雨', '下两', '下丽'] },
    cloze: { prefix: '春天，种子', answer: '发', suffix: '芽了。', options: ['发', '长', '要'], english: 'In spring, the seed sprouted.' },
    order: { answer: ['种子', '发', '芽', '了', '。'], english: 'The seed has sprouted.' }, readPhrase: 1,
  },
  11: {
    days: [70, 73, 76, 80, 83], endPage: 85, pages: [70, 74, 71, 75, 74, 72, 85], strokes: 6,
    parts: { pieces: ['氵', '工'], answer: '江', options: ['江', '河', '红'] },
    spell: { answer: '长江', options: ['长江', '长工', '长汪'] },
    cloze: { prefix: '一', answer: '条', suffix: '小河', options: ['条', '双', '本'], english: 'A small river.' },
    order: { answer: ['哥哥', '的', '名字', '叫', '冬冬', '。'], english: 'Older brother’s name is Dongdong.' }, readPhrase: 3,
  },
  12: {
    days: [77, 79, 82, 85, 88], endPage: 90, pages: [77, 78, 83, 84, 80, 79, 90], strokes: 11,
    parts: { pieces: ['方', '攵'], answer: '放', options: ['放', '旅', '方'], meaning: 'to let go; in 放假, to have a holiday' },
    spell: { answer: '放假', options: ['放假', '放价', '放佳'] },
    cloze: { prefix: '爸爸', answer: '告诉', suffix: '我，明天我们去动物园。', options: ['告诉', '游泳', '旅游'], english: 'Dad told me we are going to the zoo tomorrow.' },
    order: { answer: ['我', '想', '去', '游泳', '。'], english: 'I want to go swimming.' }, readPhrase: 2,
  },
};

const cardTypes = ['write', 'strokes', 'parts', 'spell', 'cloze', 'order', 'read'];
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const rotate = (items, amount) => [...items.slice(amount % items.length), ...items.slice(0, amount % items.length)];

export function buildWorkbookHomework(lesson) {
  const entry = source[lesson.number];
  if (!entry) throw new Error(`No Book 2 workbook homework for lesson ${lesson.number}.`);
  const booklet = lesson.number % 2 ? 'A' : 'B';
  const cards = cardTypes.map((type, index) => {
    const page = entry.pages[index];
    const day = Math.max(0, entry.days.findLastIndex(start => start <= page));
    const exercise = type === 'write' || type === 'strokes' ? { character: lesson.character, count: entry.strokes }
      : type === 'read' ? { phrase: lesson.phrases[entry.readPhrase] }
        : { ...entry[type] };
    if (type === 'strokes') exercise.options = rotate([entry.strokes - 1, entry.strokes, entry.strokes + 1], lesson.number % 3);
    if (type === 'order') exercise.bankOrder = rotate(exercise.answer.map((_, i) => i), lesson.number % (exercise.answer.length - 1) + 1);
    return { id: type, type, booklet, page, day: dayNames[day], ...exercise };
  });
  cards.sort((a, b) => a.page - b.page || cardTypes.indexOf(a.type) - cardTypes.indexOf(b.type));
  return { booklet, firstPage: entry.days[0], lastPage: entry.endPage, cards };
}
