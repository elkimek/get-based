// Prepared-operation adapter for the browser's simulated mint. Production uses
// the actual SDK; these fixtures model mint signatures, spent inputs and replay.
export function installDurableBrowserStub(sdk, incomingAmount) {
  const Wallet = sdk.Wallet;
  const tokens = new Map(), signatures = new Map(), spent = new Set();
  const output = p => ({ blindedMessage: { B_: 'B-' + p.secret, id: 'browser-keyset', amount: p.amount }, fixtureProof: p });
  const preview = (result, inputs = []) => ({ inputs, keysetId: 'browser-keyset', unselectedProofs: [], sendOutputs: (result.send || []).map(output), keepOutputs: (result.keep || []).map(output) });
  Object.defineProperty(Wallet.prototype, 'ops', { get() { return {
    send: (amount, proofs) => { const builder = { includeFees: () => builder, prepare: async () => preview(await this.send(amount, proofs), proofs) }; return builder; },
    receive: token => ({ prepare: async () => preview({ keep: await this.receive(token) }, tokens.get(token)?.proofs || []) }),
  }; } });
  Wallet.prototype.completeSwap = async function(p) {
    for (const input of p.inputs) spent.add(input.secret);
    for (const o of [...p.sendOutputs, ...p.keepOutputs]) signatures.set(o.blindedMessage.B_, { id: o.blindedMessage.id, amount: o.blindedMessage.amount });
    return { send: p.sendOutputs.map(o => o.fixtureProof), keep: p.keepOutputs.map(o => o.fixtureProof) };
  };
  Wallet.prototype.prepareMint = async function(method, amount, quote) { return { method, quote, keysetId: 'browser-keyset', outputData: (await this.mintProofsBolt11(amount, quote.quote)).map(output) }; };
  Wallet.prototype.completeMint = async function(p) { return p.outputData.map(o => o.fixtureProof); };
  Wallet.prototype.prepareMelt = async function(method, quote, proofs) { return { method, quote, inputs: proofs, outputData: [output({ secret: 'change-' + quote.quote, amount: 1, C: 'change' })] }; };
  Wallet.prototype.completeMelt = async function(p) { const result = await this.meltProofsBolt11(p.quote, p.inputs); for (const input of p.inputs) spent.add(input.secret); return { ...result, quote: { ...p.quote, state: 'PAID' } }; };
  const group = Wallet.prototype.groupProofsByState;
  Wallet.prototype.groupProofsByState = async function(proofs) { return group.call(this, proofs.map(p => spent.has(p.secret) ? { ...p, spent: true } : p)); };
  const encode = sdk.getEncodedToken;
  sdk.getEncodedToken = data => { const token = encode(data); tokens.set(token, data); return token; };
  sdk.getDecodedToken = token => tokens.get(token) || { proofs: [{ secret: token, amount: 1 }] };
  const metadata = sdk.getTokenMetadata;
  sdk.getTokenMetadata = token => ({ ...metadata(token), amount: tokens.has(token) ? sdk.sumProofs(tokens.get(token).proofs) : incomingAmount() });
  sdk.OutputData = { serialize: o => o, deserialize: o => ({ ...o, toProof: () => o.fixtureProof }) };
  sdk.Mint = class { async restore({ outputs }) { const found = outputs.filter(o => signatures.has(o.B_)); return { outputs: found, signatures: found.map(o => signatures.get(o.B_)) }; } };
  return { spendToken: token => { for (const p of tokens.get(token)?.proofs || []) spent.add(p.secret); } };
}
