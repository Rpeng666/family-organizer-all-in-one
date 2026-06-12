export const MEMBER_COLOR_SWATCHES = [
    { value: '#EF4444', label: 'Cherry' },
    { value: '#F97316', label: 'Orange' },
    { value: '#F59E0B', label: 'Amber' },
    { value: '#EAB308', label: 'Sunflower' },
    { value: '#84CC16', label: 'Lime' },
    { value: '#22C55E', label: 'Leaf' },
    { value: '#10B981', label: 'Mint' },
    { value: '#14B8A6', label: 'Teal' },
    { value: '#06B6D4', label: 'Aqua' },
    { value: '#0EA5E9', label: 'Sky' },
    { value: '#3B82F6', label: 'Blue' },
    { value: '#6366F1', label: 'Indigo' },
    { value: '#8B5CF6', label: 'Violet' },
    { value: '#A855F7', label: 'Purple' },
    { value: '#D946EF', label: 'Orchid' },
    { value: '#EC4899', label: 'Pink' },
] as const;

export const MEMBER_COLOR_SIMILARITY_THRESHOLD = 14;

type MemberColorRecord = {
    id?: string | null;
    color?: string | null;
};

export interface SimilarMemberColorMatch {
    color: string;
    distance: number;
    memberId: string;
    memberName: string;
}

function normalizeChannel(channel: number) {
    const normalized = channel / 255;
    if (normalized <= 0.04045) {
        return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
}

function xyzToLabValue(value: number) {
    return value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
}

function hashString(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function hexToRgb(hexColor: string) {
    const normalized = normalizeHexColor(hexColor);
    if (!normalized) return null;
    const hex = normalized.slice(1);
    return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
    };
}

function hexToLab(hexColor: string) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return null;

    const r = normalizeChannel(rgb.r);
    const g = normalizeChannel(rgb.g);
    const b = normalizeChannel(rgb.b);

    const x = xyzToLabValue((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const y = xyzToLabValue(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const z = xyzToLabValue((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);

    return {
        l: 116 * y - 16,
        a: 500 * (x - y),
        b: 200 * (y - z),
    };
}

function getDistanceScore(candidate: string, takenColors: string[]) {
    if (takenColors.length === 0) {
        return Number.POSITIVE_INFINITY;
    }

    const candidateLab = hexToLab(candidate);
    if (!candidateLab) return 0;

    return Math.min(
        ...takenColors.map((takenColor) => {
            const takenLab = hexToLab(takenColor);
            if (!takenLab) return Number.POSITIVE_INFINITY;
            return Math.sqrt(
                (candidateLab.l - takenLab.l) ** 2 +
                    (candidateLab.a - takenLab.a) ** 2 +
                    (candidateLab.b - takenLab.b) ** 2
            );
        })
    );
}

function chooseDistinctPaletteColor(takenColors: string[], seed: number) {
    const palette = MEMBER_COLOR_SWATCHES.map((swatch) => swatch.value);
    const offsetPalette = palette.map((_, index) => palette[(index + seed) % palette.length]);
    const exactUnused = offsetPalette.find((candidate) => !takenColors.includes(candidate));
    if (exactUnused) {
        return exactUnused;
    }

    return offsetPalette.reduce((bestCandidate, candidate) => {
        const bestScore = getDistanceScore(bestCandidate, takenColors);
        const candidateScore = getDistanceScore(candidate, takenColors);
        return candidateScore > bestScore ? candidate : bestCandidate;
    }, offsetPalette[0]);
}

export function normalizeHexColor(value: string | null | undefined) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const hexBody = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (!/^[\da-fA-F]{3}$|^[\da-fA-F]{6}$/.test(hexBody)) {
        return null;
    }

    const expanded = hexBody.length === 3 ? hexBody.split('').map((char) => `${char}${char}`).join('') : hexBody;
    return `#${expanded.toUpperCase()}`;
}

export function hexToRgbaString(hexColor: string, alpha: number) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) {
        return `rgba(15, 23, 42, ${alpha})`;
    }

    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function getReadableTextColor(hexColor: string) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return '#0F172A';

    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.62 ? '#0F172A' : '#F8FAFC';
}

export function buildMemberColorMap<T extends MemberColorRecord>(members: T[]) {
    const byId: Record<string, string> = {};
    const takenColors: string[] = [];

    members.forEach((member) => {
        const memberId = typeof member.id === 'string' ? member.id : '';
        const savedColor = normalizeHexColor(member.color);
        if (!memberId || !savedColor) return;

        byId[memberId] = savedColor;
        takenColors.push(savedColor);
    });

    const missingMembers = members
        .filter((member) => {
            const memberId = typeof member.id === 'string' ? member.id : '';
            return Boolean(memberId) && !normalizeHexColor(member.color);
        })
        .sort((left, right) => String(left.id || '').localeCompare(String(right.id || '')));

    missingMembers.forEach((member) => {
        const memberId = String(member.id || '');
        const seed = hashString(memberId) % MEMBER_COLOR_SWATCHES.length;
        const fallbackColor = chooseDistinctPaletteColor(takenColors, seed);
        byId[memberId] = fallbackColor;
        takenColors.push(fallbackColor);
    });

    return byId;
}

export function pickRandomMemberColor(existingColors: string[] = []) {
    const normalizedTakenColors = existingColors.map((color) => normalizeHexColor(color)).filter((color): color is string => Boolean(color));
    const exactUnused = MEMBER_COLOR_SWATCHES.map((swatch) => swatch.value).filter((color) => !normalizedTakenColors.includes(color));
    const candidates = exactUnused.length > 0 ? exactUnused : MEMBER_COLOR_SWATCHES.map((swatch) => swatch.value);
    return candidates[Math.floor(Math.random() * candidates.length)] || MEMBER_COLOR_SWATCHES[0].value;
}

export function findSimilarMemberColors(
    targetColor: string,
    otherMembers: Array<{ color?: string | null; id?: string | null; name?: string | null }>,
    threshold = MEMBER_COLOR_SIMILARITY_THRESHOLD
): SimilarMemberColorMatch[] {
    const normalizedTargetColor = normalizeHexColor(targetColor);
    if (!normalizedTargetColor) return [];

    return otherMembers
        .map((member) => {
            const normalizedMemberColor = normalizeHexColor(member.color);
            if (!normalizedMemberColor || !member.id) return null;

            return {
                color: normalizedMemberColor,
                distance: getDistanceScore(normalizedTargetColor, [normalizedMemberColor]),
                memberId: String(member.id),
                memberName: String(member.name || 'Another member'),
            };
        })
        .filter((match): match is SimilarMemberColorMatch => Boolean(match) && match.distance <= threshold)
        .sort((left, right) => left.distance - right.distance);
}
