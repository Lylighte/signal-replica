// Default configuration supplied in signal-settings.json.
export const DEFAULT_SETTINGS = {
  "format": "signal-studio",
  "version": 1,
  "options": [
    {
      "id": "ez",
      "label": "EZ",
      "value": "10"
    },
    {
      "id": "hd",
      "label": "HD",
      "value": "14"
    },
    {
      "id": "in",
      "label": "IN",
      "value": "17"
    },
    {
      "id": "at",
      "label": "AT",
      "value": "18"
    }
  ],
  "design": {
    "numberSize": 400,
    "numberWeight": 900,
    "numberWidth": 1.15,
    "numberBrightness": 200,
    "numberGlowRadius": 45,
    "numberGlowStrength": 0.85,
    "scanStrength": 0,
    "scanSpacing": 6,
    "numberGap": 260,
    "rowPitch": 300,
    "finalColumns": 5,
    "finalColumnGap": 170,
    "finalWidth": 0.6,
    "singleScale": 1.45,
    "labelSize": 24,
    "labelWeight": 400,
    "labelBrightness": 224,
    "labelGlowRadius": 28,
    "labelGlowStrength": 2,
    "optionGap": 105,
    "labelLeft": 60,
    "labelRight": 660,
    "labelMaxWidth": 130,
    "labelExitLeft": 320,
    "labelExitRight": 260,
    "centerBrightness": 1,
    "edgeBrightness": 0.6,
    "vignetteKnee": 0.74,
    "motionBlur": 1.75,
    "glitchStrength": 1,
    "flashBrightness": 216,
    "washBrightness": 105,
    "scanLineStrength": 0.09,
    "scanLineSpacing": 6,
    "scanLineWidth": 1.5,
    "noiseStrength": 0.65,
    "noiseDensity": 420,
    "noiseBlockSize": 12,
    "noiseBandStrength": 0.22,
    "easingCurve": "sigmoid",
    "easingPower": 4,
    "sigmoidSteepness": 13,
    "settleWindow": 0.1,
    "settleStagger": 0,
    "introDuration": 0.9,
    "introSpread": 2.05,
    "introSize": 1.7,
    "introBlur": 12,
    "selectDuration": 0.85,
    "expandDuration": 0.75,
    "labelExitDuration": 6.64,
    "pressStart": 2.033333333333333,
    "pressDuration": 0.4,
    "pressFade": 0.1,
    "pressOpacity": 0.1,
    "exitLetterSpread": 30,
    "exitExpandDuration": 0.4,
    "screenCurve": "curved",
    "screenCurvature": 0.06,
    "rollSpeed": 1,
    "placeRatio": 0.25,
    "placeStagger": 0.32,
    "speedConverge": 6.7,
    "pushDuration": 3.7,
    "revealStagger": 0.28
  },
  "preview": {
    "view": "single",
    "selectedId": "at",
    "aspect": "16:9"
  }
};
Object.freeze(DEFAULT_SETTINGS.design); Object.freeze(DEFAULT_SETTINGS.preview); DEFAULT_SETTINGS.options.forEach(Object.freeze); Object.freeze(DEFAULT_SETTINGS.options); Object.freeze(DEFAULT_SETTINGS);
export const DESIGN_STORAGE_KEY = 'signal-design-v2';
