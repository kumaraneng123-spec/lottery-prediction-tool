

// Pattern definitions
const PATTERNS = {
    pattern1: [0, 1],
    pattern2: [0, 4, 5],
    pattern3: [0, 4, 8],
    pattern4: [0, 8],
    pattern5: [5, 8],
    pattern6: [1, 3, 5, 7, 9],
    pattern7: [1, 3, 7, 9],
    pattern8: [2, 6, 8],
    pattern9: [3, 6]
};

// Prize slot priorities (higher value = higher priority)
const PRIZE_PRIORITIES = {
    '1st': 10,
    '2nd': 9,
    '3rd': 8,
    '5000': 7,
    '2000': 6,
    '1000': 5,
    '500': 4,
    '200': 3,
    '100': 2
};

let lotteryData = [];

// Load lottery data
async function loadLotteryData() {
    try {
        const response = await fetch('data.json');
        lotteryData = await response.json();
        console.log('Lottery data loaded:', lotteryData.length, 'records');
    } catch (error) {
        console.error('Error loading lottery data:', error);
        showError('Failed to load lottery data. Please refresh the page.');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadLotteryData();
    
    const searchInput = document.getElementById('searchInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    // Validate input to only accept digits
    searchInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
    
    // Handle Enter key
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            analyzeNumber();
        }
    });
    
    // Handle analyze button click
    analyzeBtn.addEventListener('click', analyzeNumber);
});

// Main analysis function
async function analyzeNumber() {
    const searchInput = document.getElementById('searchInput');
    const inputValue = searchInput.value.trim();
    
    // Validate input
    if (!inputValue) {
        showError('Please enter a 3-digit number');
        return;
    }
    
    if (inputValue.length !== 3) {
        showError('Please enter exactly 3 digits');
        return;
    }
    
    clearError();
    showLoading();
    
    // Simulate processing delay for better UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Find all occurrences
    const occurrences = findOccurrences(inputValue);
    
    hideLoading();
    
    if (occurrences.length === 0) {
        showNoResults();
        return;
    }
    
    // Display results
    displayStats(occurrences, inputValue);
    displayPredictions(occurrences, inputValue);
    displayOccurrences(occurrences, inputValue);
}

// Find all occurrences of the search number
function findOccurrences(searchNumber) {
    const occurrences = [];
    
    lotteryData.forEach(dayData => {
        const date = dayData.date;
        const results = dayData.result;
        
        // Search in all prize categories
        Object.keys(results).forEach(prizeSlot => {
            const numbers = Array.isArray(results[prizeSlot]) 
                ? results[prizeSlot] 
                : [results[prizeSlot]];
            
            numbers.forEach(number => {
                const numStr = String(number).padStart(4, '0');
                
                // Check if search number appears in this lottery number
                if (numStr.includes(searchNumber)) {
                    const patterns = detectPatterns(numStr, searchNumber);
                    
                    occurrences.push({
                        date,
                        lotteryNumber: numStr,
                        prizeSlot,
                        patterns,
                        searchNumber
                    });
                }
            });
        });
    });
    
    // Sort by date (most recent first)
    occurrences.sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateB - dateA;
    });
    
    return occurrences;
}

// Detect patterns in a lottery number
function detectPatterns(lotteryNumber, searchNumber) {
    const detectedPatterns = [];
    const lastDigit = parseInt(lotteryNumber[lotteryNumber.length - 1]);
    
    // Check each pattern
    Object.keys(PATTERNS).forEach(patternKey => {
        const pattern = PATTERNS[patternKey];
        
        if (pattern.includes(lastDigit)) {
            detectedPatterns.push({
                name: patternKey,
                digits: pattern,
                lastDigit
            });
        }
    });
    
    return detectedPatterns;
}

// Generate predictions based on patterns
function generatePredictions(occurrences, searchNumber) {
    const predictions = [];
    const patternFrequency = {};
    const patternOccurrences = {};
    const recentWeight = 3; // Weight multiplier for recent occurrences
    
    // Analyze pattern frequencies with recency bias
    occurrences.forEach((occurrence, index) => {
        const recencyFactor = index < 5 ? recentWeight : 1; // Recent 5 get higher weight
        const prizeWeight = PRIZE_PRIORITIES[occurrence.prizeSlot] || 1;
        
        occurrence.patterns.forEach(pattern => {
            const key = pattern.name;
            
            if (!patternFrequency[key]) {
                patternFrequency[key] = 0;
                patternOccurrences[key] = [];
            }
            
            patternFrequency[key] += (recencyFactor * prizeWeight);
            patternOccurrences[key].push({
                ...occurrence,
                recencyFactor,
                prizeWeight
            });
        });
    });
    
    // Sort patterns by frequency (weighted)
    const sortedPatterns = Object.keys(patternFrequency).sort((a, b) => {
        return patternFrequency[b] - patternFrequency[a];
    });
    
    // Generate predictions for top patterns
    const topPatterns = sortedPatterns.slice(0, 6); // Top 6 patterns
    
    topPatterns.forEach(patternKey => {
        const pattern = PATTERNS[patternKey];
        const occurrenceList = patternOccurrences[patternKey];
        const frequency = patternFrequency[patternKey];
        
        // Calculate confidence based on frequency, recency, and prize slots
        const totalOccurrences = occurrences.length;
        const patternCount = occurrenceList.length;
        const recentCount = occurrenceList.filter((_, i) => i < 5).length;
        
        let confidence = 'low';
        const confidenceScore = (frequency / totalOccurrences) * 10;
        
        if (confidenceScore > 6 || (recentCount >= 2 && patternCount >= 3)) {
            confidence = 'high';
        } else if (confidenceScore > 3 || recentCount >= 1) {
            confidence = 'medium';
        }
        
        // Generate predicted numbers
        const predictedNumbers = generateNumbersFromPattern(
            searchNumber, 
            pattern, 
            occurrenceList,
            confidence
        );
        
        predictions.push({
            pattern: patternKey,
            patternDigits: pattern,
            confidence,
            frequency: patternCount,
            predictedNumbers,
            recentOccurrences: recentCount,
            reasoning: generateReasoning(patternKey, pattern, occurrenceList, confidence)
        });
    });
    
    return predictions;
}

// Generate numbers from pattern with intelligent logic
function generateNumbersFromPattern(searchNumber, pattern, occurrences, confidence) {
    const numbers = new Set();
    
    // Strategy 1: Use last digits from pattern
    pattern.forEach(digit => {
        numbers.add(searchNumber + digit);
    });
    
    // Strategy 2: Analyze actual occurrences for common fourth digits
    const fourthDigitFreq = {};
    occurrences.forEach(occ => {
        const fourthDigit = occ.lotteryNumber[3];
        fourthDigitFreq[fourthDigit] = (fourthDigitFreq[fourthDigit] || 0) + 1;
    });
    
    // Add most common fourth digits
    const sortedFourthDigits = Object.keys(fourthDigitFreq).sort((a, b) => {
        return fourthDigitFreq[b] - fourthDigitFreq[a];
    });
    
    sortedFourthDigits.slice(0, 2).forEach(digit => {
        numbers.add(searchNumber + digit);
    });
    
    // Strategy 3: For high confidence, add sequential variations
    if (confidence === 'high') {
        const baseNum = parseInt(searchNumber);
        
        // Add nearby numbers with pattern digits
        pattern.forEach(digit => {
            if (baseNum + 10 <= 999) {
                const nextTen = String(baseNum + 10).padStart(3, '0') + digit;
                numbers.add(nextTen);
            }
        });
    }
    
    // Convert to array and limit based on confidence
    let resultArray = Array.from(numbers);
    
    const maxNumbers = confidence === 'high' ? 8 : confidence === 'medium' ? 6 : 4;
    resultArray = resultArray.slice(0, maxNumbers);
    
    // Sort by likelihood (pattern digits first, then frequency)
    resultArray.sort((a, b) => {
        const aLastDigit = parseInt(a[a.length - 1]);
        const bLastDigit = parseInt(b[b.length - 1]);
        
        const aInPattern = pattern.includes(aLastDigit);
        const bInPattern = pattern.includes(bLastDigit);
        
        if (aInPattern && !bInPattern) return -1;
        if (!aInPattern && bInPattern) return 1;
        
        return a.localeCompare(b);
    });
    
    return resultArray;
}

// Generate reasoning for predictions
function generateReasoning(patternKey, pattern, occurrences, confidence) {
    const recentCount = occurrences.filter((_, i) => i < 5).length;
    const totalCount = occurrences.length;
    
    let reasoning = `Pattern ${patternKey} [${pattern.join(', ')}] appeared ${totalCount} time${totalCount !== 1 ? 's' : ''}`;
    
    if (recentCount > 0) {
        reasoning += `, with ${recentCount} recent occurrence${recentCount !== 1 ? 's' : ''}`;
    }
    
    const highPrizeCount = occurrences.filter(o => 
        ['1st', '2nd', '3rd', '5000'].includes(o.prizeSlot)
    ).length;
    
    if (highPrizeCount > 0) {
        reasoning += `. Found in ${highPrizeCount} high-value prize slot${highPrizeCount !== 1 ? 's' : ''}`;
    }
    
    reasoning += `.`;
    
    return reasoning;
}

// Continue to Part 2...





// Display statistics
function displayStats(occurrences, searchNumber) {
    const statsSection = document.getElementById('statsSection');
    const totalOccurrences = document.getElementById('totalOccurrences');
    const uniqueDates = document.getElementById('uniqueDates');
    const patternCount = document.getElementById('patternCount');
    
    // Calculate unique dates
    const dates = new Set(occurrences.map(o => o.date));
    
    // Calculate unique patterns
    const patterns = new Set();
    occurrences.forEach(o => {
        o.patterns.forEach(p => patterns.add(p.name));
    });
    
    // Animate numbers
    animateNumber(totalOccurrences, 0, occurrences.length, 1000);
    animateNumber(uniqueDates, 0, dates.size, 1000);
    animateNumber(patternCount, 0, patterns.size, 1000);
    
    statsSection.classList.remove('hidden');
}

// Display predictions
function displayPredictions(occurrences, searchNumber) {
    const predictionsSection = document.getElementById('predictionsSection');
    const predictionCards = document.getElementById('predictionCards');
    
    const predictions = generatePredictions(occurrences, searchNumber);
    
    predictionCards.innerHTML = '';
    
    predictions.forEach((prediction, index) => {
        const card = createPredictionCard(prediction, index);
        predictionCards.appendChild(card);
    });
    
    predictionsSection.classList.remove('hidden');
}

// Create prediction card element
function createPredictionCard(prediction, index) {
    const card = document.createElement('div');
    card.className = 'prediction-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    const confidenceClass = `confidence-${prediction.confidence}`;
    const confidenceText = prediction.confidence.charAt(0).toUpperCase() + prediction.confidence.slice(1);
    
    card.innerHTML = `
        <div class="prediction-header">
            <span class="pattern-badge">${prediction.pattern}</span>
            <span class="confidence-badge ${confidenceClass}">${confidenceText}</span>
        </div>
        <div class="predicted-numbers">
            ${prediction.predictedNumbers.map(num => 
                `<span class="predicted-number">${num}</span>`
            ).join('')}
        </div>
        <div class="prediction-info">
            <strong>Pattern:</strong> [${prediction.patternDigits.join(', ')}]<br>
            <strong>Frequency:</strong> ${prediction.frequency} occurrence${prediction.frequency !== 1 ? 's' : ''}<br>
            <strong>Recent:</strong> ${prediction.recentOccurrences} in last 5 draws<br>
            <strong>Analysis:</strong> ${prediction.reasoning}
        </div>
    `;
    
    return card;
}

// Display occurrences
function displayOccurrences(occurrences, searchNumber) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('resultsContainer');
    
    // Group by date
    const groupedByDate = {};
    occurrences.forEach(occ => {
        if (!groupedByDate[occ.date]) {
            groupedByDate[occ.date] = [];
        }
        groupedByDate[occ.date].push(occ);
    });
    
    resultsContainer.innerHTML = '';
    
    Object.keys(groupedByDate).forEach((date, index) => {
        const dateCard = createDateCard(date, groupedByDate[date], searchNumber, index);
        resultsContainer.appendChild(dateCard);
    });
    
    resultsSection.classList.remove('hidden');
}

// Create date card element
function createDateCard(date, occurrences, searchNumber, index) {
    const card = document.createElement('div');
    card.className = 'date-card';
    card.style.animationDelay = `${index * 0.05}s`;
    
    const formattedDate = formatDate(date);
    
    card.innerHTML = `
        <div class="date-header">
            <h3 class="date-title">📅 ${formattedDate}</h3>
            <span class="occurrence-count">${occurrences.length} match${occurrences.length !== 1 ? 'es' : ''}</span>
        </div>
        <div class="occurrences-grid">
            ${occurrences.map(occ => createOccurrenceItem(occ, searchNumber)).join('')}
        </div>
    `;
    
    return card;
}

// Create occurrence item element
function createOccurrenceItem(occurrence, searchNumber) {
    const highlightedNumber = highlightSearchNumber(occurrence.lotteryNumber, searchNumber);
    const patternsHtml = occurrence.patterns.map(p => 
        `<span class="pattern-tag">${p.name}: [${p.digits.join(', ')}]</span>`
    ).join('');
    
    return `
        <div class="occurrence-item">
            <div class="occurrence-header">
                <span class="lottery-number">${highlightedNumber}</span>
                <span class="prize-slot">${occurrence.prizeSlot}</span>
            </div>
            <div class="patterns-container">
                ${patternsHtml}
            </div>
        </div>
    `;
}

// Highlight search number in lottery number
function highlightSearchNumber(lotteryNumber, searchNumber) {
    const index = lotteryNumber.indexOf(searchNumber);
    if (index === -1) return lotteryNumber;
    
    const before = lotteryNumber.substring(0, index);
    const highlighted = lotteryNumber.substring(index, index + searchNumber.length);
    const after = lotteryNumber.substring(index + searchNumber.length);
    
    return `${before}<span style="color: #f59e0b; font-weight: 900;">${highlighted}</span>${after}`;
}

// Utility functions
function parseDate(dateStr) {
    const [day, month, year] = dateStr.split('-');
    return new Date(year, month - 1, day);
}

function formatDate(dateStr) {
    const date = parseDate(dateStr);
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    return date.toLocaleDateString('en-US', options);
}

function animateNumber(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            element.textContent = end;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 16);
}

function showLoading() {
    document.getElementById('loadingSpinner').classList.remove('hidden');
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('predictionsSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('noResults').classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.add('hidden');
}

function showNoResults() {
    document.getElementById('noResults').classList.remove('hidden');
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('predictionsSection').classList.add('hidden');
    document.getElementById('resultsSection').classList.add('hidden');
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function clearError() {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = '';
    errorElement.style.display = 'none';
}