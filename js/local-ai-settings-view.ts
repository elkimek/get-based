import { getOllamaConfig, getOllamaMainModel } from './api.js';
import { getLocalAiExecutionLocation, isCloudModel } from './local-ai-discovery.js';
import { getLocalAiReleasePlan } from './local-ai-lifecycle.js';
import { assessModel, assessFitness, getBestModel, getUpgradeSuggestion, getHardwareOverride, detectHardware } from './hardware.js';
import type { LocalAiModel } from './local-ai-provider-shared.js';
import type { AdvisorModel, LocalAiAdvisor, LocalAiSettingsSnapshot, LocalAiTone } from './local-ai-settings-contract.js';
export type AdvisorHardware = Awaited<ReturnType<typeof detectHardware>>;

export function checkedAdvisorModels(rows: readonly LocalAiModel[]): AdvisorModel[] {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (typeof row?.name !== 'string' || !row.name || seen.has(row.name)) return [];
    seen.add(row.name);
    const checked: AdvisorModel = { name: row.name };
    for (const key of ['size', 'contextLength', 'maxContextLength', 'vramAllocated'] as const) {
      if (typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0) checked[key] = row[key];
    }
    for (const key of ['quantLevel', 'paramSize', 'format', 'sizeSource', 'source', 'executionLocation'] as const) if (typeof row[key] === 'string') checked[key] = row[key];
    if (typeof row.loaded === 'boolean' || row.loaded === null) checked.loaded = row.loaded;
    return [checked];
  });
}
export function localAiLocationSnapshot(url: string, selectedModel: string): Pick<LocalAiSettingsSnapshot, 'locationCopy' | 'insecureRemote' | 'pricing'> {
  const location = getLocalAiExecutionLocation(url, selectedModel);
  const locationCopy = location === 'cloud' ? 'The selected model is cloud-hosted and sends requests off-device.'
    : location === 'local' ? 'The configured server is on this device.'
      : location === 'lan' ? 'The configured server is on your local network; requests leave this browser device.'
        : 'The configured endpoint is remote; its operator and transport determine privacy.';
  return { locationCopy, insecureRemote: location !== 'local' && location !== 'cloud' && /^http:\/\//i.test(url), pricing: { text: isCloudModel(selectedModel) ? 'Cloud model · provider terms may apply' : 'No app fee · configured server', tone: isCloudModel(selectedModel) ? 'warning' : 'success' } };
}
export function buildLocalAiSettingsSnapshot(): LocalAiSettingsSnapshot {
  const selectedModel = getOllamaMainModel();
  return { ...localAiLocationSnapshot(getOllamaConfig().url, selectedModel), selectedModel, models: [], advisor: null };
}
const fitTones: Record<string, LocalAiTone> = { fits: 'success', tight: 'warning', toobig: 'danger', cloud: 'secondary', unknown: 'secondary' };
const fitnessLabels: Record<string, string> = { recommended: '★ Recommended', capable: 'Capable', underpowered: 'Underpowered', inadequate: 'Inadequate' };
const fitnessTones: Record<string, LocalAiTone> = { recommended: 'success', capable: 'secondary', underpowered: 'warning', inadequate: 'danger' };

export function buildLocalAiAdvisor(details: readonly AdvisorModel[], hw: AdvisorHardware, local: boolean, isOllama: boolean, currentModel: string, override = getHardwareOverride()): LocalAiAdvisor {
  const best = getBestModel(details, hw.gpu.vram ? hw : null);
  const gpu = hw.gpu;
  const gpuLabel = !local && !gpu.vram ? 'Remote server — enter VRAM below to check model fit'
    : gpu.vram ? `${gpu.name || 'Server'} — ${gpu.vram} GB ${gpu.unified ? 'unified memory' : 'VRAM'}${gpu.source === 'manual' ? ' (manual)' : ''}`
      : gpu.source === 'blocked' || gpu.source === 'unavailable' ? 'GPU not detected'
        : gpu.renderer ? `${gpu.renderer} (VRAM unknown)` : 'GPU not detected';
  const chips = [gpuLabel];
  const allocated = details.reduce((total, model) => total + (model.vramAllocated || 0), 0);
  const provider = isOllama ? 'ollama' : details.some(model => model.source === 'lmstudio') ? 'lmstudio' : details.some(model => model.source === 'unsloth') ? 'unsloth' : 'openai-compatible';
  if (allocated > 0) chips.push(`${getLocalAiReleasePlan({ provider, modelDetails: [...details] }).providerLabel} currently allocated — ${(allocated / 1e9).toFixed(1)} GB VRAM`);
  if (local && hw.ram.gb) chips.push(`${hw.ram.gb} GB RAM`);
  if (local && hw.cpuThreads) chips.push(`${hw.cpuThreads} threads`);
  const rows = details.map(model => {
    const size = model.size || 0;
    const assessment = model.executionLocation === 'cloud' || isCloudModel(model.name) ? assessModel(model, hw)
      : !size ? { tier: 'unknown', badge: '?', label: 'Size unknown' }
        : gpu.vram ? assessModel(model, hw)
          : { ...assessModel(model, { gpu: { vram: null, unified: false } }), label: local ? 'Set VRAM to check' : 'Enter VRAM' };
    const fitness = assessFitness(model.name);
    const runtime = [model.format, model.loaded === true ? 'loaded now' : model.loaded === false ? 'available — loads on first request' : model.loaded === null ? 'runtime load state unavailable' : '',
      (model.contextLength || 0) > 0 ? `${model.contextLength!.toLocaleString()} token context loaded` : '',
      (model.maxContextLength || 0) > (model.contextLength || 0) ? `${model.maxContextLength!.toLocaleString()} max context` : '',
      (model.vramAllocated || 0) > 0 ? `${(model.vramAllocated! / 1e9).toFixed(1)} GB VRAM allocated` : ''].filter(Boolean);
    return { name: model.name, active: model.name === currentModel, best: model.name === best?.name,
      badge: assessment.badge, verdict: assessment.label, tone: fitTones[assessment.tier] || 'secondary',
      size: [size ? `${model.sizeSource === 'estimated' ? '~' : ''}${(size / 1e9).toFixed(1)} GB` : '', model.quantLevel, model.paramSize].filter(Boolean).join(' · '),
      details: runtime.join(' · '), fitness: fitness ? fitnessLabels[fitness.tier] || 'Unknown' : 'Unknown', fitnessNote: fitness?.note || '', fitnessTone: fitness ? fitnessTones[fitness.tier] || 'secondary' : 'secondary' };
  });
  const upgrade = getUpgradeSuggestion(details, gpu.vram ? hw : null);
  return { local, chips, rows, suggestion: upgrade ? { model: upgrade.model, command: isOllama ? `ollama pull ${upgrade.model}` : null, note: upgrade.note } : null,
    override, overridePlaceholder: String(gpu.vram || 'GB'), overrideLabel: local ? 'Override VRAM' : 'Server VRAM', overrideOpen: !local && !override };
}
export function buildLocalAiModelLabels(models: readonly string[], details: readonly AdvisorModel[], hw: AdvisorHardware): LocalAiSettingsSnapshot['models'] {
  return models.map(value => {
    const detail = details.find(model => model.name === value);
    if (!detail) return { value, label: value };
    const assessment = hw.gpu.vram ? assessModel(detail, hw) : null;
    const star = assessFitness(value)?.tier === 'recommended' ? '★ ' : '';
    const size = detail.size ? `${detail.sizeSource === 'estimated' ? '~' : ''}${(detail.size / 1e9).toFixed(1)} GB` : '';
    return { value, label: (assessment ? assessment.badge + ' ' : '') + star + [value, size, detail.quantLevel].filter(Boolean).join(' · ') };
  });
}
