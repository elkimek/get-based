/** Shared by authored child components and synchronous native SSR hosts. */
const owners = new WeakMap<Element, object>();

export function contextChildIsOwned(host: Element): boolean {
  return owners.has(host);
}

/** The component lifetime owns subscriptions and DOM; a native host must not hydrate it again. */
export function ownContextChild(host: Element): () => void {
  if (owners.has(host)) throw new Error('Context child host already has a component owner');
  const owner = {};
  owners.set(host, owner);
  return () => {
    if (owners.get(host) === owner) owners.delete(host);
  };
}
