// ---------- State ----------
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let monthlyBudget = parseFloat(localStorage.getItem('monthlyBudget')) || 0;
let selectedMonth = 'all'; // 'all' or 'YYYY-MM'
let expenseChart = null;

// ---------- DOM ----------
const form = document.getElementById('transaction-form');
const transactionList = document.getElementById('transaction-list');
const balanceEl = document.getElementById('balance');
const incomeEl = document.getElementById('total-income');
const expenseEl = document.getElementById('total-expense');
const clearBtn = document.getElementById('clear-all');
const monthFilter = document.getElementById('month-filter');
const budgetInput = document.getElementById('budget-input');
const exportBtn = document.getElementById('export-csv');
const importBtn = document.getElementById('import-csv-btn');
const importFile = document.getElementById('import-csv');
const budgetStatus = document.getElementById('budget-status');
const budgetFill = document.getElementById('budget-fill');
const budgetMsg = document.getElementById('budget-msg');
const netLabel = document.getElementById('net-label');
const incomeLabel = document.getElementById('income-label');
const expenseLabel = document.getElementById('expense-label');

// ---------- Init ----------
budgetInput.value = monthlyBudget > 0 ? monthlyBudget : '';
document.getElementById('date').valueAsDate = new Date();
populateMonthFilter();
renderAll();

// ---------- Persistence ----------
function saveData() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('monthlyBudget', monthlyBudget);
}

// ---------- Helpers ----------
function getMonthKey(dateStr) {
    return dateStr.slice(0, 7); // 'YYYY-MM'
}

function getFilteredTransactions() {
    if (selectedMonth === 'all') return transactions;
    return transactions.filter(t => getMonthKey(t.date) === selectedMonth);
}

function formatMonthLabel(yyyymm) {
    const [y, m] = yyyymm.split('-');
    return new Date(y, parseInt(m) - 1, 1)
        .toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

function populateMonthFilter() {
    const months = new Set();
    transactions.forEach(t => months.add(getMonthKey(t.date)));
    months.add(getMonthKey(new Date().toISOString().slice(0, 10)));
    const sorted = [...months].sort().reverse();
    monthFilter.innerHTML = '<option value="all">All Months</option>';
    sorted.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = formatMonthLabel(m);
        monthFilter.appendChild(opt);
    });
    monthFilter.value = selectedMonth;
}

// ---------- Events ----------
form.addEventListener('submit', function (e) {
    e.preventDefault();
    const transaction = {
        id: Date.now(),
        description: document.getElementById('description').value.trim(),
        amount: parseFloat(document.getElementById('amount').value),
        type: document.getElementById('type').value,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value
    };
    transactions.push(transaction);
    saveData();
    populateMonthFilter();
    renderAll();
    form.reset();
    document.getElementById('date').valueAsDate = new Date();
});

function deleteTransaction(id) {
    transactions = transactions.filter(t => t.id !== id);
    saveData();
    populateMonthFilter();
    renderAll();
}

clearBtn.addEventListener('click', function () {
    if (confirm('Delete ALL transactions? This cannot be undone.')) {
        transactions = [];
        saveData();
        populateMonthFilter();
        renderAll();
    }
});

monthFilter.addEventListener('change', function () {
    selectedMonth = monthFilter.value;
    renderAll();
});

budgetInput.addEventListener('input', function () {
    monthlyBudget = parseFloat(budgetInput.value) || 0;
    saveData();
    renderAll();
});

// ---------- CSV Export ----------
exportBtn.addEventListener('click', function () {
    if (transactions.length === 0) {
        alert('No transactions to export.');
        return;
    }
    const headers = ['id', 'date', 'description', 'category', 'type', 'amount'];
    const rows = transactions.map(t => [
        t.id, t.date, `"${t.description.replace(/"/g, '""')}"`, t.category, t.type, t.amount
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance-data.csv';
    a.click();
    URL.revokeObjectURL(url);
});

// ---------- CSV Import ----------
importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        if (lines.length < 2) { alert('CSV empty or invalid.'); return; }
        const newOnes = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            if (cols.length < 6) continue;
            const [id, date, description, category, type, amount] = cols;
            newOnes.push({
                id: parseInt(id) || Date.now() + Math.floor(Math.random() * 1000),
                date,
                description: description.replace(/""/g, '"'),
                category,
                type,
                amount: parseFloat(amount)
            });
        }
        transactions = transactions.concat(newOnes);
        saveData();
        populateMonthFilter();
        renderAll();
        alert(`Imported ${newOnes.length} transactions.`);
    };
    reader.readAsText(file);
    importFile.value = '';
});

function parseCsvLine(line) {
    const out = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else cur += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { out.push(cur); cur = ''; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
}

// ---------- Render ----------
function renderAll() {
    const filtered = getFilteredTransactions();
    renderTransactions(filtered);
    updateSummary(filtered);
    updateBudget(filtered);
    renderChart(filtered);
    updateLabels();
}

function updateLabels() {
    const period = selectedMonth === 'all' ? 'All Time' : formatMonthLabel(selectedMonth);
    netLabel.textContent = `Net (${period})`;
    incomeLabel.textContent = `Income (${period})`;
    expenseLabel.textContent = `Expenses (${period})`;
}

function renderTransactions(filtered) {
    transactionList.innerHTML = '';
    const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(t => {
        const row = document.createElement('tr');
        const sign = t.type === 'income' ? '+' : '-';
        const color = t.type === 'income' ? '#27ae60' : '#e74c3c';
        row.innerHTML = `
            <td>${t.date}</td>
            <td>${escapeHtml(t.description)}</td>
            <td>${t.category}</td>
            <td><span class="tag ${t.type}">${t.type}</span></td>
            <td style="color: ${color}; font-weight: bold;">${sign}$${t.amount.toFixed(2)}</td>
            <td><button class="delete-btn" onclick="deleteTransaction(${t.id})">Delete</button></td>
        `;
        transactionList.appendChild(row);
    });
}

function updateSummary(filtered) {
    let income = 0, expense = 0;
    filtered.forEach(t => {
        if (t.type === 'income') income += t.amount;
        else expense += t.amount;
    });
    const net = income - expense;
    balanceEl.textContent = `${net < 0 ? '-' : ''}$${Math.abs(net).toFixed(2)}`;
    incomeEl.textContent = `$${income.toFixed(2)}`;
    expenseEl.textContent = `$${expense.toFixed(2)}`;
}

function updateBudget(filtered) {
    const expense = filtered
        .filter(t => t.type === 'expense')
        .reduce((s, t) => s + t.amount, 0);

    budgetStatus.textContent = `$${expense.toFixed(2)} / $${monthlyBudget.toFixed(2)}`;

    let pct = 0;
    if (monthlyBudget > 0) pct = (expense / monthlyBudget) * 100;

    budgetFill.style.width = Math.min(pct, 100) + '%';

    if (monthlyBudget <= 0) {
        budgetFill.style.background = '#95a5a6';
        budgetMsg.textContent = 'Set a budget to track spending';
    } else if (pct > 100) {
        budgetFill.style.background = '#e74c3c';
        budgetMsg.textContent = `Over budget by $${(expense - monthlyBudget).toFixed(2)}`;
    } else if (pct >= 80) {
        budgetFill.style.background = '#f39c12';
        budgetMsg.textContent = `Careful! ${pct.toFixed(0)}% used`;
    } else {
        budgetFill.style.background = '#27ae60';
        budgetMsg.textContent = `${(100 - pct).toFixed(0)}% remaining`;
    }
}

function renderChart(filtered) {
    const canvas = document.getElementById('expense-chart');
    const ctx = canvas.getContext('2d');

    if (typeof Chart === 'undefined') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('Chart needs internet to load', canvas.width / 2, canvas.height / 2);
        return;
    }

    const categories = {};
    filtered.forEach(t => {
        if (t.type === 'expense') {
            categories[t.category] = (categories[t.category] || 0) + t.amount;
        }
    });

    const labels = Object.keys(categories);
    const data = Object.values(categories);

    if (expenseChart) expenseChart.destroy();

    if (labels.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '16px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'center';
        ctx.fillText('No expense data yet', canvas.width / 2, canvas.height / 2);
        return;
    }

    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#95a5a6']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
