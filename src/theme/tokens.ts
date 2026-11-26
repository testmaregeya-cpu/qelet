import type { TextStyle } from 'react-native';

/** Strictly aligned to 4px grid. */
export const Space = {
  s4: 4,
  s8: 8,
  s12: 12,
  s16: 16,
  s20: 20,
  s24: 24,
  s32: 32,
  s40: 40,
  s48: 48,
} as const;

/** Nested radius tokens: inner = outer - padding, never below 4. */
export const Radius = {
  tag: 4,
  pill: 6,
  control: 8,
  innerCard: 12,
  card: 16,
  sheet: 20,
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
  | 'figureLg'
  | 'figureMd'
  | 'figureSm'
  | 'sectionTitle'
  | 'body'
  | 'bodyMedium'
  | 'caption'
  | 'meta'
  | 'monoMeta',
  TextStyle
> = {
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
