import { describe, it, expect } from 'vitest';
import {
  analyzeText,
  computeFleschKincaid,
  computeHedgingDensity,
  computeSentenceUniformity,
  computeTTR,
  detectStructuralPatterns,
} from './textAnalyzer.js';

describe('computeHedgingDensity', () => {
  it('returns 0 for empty string', () => {
    expect(computeHedgingDensity('')).toBe(0);
  });

  it('returns 0 for text with no hedge words', () => {
    expect(computeHedgingDensity('The quick brown fox jumps over the lazy dog.')).toBe(0);
  });

  it('detects single hedge word', () => {
    const density = computeHedgingDensity('I think this is correct.');
    expect(density).toBeGreaterThan(0);
  });

  it('detects multiple hedge phrases', () => {
    const text = 'Perhaps this might work. I think it could be argued that it depends.';
    const density = computeHedgingDensity(text);
    expect(density).toBeGreaterThan(0.1);
  });

  it('is capped at 1.0', () => {
    const text = Array(50).fill('perhaps might could').join(' ');
    expect(computeHedgingDensity(text)).toBeLessThanOrEqual(1);
  });
});

describe('computeSentenceUniformity', () => {
  it('returns 0 for fewer than 3 sentences', () => {
    expect(computeSentenceUniformity('One sentence. Two sentences.')).toBe(0);
  });

  it('returns high value for very uniform sentence lengths', () => {
    const uniform = 'The cat sat here. The dog ran there. The bird flew away.';
    expect(computeSentenceUniformity(uniform)).toBeGreaterThan(0.5);
  });

  it('returns lower value for highly variable sentences', () => {
    const varied = 'Hi. This is a much longer sentence with many words and clauses. Ok. ' +
      'Another extremely verbose sentence that goes on and on with lots of detail.';
    const uniform = 'The cat sat here. The dog ran there. The bird flew away. The fish swam deep.';
    expect(computeSentenceUniformity(varied)).toBeLessThan(computeSentenceUniformity(uniform));
  });

  it('result is between 0 and 1', () => {
    const val = computeSentenceUniformity('Hello world. Goodbye world. See you later.');
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});

describe('computeTTR', () => {
  it('returns 1 for all unique words', () => {
    const ttr = computeTTR('apple banana cherry dragon elephant flamingo');
    expect(ttr).toBe(1);
  });

  it('returns lower value for repeated words', () => {
    const repetitive = 'the the the the the the the the cat cat cat cat cat sat sat sat sat';
    expect(computeTTR(repetitive)).toBeLessThan(0.5);
  });

  it('returns 1 for empty / very short text', () => {
    expect(computeTTR('')).toBe(1);
  });

  it('result is between 0 and 1', () => {
    const val = computeTTR('hello world hello again world today');
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});

describe('computeFleschKincaid', () => {
  it('returns 0 for empty string', () => {
    expect(computeFleschKincaid('')).toBe(0);
  });

  it('returns a positive grade for normal text', () => {
    const text = 'The quick brown fox jumps over the lazy dog. It was a beautiful day.';
    expect(computeFleschKincaid(text)).toBeGreaterThan(0);
  });

  it('returns higher grade for complex vocabulary', () => {
    const simple = 'The cat sat on the mat. The dog ran.';
    const complex = 'Photosynthesis enables chloroplasts to synthesize carbohydrates from atmospheric carbon dioxide.';
    expect(computeFleschKincaid(complex)).toBeGreaterThan(computeFleschKincaid(simple));
  });
});

describe('detectStructuralPatterns', () => {
  it('returns empty array for plain text', () => {
    expect(detectStructuralPatterns('Just a plain sentence with no patterns.')).toEqual([]);
  });

  it('detects bulleted_list', () => {
    const text = '- Item one\n- Item two\n- Item three\n- Item four';
    expect(detectStructuralPatterns(text)).toContain('bulleted_list');
  });

  it('detects numbered_list', () => {
    const text = '1. First\n2. Second\n3. Third';
    expect(detectStructuralPatterns(text)).toContain('numbered_list');
  });

  it('detects all_caps_heavy', () => {
    const text = 'This is VERY IMPORTANT! PLEASE READ CAREFULLY!';
    expect(detectStructuralPatterns(text)).toContain('all_caps_heavy');
  });

  it('detects excessive_ellipsis', () => {
    const text = 'Well... I think... maybe... it could work...';
    expect(detectStructuralPatterns(text)).toContain('excessive_ellipsis');
  });

  it('detects url_heavy', () => {
    const text = 'See https://a.com and https://b.com and https://c.com for details.';
    expect(detectStructuralPatterns(text)).toContain('url_heavy');
  });

  it('detects repeated_phrases', () => {
    const text = 'the quick brown fox and the quick brown fox jumped over';
    expect(detectStructuralPatterns(text)).toContain('repeated_phrases');
  });

  it('detects template_divider', () => {
    const text = 'Header\n---\nContent below';
    expect(detectStructuralPatterns(text)).toContain('template_divider');
  });
});

describe('analyzeText', () => {
  it('returns all required fields', () => {
    const result = analyzeText('I think this might work. Perhaps it could be better.');
    expect(result).toHaveProperty('hedgingDensity');
    expect(result).toHaveProperty('sentenceUniformity');
    expect(result).toHaveProperty('ttr');
    expect(result).toHaveProperty('fleschKincaid');
    expect(result).toHaveProperty('structuralPatterns');
    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('analysedAt');
  });

  it('wordCount matches actual word count', () => {
    const text = 'one two three four five';
    expect(analyzeText(text).wordCount).toBe(5);
  });

  it('structuralPatterns is an array', () => {
    expect(Array.isArray(analyzeText('plain text').structuralPatterns)).toBe(true);
  });
});
