// Maintained channel explanations and references. Domain estimates remain in their services.
export interface ChannelCitation { spectrum: string; refs: { cite: string; href: string; why: string }[] }
export const CHANNEL_CITATIONS: Readonly<Record<string, ChannelCitation>> = {
  vitamin_d: {
    spectrum: 'Pre-vitamin-D action spectrum (CIE 174:2006), peak ~298 nm UVB',
    refs: [
      { cite: 'Webb AR & Engelsen O (2006). "Calculated ultraviolet exposure levels for a healthy vitamin D status." Photochem Photobiol 82:1697',
        href: 'https://pubmed.ncbi.nlm.nih.gov/16958558/',
        why: 'Shows how vitamin-D-effective UV varies by place and season; the engine uses its spectral integral rather than a universal UVI cliff' },
      { cite: 'Holick MF (2007). "Vitamin D Deficiency." NEJM 357:266',
        href: 'https://www.nejm.org/doi/full/10.1056/NEJMra070553',
        why: 'Most-cited modern clinical review of the vitamin D pathway, including the per-session photoisomerization plateau (skin converts excess previtamin-D to inert tachysterol/lumisterol at high doses)' },
      { cite: 'Bogh MK & Wulf HC (2010). "Vitamin D production after UVB exposure depends on baseline 25(OH)D and total cholesterol." J Invest Dermatol 130:546',
        href: 'https://pubmed.ncbi.nlm.nih.gov/19812604/',
        why: 'Shows large per-session response variability and why the IU-equivalent band must remain broad' },
    ],
  },
  circadian: {
    spectrum: 'Melanopic action spectrum (CIE S 026/E:2018), peak ~490 nm',
    refs: [
      { cite: 'Brown TM et al. (2022). "Recommendations for daytime, evening, and nighttime indoor light exposure." PLOS Biol 20:e3001571',
        href: 'https://doi.org/10.1371/journal.pbio.3001571',
        why: 'Current expert-consensus recommendations: ≥250 melanopic lux daytime, <10 evening, <1 night' },
      { cite: 'Lucas RJ et al. (2014). "Measuring and using light in the melanopsin age." Trends Neurosci 37:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24287308/',
        why: 'Foundational paper that informed the M-EDI / α-opic lux framework later codified in CIE S 026' },
      { cite: 'Hattar S et al. (2002). "Melanopsin-containing retinal ganglion cells: architecture, projections, and intrinsic photosensitivity." Science 295:1065',
        href: 'https://pubmed.ncbi.nlm.nih.gov/11834834/',
        why: 'Discovery of melanopsin and the ipRGC photoreceptor — the why-this-channel-exists paper' },
    ],
  },
  nir_solar: {
    spectrum: 'Red and near-infrared light, roughly 600–1400 nm. Sunlight and targeted devices are shown separately because their spectra and delivery are different.',
    refs: [
      { cite: '"Longer wavelengths in sunlight pass through the human body and have a systemic impact which improves vision." Scientific Reports 15:24435 (2025)',
        href: 'https://pubmed.ncbi.nlm.nih.gov/40628952/',
        why: 'Human work measuring long-wave sunlight through the body and testing a separate 850 nm body exposure' },
      { cite: '"A Controlled Trial to Determine the Efficacy of Red and Near-Infrared Light Treatment." Photomed Laser Surg 32:93 (2014)',
        href: 'https://doi.org/10.1089/pho.2013.3616',
        why: 'A controlled study of broad red and near-infrared light for the specific skin outcomes tested' },
      { cite: '"Melatonin and the Optics of the Human Body." Melatonin Research 2:138 (2019)',
        href: 'https://doi.org/10.32794/MR11250016',
        why: 'Introduces the proposed link between near-infrared light, body optics, and melatonin inside cells' },
      { cite: 'Hamblin MR (2018). "Mechanisms and Mitochondrial Redox Signaling in Photobiomodulation." Photochem Photobiol 94:199',
        href: 'https://pubmed.ncbi.nlm.nih.gov/29164625/',
        why: 'Reviews several ways red and near-infrared light may interact with cell energy and signaling' },
    ],
  },
  no_cv: {
    spectrum: 'UVA + violet (320-440 nm) on bare skin → photo-released NO',
    refs: [
      { cite: 'Liu D et al. (2014). "UVA irradiation of human skin vasodilates arterial vasculature and lowers blood pressure independently of nitric oxide synthase." J Invest Dermatol 134:1839',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24445737/',
        why: 'Controlled mechanistic crossover trial showing UVA on skin lowers BP via photo-released NO from skin stores (NOT via vit-D)' },
      { cite: 'Lindqvist PG et al. (2016). "Avoidance of sun exposure as a risk factor for major causes of death." J Intern Med 280:375',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26992108/',
        why: 'Observational association over 20 years; it does not prove causality or make intentional UV exposure a treatment' },
      { cite: 'Feelisch M et al. (2010). "Is sunlight good for our heart?" Eur Heart J 31:1041',
        href: 'https://pubmed.ncbi.nlm.nih.gov/20215123/',
        why: 'Foundational hypothesis paper laying out the UVA→NO→cardiovascular mechanism' },
    ],
  },
  pomc: {
    spectrum: 'UVA + UVB on skin keratinocytes → POMC → α-MSH/β-endorphin',
    refs: [
      { cite: 'Fell GL et al. (2014). "Skin β-endorphin mediates addiction to UV light." Cell 157:1527',
        href: 'https://pubmed.ncbi.nlm.nih.gov/24949966/',
        why: 'Landmark Cell paper showing UV → keratinocyte β-endorphin → opioid-receptor-mediated mood/addictive response' },
      { cite: 'Slominski A et al. (2012). "Sensing the environment: regulation of local and global homeostasis by the skin\'s neuroendocrine system." Adv Anat Embryol Cell Biol 212:1',
        href: 'https://pubmed.ncbi.nlm.nih.gov/22894052/',
        why: 'Comprehensive review of skin as a neuroendocrine organ — POMC, α-MSH, ACTH, cortisol all expressed in skin' },
      { cite: 'Cui R et al. (2007). "Central role of p53 in the suntan response and pathologic hyperpigmentation." Cell 128:853',
        href: 'https://pubmed.ncbi.nlm.nih.gov/17350573/',
        why: 'p53 → POMC → α-MSH → melanin pathway: the molecular mechanism behind the tan signal' },
    ],
  },
  violet_eye: {
    spectrum: 'Outdoor violet-light hypothesis, roughly 360–400 nm at the eye. Human evidence is stronger for time outdoors than for a wavelength-specific dose, and this is not a reason to expose unprotected eyes to UV.',
    refs: [
      { cite: 'Torii H et al. (2017). "Violet light exposure can be a preventive strategy against myopia progression." EBioMedicine 15:210',
        href: 'https://pubmed.ncbi.nlm.nih.gov/28063778/',
        why: 'Early human and experimental evidence for a violet-light hypothesis; it does not establish a safe eye-exposure dose' },
      { cite: 'Rose KA et al. (2008). "Outdoor activity reduces the prevalence of myopia in children." Ophthalmology 115:1279',
        href: 'https://pubmed.ncbi.nlm.nih.gov/18294691/',
        why: 'Cohort of >4000 kids (1,765 six-year-olds + 2,367 twelve-year-olds): time outdoors (not near-work) is the protective factor against myopia' },
      { cite: 'He M et al. (2015). "Effect of Time Spent Outdoors at School on the Development of Myopia Among Children in China: A Randomized Clinical Trial." JAMA 314:1142',
        href: 'https://pubmed.ncbi.nlm.nih.gov/26372583/',
        why: 'JAMA RCT in ~1,900 first-graders: 40 extra outdoor min/day cut new-myopia incidence by 9 percentage points (39.5% → 30.4%, ~23% relative reduction)' },
    ],
  },
};


export const CHANNEL_READING_NOTES: Readonly<Record<string, string>> = {
    vitamin_d:  'This shows when vitamin-D-effective UVB reached uncovered skin. It is not a reason to stay outside longer.',
    nir_solar:  'This records red and near-infrared exposure. Sunlight and a targeted device are not treated as the same experience.',
    circadian:  'For the body clock, timing matters most. Morning light and evening light can send different signals.',
    no_cv:      'This is a modeled skin-light signal, not a blood-pressure reading or a reason to seek more UVA.',
    pomc:       'This shows light that may start the skin pathway. It does not measure hormones or mood.',
    violet_eye: 'This is an early-stage pathway model. Use normal ambient outdoor light and never stare at the sun.',
  };

export function channelTakeaway(channel: string, hasSun: boolean, hasDevice: boolean): string {
  const recipes: Readonly<Record<string, string>> = {
    vitamin_d: hasSun
      ? 'Vitamin-D-effective UVB reached uncovered skin in your sunlight log. Keep following the burn guide; more is not automatically better.'
      : 'This signal only appears when vitamin-D-effective UVB reaches uncovered skin. Its absence is not a prompt to extend exposure.',
    circadian: hasSun
      ? 'Outdoor light reached the eyes in your recent logs. Keep the timing steady; morning and evening light do not send the same message.'
      : 'Normal ambient outdoor light in the morning can provide a clear day signal. There is no need to look at the sun.',
    nir_solar: hasSun
      ? `Your sunlight log included red and near-infrared light.${hasDevice ? ' The device signal is shown separately because it is more targeted.' : ''}`
      : 'An outdoor session naturally includes red and near-infrared light as part of the wider daylight spectrum.',
    no_cv: hasSun
      ? 'A UVA-related skin signal was modeled in your sunlight log. This does not measure blood pressure or make extra UVA advisable.'
      : 'This signal appears when UVA reaches logged skin. No signal means it was not modeled, not that your body is deficient.',
    pomc: hasSun
      ? 'Sunlight reached a skin pathway linked with pigment and neuroendocrine signaling. The app does not measure hormones or mood.'
      : 'This pathway appears when the relevant sunlight reaches logged skin. It is something to observe, not a UV goal.',
    violet_eye: hasSun
      ? 'Ambient outdoor light reached this modeled eye pathway. Keep normal eye protection when needed and never stare at the sun.'
      : 'A normal outdoor walk can provide ambient violet light. The human biology is still being studied.',
  };
  return recipes[channel] || '';
}
