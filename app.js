// Firebase Init
const firebaseConfig = {
    apiKey: "AIzaSyCVFZYYzneg3l8l7EROFMEwqiTq5St-hRQ",
    authDomain: "ongoing-9db96.firebaseapp.com",
    projectId: "ongoing-9db96",
    storageBucket: "ongoing-9db96.firebasestorage.app",
    messagingSenderId: "533877088381",
    appId: "1:533877088381:web:bfac3a2e3f1a26c2779114"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const provider = new firebase.auth.GoogleAuthProvider();

// DOM Elements
const tabBtns = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const csvFileInput = document.getElementById('csvFileInput');
const recentList = document.getElementById('recentList');
const homeTotalAmount = document.getElementById('homeTotalAmount');
const addTransactionForm = document.getElementById('addTransactionForm');

const loginOverlay = document.getElementById('loginOverlay');
const loginBtnOverlay = document.getElementById('loginBtnOverlay');
const skipLoginBtn = document.getElementById('skipLoginBtn');

// State
let transactions = [];
let charts = {
    weekly: null,
    category: null
};
let currentDate = new Date();
let currentCalMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
let currentUser = null;
let unsubscribeFirestore = null;

// Initialize
function init() {
    document.getElementById('inputDate').value = new Date().toISOString().split('T')[0];
    setupEventListeners();

    // Setup Auth Listener
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            loginOverlay.classList.remove('active');
            logoutBtn.style.display = 'inline-block';
            
            // Check for local transactions to migrate
            const localData = localStorage.getItem('transactions');
            if (localData) {
                const localTxns = JSON.parse(localData);
                if (localTxns.length > 0) {
                    alert('기존 기기에 있던 오프라인 데이터를 클라우드로 마이그레이션 합니다.');
                    const batch = db.batch();
                    localTxns.forEach(t => {
                        const docRef = db.collection('users').doc(user.uid).collection('transactions').doc();
                        batch.set(docRef, {
                            category: t.category,
                            desc: t.desc,
                            amount: t.amount,
                            date: firebase.firestore.Timestamp.fromDate(new Date(t.date))
                        });
                    });
                    await batch.commit();
                    localStorage.removeItem('transactions');
                }
            }
            
            // Load from Firebase
            loadFromFirebase();
        } else {
            currentUser = null;
            logoutBtn.style.display = 'none';
            if (unsubscribeFirestore) {
                unsubscribeFirestore();
            }
            loadFromLocalStorage();
            updateUI();
        }
    });
}

function loadFromFirebase() {
    if (!currentUser) return;
    
    unsubscribeFirestore = db.collection('users').doc(currentUser.uid).collection('transactions')
        .orderBy('date', 'desc')
        .onSnapshot((snapshot) => {
            transactions = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                transactions.push({
                    id: doc.id,
                    date: data.date.toDate(),
                    category: data.category,
                    desc: data.desc,
                    amount: data.amount
                });
            });
            updateUI();
        });
}

function setupEventListeners() {
    // Tab Navigation
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Update active state
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
            
            // Re-render specific tabs if needed
            if(targetTab === 'stats') {
                renderCharts();
            } else if (targetTab === 'ai') {
                generateAIComment();
            } else if (targetTab === 'calendar') {
                renderCalendar();
            }
        });
    });

    // Calendar Navigation
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        currentCalMonth.setMonth(currentCalMonth.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        currentCalMonth.setMonth(currentCalMonth.getMonth() + 1);
        renderCalendar();
    });

    // Auth
    loginBtnOverlay.addEventListener('click', () => {
        auth.signInWithPopup(provider).catch(error => {
            console.error(error);
            alert('로그인 중 오류가 발생했습니다.');
        });
    });

    skipLoginBtn.addEventListener('click', () => {
        loginOverlay.classList.remove('active');
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            loginOverlay.classList.add('active');
            transactions = [];
            updateUI();
        });
    });

    // CSV Import / Export
    importBtn.addEventListener('click', () => {
        csvFileInput.click();
    });

    exportBtn.addEventListener('click', handleExportCSV);

    csvFileInput.addEventListener('change', handleCSVUpload);

    // Form Submit
    addTransactionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('inputDate').value;
        const category = document.getElementById('inputCategory').value;
        const desc = document.getElementById('inputDesc').value;
        const amount = parseInt(document.getElementById('inputAmount').value, 10);

        if(date && category && desc && amount) {
            const newTxn = {
                date: new Date(date),
                category,
                desc,
                amount
            };

            if (currentUser) {
                // Save to Firebase
                db.collection('users').doc(currentUser.uid).collection('transactions').add({
                    ...newTxn,
                    date: firebase.firestore.Timestamp.fromDate(newTxn.date)
                }).then(() => {
                    alert('클라우드에 저장되었습니다.');
                    addTransactionForm.reset();
                    document.getElementById('inputDate').value = new Date().toISOString().split('T')[0];
                });
            } else {
                // Save Locally
                transactions.push(newTxn);
                transactions.sort((a, b) => b.date - a.date);
                saveToLocalStorage();
                updateUI();
                addTransactionForm.reset();
                document.getElementById('inputDate').value = new Date().toISOString().split('T')[0];
                alert('기기에 저장되었습니다. (클라우드 보관을 위해 로그인을 권장합니다)');
            }
        }
    });
}

// Data Management
function saveToLocalStorage() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('transactions');
    if (data) {
        transactions = JSON.parse(data).map(t => ({
            ...t,
            date: new Date(t.date)
        }));
    }
}

// CSV Parsing & Export
function handleExportCSV() {
    if (transactions.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }

    // Convert transactions to CSV format
    const exportData = transactions.map(t => ({
        날짜: `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}-${String(t.date.getDate()).padStart(2, '0')}`,
        소분류: t.category,
        내용: t.desc,
        금액: t.amount
    }));

    const csv = Papa.unparse(exportData);
    
    // Add BOM for Excel UTF-8 compatibility
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `가계부_내역_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        complete: function(results) {
            parseCSVData(results.data);
            saveToLocalStorage();
            updateUI();
            alert('CSV 데이터가 성공적으로 불러와졌습니다.');
        },
        error: function(err) {
            console.error(err);
            alert('CSV 파일을 읽는 중 오류가 발생했습니다.');
        }
    });
}

function parseCSVData(data) {
    // Determine where actual transaction data starts by finding the header row
    let headerRowIdx = -1;
    for(let i=0; i<data.length; i++) {
        if(data[i].includes('날짜') && data[i].includes('내용')) {
            headerRowIdx = i;
            break;
        }
    }

    if(headerRowIdx === -1) {
        alert('지원하지 않는 CSV 포맷입니다. (날짜, 내용 열을 찾을 수 없습니다.)');
        return;
    }

    const headers = data[headerRowIdx];
    const dateIdx = headers.indexOf('날짜');
    const subCatIdx = headers.indexOf('소분류');
    const descIdx = headers.indexOf('내용');
    const amountIdx = headers.findIndex(h => h.trim() === '금액');

    const newTransactions = [];

    for(let i = headerRowIdx + 1; i < data.length; i++) {
        const row = data[i];
        if(!row || row.length < Math.max(dateIdx, amountIdx)) continue;
        
        const dateStr = row[dateIdx];
        const category = row[subCatIdx];
        const desc = row[descIdx];
        let amountStr = row[amountIdx];
        
        if(!dateStr || !amountStr) continue;
        
        amountStr = amountStr.replace(/,/g, '').trim();
        const amount = parseInt(amountStr, 10);
        
        if(isNaN(amount)) continue;

        // "4월 20일" format to current year
        const year = new Date().getFullYear();
        let month = 1, day = 1;
        const match = dateStr.match(/(\d+)월\s*(\d+)일/);
        if(match) {
            month = parseInt(match[1], 10);
            day = parseInt(match[2], 10);
        }
        
        newTransactions.push({
            date: new Date(year, month - 1, day),
            category: category || '기타',
            desc: desc,
            amount: amount
        });
    }

    // Merge logic (Replace all for simplicity or append. We will append and distinct by simple hashing)
    transactions = [...transactions, ...newTransactions];
    // Simple sort by date descending
    transactions.sort((a, b) => b.date - a.date);
}

// UI Rendering
function updateUI() {
    renderHome();
}

function renderHome() {
    // Total Amount
    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    homeTotalAmount.textContent = total.toLocaleString() + '원';

    // Recent List
    recentList.innerHTML = '';
    const recentTxns = transactions.slice(0, 10); // Show max 10
    
    recentTxns.forEach(t => {
        const li = document.createElement('li');
        const formattedDate = `${t.date.getMonth() + 1}월 ${t.date.getDate()}일`;
        
        li.innerHTML = `
            <div class="txn-info">
                <span class="txn-title">${t.desc} <small style="color:var(--text-secondary)">(${t.category})</small></span>
                <span class="txn-date">${formattedDate}</span>
            </div>
            <div class="txn-amount">${t.amount.toLocaleString()}원</div>
        `;
        recentList.appendChild(li);
    });
}

// Calendar Rendering
function renderCalendar() {
    const monthLabel = document.getElementById('calendarMonthLabel');
    const calGrid = document.getElementById('calendarGrid');
    const calMonthlyTotal = document.getElementById('calMonthlyTotal');
    const calTodayTotal = document.getElementById('calTodayTotal');

    const year = currentCalMonth.getFullYear();
    const month = currentCalMonth.getMonth();
    
    monthLabel.textContent = `${year}년 ${month + 1}월`;

    // Calculate dates
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Map daily spending
    const dailySpend = {};
    let monthlyTotal = 0;
    let todayTotal = 0;
    
    const todayStr = new Date().toDateString();

    transactions.forEach(t => {
        if(t.date.getFullYear() === year && t.date.getMonth() === month) {
            const day = t.date.getDate();
            dailySpend[day] = (dailySpend[day] || 0) + t.amount;
            monthlyTotal += t.amount;
        }
    });

    // For "오늘까지의 총액" - sum all past dates up to today globally, or just this month up to today?
    // Let's do globally all transactions up to today.
    const today = new Date();
    transactions.forEach(t => {
        // Clear time portion for comparison
        const tDate = new Date(t.date.getFullYear(), t.date.getMonth(), t.date.getDate());
        const nDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if(tDate <= nDate) {
            todayTotal += t.amount;
        }
    });

    calMonthlyTotal.textContent = monthlyTotal.toLocaleString() + '원';
    calTodayTotal.textContent = todayTotal.toLocaleString() + '원';

    // Build Calendar HTML
    let html = '';
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    dayNames.forEach(d => {
        html += `<div class="calendar-day-header">${d}</div>`;
    });

    // Empty cells before start of month
    for(let i=0; i<firstDay; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    for(let d=1; d<=daysInMonth; d++) {
        const checkDate = new Date(year, month, d);
        const isToday = checkDate.toDateString() === todayStr;
        const total = dailySpend[d] || 0;
        
        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <span class="cal-date">${d}</span>
                <span class="cal-total">${total > 0 ? total.toLocaleString() : ''}</span>
            </div>
        `;
    }

    calGrid.innerHTML = html;
}

function renderCharts() {
    const themeColor = '#f8fafc';
    const gridColor = 'rgba(255, 255, 255, 0.1)';

    // Data prep for Category Pie Chart
    const catMap = {};
    transactions.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const catLabels = Object.keys(catMap);
    const catData = Object.values(catMap);

    if(charts.category) charts.category.destroy();
    
    const ctxCategory = document.getElementById('categoryChart').getContext('2d');
    charts.category = new Chart(ctxCategory, {
        type: 'doughnut',
        data: {
            labels: catLabels,
            datasets: [{
                data: catData,
                backgroundColor: [
                    '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', 
                    '#f59e0b', '#10b981', '#06b6d4', '#64748b'
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: themeColor } }
            }
        }
    });

    // Data prep for Weekly Bar Chart (Mocked weeks for simplicity based on month)
    const weekMap = {};
    transactions.forEach(t => {
        const weekNum = Math.ceil(t.date.getDate() / 7);
        const label = `${t.date.getMonth() + 1}월 ${weekNum}주차`;
        weekMap[label] = (weekMap[label] || 0) + t.amount;
    });
    
    // Sort week labels
    const weekLabels = Object.keys(weekMap).sort();
    const weekData = weekLabels.map(l => weekMap[l]);

    if(charts.weekly) charts.weekly.destroy();

    const ctxWeekly = document.getElementById('weeklyChart').getContext('2d');
    charts.weekly = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: '지출 금액',
                data: weekData,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: themeColor } },
                x: { grid: { display: false }, ticks: { color: themeColor } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function generateAIComment() {
    const aiContainer = document.getElementById('aiCommentContent');
    
    if(transactions.length === 0) {
        aiContainer.innerHTML = '<p>데이터가 부족하여 분석할 수 없습니다. 소비 내역을 추가해주세요!</p>';
        return;
    }

    // Basic AI Logic: Find max spending category
    const catMap = {};
    transactions.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });

    let maxCat = '';
    let maxAmount = 0;
    
    for(const [cat, amt] of Object.entries(catMap)) {
        if(amt > maxAmount) {
            maxAmount = amt;
            maxCat = cat;
        }
    }

    const total = transactions.reduce((sum, t) => sum + t.amount, 0);
    const ratio = Math.round((maxAmount / total) * 100);

    aiContainer.innerHTML = `
        <p>현재 기록된 총 지출액은 <strong>${total.toLocaleString()}원</strong> 입니다.</p>
        <div class="ai-suggestion">
            <strong>💡 AI 분석 결과</strong><br>
            가장 지출이 큰 카테고리는 <strong>'${maxCat}'</strong>이며, 총 지출의 <strong>${ratio}%</strong>를 차지하고 있습니다. 
            <br><br>
            이 카테고리의 지출을 조금만 줄여도 전체 생활비 절감에 큰 도움이 될 것 같습니다. 이번 달은 '${maxCat}' 예산을 설정해보는 것은 어떨까요?
        </div>
    `;
}

// Start
init();
