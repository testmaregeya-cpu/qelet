import type { TextStyle } from 'react-native';

/** Strictly aligned to 4px grid. */
export const Space = {
  s2: 2,
  s4: 4,
  s6: 6,
  s8: 8,
  s10: 10,
  s12: 12,
  s14: 14,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
} as const;

export const Hairline = 0.5;

/** Nested radius tokens: inner = outer - padding, never below 4. */
export const Radius = {
  tag: 6,
  pill: 999,
  control: 10,
  innerCard: 14,
  card: 18,
  sheet: 26,
  full: 999,
} as const;

export const Fonts = {
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemi: 'DMSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const Type: Record<
  | 'pageTitle'
  | 'heroTitle'
  | 'heroFigure'
  | 'amountHero'
  | 'figureLg'
  | 'figureMd'
  | 'figureSm'
  | 'sectionTitle'
  | 'sectionHeader'
  | 'body'
  | 'bodyMedium'
  | 'caption'
  | 'meta'
  | 'monoMeta',
  TextStyle
> = {
  amountHero: {
    fontFamily: Fonts.sansSemi,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  heroFigure: {
    fontFamily: Fonts.sansSemi,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  heroTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.4,
  },
  pageTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  figureLg: {
    fontFamily: Fonts.sansMedium,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  figureMd: {
    fontFamily: Fonts.sansMedium,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  figureSm: {
    fontFamily: Fonts.monoMedium,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  sectionHeader: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  monoMeta: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
};
