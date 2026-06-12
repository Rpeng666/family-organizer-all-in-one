export const DEFAULT_THEME_NAME = 'classic';

export const themes = {
  classic: {
    id: 'classic',
    label: 'Cobalt Studio',
    description: 'A polished cobalt canvas with bright porcelain surfaces and vivid family accents.',
    preview: ['#487BFF', '#FF8558', '#18A999', '#6AAD3D', '#C7961A'],
    colors: {
      bg: '#EEF3FF',
      panel: '#FFFFFF',
      panelElevated: '#F8FBFF',
      ink: '#0E1C33',
      inkMuted: '#61728E',
      line: '#D4DDF0',
      accentDashboard: '#487BFF',
      accentChores: '#FF8558',
      accentCalendar: '#18A999',
      accentFinance: '#6AAD3D',
      accentMore: '#C7961A',
      accentTasks: '#9B6BFF',
      warning: '#D97706',
      danger: '#E14D68',
      success: '#149A67',
      locked: '#AAB5C7',
      onAccent: '#F8FBFF',
      canvas: '#102968',
      canvasMuted: '#173C8F',
      canvasStrong: '#091A47',
      canvasText: '#F5F8FF',
      canvasTextMuted: '#C7D4F5',
      canvasLine: 'rgba(255,255,255,0.14)',
      surfaceMuted: '#EAF1FF',
      surfaceAccent: '#DDE8FF',
      surfaceAccentStrong: '#C9DBFF',
      tabBar: '#0C1734',
      tabBarBorder: 'rgba(255,255,255,0.12)',
    },
  },
  bright: {
    id: 'bright',
    label: 'Sunrise Ledger',
    description: 'A brighter editorial look with warm light surfaces and punchier accents.',
    preview: ['#426DFF', '#FF8A4A', '#0FA99F', '#58AF43', '#D3A21F'],
    colors: {
      bg: '#FFF7EF',
      panel: '#FFFFFF',
      panelElevated: '#FFFDFC',
      ink: '#1F2230',
      inkMuted: '#756E6A',
      line: '#E9DCCF',
      accentDashboard: '#426DFF',
      accentChores: '#FF8A4A',
      accentCalendar: '#0FA99F',
      accentFinance: '#58AF43',
      accentMore: '#D3A21F',
      accentTasks: '#8F5EFF',
      warning: '#D9822B',
      danger: '#DD5A52',
      success: '#20986A',
      locked: '#C6BFB7',
      onAccent: '#FFFDF8',
      canvas: '#17326E',
      canvasMuted: '#21469B',
      canvasStrong: '#0B1D4D',
      canvasText: '#F8FAFF',
      canvasTextMuted: '#D0DAF7',
      canvasLine: 'rgba(255,255,255,0.15)',
      surfaceMuted: '#FFF0E2',
      surfaceAccent: '#E6ECFF',
      surfaceAccentStrong: '#D6E1FF',
      tabBar: '#18223F',
      tabBarBorder: 'rgba(255,255,255,0.12)',
    },
  },
  paper: {
    id: 'paper',
    label: 'Cloud Paper',
    description: 'Quiet white surfaces with cool slate structure and high-clarity accents.',
    preview: ['#3767F7', '#FA8344', '#15A39B', '#5CAB42', '#C09218'],
    colors: {
      bg: '#F6F8FC',
      panel: '#FFFFFF',
      panelElevated: '#FBFCFF',
      ink: '#111D34',
      inkMuted: '#66758D',
      line: '#D9E1EF',
      accentDashboard: '#3767F7',
      accentChores: '#FA8344',
      accentCalendar: '#15A39B',
      accentFinance: '#5CAB42',
      accentMore: '#C09218',
      accentTasks: '#8A59F7',
      warning: '#D27D1B',
      danger: '#D94F69',
      success: '#1B9A66',
      locked: '#B3BCCD',
      onAccent: '#F8FBFF',
      canvas: '#122A62',
      canvasMuted: '#204790',
      canvasStrong: '#0B173B',
      canvasText: '#F7FAFF',
      canvasTextMuted: '#CFD8EE',
      canvasLine: 'rgba(255,255,255,0.14)',
      surfaceMuted: '#F1F5FF',
      surfaceAccent: '#E2EBFF',
      surfaceAccentStrong: '#D1DFFF',
      tabBar: '#111D34',
      tabBarBorder: 'rgba(255,255,255,0.1)',
    },
  },
  dark: {
    id: 'dark',
    label: 'Midnight Relay',
    description: 'Nearly-black surfaces, soft neon glows, and bright controls inspired by premium nighttime apps.',
    preview: ['#8E8BFF', '#34D5FF', '#6EF6C8', '#FF8DB6', '#FFFFFF'],
    colors: {
      bg: '#04050A',
      panel: '#08090F',
      panelElevated: '#0E111A',
      ink: '#FAFBFF',
      inkMuted: '#B7BCD0',
      line: '#171C28',
      accentDashboard: '#8E8BFF',
      accentChores: '#FF8DA1',
      accentCalendar: '#34D5FF',
      accentFinance: '#6EF6C8',
      accentMore: '#C696FF',
      accentTasks: '#B49AFF',
      warning: '#FFBE5C',
      danger: '#FF7BA2',
      success: '#6EF6C8',
      locked: '#545B72',
      onAccent: '#05060A',
      canvas: '#020308',
      canvasMuted: '#0B0D1A',
      canvasStrong: '#000000',
      canvasText: '#FFFFFF',
      canvasTextMuted: '#CDD2E5',
      canvasLine: 'rgba(255,255,255,0.07)',
      surfaceMuted: '#090B12',
      surfaceAccent: '#101525',
      surfaceAccentStrong: '#171D33',
      tabBar: '#030409',
      tabBarBorder: 'rgba(255,255,255,0.08)',
    },
  },
};

export function isThemeName(value) {
  return Object.prototype.hasOwnProperty.call(themes, value);
}

export function getThemeDefinition(themeName) {
  return themes[isThemeName(themeName) ? themeName : DEFAULT_THEME_NAME];
}

export function getThemeColors(themeName) {
  return getThemeDefinition(themeName).colors;
}

export const themeOptions = Object.values(themes).map(({ id, label, description, preview }) => ({
  id,
  label,
  description,
  preview,
}));

export const colors = getThemeColors(DEFAULT_THEME_NAME);

export function withAlpha(hex, alpha) {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 3 && normalized.length !== 6) {
    return hex;
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  if ([red, green, blue].some((value) => Number.isNaN(value))) {
    return hex;
  }

  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 12,
  md: 18,
  lg: 28,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: '#091934',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  float: {
    shadowColor: '#06122D',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
};
