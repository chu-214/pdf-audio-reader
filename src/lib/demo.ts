import { classifyPages } from './content';
import { DEFAULT_SETTINGS, type Block, type DocumentRecord } from '../types';

const chapters = [
  {
    title: 'The art of paying attention',
    subtitle: 'A small field guide to a more focused day',
    paragraphs: [
      'We live in a world that is very good at asking for our attention. A notification, a new tab, one more thing to read. Sometimes the most useful thing we can do is decide what deserves it.',
      'Attention is not just a way of getting things done. It is how we experience our days. What we notice becomes what we remember, and what we remember becomes the story we tell about our lives.',
      'This is a guide to making a little more room for the things that matter. Start small. Choose one thing. Give it your attention, and see what happens.',
    ],
    note: '1. This demo includes small print so you can try the optional footnote filter.',
  },
  {
    title: '01  Make a little space', subtitle: 'You do not have to fill every quiet moment.',
    paragraphs: [
      'A quiet moment can feel like an invitation to reach for your phone. Try letting the moment be quiet instead. Look out of the window. Make a cup of tea. Walk without a destination for five minutes.',
      'Space is where connections happen. An idea you could not quite finish yesterday meets something you notice today. A problem looks different when you are no longer staring directly at it.',
      'Choose a small boundary you can keep. Put your phone in another room for the first half hour of the morning, or leave one part of your daily walk free from input. The point is to give your mind some room.',
    ],
    note: '2. Try this at your own pace. A few minutes are enough to begin.',
  },
  {
    title: '02  Read with your ears', subtitle: 'A different way to make room for a good idea.',
    paragraphs: [
      'Some ideas are easier to take in when you hear them. A sentence has a rhythm. A pause gives a thought room to land. Listening can turn an ordinary walk into time spent with a new perspective.',
      'Documents are usually designed for the eye. Page numbers help you find your place. Headers tell you where you are. Footers carry links and small print. Read out loud, those useful visual signals can become distractions.',
      'A good listening experience keeps the substance and lets the furniture fade into the background. You can always return to the original page when you want to look more closely.',
    ],
    note: '3. Folio keeps the original PDF available alongside your clean narration.',
  },
  {
    title: '03  Take one thing with you', subtitle: 'An idea becomes useful when you make it your own.',
    paragraphs: [
      'You do not need to remember every sentence. When you finish reading or listening, ask yourself what stayed with you. It might be a question, a useful distinction, or something you want to try.',
      'Write that one thing down in your own words. Tell a friend about it. Put it somewhere you will see it tomorrow. The act of choosing helps the idea become part of how you think.',
      'And then move on with your day. The best ideas are not the ones that keep us reading forever. They are the ones that help us live a little more deliberately.',
    ],
    note: '4. This field guide was written as sample content for Folio.',
  },
];

export function createDemo(): DocumentRecord {
  const pages = chapters.map((chapter, index) => {
    let y = 188;
    const blocks: Block[] = [];
    const add = (text: string, top: number, fontSize: number, heading = false) => blocks.push({ id: `p${index + 1}-b${blocks.length}`, text, x: 65, y: top, width: 470, height: fontSize * 1.3, fontSize, heading });
    add('FOLIO FIELD NOTES', 32, 9);
    add(chapter.title, 95, 25, true);
    add(chapter.subtitle, 140, 12);
    for (const paragraph of chapter.paragraphs) {
      const words = paragraph.split(' '); let line = '';
      for (const word of words) {
        if ((line + ' ' + word).length > 76) { add(line, y, 12); y += 21; line = word; }
        else line += (line ? ' ' : '') + word;
      }
      if (line) { add(line, y, 12); y += 21; }
      y += 18;
    }
    add(chapter.note, 661, 8);
    add('https://folio.example/field-notes', 718, 8);
    add(String(index + 1), 756, 10);
    return { number: index + 1, width: 612, height: 792, source: 'text' as const, blocks };
  });
  return {
    id: 'folio-demo', title: 'The art of paying attention', filename: 'Folio field notes · Sample document',
    size: 0, createdAt: Date.now(), updatedAt: Date.now(), pages: classifyPages(pages),
    position: { page: 0, chunk: 0 }, settings: { ...DEFAULT_SETTINGS }, bookmarkPages: [],
  };
}
