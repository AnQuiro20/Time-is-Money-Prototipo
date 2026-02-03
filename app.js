// ======= Estado y utilidades =======
        const state = {
            prefs: { rate: 0, currency: 'CRC', hoursPerWeek: 40, taxAdj: 13 },
            goal: { name: '', timeBudgetH: 0 },
            expenses: [], // {id, desc, amount, cat, dateISO}
            wallet: { amount: 0 }
        };

        const $ = (sel) => document.querySelector(sel);
        const $$ = (sel) => document.querySelectorAll(sel);
        const fmtMoney = (n, cur) => `${cur === 'USD' ? '$' : '₡'}${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
        const fmtMin = (m) => {
            if (m < 60) return `${Math.round(m)} min`;
            const h = Math.floor(m / 60); const r = Math.round(m % 60);
            return r ? `${h} h ${r} min` : `${h} h`;
        }
        const monthKey = () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }

        function save() { localStorage.setItem('tim_data_v1', JSON.stringify(state)); }
        function load() {
            try {
                const raw = localStorage.getItem('tim_data_v1');
                if (!raw) return;
                const obj = JSON.parse(raw);
                if (obj.prefs) state.prefs = obj.prefs;
                if (obj.goal) state.goal = obj.goal;
                if (Array.isArray(obj.expenses)) state.expenses = obj.expenses;
                if (obj.wallet) state.wallet = obj.wallet;
            } catch (e) { console.warn('No se pudo cargar', e); }
        }

        // ======= Conversión principal =======
        function amountToMinutes(amount) {
            const rate = Number(state.prefs.rate || 0);
            if (!rate || rate <= 0) return 0;
            const taxFactor = 1 - (Number(state.prefs.taxAdj || 0) / 100);
            const effectiveRate = rate * taxFactor; // si hay impuestos, baja el valor que recibes neto
            return (amount / Math.max(effectiveRate, 0.0001)) * 60;
        }

        function hoursToAmount(hours){
            const rate = Number(state.prefs.rate || 0);
            const taxFactor = 1 - (Number(state.prefs.taxAdj || 0) / 100);
            const effectiveRate = rate * taxFactor;
            return Math.max(0, Number(hours||0) * Math.max(effectiveRate, 0));
        }

        function getCurrentWeekRange(){
            const now = new Date();
            const day = (now.getDay()+6)%7; // Lunes=0
            const start = new Date(now);
            start.setDate(now.getDate()-day);
            start.setHours(0,0,0,0);
            const end = new Date(start);
            end.setDate(start.getDate()+7);
            return {start, end};
        }

        // ======= Render =======
        function renderPrefs() {
            $('#rate').value = state.prefs.rate || '';
            $('#currency').value = state.prefs.currency || 'CRC';
            $('#hoursPerWeek').value = state.prefs.hoursPerWeek || '';
            const taxEl = $('#taxAdj'); if (taxEl) { taxEl.value = 13; taxEl.disabled = true; }
            $('#curLabel').textContent = state.prefs.currency || 'CRC';
        }

        function renderTable() {
            const tbody = $('#tbody'); tbody.innerHTML = '';
            const now = new Date();
            const curMonth = now.getMonth(); const curYear = now.getFullYear();

            const monthExpenses = state.expenses.filter(e => {
                const d = new Date(e.dateISO);
                return d.getMonth() === curMonth && d.getFullYear() === curYear;
            });

            monthExpenses.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));

            let sumMin = 0;

            for (const e of monthExpenses) {
                const mins = amountToMinutes(Number(e.amount));
                sumMin += mins;
                const tr = document.createElement('tr');
                tr.dataset.cat = e.cat;
                tr.innerHTML = `
        <td>${e.desc}</td>
        <td>${fmtMoney(e.amount, state.prefs.currency)}</td>
        <td>${fmtMin(mins)}</td>
        <td>${e.cat}</td>
        <td class="table-tools">
          <button class="btn btn-ghost" data-edit="${e.id}">Editar</button>
          <button class="btn btn-danger" data-del="${e.id}">Borrar</button>
        </td>`;
                tbody.appendChild(tr);
            }

            // Resumen rápido
            $('#sumTime').value = fmtMin(sumMin);
            const avg = monthExpenses.length ? sumMin / monthExpenses.length : 0;
            $('#avgTime').value = fmtMin(avg);

            // Escuchar botones de fila
            tbody.querySelectorAll('[data-del]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-del');
                    state.expenses = state.expenses.filter(x => x.id !== id);
                    save();
                    renderAll();
                });
            });
            tbody.querySelectorAll('[data-edit]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-edit');
                    const item = state.expenses.find(x => x.id === id);
                    if (!item) return;
                    $('#desc').value = item.desc;
                    $('#amount').value = item.amount;
                    $('#category').value = item.cat;
                    $('#date').value = item.dateISO;
                    // Al guardar, lo reemplazamos
                    state.expenses = state.expenses.filter(x => x.id !== id);
                    save();
                    renderAll();
                });
            });
        }

        function renderGoal() {
            const label = state.goal.name ? `${state.goal.name} – ${state.goal.timeBudgetH || 0} h/mes` : 'Sin meta aún';
            $('#goalLabel').textContent = label;

            // Calcular tiempo usado del mes
            const now = new Date();
            const curMonth = now.getMonth(); const curYear = now.getFullYear();
            const minutesUsed = state.expenses
                .filter(e => { const d = new Date(e.dateISO); return d.getMonth() === curMonth && d.getFullYear() === curYear; })
                .reduce((acc, e) => acc + amountToMinutes(Number(e.amount)), 0);

            const budgetMin = (Number(state.goal.timeBudgetH || 0)) * 60;
            const pct = budgetMin ? Math.min(100, (minutesUsed / budgetMin) * 100) : 0;
            $('#progressUsed').style.width = pct + '%';

            $('#usedTime').textContent = `${fmtMin(minutesUsed)} usadas`;
            const remain = Math.max(0, budgetMin - minutesUsed);
            $('#remainTime').textContent = `${fmtMin(remain)} restantes`;

            // Equivalente en dinero de la meta
            const cur = state.prefs.currency || 'CRC';
            const eqAmt = hoursToAmount(Number(state.goal.timeBudgetH||0));
            const eqEl = document.getElementById('goalBudgetMoney');
            const curLbl = document.getElementById('curLabelGoal');
            if (curLbl) curLbl.textContent = cur;
            if (eqEl) eqEl.value = fmtMoney(eqAmt, cur);

            // Exceso mensual respecto a la meta
            const overMonthMin = (budgetMin>0) ? Math.max(0, minutesUsed - budgetMin) : 0;
            const wrapMonth = document.getElementById('goalOverWrap');
            const barMonth = document.getElementById('goalOverBar');
            const labMonth = document.getElementById('goalOverLabel');
            if (overMonthMin > 0 && budgetMin>0){
                if (wrapMonth) wrapMonth.style.display = 'block';
                const pctOver = Math.min(100, (overMonthMin / budgetMin) * 100);
                if (barMonth) barMonth.style.width = pctOver + '%';
                if (labMonth) labMonth.textContent = fmtMin(overMonthMin);
            }else{
                if (wrapMonth) wrapMonth.style.display = 'none';
                if (barMonth) barMonth.style.width = '0%';
            }

            // Exceso semanal (según horas por semana)
            const wr = getCurrentWeekRange();
            const minutesUsedWeek = state.expenses
                .filter(e=>{ const d=new Date(e.dateISO); return d>=wr.start && d<wr.end; })
                .reduce((acc,e)=> acc + amountToMinutes(Number(e.amount)), 0);
            const weeklyBudgetMin = Number(state.prefs.hoursPerWeek||0) * 60;
            const overMin = Math.max(0, minutesUsedWeek - weeklyBudgetMin);
            const wrap = document.getElementById('weeklyOverWrap');
            const bar = document.getElementById('weeklyOverBar');
            const lab = document.getElementById('weeklyOverLabel');
            if (overMin > 0 && weeklyBudgetMin>0){
                if (wrap) wrap.style.display = 'block';
                const pct = Math.min(100, (overMin / weeklyBudgetMin) * 100);
                if (bar) bar.style.width = pct + '%';
                if (lab) lab.textContent = fmtMin(overMin);
            }else{
                if (wrap) wrap.style.display = 'none';
                if (bar) bar.style.width = '0%';
            }
        }

        function renderChart() {
            const ctx = $('#chart').getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

            // Sumar minutos por categoría (mes actual)
            const now = new Date();
            const curMonth = now.getMonth(); const curYear = now.getFullYear();
            const cats = ['Deseos', 'Necesidades', 'Trabajo'];
            const sums = { Deseos: 0, Necesidades: 0, Trabajo: 0 };

            for (const e of state.expenses) {
                const d = new Date(e.dateISO);
                if (d.getMonth() !== curMonth || d.getFullYear() !== curYear) continue;
                const m = amountToMinutes(Number(e.amount));
                sums[e.cat] = (sums[e.cat] || 0) + m;
            }
            const data = cats.map(c => sums[c]);

            // Dibujar barras simples
            const W = ctx.canvas.clientWidth * devicePixelRatio;
            const H = ctx.canvas.clientHeight * devicePixelRatio;
            if (ctx.canvas.width !== W || ctx.canvas.height !== H) { ctx.canvas.width = W; ctx.canvas.height = H; }

            const padding = 40 * devicePixelRatio;
            const barW = (W - padding * 2) / (data.length * 1.5);
            const maxV = Math.max(60, ...data); // al menos 60 min

            ctx.font = `${12 * devicePixelRatio}px system-ui`;
            ctx.fillStyle = '#b9c0ff';

            data.forEach((v, i) => {
                const x = padding + i * (barW * 1.5);
                const h = (H - padding * 2) * (v / maxV);
                const y = H - padding - h;

                // barra (gradient)
                const g = ctx.createLinearGradient(0, y, 0, y + h);
                g.addColorStop(0, '#6b79ff');
                g.addColorStop(1, '#4dd4b0');
                ctx.fillStyle = g;
                const r = 10 * devicePixelRatio;
                roundRect(ctx, x, y, barW, h, r);
                ctx.fill();

                // etiqueta
                ctx.fillStyle = '#b9c0ff';
                ctx.fillText(cats[i], x, H - padding + 16 * devicePixelRatio);
                ctx.fillText(fmtMin(v), x, y - 6 * devicePixelRatio);
            });

            // eje base
            ctx.strokeStyle = '#27307a';
            ctx.beginPath();
            ctx.moveTo(padding, H - padding);
            ctx.lineTo(W - padding / 2, H - padding);
            ctx.stroke();
        }

        function roundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function renderWallet() {
            const amt = Number((state.wallet && state.wallet.amount) || 0);
            const cur = state.prefs.currency || 'CRC';
            const amtEl = $('#walletAmount');
            const timeEl = $('#walletTime');
            const curLbl = $('#curLabelWallet');
            if (amtEl) amtEl.value = amt || '';
            if (curLbl) curLbl.textContent = cur;
            if (timeEl) timeEl.value = fmtMin(amountToMinutes(amt));
        }

        function renderAll() {
            renderPrefs();
            renderTable();
            renderGoal();
            renderChart();
            renderWallet();
        }

        // ======= Eventos UI =======
        $('#currency').addEventListener('change', () => {
            state.prefs.currency = $('#currency').value; save(); renderAll();
        });

        $('#savePrefs').addEventListener('click', () => {
            state.prefs.rate = Number($('#rate').value || 0);
            state.prefs.currency = $('#currency').value;
            const hpw = Number($('#hoursPerWeek').value || 0);
            if (!hpw || hpw <= 0) { alert('Las horas por semana son obligatorias.'); return; }
            state.prefs.hoursPerWeek = hpw;
            state.prefs.taxAdj = 13;
            save(); renderAll();
        });

        $('#resetPrefs').addEventListener('click', () => {
            if (!confirm('¿Restablecer preferencias?')) return;
            state.prefs = { rate: 0, currency: 'CRC', hoursPerWeek: 40, taxAdj: 13 };
            save(); renderAll();
        });

        $('#addExp').addEventListener('click', () => {
            const desc = $('#desc').value.trim();
            const amount = Number($('#amount').value || 0);
            const cat = $('#category').value;
            const date = $('#date').value || new Date().toISOString().slice(0, 10);
            if (!desc || amount <= 0) { alert('Completa descripción y monto > 0'); return; }
            state.expenses.push({ id: crypto.randomUUID(), desc, amount, cat, dateISO: date });
            $('#desc').value = ''; $('#amount').value = '';
            save(); renderAll();
        });

        if (false) $('#seedData').addEventListener('click', () => {
            const base = [
                { desc: 'Café', amount: 3, cat: 'Deseos' },
                { desc: 'Uber', amount: 6, cat: 'Deseos' },
                { desc: 'Internet', amount: 25, cat: 'Necesidades' },
                { desc: 'Almuerzo', amount: 8.5, cat: 'Necesidades' },
                { desc: 'Software pro', amount: 12, cat: 'Trabajo' },
            ];
            const cur = new Date().toISOString().slice(0, 10);
            base.forEach(x => state.expenses.push({ id: crypto.randomUUID(), desc: x.desc, amount: x.amount, cat: x.cat, dateISO: cur }));
            if (!state.prefs.rate) { state.prefs.rate = 6; state.prefs.currency = 'USD'; }
            save(); renderAll();
        });

        $('#saveGoal').addEventListener('click', () => {
            state.goal.name = $('#goalName').value.trim();
            state.goal.timeBudgetH = Number($('#timeBudget').value || 0);
            save(); renderAll();
        });

        // Actualizar dinero equivalente al escribir horas meta
        const tb = document.getElementById('timeBudget');
        if (tb){
            tb.addEventListener('input', ()=>{
                const h = Number(tb.value||0);
                const cur = state.prefs.currency || 'CRC';
                const out = document.getElementById('goalBudgetMoney');
                const curLbl = document.getElementById('curLabelGoal');
                if (curLbl) curLbl.textContent = cur;
                if (out) out.value = fmtMoney(hoursToAmount(h), cur);
            });
        }

        // Cartera
        $('#saveWallet').addEventListener('click', () => {
            const amt = Number($('#walletAmount').value || 0);
            state.wallet = { amount: Math.max(0, amt) };
            save(); renderWallet();
        });
        const walletAmtEl = document.getElementById('walletAmount');
        if (walletAmtEl){
            walletAmtEl.addEventListener('input', ()=>{
                const v = Number(walletAmtEl.value||0);
                const out = document.getElementById('walletTime');
                if (out) out.value = fmtMin(amountToMinutes(Math.max(0,v)));
            });
        }

        $('#exportJson').addEventListener('click', (e) => {
            e.preventDefault();
            const data = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url; a.download = `time-is-money-${monthKey()}.json`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        $('#importJson').addEventListener('click', (e) => {
            e.preventDefault();
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,application/json';
            inp.onchange = () => {
                const f = inp.files[0]; if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                    try {
                        const obj = JSON.parse(r.result);
                        if (obj.prefs) state.prefs = obj.prefs;
                        if (obj.goal) state.goal = obj.goal;
                        if (Array.isArray(obj.expenses)) state.expenses = obj.expenses;
                        if (obj.wallet) state.wallet = obj.wallet;
                        save(); renderAll();
                    } catch (err) { alert('Archivo inválido'); }
                };
                r.readAsText(f);
            };
            inp.click();
        });

        // ======= Init =======
        (function init() {
            load();
            // Defaults
            if (!state.prefs.currency) state.prefs.currency = 'CRC';
            if (!state.prefs.hoursPerWeek) state.prefs.hoursPerWeek = 40;
            state.prefs.taxAdj = 13;
            renderAll();
        })();
