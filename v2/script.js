// script.js — Part 1
// ----------------------------------
// Global constants and variables

const PATTERNS = [
    [0,1],
    [0,4,5],
    [0,4,8],
    [0,8],
    [5,8],
    [1,3,5,7,9],
    [1,3,7,9],
    [2,6,8],
    [3,6]
  ];
  
  let rawData = [];
  let latestDate = null; // store latest date from dataset
  
  // helper for quick DOM selection
  const el = id => document.getElementById(id);
  
  // script.js — Part 2
// ----------------------------------
// Load the JSON dataset (expects data.json in same folder)

async function loadData() {
    try {
      const res = await fetch('data.json');
      if (!res.ok) throw new Error('Failed to load data.json — check its location');
  
      const data = await res.json();
      rawData = data.map(d => ({ ...d }));
  
      // Sort dates chronologically (expects dd-mm-yyyy format)
      rawData.sort((a, b) => parseDate(a.date) - parseDate(b.date));
      latestDate = rawData.length ? rawData[rawData.length - 1].date : null;
    } catch (err) {
      console.error(err);
      document.querySelector('#cards').innerHTML =
        `<div class="no-results">Error loading data.json: ${err.message}</div>`;
    }
  }
  
  // Convert dd-mm-yyyy → timestamp for sorting and recency weighting
  function parseDate(ddmmyyyy) {
    const [d, m, y] = ddmmyyyy.split('-').map(x => parseInt(x, 10));
    return new Date(y, m - 1, d).getTime();
  }

  // script.js — Part 3
// ----------------------------------
// Search dataset for 3-digit term occurrences

function findMatches(term) {
    term = term.toString().padStart(3, '0');
    const matches = [];
  
    rawData.forEach(day => {
      const date = day.date;
      const res = day.result || {};
  
      Object.keys(res).forEach(slot => {
        const val = res[slot];
        if (Array.isArray(val)) {
          val.forEach(n => processNumber(n, date, slot, matches, term));
        } else {
          processNumber(val, date, slot, matches, term);
        }
      });
    });
  
    return matches;
  }
  
  // Check a single lottery number for a match and store results
  function processNumber(n, date, slot, matches, term) {
    if (n == null) return;
    const s = n.toString();
  
    // Change to s.startsWith(term) if you want prefix-only matching
    if (s.includes(term)) {
      const lastDigit = parseInt(s[s.length - 1], 10);
      const matchedPatterns = PATTERNS.filter(p => p.includes(lastDigit));
      matches.push({ date, slot, number: s, lastDigit, matchedPatterns });
    }
  }

  // script.js — Part 4
// ----------------------------------
// Aggregate all patterns from matches and build recency weights

function aggregatePatterns(matches) {
    const map = new Map();
    matches.forEach(m => {
      m.matchedPatterns.forEach(p => {
        const key = p.join(',');
        if (!map.has(key)) map.set(key, { pattern: p.slice(), occurrences: [] });
        map.get(key).occurrences.push(m);
      });
    });
    return map;
  }
  
  // Assign weights so recent dates are prioritized in prediction
  function getRecencyWeight(daysBackLimit) {
    const weights = new Map();
    const latestTs = parseDate(latestDate);
  
    rawData.forEach(day => {
      const dts = parseDate(day.date);
      const daysBack = Math.round((latestTs - dts) / (1000 * 60 * 60 * 24));
      const w = Math.max(0.1, 1 - (daysBack / daysBackLimit)); // linear falloff
      weights.set(day.date, w);
    });
  
    return weights;
  }
// script.js — Part 5
// ----------------------------------
// Predict possible next-day last digits per pattern

function predictForPattern(patternKeyObj, recencyLimit) {
    const { pattern, occurrences } = patternKeyObj;
    if (occurrences.length === 0) return [];
  
    const weights = getRecencyWeight(recencyLimit);
    const freq = new Map();
  
    occurrences.forEach(o => {
      const w = weights.get(o.date) || 0.1;
      freq.set(o.lastDigit, (freq.get(o.lastDigit) || 0) + w);
    });
  
    // Include unused digits in the pattern as low-probability candidates
    pattern.forEach(d => { if (!freq.has(d)) freq.set(d, 0.05); });
  
    const arr = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .map(x => x[0]);
  
    return arr;
  }

  // script.js — Part 6
// ----------------------------------
// Display results and predictions in beautiful cards

function renderResults(matches, input3, recencyLimit) {
    const container = document.querySelector('#cards');
    container.innerHTML = '';
  
    if (matches.length === 0) {
      document.querySelector('#matchCount').textContent =
        `No occurrences of ${input3} found.`;
      container.innerHTML = `<div class="no-results">No matches for <strong>${input3}</strong>.</div>`;
      document.querySelector('#predictionsOverview').innerHTML = '';
      return;
    }
  
    document.querySelector('#matchCount').textContent =
      `${matches.length} occurrence(s) of ${input3} found (latest date: ${latestDate}).`;
  
    const byDate = {};
    matches.forEach(m => {
      if (!byDate[m.date]) byDate[m.date] = [];
      byDate[m.date].push(m);
    });
  
    const patternAgg = aggregatePatterns(matches);
  
    // Predictions Overview
    const predictionsOverview = document.querySelector('#predictionsOverview');
    predictionsOverview.innerHTML = '';
    const overviewFrag = document.createDocumentFragment();
  
    Array.from(patternAgg.values()).forEach(pobj => {
      const predictedDigits = predictForPattern(pobj, recencyLimit);
      if (predictedDigits.length) {
        const div = document.createElement('div');
        div.className = 'pattern';
        div.innerHTML = `<strong>Pattern</strong> [${pobj.pattern.join(',')}] → predicted last digits: ${predictedDigits.join(', ')}`;
        overviewFrag.appendChild(div);
      }
    });
    predictionsOverview.appendChild(overviewFrag);
  
    // Render each date card
    const dates = Object.keys(byDate).sort((a, b) => parseDate(b) - parseDate(a));
  
    dates.forEach(date => {
      const card = document.createElement('div');
      card.className = 'card';
      const header = document.createElement('div');
      header.className = 'date';
      header.textContent = date;
      card.appendChild(header);
  
      byDate[date].forEach(entry => {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'slot';
        slotDiv.innerHTML = `<div class="prize">${entry.slot}</div><div class="number">${entry.number}</div>`;
        card.appendChild(slotDiv);
  
        // show matched patterns
        const patternsWrap = document.createElement('div');
        patternsWrap.className = 'patterns';
        if (entry.matchedPatterns.length === 0) {
          patternsWrap.innerHTML = `<div class="pattern">No known pattern</div>`;
        } else {
          entry.matchedPatterns.forEach(p => {
            const pdiv = document.createElement('div');
            pdiv.className = 'pattern';
            pdiv.textContent = `[${p.join(',')}]`;
            patternsWrap.appendChild(pdiv);
          });
        }
        card.appendChild(patternsWrap);
  
        // predicted numbers for this entry
        const predWrap = document.createElement('div');
        predWrap.className = 'predictions';
        const aggForEntry = {};
  
        entry.matchedPatterns.forEach(p => {
          const key = p.join(',');
          const pobj = patternAgg.get(key);
          const digits = predictForPattern(pobj, recencyLimit);
          digits.forEach(d => { aggForEntry[d] = true; });
        });
  
        const uniqDigits = Object.keys(aggForEntry)
          .map(x => parseInt(x, 10))
          .sort((a, b) => a - b);
  
        if (uniqDigits.length === 0) {
          predWrap.innerHTML = `<small class="hint">No predictions for this entry.</small>`;
        } else {
          uniqDigits.forEach(d => {
            const elp = document.createElement('div');
            elp.className = 'pred';
            elp.textContent = input3 + d.toString();
            predWrap.appendChild(elp);
          });
        }
        card.appendChild(predWrap);
      });
  
      container.appendChild(card);
    });
  }
// script.js — Part 7
// ----------------------------------
// Bootstrapping, search input & button wiring

(async function() {
    await loadData();
  
    const btn = el('searchBtn');
    const input = el('input3');
    const recency = el('recency');
  
    function runSearch() {
      const val = input.value.trim();
      if (!/^[0-9]{1,3}$/.test(val)) {
        alert('Please enter 1–3 digits only.');
        return;
      }
      const matches = findMatches(val);
      const recencyLimit = parseInt(recency.value, 10) || 14;
      renderResults(matches, val, recencyLimit);
    }
  
    btn.addEventListener('click', runSearch);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
  
    if (latestDate) {
      document.querySelector('#matchCount').textContent =
        `Data loaded — latest date: ${latestDate}`;
    }
  })();
    