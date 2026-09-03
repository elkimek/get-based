// @ts-check
// Runtime-neutral Get-based agent tool definitions shared by browser and host.

export const AGENT_TOOL_CONTRACT_VERSION = 1;
export const MAX_AGENT_PROFILE_ID_LENGTH = 128;
export const MAX_AGENT_SECTION_NAME_LENGTH = 80;

const AGENT_TOOL_CATALOG = Object.freeze([
  Object.freeze({
    name: 'getbased_lab_context',
    description: 'Read the user-approved Get-based health context, including available lab summaries, context cards, supplements, and goals. Use for broad questions about labs, biomarkers, or health trends.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        profile: Object.freeze({
          type: 'string',
          maxLength: MAX_AGENT_PROFILE_ID_LENGTH,
          description: 'Optional Get-based profile ID. Omit to use the active or default profile.',
        }),
      }),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: 'getbased_section',
    description: 'Read one section of the user-approved Get-based health context. Omit section to list available section names. Section names are matched exactly, then by prefix.',
    access: /** @type {const} */ ('read'),
    inputSchema: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        section: Object.freeze({
          type: 'string',
          maxLength: MAX_AGENT_SECTION_NAME_LENGTH,
          description: 'Optional section name, such as hormones, lipids, biometrics, supplements, genetics, or wearables.',
        }),
        profile: Object.freeze({
          type: 'string',
          maxLength: MAX_AGENT_PROFILE_ID_LENGTH,
          description: 'Optional Get-based profile ID. Omit to use the active or default profile.',
        }),
      }),
      additionalProperties: false,
    }),
  }),
]);

/** @param {unknown} value */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getAgentToolCatalog() {
  return cloneJson(AGENT_TOOL_CATALOG);
}

export function getCodexDynamicTools() {
  return AGENT_TOOL_CATALOG.map(({ name, description, inputSchema }) => ({
    type: 'function',
    name,
    description,
    inputSchema: cloneJson(inputSchema),
  }));
}
