import { normalizeSearch } from './search'
import { billerCategoryLabel, serviceCategoryLabel, type ServicePrice } from './types'

/** Words that carry no meaning for finding a service ("I want", "how", "steps", …). */
const STOPWORDS = new Set([
  'في', 'من', 'عن', 'الي', 'علي', 'مع', 'او', 'و', 'يا', 'هو', 'هي', 'ايه', 'ايش', 'وش', 'كيف', 'ازاي',
  'ابغي', 'ابي', 'عاوز', 'عايز', 'اريد', 'محتاج', 'اعمل', 'اسوي', 'طريقه', 'خطوات', 'خطوه', 'كود', 'رقم',
  'خدمه', 'خدمات', 'معامله', 'معاملات', 'المفوتر', 'مفوتر', 'بتاع', 'بتاعه', 'حق', 'لو', 'سمحت',
])

/** Normalize, then drop Arabic article/preposition prefixes so "للطاقه" and "الطاقه" both become "طاقه". */
function stem(word: string): string {
  const w = normalizeSearch(word)
  const stripped = w.replace(/^(وال|بال|فال|كال|لل|ال)/, '')
  return stripped.length >= 2 ? stripped : w
}

function words(text: string): string[] {
  return normalizeSearch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(stem)
}

export function queryTokens(query: string): string[] {
  return [...new Set(words(query).filter((token) => token.length >= 2 && !STOPWORDS.has(token)))]
}

/** Biller code from names like "رقم المفوتر 002: السعودية للطاقة". */
export function billerCode(name: string): string | null {
  return /رقم\s*المفوتر\s*(\d+)/.exec(name)?.[1] ?? null
}

/** Name without the "رقم المفوتر 002:" prefix, for a cleaner title. */
export function serviceTitle(name: string): string {
  return name.replace(/^\s*رقم\s*المفوتر\s*\d+\s*[:\-–]\s*/, '').trim() || name
}

export interface ServiceMatch {
  service: ServicePrice
  code: string | null
  score: number
}

/**
 * Rank services for a free-text question. Name words weigh most, then the biller code,
 * the service type / biller category, and finally the steps text.
 */
export function matchServices(services: ServicePrice[], query: string, limit = 5): ServiceMatch[] {
  const tokens = queryTokens(query)
  if (!tokens.length) return []
  const phrase = normalizeSearch(query)

  const scored = services.map((service) => {
    const code = billerCode(service.name)
    const nameWords = words(service.name)
    const typeWords = words(
      `${serviceCategoryLabel[service.category] ?? ''} ${service.biller_category ? billerCategoryLabel[service.biller_category] : ''}`,
    )
    const steps = service.steps ? normalizeSearch(service.steps) : ''
    let score = 0
    let hits = 0
    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        if (code && (code === token || Number(code) === Number(token))) {
          score += 8
          hits++
        } else if (code?.includes(token)) {
          score += 3
          hits++
        }
        continue
      }
      if (nameWords.some((word) => word === token)) {
        score += 4
        hits++
      } else if (nameWords.some((word) => word.startsWith(token) || (token.length >= 4 && word.includes(token)))) {
        score += 3
        hits++
      } else if (typeWords.some((word) => word.startsWith(token))) {
        score += 1.5
        hits++
      } else if (steps.includes(token)) {
        score += 0.75
        hits++
      }
    }
    if (phrase.length >= 3 && normalizeSearch(service.name).includes(phrase)) score += 4
    // Prefer services that matched more of the question's words.
    score += hits === tokens.length ? 2 : 0
    return { service, code, score }
  })

  const ranked = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
  if (!ranked.length) return []
  const best = ranked[0].score
  return ranked.filter((item) => item.score >= best * 0.6).slice(0, limit)
}
