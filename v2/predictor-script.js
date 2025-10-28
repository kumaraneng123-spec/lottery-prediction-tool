
// script.js
const PATTERNS = [
    [0, 1], [0, 4, 5], [0, 4, 8], [0, 8], [5, 8], [1, 3, 5, 7, 9], [1, 3, 7, 9], [2, 6, 8], [3, 6]
];

let DATA = [];

async function loadData() {
    try {
        const res = await fetch('./data.json');
        if (!res.ok) throw new Error('Could not load data.json (' + res.statusText + ')');
        const json = await res.json();
        DATA = normalizeData(json);
        console.log('Loaded dataset with', DATA.length, 'days');
    } catch (e) {
        document.getElementById('summary').innerHTML = `<div style="color:#ffb4b4">Error loading data.json — check file in same folder. (${e.message})</div>`;
        console.error(e);
    }
}

// Normalizes a few common JSON shapes into array of {date: 'YYYY-MM-DD', entries: [{slot, number}]}
function normalizeData(raw) {
    // If raw is an object with date keys
    if (!raw) return [];
    if (Array.isArray(raw)) {
        // Expect elements like { date: '2025-10-01', prizes: { first: '1234', second: ['2345', ...] } }
        return raw.map(day => {
            const date = day.date || day.day || day.d;
            let entries = [];
            // If prizes in object form
            if (day.prizes && typeof day.prizes === 'object') {
                for (const [slot, val] of Object.entries(day.prizes)) {
                    if (Array.isArray(val)) val.forEach(v => entries.push({ slot, number: String(v) }));
                    else entries.push({ slot, number: String(val) });
                }
            } else if (day.slots && Array.isArray(day.slots)) {
                day.slots.forEach(s => entries.push({ slot: s.slot || s.name, number: String(s.number) }));
            } else if (day.results && typeof day.results === 'object') {
                for (const [slot, val] of Object.entries(day.results)) {
                    if (Array.isArray(val)) val.forEach(v => entries.push({ slot, number: String(v) }));
                    else entries.push({ slot, number: String(val) });
                }
            } else {
                // Try flattening top-level keys except date
                for (const [k, v] of Object.entries(day)) {
                    if (['date', 'day', 'd'].includes(k)) continue;
                    if (Array.isArray(v)) v.forEach(v2 => entries.push({ slot: k, number: String(v2) }));
                    else entries.push({ slot: k, number: String(v) });
                }
            }
            return { date: date || '', entries };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    // If raw is object keyed by date
    if (typeof raw === 'object') {
        return Object.keys(raw).map(date => {
            const day = raw[date];
            let entries = [];
            if (typeof day === 'object') {
                for (const [k, v] of Object.entries(day)) {
                    if (Array.isArray(v)) v.forEach(v2 => entries.push({ slot: k, number: String(v2) }));
                    else entries.push({ slot: k, number: String(v) });
                }
            }
            return { date, entries };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    return [];
}

function isThreeDigit(str) {
    return /^\d{3}$/.test(str);
}

function detectPatternsForDigit(digit) {
    const d = Number(digit);
    const matched = [];
    PATTERNS.forEach(p => { if (p.includes(d)) matched.push(p); });
    return matched;
}

function searchNumber(input) {
    if (!isThreeDigit(input)) {
        alert('Please enter exactly 3 digits');
        return;
    }
    const matches = []; // {date, slot, number, lastDigit, patterns, dayIndex}
    DATA.forEach((day, idx) => {
        day.entries.forEach(e => {
            const num = String(e.number);
            // We check occurrences where the lottery number *starts with* the 3-digit input (like 310 -> 3109)
            if (num.startsWith(input)) {
                const lastDigit = Number(num[num.length - 1]);
                const patterns = detectPatternsForDigit(lastDigit);
                matches.push({ date: day.date, slot: e.slot, number: num, lastDigit, patterns, dayIndex: idx });
            }
        });
    });
    return matches.sort((a, b) => b.dayIndex - a.dayIndex); // most recent first
}

function aggregatePatterns(matches) {
    const map = new Map();
    matches.forEach(m => {
        m.patterns.forEach(p => {
            const key = p.join(',');
            if (!map.has(key)) map.set(key, { pattern: p, occurrences: [] });
            map.get(key).occurrences.push(m);
        });
    });
    // convert to array & sort by recency-weighted score
    const arr = Array.from(map.values()).map(obj => {
        // score: sum of weights where recent items get higher weights
        let score = 0;
        obj.occurrences.forEach((occ, i) => {
            // weight: 1/(1+dayDistance) where distance is index difference from latest dayIndex
            const dist = occ.dayIndex; // earlier index -> older; but DATA sorted ascending so dayIndex small is older
            // compute recency relative to max index
        });
        // We'll compute recency differently outside
        return obj;
    });
    // compute recency by latest occurrence date index
    const maxIndex = DATA.length - 1;
    arr.forEach(o => {
        let s = 0;
        o.occurrences.forEach(occ => {
            const recency = (maxIndex - occ.dayIndex); // 0 = latest day, bigger = older
            s += 1 / (1 + recency);
        });
        o.score = s;
    });
    arr.sort((a, b) => b.score - a.score);
    return arr;
}

function predictForPattern(input, patternObj, topN = 5) {
    // patternObj: {pattern: [..], occurrences: [...]}
    // We'll predict next-day numbers by: combinining input + every digit in the pattern as possible last-digit
    // but prefer digits that appeared more recently for this input and pattern.
    const counts = new Map();
    patternObj.occurrences.forEach((occ, idx) => {
        const d = occ.lastDigit;
        // weight by recency: recent occ (lower dayIndex distance to max) gets more weight
        const maxIndex = DATA.length - 1;
        const recency = (maxIndex - occ.dayIndex);
        const weight = 1 / (1 + recency);
        counts.set(d, (counts.get(d) || 0) + weight);
    });
    // ensure all pattern digits included even if not seen
    patternObj.pattern.forEach(d => { if (!counts.has(d)) counts.set(d, 0.01); });

    const preds = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([d, w]) => ({ digit: d, score: w, number: input + String(d) }));
    return preds;
}

function renderSummary(input, matches, aggregated) {
    const container = document.getElementById('summary');
    if (matches.length === 0) {
        container.innerHTML = `<strong>No past occurrences</strong> — no matches found for <code>${input}</code>`;
        document.getElementById('cards').innerHTML = '';
        return;
    }
    // Determine latest date in DATA to compute prediction date
    const latest = DATA.length ? DATA[DATA.length - 1].date : '';
    const nextDay = latest ? nextDateString(latest) : 'next day';

    let html = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">`;
    html += `<div><strong>Found</strong> ${matches.length} occurrences for <code>${input}</code></div>`;
    html += `<div style="color:var(--muted)">Based on dataset latest date: <strong>${latest}</strong> — predicting for <strong>${nextDay}</strong></div>`;
    html += `</div>`;

    html += `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">`;
    aggregated.forEach(a => {
        const patLabel = '[' + a.pattern.join(',') + ']';
        const preds = predictForPattern(input, a, 3);
        const predStr = preds.map(p => p.number).join(', ');
        html += `<div class="badge">Pattern ${patLabel} → ${predStr}</div>`;
    });
    html += `</div>`;

    container.innerHTML = html;
}

function renderCards(matches) {
    const grid = document.getElementById('cards');
    if (matches.length === 0) { grid.innerHTML = ''; return; }
    // group by date (most recent first)
    const byDate = new Map();
    matches.forEach(m => {
        if (!byDate.has(m.date)) byDate.set(m.date, []);
        byDate.get(m.date).push(m);
    });
    // create cards sorted by date descending
    const dates = Array.from(byDate.keys()).sort((a, b) => new Date(b) - new Date(a));
    let html = '';
    dates.forEach(date => {
        const items = byDate.get(date);
        html += `<div class="card">`;
        html += `<div class="date">${date}</div>`;
        items.forEach(it => {
            const patLabels = it.patterns.map(p => '[' + p.join(',') + ']').join(' ');
            html += `<div class="slot">${escapeHtml(it.slot)}</div>`;
            html += `<div class="lot-number">${escapeHtml(it.number)} <span style="color:var(--muted);font-size:13px">(last digit: ${it.lastDigit})</span></div>`;
            html += `<div class="patterns">Patterns: ${patLabels || '<span style="color:var(--muted)">none</span>'}</div>`;
        });
        html += `</div>`;
    });
    grid.innerHTML = html;
}

function nextDateString(isoDate) {
    // accepts YYYY-MM-DD or other parseable date
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// wire up
window.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    document.getElementById('searchBtn').addEventListener('click', () => {
        const input = document.getElementById('threeDigitInput').value.trim();
        const matches = searchNumber(input);
        const agg = aggregatePatterns(matches);
        renderSummary(input, matches, agg);
        renderCards(matches);
    });

    document.getElementById('threeDigitInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('searchBtn').click();
    });
});
