// Short, child-friendly meanings for the words used on the Book 2 speaking cards.
// Keeping these locally makes word study work without a translation service.
export const wordMeanings = {
  中文: 'Chinese language', 学校: 'school', 学习: 'to study', 汉语: 'spoken Chinese', 汉字: 'Chinese character',
  喜欢: 'to like', 不是: 'is not', 云云: 'Yunyun (a name)', 家里: 'at home', 放学: 'school is over',
  今天: 'today', 星期五: 'Friday', 好朋友: 'good friend', 朋友: 'friend', 你好: 'hello',
  谢谢: 'thank you', 对不起: 'sorry', 没关系: 'no problem', 再见: 'goodbye', 生日: 'birthday',
  买东西: 'to shop', 东西: 'things', 高兴: 'happy', 一个: 'one (with a measure word)', 小学生: 'primary school student',
  收拾: 'to tidy up', 房间: 'room', 洗衣: 'to wash clothes', 洗澡: 'to bathe', 不少: 'quite a lot',
  双手: 'both hands', 大脑: 'brain', 做工: 'to do work', 思考: 'to think', 月亮: 'moon',
  为什么: 'why', 点儿: 'a little', 明白: 'to understand', 冬天: 'winter', 哪里: 'where',
  黑夜: 'dark night', 河水: 'river water', 流动: 'to flow', 鱼儿: 'fish', 下雨: 'to rain',
  发芽: 'to sprout', 开花: 'to bloom', 名字: 'name', 长江: 'Yangtze River', 黄河: 'Yellow River',
  我们: 'we', 你们: 'you (plural)', 放假: 'to have a holiday', 哪儿: 'where', 动物园: 'zoo',
  动物: 'animal', 假期: 'holiday', 快乐: 'happy',
};

export const characterMeanings = {
  我: 'I; me', 在: 'at; in', 中: 'middle; China', 文: 'language; writing', 学: 'to learn', 校: 'school',
  习: 'to practise', 说: 'to speak', 汉: 'Chinese; Han', 语: 'language', 写: 'to write', 字: 'character',
  喜: 'to like', 欢: 'happy', 这: 'this', 是: 'is', 你: 'you', 的: 'possessive particle', 书: 'book',
  吗: 'question particle', 不: 'not', 云: 'cloud', 家: 'home', 里: 'inside', 讲: 'to speak',
  放: 'to let out', 了: 'completed action particle', 今: 'today', 天: 'day; sky', 星: 'star',
  期: 'period', 五: 'five', 他: 'he', 谁: 'who', 好: 'good', 朋: 'friend', 友: 'friend',
  请: 'please', 坐: 'to sit', 谢: 'to thank', 对: 'correct', 起: 'to rise', 没: 'not have',
  关: 'relation', 系: 'connection', 再: 'again', 见: 'to see', 生: 'birth', 日: 'day',
  买: 'to buy', 东: 'east', 西: 'west', 歌: 'song', 真: 'really', 高: 'high', 兴: 'happy',
  一: 'one', 个: 'measure word', 小: 'small', 会: 'can', 收: 'to gather', 拾: 'to pick up',
  房: 'house', 间: 'room', 洗: 'to wash', 衣: 'clothes', 和: 'and', 澡: 'to bathe',
  做: 'to do', 事: 'thing', 少: 'few', 双: 'pair', 手: 'hand', 大: 'big', 脑: 'brain',
  工: 'work', 思: 'to think', 考: 'to consider', 用: 'to use', 又: 'again', 月: 'moon',
  亮: 'bright', 也: 'also', 走: 'to walk', 为: 'for; because', 什: 'what', 么: 'question suffix',
  跟: 'to follow', 人: 'person', 很: 'very', 远: 'far', 有: 'to have', 点: 'a little',
  儿: 'child; word suffix', 明: 'clear', 白: 'white', 冬: 'winter', 黑: 'black', 夜: 'night',
  哪: 'which; where', 河: 'river', 水: 'water', 流: 'to flow', 动: 'to move', 鱼: 'fish',
  上: 'above', 游: 'to swim', 下: 'below', 雨: 'rain', 要: 'to want', 发: 'to sprout',
  芽: 'sprout', 开: 'to open', 花: 'flower', 种: 'to plant', 瓜: 'melon', 它: 'it',
  名: 'name', 叫: 'to be called', 长: 'long', 江: 'river', 黄: 'yellow', 从: 'from',
  到: 'to arrive', 爱: 'to love', 假: 'holiday', 想: 'to want', 去: 'to go', 园: 'garden',
  祝: 'to wish', 快: 'happy; fast', 乐: 'happy',
};

const isHanzi = char => /\p{Script=Han}/u.test(char);
const wordsByLength = Object.keys(wordMeanings).sort((a, b) => b.length - a.length);

export function tokenizePhrase(chinese, pinyin) {
  const chars = Array.from(chinese);
  const syllables = pinyin.match(/[\p{Script=Latin}\p{M}]+/gu) || [];
  const pinyinByPosition = [];
  let nextSyllable = 0;
  for (let i = 0; i < chars.length; i++) {
    if (!isHanzi(chars[i])) continue;
    // In 点儿 and 哪儿, 儿 shares the preceding -r syllable.
    if (chars[i] === '儿' && /r$/i.test(pinyinByPosition[i - 1] || '') &&
        syllables.length - nextSyllable === chars.slice(i + 1).filter(isHanzi).length) {
      pinyinByPosition[i] = '';
    } else {
      pinyinByPosition[i] = syllables[nextSyllable++] || '';
    }
  }
  const tokens = [];
  for (let i = 0; i < chars.length;) {
    if (!isHanzi(chars[i])) {
      tokens.push({ text: chars[i], pinyin: '', meaning: '', isChinese: false });
      i++;
      continue;
    }
    const rest = chars.slice(i).join('');
    const word = wordsByLength.find(candidate => rest.startsWith(candidate)) || chars[i];
    const length = Array.from(word).length;
    tokens.push({
      text: word,
      pinyin: pinyinByPosition.slice(i, i + length).filter(Boolean).join(' '),
      meaning: wordMeanings[word] || characterMeanings[word] || '',
      isChinese: true,
    });
    i += length;
  }
  return tokens;
}
