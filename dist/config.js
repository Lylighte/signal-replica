import {DEFAULT_SETTINGS} from './default-settings.js';
export const REFERENCE_OFFSET=64/30;
const at=time=>time+REFERENCE_OFFSET;
export const APP_CONFIG = Object.freeze({ optionSource: { mode: 'custom', presetId: 'four-difficulties' }, preview:DEFAULT_SETTINGS.preview, maxOptions: 8, maxDigits: 4, maxLabelLength: 12, duration: 17.507845804988662, stillTime: at(4.5) });
export const MOTION = Object.freeze({ introEnd:.55, selectStart:2.93, selectEnd:3.63, expandStart:at(2.12), expandEnd:at(3.42), numberAppear:at(74/30), flashEnd:at(94/30), numberSettle:at(3.55), flashes:[[at(73/30),at(81/30)],[at(85/30),at(94/30)]], rollStart:at(5.9), sideStart:at(8.8), sideEnd:at(11.1), labelExitEnd:at(11.6), exposureStart:at(10), exitStart:16.0, exitEnd:17.42, fadeStart:17.35, blankAt:17.45, glitchBursts:[[224/30,228/30,.28]], noiseBursts:[[202/30,206/30,.55],[210/30,215/30,.6],[221/30,223/30,.35],[224/30,229/30,.65],[232/30,233/30,.45]] });
export const PRESETS = Object.freeze([
  { id: 'four-difficulties', name: '四难度同屏', options: DEFAULT_SETTINGS.options },
  { id: 'ez-zero', name: 'EZ 0', options: [{id:'ez',label:'EZ',value:'0'}] }
]);

export function validateOption(option) {
  if (!option || typeof option !== 'object') throw new Error('选项格式无效。');
  const label = String(option.label ?? '').trim();
  const value = String(option.value ?? '').trim().replace(/[０-９]/g, c => String(c.charCodeAt(0)-65296));
  if (!label || Array.from(label).length > APP_CONFIG.maxLabelLength) throw new Error('选项名称需为 1–12 个字符。');
  if (!/^\d{1,4}$/.test(value)) throw new Error('数字需为 1–4 位非负整数。');
  if (typeof option.id !== 'string' || !option.id.trim()) throw new Error('选项缺少有效标识。');
  return { id: option.id, label, value };
}

export function validateOptions(options) {
  if (!Array.isArray(options) || options.length < 1 || options.length > APP_CONFIG.maxOptions) throw new Error('请设置 1–8 个选项。');
  const result = options.map(validateOption);
  if (new Set(result.map(x=>x.id)).size !== result.length) throw new Error('选项标识不能重复。');
  return result;
}

// Both development input and release presets resolve to the same renderer data.
export function resolveOptionSource(source, customOptions) {
  if (source?.mode === 'custom') return validateOptions(customOptions ?? PRESETS[0].options);
  if (source?.mode !== 'preset') throw new Error('未知选项来源。');
  const preset = PRESETS.find(p => p.id === source.presetId);
  if (!preset) throw new Error('未找到该选项预设。');
  return validateOptions(preset.options);
}
