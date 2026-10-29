import {PageTitle, Rule, Specs} from '../components/ui';
import {hides} from '../content';
import {BOARD_SEED, MEMO_PROGRAM_ID} from '../lib/board';
import {BUCKETS, MAX_BODY, MAX_MEMO_CHARS} from '../lib/protocol';
import {useApp} from '../state/AppContext';

const WIRE = `memo text = base64( envelope )

envelope
  magic        4   "PGN1"
  ephemeral   32   x25519 public key, fresh per drop
  tag          8   HKDF(shared)[32..40]
  nonce       24   XChaCha20-Poly1305 nonce
  ciphertext   n   AEAD( plaintext ), aad = magic‖ephemeral‖tag

plaintext (padded to ${BUCKETS.join(' / ')} bytes)
  flags        1   bit0 = sender present, bit1 = payment
  sender      32   sender's Ed25519 identity key, or zeros
  signature   64   Ed25519 over "pigeon/v1/sender"‖ephemeral‖recipient‖lamports‖length‖body
  lamports     8   big-endian, zero for a plain note
  length       2   big-endian body length
  body        <=${MAX_BODY}   utf-8
  padding      *   zeros`;

const KEYS = `recipient_x = Montgomery( recipient_public )          # Ed25519 → X25519, RFC 7748 §4.1
shared = X25519( ephemeral_secret, recipient_x )
okm    = HKDF-SHA256( ikm = shared,
                      salt = ephemeral_public ‖ recipient_public,
                      info = "pigeon/v1", len = 72 )
key    = okm[0..32]     encrypts the plaintext
tag    = okm[32..40]    cheap "is this mine" check
seed   = okm[40..72]    one-time Solana wallet, if paying`;

const TX = `instruction 0  System.transfer( payer → board, 0 lamports )
instruction 1  Memo( memo text )
instruction 2  System.transfer( payer → stealth wallet, lamports )   only when paying

board   = find_program_address( ["${BOARD_SEED}", name], Memo program )
stealth = ed25519 keypair from seed; address never seen before`;

function Section({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <section>
      <Rule label={label} />
      <div className="mt-5 max-w-[72ch]">{children}</div>
    </section>
  );
}

function Pre({children}: {children: string}) {
  return <pre className="overflow-x-auto border hairline bg-page p-4 text-fine leading-[1.6] whitespace-pre">{children}</pre>;
}

export function Protocol() {
  const {board, boardName} = useApp();
  return (
    <>
      <PageTitle kicker="whisper · wire format pigeon/v1" title="Protocol" aside="short enough to audit in an evening" />
      <div className="flex flex-col gap-[clamp(36px,6vh,64px)] text-body">
        <Section label="Idea">
          <p>
            A dead drop is a hiding place two people agree on in advance. One leaves something, walks away, and later the other collects it. Nobody has to meet. Nobody has to know who the other party is.
          </p>
          <p className="mt-4">
            Whisper makes the hiding place a public board on Solana. Every drop is posted in the open. The trick is that a drop carries no recipient, only a tag that the recipient can recompute and nobody else can. Readers fetch the whole board and try every drop against their key. Theirs open; the rest stay noise. The chain, the RPC node and every other reader see identical traffic whether or not a drop was for you.
          </p>
          <p className="mt-4">
            Money works the same way. A payment does not go to the recipient's wallet. It goes to a wallet that did not exist a second ago, derived from the same shared secret, and only the recipient can derive its key. On chain a stranger got paid.
          </p>
        </Section>

        <Section label="Keys">
          <p>
            A Whisper ID is an Ed25519 public key, written as bech32m with the prefix wsp so it can never be mistaken for a wallet address. Key agreement uses its X25519 twin, so the same key both signs and agrees. The sender makes a one-time ephemeral keypair per drop, so two drops to the same person share nothing visible and a leaked ephemeral secret exposes one drop, not a mailbox. A sender who includes their ID signs the drop; the recipient shows a from line only when that signature verifies.
          </p>
          <div className="mt-4">
            <Pre>{KEYS}</Pre>
          </div>
          <p className="mt-4 text-ink-60">
            The tag is a cheap first pass: one scalar multiplication per drop, no AEAD until it matches. Tags are 64 bits, so a false match is a one in eighteen-quintillion event and would fail decryption anyway.
          </p>
        </Section>

        <Section label="Payments">
          <p>
            The last 32 bytes of the HKDF output seed an ed25519 keypair, which is a Solana wallet. The sender funds that address in the same transaction as the memo. The recipient, scanning the board, opens the drop, derives the identical seed, and now holds the private key to a wallet with SOL in it. They can sweep it anywhere, or import the key into a wallet app and spend from it directly.
          </p>
          <p className="mt-4 text-ink-60">
            This is the stealth-address construction from Monero and from Zcash's shielded receiving side, done with plain keypairs instead of a shielded pool. Amounts stay visible; the link between the money and the person does not exist on chain. Sweeping to a known wallet creates that link at sweep time, so the inbox says so.
          </p>
        </Section>

        <Section label="Wire format">
          <Pre>{WIRE}</Pre>
          <p className="mt-4 text-ink-60">
            The whole memo is at most {MAX_MEMO_CHARS} characters, which keeps a payment transaction under Solana's 1,232-byte limit with one signer. Padding to buckets means the chain learns a drop was small, medium or large and nothing finer.
          </p>
        </Section>

        <Section label="On chain">
          <Pre>{TX}</Pre>
          <p className="mt-4">
            The board is a program-derived address under the Memo program, so nobody holds a key for it. A zero-lamport transfer is the cheapest way to get the board into the transaction's account list, which is what lets anyone list the board's history with <span className="text-ink-60">getSignaturesForAddress</span>. There is no custom program to deploy, upgrade or trust.
          </p>
          <div className="mt-4">
            <Specs
              rows={[
                ['memo program', MEMO_PROGRAM_ID.toBase58()],
                [`board “${boardName}”`, board.toBase58()],
                ['cost per drop', '5,000 lamports (one signature)'],
                ['minimum payment', '0.001 SOL (new accounts must be rent-exempt)'],
                ['custom program', 'none'],
              ]}
            />
          </div>
        </Section>

        <Section label="What the chain learns">
          <dl>
            {hides.map(([k, v]) => (
              <div key={k} className="border-b border-dotted border-ink-40 py-3">
                <dt>{k}</dt>
                <dd className="text-ink-60">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section label="Threats this does not stop">
          <ul className="flex list-none flex-col gap-3">
            <li>
              <span className="text-ink-60">Timing correlation.</span> If you post at 14:02 and your contact scans at 14:03 every day, a patient observer with RPC logs can guess. Chaff and irregular hours help; they do not solve it.
            </li>
            <li>
              <span className="text-ink-60">Fee-payer linkage.</span> The wallet that pays is public. A burner funded through an exchange withdrawal is still linked to that exchange account.
            </li>
            <li>
              <span className="text-ink-60">Sweep linkage.</span> Moving stealth funds into your everyday wallet ties them to you from that moment. Sweep to fresh wallets, or spend from the stealth key directly.
            </li>
            <li>
              <span className="text-ink-60">Amount fingerprinting.</span> Amounts are public. Odd amounts repeated are a signature. Round numbers blend.
            </li>
            <li>
              <span className="text-ink-60">Endpoint compromise.</span> Keys live in your browser. A malicious extension or a tampered build of this page can read them. Verify the build, or run it locally.
            </li>
            <li>
              <span className="text-ink-60">Retention.</span> Drops are permanent. Rotate addresses; forward secrecy here is per-drop on the sender side only.
            </li>
          </ul>
        </Section>

        <Section label="Lineage">
          <p className="text-ink-60">
            Trial decryption against a public stream is how Zcash wallets find their notes and how Bitmessage worked. One-time keys per payment are stealth addresses, from Monero and from Zcash's receiving side. Reading everything so nobody knows what you wanted is the PIR idea, done the cheap way. Cover traffic is Tor's answer to the same observer. Whisper borrows all four and adds nothing clever, on purpose.
          </p>
        </Section>
      </div>
    </>
  );
}
