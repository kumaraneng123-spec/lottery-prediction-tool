// script.js — Part 1
/* Constants & state */
const PATTERNS = [
    [0, 1], [0, 4, 5], [0, 4, 8], [0, 8], [5, 8],
    [1, 3, 5, 7, 9], [1, 3, 7, 9], [2, 6, 8], [3, 6]
];

let rawData = [];
let latestDate = null;

const el = id => document.getElementById(id);

/* Load data.json (must be in same folder). For local file:// use a local static server */
async function loadData() {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error('Cannot load data.json — ensure file exists & JSON is valid');
        const data = await res.json();
        rawData = Array.isArray(data) ? data.map(d => ({ ...d })) : [];
        rawData.sort((a, b) => parseDate(a.date) - parseDate(b.date));
        latestDate = rawData.length ? rawData[rawData.length - 1].date : null;
    } catch (err) {
        console.error(err);
        document.querySelector('#cards').innerHTML = `<div class="no-results">Error loading data.json: ${err.message}</div>`;
    }
}

/* parse dd-mm-yyyy → timestamp */
function parseDate(ddmmyyyy) {
    if (!ddmmyyyy) return 0;
    const [d, m, y] = ddmmyyyy.split('-').map(x => parseInt(x, 10));
    return new Date(y, m - 1, d).getTime();
}

/* clamp util */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// script.js — Part 2
/* Find all occurrences of the 3-digit term in dataset */
function findMatches(term, mode = 'any') {
    term = term.toString().padStart(3, '0');
    const matches = [];

    rawData.forEach(day => {
        const date = day.date;
        const res = day.result || {};
        Object.keys(res).forEach(slot => {
            const val = res[slot];
            if (Array.isArray(val)) {
                val.forEach(n => processNumber(n, date, slot, matches, term, mode));
            } else {
                processNumber(val, date, slot, matches, term, mode);
            }
        });
    });

    return matches;
}

/* Check one number and record matched patterns and metadata */
function processNumber(n, date, slot, matches, term, mode) {
    if (n == null) return;
    const s = n.toString();
    const matched = (mode === 'prefix') ? s.startsWith(term) : s.includes(term);
    if (!matched) return;

    const lastDigit = parseInt(s[s.length - 1], 10);
    const matchedPatterns = PATTERNS
        .map(p => ({ pattern: p, includes: p.includes(lastDigit) }))
        .filter(x => x.includes)
        .map(x => x.pattern);

    matches.push({
        date,
        slot,
        number: s,
        lastDigit,
        matchedPatterns
    });
}

// script.js — Part 3
/* Aggregate patterns from matches */
function aggregatePatterns(matches) {
    const map = new Map(); // key: patternKey, value: {pattern, occurrences[]}
    matches.forEach(m => {
        m.matchedPatterns.forEach(p => {
            const key = p.join(',');
            if (!map.has(key)) map.set(key, { pattern: p.slice(), occurrences: [] });
            map.get(key).occurrences.push(m);
        });
    });
    return map;
}

/* Create recency weights per date (most recent -> weight close to 1) */
function getRecencyWeights(daysBackLimit) {
    const weights = new Map();
    if (!latestDate) return weights;
    const latestTs = parseDate(latestDate);
    rawData.forEach(day => {
        const dts = parseDate(day.date);
        const daysBack = Math.round((latestTs - dts) / (1000 * 60 * 60 * 24));
        // weight: linear falloff with minimum 0.05
        const w = clamp(1 - (daysBack / daysBackLimit), 0.05, 1);
        weights.set(day.date, w);
    });
    return weights;
}

/* Compute pattern sequence continuity score:
   - checks pattern in direct order and reversed order
   - counts how many consecutive elements follow the pattern order in recent occurrences
   - returns best direction ("direct" or "reverse") and a continuity score [0..1]
*/
function analyzeSequenceContinuity(pattern, occurrences, recencyWeights) {
    if (!occurrences.length) return { direction: null, score: 0, lastDigit: null };

    // order occurrences by date ascending (older -> newer)
    const sorted = occurrences.slice().sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const patternStr = pattern.join(',');
    const revPattern = pattern.slice().reverse();

    function continuityFor(seqPattern) {
        // map digit → index in seqPattern
        const idxMap = new Map(seqPattern.map((d, i) => [d, i]));
        let prevIdx = -1;
        let continuitySum = 0;
        let weightSum = 0;
        sorted.forEach(o => {
            const w = recencyWeights.get(o.date) || 0.05;
            const idx = idxMap.get(o.lastDigit);
            if (idx == null) {
                // no contribution
                weightSum += 0;
            } else {
                // if index follows prevIdx (allow wrap-around by treating idx>prevIdx)
                const contributes = (idx > prevIdx) ? 1 : 0;
                continuitySum += contributes * w;
                weightSum += w;
                prevIdx = idx;
            }
        });
        const score = weightSum > 0 ? (continuitySum / weightSum) : 0;
        const lastDigit = sorted[sorted.length - 1].lastDigit;
        return { score, lastDigit };
    }

    const direct = continuityFor(pattern);
    const rev = continuityFor(revPattern);

    if (direct.score >= rev.score) return { direction: 'direct', score: direct.score, lastDigit: direct.lastDigit };
    return { direction: 'reverse', score: rev.score, lastDigit: rev.lastDigit };
}

/* Predict next-day last digits for a pattern:
   - uses sequence continuation (if high continuity score) to propose next element(s) in pattern order
   - otherwise takes recency-weighted frequency within pattern digits
   - returns ordered list of candidate digits (highest priority first)
*/
function predictForPattern(patternObj, recencyLimit) {
    const { pattern, occurrences } = patternObj;
    const weights = getRecencyWeights(recencyLimit);
    if (!occurrences || occurrences.length === 0) {
        // no history — return entire pattern with small preference order as given
        return pattern.slice();
    }

    // sequence continuity analysis
    const seqAnalysis = analyzeSequenceContinuity(pattern, occurrences, weights);

    // if continuity strong (>0.5), try to predict continuation from lastDigit
    if (seqAnalysis.score >= 0.45 && seqAnalysis.lastDigit != null) {
        // find best direction sequence
        const seq = seqAnalysis.direction === 'direct' ? pattern : pattern.slice().reverse();
        const idx = seq.indexOf(seqAnalysis.lastDigit);
        const candidates = [];
        // next item in sequence (if exists)
        if (idx >= 0 && idx < seq.length - 1) {
            candidates.push(seq[idx + 1]);
        } else {
            // if at end, consider wrap-around or suggest previous two elements as fallback
            if (seq.length > 0) candidates.push(seq[0]);
            if (seq.length > 1 && seq[idx - 1] != null) candidates.push(seq[idx - 1]);
        }
        // add high-frequency digits as fallback (below)
        const freqFallback = topFreqDigits(occurrences, weights, pattern);
        // merge unique preserving order: sequence candidates first
        const merged = [...new Set([...candidates, ...freqFallback, ...pattern])];
        return merged;
    }

    // otherwise return top recency-weighted frequent digits inside pattern
    return topFreqDigits(occurrences, weights, pattern);
}

/* Helper: produce top digits inside 'pattern' by recency-weighted frequency */
function topFreqDigits(occurrences, weights, pattern) {
    const freq = new Map();
    occurrences.forEach(o => {
        const w = weights.get(o.date) || 0.05;
        if (pattern.includes(o.lastDigit)) {
            freq.set(o.lastDigit, (freq.get(o.lastDigit) || 0) + w);
        }
    });
    // ensure all pattern digits are present with small baseline
    pattern.forEach(d => { if (!freq.has(d)) freq.set(d, 0.05); });

    return Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(x => x[0]);
}

// script.js — Part 4
/* Render UI cards and predictions */
function renderResults(matches, input3, recencyLimit) {
    const container = document.querySelector('#cards');
    container.innerHTML = '';

    if (matches.length === 0) {
        document.querySelector('#matchCount').textContent = `No occurrences of ${input3} found.`;
        container.innerHTML = `<div class="no-results">No matches for <strong>${input3}</strong>.</div>`;
        document.querySelector('#predictionsOverview').innerHTML = '';
        return;
    }

    document.querySelector('#matchCount').textContent = `${matches.length} occurrence(s) of ${input3} found — latest data: ${latestDate || 'n/a'}.`;

    // group by date
    const byDate = {};
    matches.forEach(m => {
        if (!byDate[m.date]) byDate[m.date] = [];
        byDate[m.date].push(m);
    });

    const patternAgg = aggregatePatterns(matches);
    // overview
    const preview = document.querySelector('#predictionsOverview');
    preview.innerHTML = '';
    Array.from(patternAgg.values()).forEach(pobj => {
        const predictedDigits = predictForPattern(pobj, recencyLimit);
        const badge = document.createElement('div');
        badge.className = 'pattern-badge';
        badge.innerHTML = `<strong>[${pobj.pattern.join(',')}]</strong> → ${predictedDigits.slice(0, 4).map(d => input3 + d.toString()).join(', ')}`;
        preview.appendChild(badge);
    });

    // create cards ordered by date descending
    const dates = Object.keys(byDate).sort((a, b) => parseDate(b) - parseDate(a));
    dates.forEach(date => {
        const card = document.createElement('article');
        card.className = 'card stat-card';
        const header = document.createElement('div');
        header.className = 'date';
        header.innerHTML = `<span class="result-date">${date}</span><small class="prior ">entries: ${byDate[date].length}</small>`;
        card.appendChild(header);

        byDate[date].forEach(entry => {
            // slot + number
            const slotDiv = document.createElement('div');
            slotDiv.className = 'slot';
            slotDiv.innerHTML = `<div class="prize prize-badge ">₹${escapeHtml(entry.slot)}</div><div class="number-badge number">${escapeHtml(entry.number)}</div>`;
            card.appendChild(slotDiv);

            // patterns
            const patternsWrap = document.createElement('div');
            patternsWrap.className = 'patterns';
            if (entry.matchedPatterns.length === 0) {
                const p = document.createElement('div'); p.className = 'pattern range-info'; p.textContent = 'No known pattern';
                patternsWrap.appendChild(p);
            } else {
                entry.matchedPatterns.forEach(pat => {
                    const p = document.createElement('div');
                    p.className = 'pattern range-info';
                    p.textContent = `[${pat.join(',')}]`;
                    patternsWrap.appendChild(p);
                });
            }
            card.appendChild(patternsWrap);

            // predictions for this entry: combine pattern predictions
            const predWrap = document.createElement('div');
            predWrap.className = 'predictions';
            const agg = {};
            entry.matchedPatterns.forEach(pat => {
                const key = pat.join(',');
                const pobj = patternAgg.get(key);
                if (pobj) {
                    const preds = predictForPattern(pobj, recencyLimit);
                    preds.slice(0, 4).forEach(d => agg[d] = true);
                }
            });

            const uniq = Object.keys(agg).map(x => parseInt(x, 10)).sort((a, b) => a - b);
            if (uniq.length === 0) {
                predWrap.innerHTML = `<small class="hint">No confident predictions.</small>`;
            } else {
                uniq.forEach(d => {
                    const elp = document.createElement('div');
                    elp.className = 'pred number-badge';
                    elp.textContent = `${input3}${d}`;
                    predWrap.appendChild(elp);
                });
            }
            card.appendChild(predWrap);

            // small spacer
            const sep = document.createElement('div');
            sep.style.height = '8px';
            card.appendChild(sep);
        });

        container.appendChild(card);
    });
}

/* Basic HTML-escape for inserted text */
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Wire up controls and boot */
(async function () {
    await loadData();
    const btn = el('searchBtn');
    const input = el('input3');
    const recency = el('recency');
    const matchMode = el('matchMode');

    function runSearch() {
        const val = input.value.trim();
        if (!/^[0-9]{1,3}$/.test(val)) {
            return alert('Please enter 1–3 digits (numbers only).');
        }
        const mode = matchMode.value || 'any';
        const matches = findMatches(val, mode);
        const recencyLimit = parseInt(recency.value, 10) || 14;
        renderResults(matches, val, recencyLimit);
        // subtle UI hint animation (re-populate button)
        btn.animate([{ transform: 'scale(1.0)' }, { transform: 'scale(0.98)' }, { transform: 'scale(1.0)' }], { duration: 200 });
    }

    btn.addEventListener('click', runSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

    if (latestDate) {
        document.querySelector('#matchCount').textContent = `Data loaded — latest date: ${latestDate}`;
    }
})();
