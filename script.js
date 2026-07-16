// ---------- State ----------
const store = {
    accounts: JSON.parse(localStorage.getItem('accounts')) || [{ id: 1, name: 'Main', color: '#4f46e5' }],
    transactions: JSON.parse(localStorage.getItem('transactions')) || [],
    recurring: JSON.parse(localStorage.getItem('recurring')) || [],
    budget: parseFloat(localStorage.getItem('monthlyBudget')) || 0,
};
let selectedMonth = 'all';
let selectedAccount = 'all';
let expenseChart = null;

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const accountFilter = $('account-filter');
const monthFilter = $('month-filter');
const budgetInput = $('budget-input');
const themeBtn = $('theme-toggle');

// ---------- Init ----------
budgetInput.value = store.budget > 0 ? store.budget : '';
$('date').valueAsDate = new Date();
initTheme();
populateAccounts();
populateMonths();
renderAll();

// ---------- Persistence ----------
function save() {
    localStorage.setItem('accounts', JSON.stringify(store.accounts));
    localStorage.setItem('transactions', JSON.stringify(store.transactions));
    localStorage.setItem('recurring', JSON.stringify(store.recurring));
    localStorage.setItem('monthlyBudget', store.budget);
}

// ---------- Theme ----------
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    setTheme(theme);
}
function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
}
themeBtn.addEventListener('click', () =>
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
);

// ---------- Accounts ----------
function populateAccounts() {
    accountFilter.innerHTML = '<option value="all">All Accounts</option>';
    store.accounts.forEach(a => {
        const o = document.createElement('option');
        o.value = a.id;
        o.textContent = a.name;
        accountFilter.appendChild(o);
    });
    accountFilter.value = selectedAccount;
}
$('add-account').addEventListener('click', () => {
    const name = prompt('Account name:');
    if (!name) return;
    const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    store.accounts.push({
        id: Date.now(),
        name,
        color: colors[store.accounts.length % colors.length]
    });
    save();
    populateAccounts();
});
accountFilter.addEventListener('change', () => {
    selectedAccount = accountFilter.value;
    renderAll();
});

// ---------- Months ----------
function monthKey(d) { return d.slice(0, 7); }
function monthLabel(ym) {
    const [y, m] = ym.split('-');
    return new Date(y, parseInt(m) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function populateMonths() {
    const set = new Set();
    getAllTransactions().forEach(t => set.add(monthKey(t.date)));
    set.add(monthKey(new Date().toISOString().slice(0, 10)));
    const sorted = [...set].sort().reverse();
    monthFilter.innerHTML = '<option value="all">All Time</option>';
    sorted.forEach(m => {
        const o = document.createElement('option');
        o.value = m;
        o.textContent = monthLabel(m);
        monthFilter.appendChild(o);
    });
    monthFilter.value = selectedMonth;
}
monthFilter.addEventListener('change', () => {
    selectedMonth = monthFilter.value;
    renderAll();
});

// ---------- Recurring engine ----------
function generateOccurrences(rule) {
    const out = [];
    const start = new Date(rule.startDate + 'T00:00:00');
    const today = new Date();
    const end = rule.endDate ? new Date(rule.endDate + 'T00:00:00') : today;
    const limit = end > today ? today : end;
    let d = new Date(start);
    let guard = 0;
    while (d <= limit && guard < 5000) {
        guard++;
        out.push({
            id: rule.id + '_' + d.toISOString().slice(0, 10),
            accountId: rule.accountId,
            description: rule.description,
            amount: rule.amount,
            type: rule.type,
            category: rule.category,
            date: d.toISOString().slice(0, 10),
            recurring: true
        });
        if (rule.frequency === 'daily') d.setDate(d.getDate() + 1);
        else if (rule.frequency === 'weekly') d.setDate(d.getDate() + 7);
        else if (rule.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    }
    return out;
}

function getAllTransactions() {
    let list = [...store.transactions];
    store.recurring.forEach(r => list.push(...generateOccurrences(r)));
    return list;
}
function getFiltered() {
    let list = getAllTransactions();
    if (selectedAccount !== 'all') list = list.filter(t => t.accountId == selectedAccount);
    if (selectedMonth !== 'all') list = list.filter(t => monthKey(t.date) === selectedMonth);
    return list;
}

// ---------- Add transaction ----------
$('recurring-toggle').addEventListener('change', e => {
    $('recurring-fields').classList.toggle('hidden', !e.target.checked);
});
$('transaction-form').addEventListener('submit', e => {
    e.preventDefault();
    const accId = selectedAccount === 'all' ? store.accounts[0].id : parseInt(selectedAccount);
    const base = {
        description: $('description').value.trim(),
        amount: parseFloat($('amount').value),
        type: $('type').value,
        category: $('category').value,
        date: $('date').value,
        accountId: accId
    };
    if ($('recurring-toggle').checked) {
        store.recurring.push({
            id: 'r' + Date.now(),
            ...base,
            frequency: $('frequency').value,
            startDate: base.date,
            endDate: $('recurring-end').value || null
        });
    } else {
        store.transactions.push({ id: Date.now(), ...base });
    }
    save();
    populateMonths();
    renderAll();
    e.target.reset();
    $('date').valueAsDate = new Date();
    $('recurring-fields').classList.add('hidden');
});

function deleteTransaction(id) {
    store.transactions = store.transactions.filter(t => t.id !== id);
    save();
    populateMonths();
    renderAll();
}
function deleteRecurring(id) {
    store.recurring = store.recurring.filter(r => r.id !== id);
    save();
    populateMonths();
    renderAll();
}
$('clear-all').addEventListener('click', () => {
    if (confirm('Erase all data? This cannot be undone.')) {
        store.transactions = [];
        store.recurring = [];
        save();
        populateMonths();
        renderAll();
    }
});

// ---------- Budget ----------
budgetInput.addEventListener('input', () => {
    store.budget = parseFloat(budgetInput.value) || 0;
    save();
    renderBudget(getFiltered());
});
function renderBudget(filtered) {
    const spent = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    $('budget-status').textContent = `$${spent.toFixed(2)} / $${store.budget.toFixed(2)}`;
    let pct = store.budget > 0 ? (spent / store.budget) * 100 : 0;
    const fill = $('budget-fill');
    fill.style.width = Math.min(pct, 100) + '%';
    if (store.budget <= 0) {
        fill.style.background = 'var(--muted)';
        $('budget-msg').textContent = 'Set a budget to track spending';
    } else if (pct > 100) {
        fill.style.background = 'var(--danger)';
        $('budget-msg').textContent = `Over by $${(spent - store.budget).toFixed(2)}`;
    } else if (pct >= 80) {
        fill.style.background = '#f59e0b';
        $('budget-msg').textContent = `${pct.toFixed(0)}% used`;
    } else {
        fill.style.background = 'var(--success)';
        $('budget-msg').textContent = `${(100 - pct).toFixed(0)}% left`;
    }
}

// ---------- Render ----------
function renderAll() {
    const filtered = getFiltered();
    renderTable(filtered);
    renderSummary(filtered);
    renderBudget(filtered);
    renderChart(filtered);
    renderRecurring();
}

function renderSummary(filtered) {
    let inc = 0, out = 0;
    filtered.forEach(t => t.type === 'income' ? inc += t.amount : out += t.amount);
    const net = inc - out;
    $('balance').textContent = `${net < 0 ? '-' : ''}$${Math.abs(net).toFixed(2)}`;
    $('total-income').textContent = `$${inc.toFixed(2)}`;
    $('total-expense').textContent = `$${out.toFixed(2)}`;
}

function renderTable(filtered) {
    const tb = $('transaction-list');
    tb.innerHTML = '';
    [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(t => {
        const acc = store.accounts.find(a => a.id == t.accountId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td>${escapeHtml(t.description)}</td>
            <td>${t.category}</td>
            <td><span class="tag ${t.type}">${t.type}</span></td>
            <td style="color:${t.type === 'income' ? 'var(--success)' : 'var(--danger)'};font-weight:600">
                ${t.type === 'income' ? '+' : '-'}$${t.amount.toFixed(2)}
            </td>
            <td><button class="del-row" onclick="deleteTransaction(${t.id})">✕</button></td>`;
        tb.appendChild(tr);
    });
}

function renderRecurring() {
    const wrap = $('recurring-list');
    wrap.innerHTML = '';
    if (store.recurring.length === 0) {
        wrap.innerHTML = '<small style="color:var(--muted)">No recurring rules yet.</small>';
        return;
    }
    store.recurring.forEach(r => {
        const acc = store.accounts.find(a => a.id == r.accountId);
        const div = document.createElement('div');
        div.className = 'rec-item';
        div.innerHTML = `
            <div>
                <strong>${escapeHtml(r.description)}</strong>
                <span class="meta"> · ${r.frequency} · ${r.type} · $${r.amount.toFixed(2)}</span>
            </div>
            <button class="rec-del" onclick="deleteRecurring('${r.id}')">Remove</button>`;
        wrap.appendChild(div);
    });
}

function renderChart(filtered) {
    const canvas = $('expense-chart');
    const ctx = canvas.getContext('2d');
    if (typeof Chart === 'undefined') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999'; ctx.textAlign = 'center';
        ctx.fillText('Chart needs internet', canvas.width / 2, canvas.height / 2);
        return;
    }
    const cats = {};
    filtered.forEach(t => {
        if (t.type === 'expense') cats[t.category] = (cats[t.category] || 0) + t.amount;
    });
    const labels = Object.keys(cats), data = Object.values(cats);
    if (expenseChart) expenseChart.destroy();
    if (!labels.length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#999'; ctx.textAlign = 'center';
        ctx.fillText('No spending yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
}

// ---------- CSV ----------
$('export-csv').addEventListener('click', () => {
    if (!store.transactions.length) return alert('Nothing to export.');
    const head = 'id,date,description,category,type,amount,accountId';
    const rows = store.transactions.map(t =>
        [t.id, t.date, `"${t.description.replace(/"/g, '""')}"`, t.category, t.type, t.amount, t.accountId].join(','));
    const blob = new Blob([head + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ledger.csv';
    a.click();
    URL.revokeObjectURL(a.href);
});
$('import-csv-btn').addEventListener('click', () => $('import-csv').click());
$('import-csv').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        let n = 0;
        for (let i = 1; i < lines.length; i++) {
            const c = parseLine(lines[i]);
            if (c.length < 6) continue;
            store.transactions.push({
                id: parseInt(c[0]) || Date.now() + n,
                date: c[1], description: c[2].replace(/""/g, '"'),
                category: c[3], type: c[4], amount: parseFloat(c[5]),
                accountId: parseInt(c[6]) || store.accounts[0].id
            });
            n++;
        }
        save(); populateMonths(); renderAll();
        alert(`Imported ${n} rows.`);
    };
    reader.readAsText(f);
    e.target.value = '';
});
function parseLine(line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else {
            if (ch === '"') q = true;
            else if (ch === ',') { out.push(cur); cur = ''; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
}

// ---------- Utils ----------
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
