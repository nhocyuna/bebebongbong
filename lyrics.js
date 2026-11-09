const memoryText = `I swore to myself that this would be the day I finally let go, but her absence remains an unending, quiet ruin. Every empty hour crawls by, thick with unanswered questions that no one will ever hear, whispering straight into the suffocating dark that swallows me whole each night. There are moments when the torment becomes so heavy, so agonizingly sharp, that I desperately want to tear her completely out of my chest. I want to walk away, to sever every invisible chain, to learn how to breathe freely in a world where she doesn't exist next to me. But my heart betrays me every single time; it utterly refuses to obey.

She is no longer just a memory or a fleeting shadow from the past. She is the very air I fail to draw, the sole reason I still anchor myself to existence in this shattered, desolate world. The silence she left behind is filled with a hollow, echoing loneliness, feeding a loop of endless questions: Why did it have to end? Why does every single road in my mind still lead back to her? I wait in vain, knowing the answer will never come, yet paralyzed by the inability to move forward or to turn around.

It is a slow, daily erosion—a darkness that gnaws relentlessly at the edges of my sanity. I want to forget. I want to wash away the ghost of her touch, to numb the constant ache, to wander off into a quiet oblivion and leave this heartbreak behind. But how do you abandon the very thing that keeps your heart beating? How do you walk away from the reason for your existence when you are already blind and lost in the dark?

Deep inside this ruined, hollowed-out soul, amidst the ash and the endless pain, there remains a pathetic, stubborn ember. It flickers weakly against the freezing void, refusing to go out. It still hopes against all reason, still aches against all logic, waiting endlessly in the ruins for someone who may never return.`;

const sentences = memoryText.replace(/\n+/g, ' ').match(/[^.!?]+[.!?]+/g).map(s => s.trim());
const caption = document.getElementById('memoryCaption');
let captionIndex = 0;

function wrapSentence(sentence) {
  const words = sentence.split(/\s+/);
  const lines = [];
  let line = '';
  const limit = innerWidth < 600 ? 42 : innerWidth < 900 ? 65 : 88;
  for (const word of words) {
    if (line && (line + ' ' + word).length > limit) {
      lines.push(line);
      line = word;
    } else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}

function showCaption() {
  const batch = innerWidth < 600 ? 1 : 2;
  const sentence = Array.from({ length: batch }, () => sentences[captionIndex++ % sentences.length]).join(' ');
  const lines = wrapSentence(sentence);
  caption.replaceChildren();
  const styles = ['rise', 'soft', 'slide', 'glimmer'];
  const style = styles[(captionIndex - 1) % styles.length];
  lines.forEach((line, index) => {
    const item = document.createElement('span');
    item.className = `caption-line ${style}`;
    const glow = document.createElement('span');
    glow.className = 'caption-glow';
    glow.textContent = line;
    item.appendChild(glow);
    item.style.animationDelay = `${index * 420}ms`;
    caption.appendChild(item);
  });
  const hold = Math.max(11000, Math.min(18000, sentence.length * 55));
  caption.classList.remove('caption-out');
  setTimeout(() => caption.classList.add('caption-out'), hold);
  setTimeout(showCaption, hold + 1100);
}

showCaption();


