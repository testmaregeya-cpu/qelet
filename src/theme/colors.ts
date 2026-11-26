export interface AppPalette {
  background: string;
  surface: string;
  surfaceMuted: string;
  navSurface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryLight: string;
  accentButtonText: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  amber: string;
  amberLight: string;
  orange: string;
  orangeLight: string;
  orangeSolidBg: string;
  danger: string;
  dangerLight: string;
  dangerSolidBg: string;
  openText: string;
  openBg: string;
  neutralBadge: string;
  neutralBadgeBg: string;
}

/**
 * Warm paper neutral ramp paired with one Birr ledger emerald accent
 * and contrast-safe semantic inks.
 */
export const LightPalette: AppPalette = {
  background: '#F7F4EE',
  surface: '#FDFBF7',
  surfaceMuted: '#EFE9DF',
  navSurface: '#FDFBF7',
  textPrimary: '#1F1B16',
  textSecondary: '#5E554A',
  textMuted: '#7B7266',
  border: 'rgba(31, 27, 22, 0.08)',
  borderStrong: 'rgba(31, 27, 22, 0.16)',
  primary: '#146C43',
  primaryLight: 'rgba(20, 108, 67, 0.09)',
  accentButtonText: '#FFFFFF',
  primaryButtonBg: '#1F1B16',
  primaryButtonText: '#FDFBF7',
  amber: '#9A5B13',
  amberLight: 'rgba(154, 91, 19, 0.10)',
  orange: '#B54708',
  orangeLight: 'rgba(181, 71, 8, 0.10)',
  orangeSolidBg: '#B54708',
  danger: '#B42318',
  dangerLight: 'rgba(180, 35, 24, 0.09)',
  dangerSolidBg: '#B42318',
  openText: '#1E4E8C',
  openBg: 'rgba(30, 78, 140, 0.09)',
  neutralBadge: '#5E554A',
  neutralBadgeBg: '#EFE9DF',
};

export const DarkPalette: AppPalette = {
  background: '#161513',
  surface: '#1C1A18',
  surfaceMuted: '#262421',
  navSurface: '#12110F',
  textPrimary: '#EFE9DE',
  textSecondary: '#AAA398',
  textMuted: '#8A847A',
  border: 'rgba(239, 233, 222, 0.08)',
  borderStrong: 'rgba(239, 233, 222, 0.16)',
  primary: '#4CC38A',
  primaryLight: 'rgba(76, 195, 138, 0.12)',
  accentButtonText: '#161513',
  primaryButtonBg: '#EFE9DE',
  primaryButtonText: '#161513',
  amber: '#E5A93B',
  amberLight: 'rgba(229, 169, 59, 0.12)',
  orange: '#EA7A38',
  orangeLight: 'rgba(234, 122, 56, 0.12)',
  orangeSolidBg: '#B54708',
  danger: '#E5484D',
  dangerLight: 'rgba(229, 72, 77, 0.12)',
  dangerSolidBg: '#B42318',
  openText: '#78A9FF',
  openBg: 'rgba(120, 169, 255, 0.12)',
  neutralBadge: '#AAA398',
  neutralBadgeBg: '#262421',
};

export const Palette = LightPalette;
