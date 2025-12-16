// --- STATE MANAGEMENT ---
const DEFAULT_GOAL = 12960;
let appData = {
    goal: DEFAULT_GOAL,
    history: {},
    settings: {
        firstLogin: new Date().toISOString(),
        catchUpMode: false,      // New setting
        catchUpDays: 1           // New setting (default yesterday)
    }
};

let tempCounter = 0;
const todayStr = new Date().toISOString().split('T')[0];

// --- INITIALIZATION ---
$(document).ready(function () {
    loadData();
    renderUI();
});

// --- CORE LOGIC ---
function loadData() {
    const stored = localStorage.getItem('japAppData');
    if (stored) {
        appData = JSON.parse(stored);
    }
    // Ensure today exists
    if (!appData.history[todayStr]) {
        appData.history[todayStr] = [];
    }
    $('#goal-input').val(appData.goal);
}

// Calculate the dynamic goal based on catch-up settings
function getDynamicGoal() {
    let baseGoal = appData.goal;

    if (!appData.settings.catchUpMode) return baseGoal;

    let deficit = 0;
    const checkDays = appData.settings.catchUpDays || 1;

    for (let i = 1; i <= checkDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];

        const entries = appData.history[dStr] || [];
        const dailyTotal = entries.reduce((a, b) => a + b, 0);

        if (dailyTotal < baseGoal) {
            deficit += (baseGoal - dailyTotal);
        }
    }

    return baseGoal + deficit;
}

// Distribute today's count to past deficits for visualization
function getVisualHistory() {
    // 1. Deep clone history so we don't touch real data
    let visualHistory = JSON.parse(JSON.stringify(appData.history));

    // If normal mode, return raw data immediately (Standard behavior)
    if (!appData.settings.catchUpMode) return visualHistory;

    let availableJap = getTodayTotal();
    const daysToCheck = appData.settings.catchUpDays || 1;
    const baseGoal = appData.goal;

    // 2. Loop: Yesterday -> Oldest (Prioritize immediate streak)
    for (let i = 1; i <= daysToCheck; i++) {
        if (availableJap <= 0) break; // Stop if no jap left

        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];

        const dayEntries = visualHistory[dStr] || [];
        const dayTotal = dayEntries.reduce((a, b) => a + b, 0);

        // If past day has a deficit
        if (dayTotal < baseGoal) {
            const deficit = baseGoal - dayTotal;

            // Use what we have to fill it
            const contribution = Math.min(availableJap, deficit);

            if (contribution > 0) {
                // Add "Ghost" entry to that past day
                if (!visualHistory[dStr]) visualHistory[dStr] = [];
                visualHistory[dStr].push(contribution);

                // Deduct from today's available budget
                availableJap -= contribution;
            }
        }
    }

    // 3. CRITICAL FIX: Overwrite 'Today' in the visual object 
    // to only show what is LEFT after paying debts.
    // We wrap it in an array [availableJap] because the system expects an array of entries.
    visualHistory[todayStr] = [availableJap];

    return visualHistory;
}

function toggleCatchUp() {
    appData.settings.catchUpMode = $('#catchup-toggle').is(':checked');
    $('#catchup-options').toggle(appData.settings.catchUpMode);
    saveData(); // Calls renderUI internally
}

function saveCatchUpSettings() {
    appData.settings.catchUpDays = parseInt($('#catchup-days').val());
    saveData();
}

function saveData() {
    localStorage.setItem('japAppData', JSON.stringify(appData));
    renderUI();
}

function getTodayTotal() {
    const entries = appData.history[todayStr] || [];
    return entries.reduce((a, b) => a + b, 0);
}

function getLifetimeTotal() {
    let total = 0;
    Object.values(appData.history).forEach(dayEntries => {
        total += dayEntries.reduce((a, b) => a + b, 0);
    });
    return total;
}

// --- ACTIONS ---
function addManualEntry() {
    const val = parseInt($('#manual-input').val());
    if (val && val > 0) {
        if (!appData.history[todayStr]) appData.history[todayStr] = [];
        appData.history[todayStr].push(val);
        $('#manual-input').val(''); // Clear input
        saveData();
    }
}
function deleteAllToday() {
    const count = appData.history[todayStr] ? appData.history[todayStr].length : 0;
    if (count > 0) {
        if (confirm("Are you sure you want to delete ALL entries for today?")) {
            appData.history[todayStr] = [];
            saveData();
        }
    } else {
        alert("No entries to clear.");
    }
}

function deleteSpecificEntry(originalIndex) {
    if (confirm("Remove this entry?")) {
        // Remove the item at the specific index
        appData.history[todayStr].splice(originalIndex, 1);
        saveData();
    }
}

function saveGoal() {
    const newGoal = parseInt($('#goal-input').val());
    if (newGoal > 0) {
        appData.goal = newGoal;
        saveData();
        alert("Daily goal updated!");
    }
}

// --- DIGITAL COUNTER MODAL ---
function openCounterModal() {
    // Start from existing count for today
    const currentToday = getTodayTotal();
    tempCounter = currentToday;

    $('#modal-counter-val').text(tempCounter.toLocaleString());
    $('#counter-modal').css('display', 'flex');
}

function incrementModalCounter() {
    tempCounter++;
    $('#modal-counter-val').text(tempCounter);
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(5);
}

function closeCounterModal(save) {
    if (save) {
        const currentToday = getTodayTotal();
        const difference = tempCounter - currentToday;

        if (difference > 0) {
            if (!appData.history[todayStr]) appData.history[todayStr] = [];
            appData.history[todayStr].push(difference);
            saveData();
        }
    }
    $('#counter-modal').hide();
}

// --- UI RENDERING ---
function renderUI() {
    const rawTodayTotal = getTodayTotal();
    const lifetimeTotal = getLifetimeTotal();
    const baseGoal = appData.goal;

    // --- 1. CATCH UP & PROGRESS BAR LOGIC ---
    let displayTotal = rawTodayTotal;
    let displayGoal = baseGoal;
    let barColor = '#ff7f50'; // Default Orange
    let progressPct = 0;
    let statusText = "";

    if (appData.settings.catchUpMode) {
        // Calculate Total Deficit from past days
        let totalDeficit = 0;
        const checkDays = appData.settings.catchUpDays || 1;
        for (let i = 1; i <= checkDays; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = d.toISOString().split('T')[0];
            const hist = appData.history[dStr] || [];
            const daySum = hist.reduce((a, b) => a + b, 0);
            if (daySum < baseGoal) totalDeficit += (baseGoal - daySum);
        }

        if (totalDeficit > 0) {
            // PHASE 1: PENALTY MODE
            if (rawTodayTotal < totalDeficit) {
                displayTotal = rawTodayTotal;
                displayGoal = totalDeficit;
                barColor = '#ff5252'; // RED
                progressPct = (displayTotal / displayGoal) * 100;
                statusText = `<span style="color:#ff5252"><i class="fas fa-exclamation-triangle"></i> ${displayTotal}/${displayGoal}</span>`;
            }
            // PHASE 2: NORMAL MODE (After penalty paid)
            else {
                const effectiveToday = rawTodayTotal - totalDeficit;
                displayTotal = effectiveToday;
                displayGoal = baseGoal;
                // Green if done, Orange if working
                barColor = (effectiveToday >= baseGoal) ? '#4caf50' : '#ff7f50';
                progressPct = (effectiveToday / baseGoal) * 100;
                statusText = `${displayTotal.toLocaleString()} / ${displayGoal.toLocaleString()}`;
            }
        } else {
            // No deficit, normal mode
            progressPct = (rawTodayTotal / baseGoal) * 100;
            barColor = (rawTodayTotal >= baseGoal) ? '#4caf50' : '#ff7f50';
            statusText = `${rawTodayTotal.toLocaleString()} / ${baseGoal.toLocaleString()}`;
        }
    } else {
        // Standard Mode (Catch up off)
        progressPct = (rawTodayTotal / baseGoal) * 100;
        barColor = (rawTodayTotal >= baseGoal) ? '#4caf50' : '#ff7f50';
        statusText = `${rawTodayTotal.toLocaleString()} / ${baseGoal.toLocaleString()}`;
    }

    // Cap width at 100%
    if (progressPct > 100) progressPct = 100;

    // Apply to DOM
    $('#total-lifetime').text(lifetimeTotal.toLocaleString());
    $('#today-text').html(statusText);
    $('#daily-progress-bar').css({
        'width': progressPct + '%',
        'background': barColor
    });

    // 2. History List
    const list = $('#today-entries-list');
    list.empty();
    const entries = appData.history[todayStr] || [];
    if (entries.length === 0) {
        list.append('<li class="history-item" style="color:#777; justify-content:center;">No entries today</li>');
    } else {
        // Show in reverse order (newest top)
        entries.slice().reverse().forEach((val, idx) => {
            // Calculate the original array index (since we are looping in reverse)
            const originalIndex = entries.length - 1 - idx;

            list.append(`<li class="history-item" style="align-items: center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button class="btn-danger" 
                                style="padding: 0; width: 18px; height: 18px; border-radius: 50%; font-size: 0.7rem; display: flex; align-items: center; justify-content: center;" 
                                onclick="deleteSpecificEntry(${originalIndex})">
                            <i class="fas fa-minus"></i>
                        </button>
                        <span style="font-size: 0.9rem;">Entry #${entries.length - idx}</span>
                    </div>
                    <strong>+${val}</strong>
                </li>`);
        });
    }

    // --- 3. Streak & Devotion ---
    const streak = calculateStreak();
    $('#streak-count').text(streak);
    $('#devotion-level').text(calculateLevel(lifetimeTotal));

    // --- 4. Charts & Settings ---
    renderChart(); // Will use new logic
    renderStats();
    renderAchievements(lifetimeTotal, streak);

    // Update Settings toggles
    $('#catchup-toggle').prop('checked', appData.settings.catchUpMode || false);
    $('#catchup-days').val(appData.settings.catchUpDays || 1);
    $('#catchup-options').toggle(appData.settings.catchUpMode || false);
}

// --- ANALYTICS HELPER ---
function calculateStreak() {
    let streak = 0;
    // Sort dates descending
    const dates = Object.keys(appData.history).sort().reverse();

    if (dates.length === 0) return 0;

    // Check if today has data
    let hasToday = (appData.history[todayStr] && appData.history[todayStr].reduce((a, b) => a + b, 0) > 0);
    let startIdx = 0;

    // If no data today yet, check if yesterday exists to maintain streak
    if (!hasToday) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        if (!appData.history[yStr]) return 0; // Streak broken
        // Don't count today as a streak day yet, but don't break logic
    }

    // Simple logic: convert dates to timestamps and check continuity
    // (Simplified for single file - checking consecutive days present in history)
    let currentDate = new Date();
    // Reset time
    currentDate.setHours(0, 0, 0, 0);

    // If today has 0 count, we start checking from yesterday for the streak number
    if (!hasToday) currentDate.setDate(currentDate.getDate() - 1);

    while (true) {
        const dStr = currentDate.toISOString().split('T')[0];
        const entries = appData.history[dStr];
        const daySum = entries ? entries.reduce((a, b) => a + b, 0) : 0;

        if (daySum > 0) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function calculateLevel(total) {
    if (total < 10000) return "Sadhaka (Beginner)";
    if (total < 100000) return "Devotee";
    if (total < 1000000) return "Dedicated Soul";
    if (total < 10000000) return "Mantra Siddha";
    return "Divine Connection";
}

function renderChart() {
    const container = $('#weekly-chart');
    container.empty();

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // GET THE VISUAL DATA
    const visualData = getVisualHistory();

    // Get last 7 days
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const dayName = days[d.getDay()];

        // Use visual data instead of raw data
        const entries = visualData[dStr] || [];
        const sum = entries.reduce((a, b) => a + b, 0);

        // Normalize for visual
        let heightPct = (sum / appData.goal) * 100;
        if (heightPct > 100) heightPct = 100;
        if (sum > 0 && heightPct < 5) heightPct = 5;

        // Logic: If this is NOT today, and the sum is exactly the goal, 
        // and we are in catchup mode, it might be filled by backlogging.
        // But for simplicity, we just use standard colors.
        const color = sum >= appData.goal ? '#4caf50' : '#ff7f50';

        container.append(`
                <div class="bar-col">
                    <div class="bar" style="height: ${heightPct}%; background: ${color}" data-val="${sum}"></div>
                    <div class="bar-label">${dayName}</div>
                </div>
            `);
    }
}

function renderStats() {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    let monthSum = 0;
    let daysCounted = 0;

    Object.keys(appData.history).forEach(date => {
        if (date.startsWith(currentMonth)) {
            const daySum = appData.history[date].reduce((a, b) => a + b, 0);
            monthSum += daySum;
            if (daySum > 0) daysCounted++;
        }
    });

    $('#month-total').text(monthSum.toLocaleString());
    const avg = daysCounted > 0 ? Math.round(monthSum / daysCounted) : 0;
    $('#daily-avg').text(avg.toLocaleString());
}

function renderAchievements(total, streak) {
    const milestones = [
        { id: 'streak_1w', name: '1 Week Streak', icon: 'fa-fire', reqStreak: 7, type: 'streak' },
        { id: 'streak_1m', name: '1 Month Streak', icon: 'fa-fire-alt', reqStreak: 30, type: 'streak' },
        { id: 'jap_50k', name: '50k Jap', icon: 'fa-seedling', val: 50000, type: 'count' },
        { id: 'jap_1l', name: '1 Lakh Jap', icon: 'fa-leaf', val: 100000, type: 'count' },
        { id: 'jap_50l', name: '50 Lakh Jap', icon: 'fa-tree', val: 5000000, type: 'count' },
        { id: 'jap_1cr', name: '1 Crore Jap', icon: 'fa-spa', val: 10000000, type: 'count' },
        { id: 'jap_2cr', name: '2 Crore Jap', icon: 'fa-sun', val: 20000000, type: 'count' },
        { id: 'jap_3cr', name: '3 Crore Jap', icon: 'fa-om', val: 30000000, type: 'count' },
        { id: 'jap_5cr', name: '5 Crore Jap', icon: 'fa-dharmachakra', val: 50000000, type: 'count' }
    ];

    const container = $('#achievement-list');
    container.empty();

    milestones.forEach(m => {
        let unlocked = false;
        if (m.type === 'count' && total >= m.val) unlocked = true;
        if (m.type === 'streak' && streak >= m.reqStreak) unlocked = true;

        const html = `
                <div class="badge ${unlocked ? 'unlocked' : ''}">
                    <i class="fas ${m.icon}"></i>
                    <h4>${m.name}</h4>
                    <p>${unlocked ? 'Unlocked!' : 'Locked'}</p>
                </div>
            `;
        container.append(html);
    });
}

// --- UTILS & DATA MANAGEMENT ---
function switchTab(tabId) {
    $('.tab-content').removeClass('active');
    $(`#tab-${tabId}`).addClass('active');

    $('.nav-item').removeClass('active');
    // Find the button with the onclick matching this tab and set active (simple query)
    $(`.nav-item[onclick="switchTab('${tabId}')"]`).addClass('active');
}

function exportData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "jap_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (imported.history && imported.goal) {
                if (confirm("This will overwrite your current data. Are you sure?")) {
                    appData = imported;
                    saveData();
                    alert("Data restored successfully.");
                }
            } else {
                alert("Invalid file format.");
            }
        } catch (err) {
            alert("Error reading file.");
        }
    };
    reader.readAsText(file);
}

function resetAllData() {
    if (confirm("Are you sure you want to delete ALL history? This cannot be undone.")) {
        if (confirm("Double check: Delete EVERYTHING?")) {
            localStorage.removeItem('japAppData');
            location.reload();
        }
    }
}
