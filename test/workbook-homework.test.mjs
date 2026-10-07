import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorkbookHomework } from '../public/workbook-homework.mjs';

const book = JSON.parse(readFileSync(new URL('../data/book2.json', import.meta.url), 'utf8'));
const expected = new Set(['write', 'strokes', 'parts', 'spell', 'cloze', 'order', 'read']);
const printedLastPages = [13, 15, 27, 30, 42, 47, 55, 61, 69, 76, 85, 90];

test('each lesson has a seven-card homework set from the matching A or B workbook', () => {
  for (const lesson of book.lessons) {
    const homework = buildWorkbookHomework(lesson);
    assert.equal(homework.booklet, lesson.number % 2 ? 'A' : 'B');
    assert.equal(homework.lastPage, printedLastPages[lesson.number - 1]);
    assert.equal(homework.cards.length, 7);
    assert.deepEqual(new Set(homework.cards.map(card => card.type)), expected);
    assert.deepEqual(homework.cards.map(card => card.page), [...homework.cards.map(card => card.page)].sort((a, b) => a - b));
    for (const card of homework.cards) {
      assert.equal(card.booklet, homework.booklet);
      assert.ok(card.page >= homework.firstPage && card.page <= homework.lastPage, `lesson ${lesson.number} p.${card.page}`);
      assert.ok(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(card.day));
    }
    const write = homework.cards.find(card => card.type === 'write');
    const strokes = homework.cards.find(card => card.type === 'strokes');
    const strokeData = JSON.parse(readFileSync(new URL(`../public/strokes/${lesson.character}.json`, import.meta.url), 'utf8'));
    assert.equal(write.character, lesson.character);
    assert.equal(strokes.count, strokeData.strokes.length);
    assert.deepEqual([...strokes.options].sort((a, b) => a - b), [strokes.count - 1, strokes.count, strokes.count + 1]);

    for (const type of ['parts', 'spell', 'cloze']) {
      const card = homework.cards.find(item => item.type === type);
      assert.equal(card.options.length, 3);
      assert.equal(new Set(card.options).size, 3);
      assert.ok(card.options.includes(card.answer));
    }
    const order = homework.cards.find(card => card.type === 'order');
    assert.deepEqual([...order.bankOrder].sort((a, b) => a - b), order.answer.map((_, i) => i));
    assert.notDeepEqual(order.bankOrder, order.answer.map((_, i) => i));
    assert.ok(order.answer.length >= 5 && order.english);
    const read = homework.cards.find(card => card.type === 'read');
    assert.ok(lesson.phrases.includes(read.phrase));
    assert.equal(read.page, homework.lastPage);
  }
});
