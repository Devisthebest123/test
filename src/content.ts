// All copy lives here so the words can be argued about in one place.

export const brand = 'Whisper';
export const strap = 'Private notes and SOL on Solana';

export const nav = [
  {label: 'Board', href: '#/board'},
  {label: 'Inbox', href: '#/inbox'},
  {label: 'Wallet', href: '#/wallet'},
  {label: 'Protocol', href: '#/protocol'},
];

export const social = {
  x: 'https://x.com/sirvaliance',
  github: 'https://github.com/sirvaliance',
  site: 'https://sirvaliance.com',
};

export const headline = ['Leave it.', 'Walk', 'away.'];

export const lede =
  'Send someone a private note, private SOL, or both. It lands on a public board where everyone sees every drop and only the person it is for can tell which one is theirs.';

export const ctas = {
  primary: {label: 'Open the board', href: '#/board'},
  secondary: {label: 'How it works', href: '#how'},
};

export const media = {
  // Clean white-cat loop; the scanline look is drawn live by ScanCat's shader.
  video: '/media/cat-loop.mp4',
  poster: '/media/cat-poster.jpg',
};

export const steps = [
  {
    n: '01',
    title: 'Seal',
    body: 'Your drop is encrypted to an address with a key that exists for exactly one message. If SOL rides along, the same secret derives a one-time wallet that only the recipient can open.',
  },
  {
    n: '02',
    title: 'Pin',
    body: 'The sealed drop goes on the board as one memo transaction, next to everyone else’s. The SOL goes to a wallet the chain has never seen. There is no recipient field anywhere.',
  },
  {
    n: '03',
    title: 'Scan',
    body: 'The recipient pulls the whole board and tries every drop. Theirs open, and the wallets inside are theirs to sweep. The rest stay noise. Not even the RPC node learns which one they came for.',
  },
];

export const hides = [
  ['Who a drop is for', 'Hidden. No recipient on chain; the tag is only computable with the recipient’s secret.'],
  ['Who got paid', 'Hidden. SOL lands in a one-time wallet. Nothing links it to the Whisper ID or to other payments.'],
  ['What it says', 'Hidden. XChaCha20-Poly1305 under an x25519 shared secret.'],
  ['How long it is', 'Mostly hidden. Only the bucket (160 / 320 / 576 bytes) is visible.'],
  ['Who sent it', 'Partly. The fee payer is public. Use a burner funded separately if that matters.'],
  ['How much', 'Visible. The transfer amount is public; the recipient is not.'],
  ['That you are reading', 'Partly. The node sees you fetched the board, not which drop you opened.'],
  ['When it was sent', 'Visible. Block time is public. Post chaff at other hours to blur your pattern.'],
];
