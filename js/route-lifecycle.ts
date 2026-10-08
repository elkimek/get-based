// Route identity survives same-view refreshes, unlike a rendered DOM node.
let revision = 0;
export function routeRevision(): number { return revision; }
export function recordRouteChange(): void { revision++; }
