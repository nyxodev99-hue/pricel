export const ADJECTIVES = ['Brave', 'Calme', 'Vif', 'Curieux', 'Discret', 'Agile', 'Solaire', 'Lunaire'];
export const ANIMALS = ['Renard', 'Loutre', 'Faucon', 'Lynx', 'Corbeau', 'Panda', 'Heron', 'Loup'];
export const AVATARS = ['🦊', '🦦', '🦅', '🐆', '🐦‍⬛', '🐼', '🦩', '🐺', '🦉', '🐢'];

export function randomPseudo() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a}${b}${Math.floor(Math.random() * 900 + 100)}`;
}

export function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
