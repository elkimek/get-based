// Retired chat entry points reject cached requests; persona management stays native.
const manualOnly = () => new Error('Persona management is available only in the manual persona picker and editor.');
export async function readPersonaDirectory(..._args: unknown[]): Promise<never> { throw manualOnly(); }
export async function preparePersonaSelectionRequest(..._args: unknown[]): Promise<never> { throw manualOnly(); }
export async function openPersonaEditor(..._args: unknown[]): Promise<never> { throw manualOnly(); }
export async function openPersonaDeletion(..._args: unknown[]): Promise<never> { throw manualOnly(); }
