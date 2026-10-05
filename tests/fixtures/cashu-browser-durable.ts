// Prepared-operation adapter for the browser's simulated mint. Production uses
// the actual SDK; these fixtures model mint signatures, spent inputs and replay.
interface BrowserProof { secret: string; amount: unknown; C?: unknown; spent?: boolean }
interface BrowserOutput { blindedMessage: { B_: string; id: string; amount: unknown }; fixtureProof: BrowserProof }
interface BrowserPreview { inputs: BrowserProof[]; sendOutputs: BrowserOutput[]; keepOutputs: BrowserOutput[]; unselectedProofs: BrowserProof[]; keysetId: string }
interface BrowserQuote { quote: string; state?: unknown }
interface BrowserToken {proofs: BrowserProof[]}
interface BrowserWallet {
  send(amount: unknown, proofs: BrowserProof[]): Promise<{send?: BrowserProof[]; keep?: BrowserProof[]}>;
  receive(token: string): Promise<BrowserProof[]>;
  mintProofsBolt11(amount: unknown, quote: string): Promise<BrowserProof[]>;
  meltProofsBolt11(quote: BrowserQuote, proofs: BrowserProof[]): Promise<Record<string, unknown>>;
  groupProofsByState(proofs: BrowserProof[]): Promise<unknown>;
  completeSwap(p: BrowserPreview): Promise<{send: BrowserProof[];keep: BrowserProof[]}>;
  prepareMint(method: string, amount: unknown, quote: BrowserQuote): Promise<{method: string;quote: BrowserQuote;keysetId: string;outputData: BrowserOutput[]}>;
  completeMint(p: {outputData: BrowserOutput[]}): Promise<BrowserProof[]>;
  prepareMelt(method: string, quote: BrowserQuote, proofs: BrowserProof[]): Promise<{method: string;quote: BrowserQuote;inputs: BrowserProof[];outputData: BrowserOutput[]}>;
  completeMelt(p: {quote: BrowserQuote;inputs: BrowserProof[]}): Promise<Record<string, unknown>>;
}
// The caller installs a simulated SDK; these erased read views preserve its
// original unchecked methods and raw metadata without claiming real SDK shape.
interface BrowserSdkReader {
  Wallet: {prototype: BrowserWallet};
  getEncodedToken(data: BrowserToken): string;
  getDecodedToken(token: string): BrowserToken;
  getTokenMetadata(token: string): unknown;
  sumProofs(proofs: BrowserProof[]): unknown;
  OutputData: {serialize(o: BrowserOutput): BrowserOutput; deserialize(o: BrowserOutput): BrowserOutput & {toProof(): BrowserProof}};
  Mint: new () => {restore(request: {outputs: {B_: string}[]}): Promise<{outputs: {B_: string}[];signatures: ({id: string;amount: unknown}|undefined)[]}>};
}
export function installDurableBrowserStub(sdk: unknown, incomingAmount: () => unknown) {
  const Wallet = (sdk as BrowserSdkReader).Wallet;
  const tokens = new Map<string, BrowserToken>(), signatures = new Map<string, {id: string; amount: unknown}>(), spent = new Set<string>();
  const output = (p: BrowserProof) => ({ blindedMessage: { B_: 'B-' + p.secret, id: 'browser-keyset', amount: p.amount }, fixtureProof: p });
  const preview = (result: {send?: BrowserProof[];keep?: BrowserProof[]}, inputs: BrowserProof[] = []) => ({ inputs, keysetId: 'browser-keyset', unselectedProofs: [], sendOutputs: (result.send || []).map(output), keepOutputs: (result.keep || []).map(output) });
  Object.defineProperty(Wallet.prototype, 'ops', { get(this: BrowserWallet) { return {
    send: (amount: unknown, proofs: BrowserProof[]) => { const builder = { includeFees: () => builder, prepare: async () => preview(await this.send(amount, proofs), proofs) }; return builder; },
    receive: (token: string) => ({ prepare: async () => preview({ keep: await this.receive(token) }, tokens.get(token)?.proofs || []) }),
  }; } });
  Wallet.prototype.completeSwap = async function(p: BrowserPreview) {
    for (const input of p.inputs) spent.add(input.secret);
    for (const o of [...p.sendOutputs, ...p.keepOutputs]) signatures.set(o.blindedMessage.B_, { id: o.blindedMessage.id, amount: o.blindedMessage.amount });
    return { send: p.sendOutputs.map(o => o.fixtureProof), keep: p.keepOutputs.map(o => o.fixtureProof) };
  };
  Wallet.prototype.prepareMint = async function(method: string, amount: unknown, quote: BrowserQuote) { return { method, quote, keysetId: 'browser-keyset', outputData: (await this.mintProofsBolt11(amount, quote.quote)).map(output) }; };
  Wallet.prototype.completeMint = async function(p: {outputData: BrowserOutput[]}) { return p.outputData.map(o => o.fixtureProof); };
  Wallet.prototype.prepareMelt = async function(method: string, quote: BrowserQuote, proofs: BrowserProof[]) { return { method, quote, inputs: proofs, outputData: [output({ secret: 'change-' + quote.quote, amount: 1, C: 'change' })] }; };
  Wallet.prototype.completeMelt = async function(p: {quote: BrowserQuote;inputs: BrowserProof[]}) { const result = await this.meltProofsBolt11(p.quote, p.inputs); for (const input of p.inputs) spent.add(input.secret); return { ...result, quote: { ...p.quote, state: 'PAID' } }; };
  const group = Wallet.prototype.groupProofsByState;
  Wallet.prototype.groupProofsByState = async function(proofs: BrowserProof[]) { return group.call(this, proofs.map(p => spent.has(p.secret) ? { ...p, spent: true } : p)); };
  const encode = (sdk as BrowserSdkReader).getEncodedToken;
  (sdk as BrowserSdkReader).getEncodedToken = data => { const token = encode(data); tokens.set(token, data); return token; };
  (sdk as BrowserSdkReader).getDecodedToken = token => tokens.get(token) || { proofs: [{ secret: token, amount: 1 }] };
  const metadata = (sdk as BrowserSdkReader).getTokenMetadata;
  (sdk as BrowserSdkReader).getTokenMetadata = token => ({ ...metadata(token) as Record<string, unknown>, amount: tokens.has(token) ? (sdk as BrowserSdkReader).sumProofs(tokens.get(token)!.proofs) : incomingAmount() });
  (sdk as BrowserSdkReader).OutputData = { serialize: o => o, deserialize: o => ({ ...o, toProof: () => o.fixtureProof }) };
  (sdk as BrowserSdkReader).Mint = class { async restore({ outputs }: {outputs: {B_: string}[]}) { const found = outputs.filter(o => signatures.has(o.B_)); return { outputs: found, signatures: found.map(o => signatures.get(o.B_)) }; } };
  return { spendToken: (token: string) => { for (const p of tokens.get(token)?.proofs || []) spent.add(p.secret); } };
}
