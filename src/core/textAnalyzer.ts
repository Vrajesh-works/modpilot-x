import type { TextSignals } from './redis.js';

const HEDGE_WORDS = [
  'might', 'could', 'perhaps', 'arguably', 'seemingly', 'apparently', 'supposedly',
  'allegedly', 'technically', 'theoretically', 'presumably',
  'i think', 'i believe', 'i feel', 'it seems', 'in my opinion', 'in my view',
  'it could be argued', 'one might say', 'some might say',
  'it depends', 'generally speaking', 'broadly speaking',
  'in general', 'for the most part', 'to some extent',
];

const STRUCTURAL_PATTERNS: Array<{ name: string; test: (t: string) => boolean }> = [
  {
    name: 'bulleted_list',
    test: (t) => (t.match(/^[\s]*[-*•]\s+/gm) ?? []).length >= 3,
  },
  {
    name: 'numbered_list',
    test: (t) => (t.match(/^[\s]*\d+[.)]\s+/gm) ?? []).length >= 3,
  },
  {
    name: 'all_caps_heavy',
    test: (t) => (t.match(/\b[A-Z]{4,}\b/g) ?? []).length >= 3,
  },
  {
    name: 'em_dash_heavy',
    test: (t) => (t.match(/—|–| -- /g) ?? []).length >= 3,
  },
  {
    name: 'excessive_ellipsis',
    test: (t) => (t.match(/\.\.\./g) ?? []).length >= 3,
  },
  {
    name: 'template_divider',
    test: (t) => /^[-=]{3,}/m.test(t),
  },
  {
    name: 'url_heavy',
    test: (t) => (t.match(/https?:\/\/\S+/g) ?? []).length >= 3,
  },
  {
    name: 'repeated_phrases',
    test: (t) => {
      const words = t.toLowerCase().split(/\s+/);
      if (words.length < 6) return false;
      const trigrams = new Map<string, number>();
      for (let i = 0; i < words.length - 2; i++) {
        const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        trigrams.set(tri, (trigrams.get(tri) ?? 0) + 1);
      }
      return [...trigrams.values()].some((c) => c >= 2);
    },
  },
];

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length === 0) return 0;
  const matches = cleaned.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (cleaned.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
}

export function computeHedgingDensity(text: string): number {
  const lower = text.toLowerCase();
  const wordCount = lower.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount === 0) return 0;
  let hits = 0;
  for (const phrase of HEDGE_WORDS) {
    const re = new RegExp(`\\b${phrase.replace(/\s+/g, '\\s+')}\\b`, 'gi');
    hits += (lower.match(re) ?? []).length;
  }
  return Math.min(1, hits / wordCount);
}

export function computeSentenceUniformity(text: string): number {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length < 3) return 0;
  const lengths = sentences.map((s) => s.split(/\s+/).filter((w) => w.length > 0).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 0;
  const variance = lengths.reduce((a, l) => a + Math.pow(l - mean, 2), 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;
  return Math.max(0, Math.min(1, 1 - cv));
}

export function computeTTR(text: string): number {
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.replace(/[^a-z]/g, '').length > 2);
  if (words.length === 0) return 1;
  const unique = new Set(words.map((w) => w.replace(/[^a-z]/g, '')));
  return unique.size / words.length;
}

export function computeFleschKincaid(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return Math.max(0, grade);
}

export function detectStructuralPatterns(text: string): string[] {
  return STRUCTURAL_PATTERNS.filter((p) => p.test(text)).map((p) => p.name);
}

export function analyzeText(text: string): TextSignals {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return {
    hedgingDensity: computeHedgingDensity(text),
    sentenceUniformity: computeSentenceUniformity(text),
    ttr: computeTTR(text),
    fleschKincaid: computeFleschKincaid(text),
    structuralPatterns: detectStructuralPatterns(text),
    wordCount,
    analysedAt: Date.now(),
  };
}
