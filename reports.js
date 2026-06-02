/**
 * reports.js - TKG Barcode Ops Reports & Statistics
 * Handles dynamic inventory counting and burn rate charts.
 */

document.addEventListener('DOMContentLoaded', () => {
    const reportsApp = {
        orders: [],
        ledger: [],
        inventory: {},
        defects: [],
        productStats: {},
        chartInstance: null,

        async init() {
            const tbody = document.getElementById('report-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Fetching Live Analytical Data from Supabase...</td></tr>';

            await this.loadData();
            this.processData();
            this.bindEvents();
            this.extractProducts();
            this.renderStats();
            this.initChart();
            this.updateChart();
        },

        bindEvents() {
            const prodFilt = document.getElementById('chart-product-filter');
            if (prodFilt) prodFilt.addEventListener('change', () => this.updateChart());
            const timeFilt = document.getElementById('chart-timeframe-filter');
            if (timeFilt) timeFilt.addEventListener('change', () => this.updateChart());
        },

        selectChartProduct(productName) {
            const productSelect = document.getElementById('chart-product-filter');
            if (productSelect) productSelect.value = productName;
            this.updateChart();
            const cs = document.querySelector('.chart-container');
            if (cs) cs.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },

        extractProducts() {
            const productSelect = document.getElementById('chart-product-filter');
            if (!productSelect) return;

            // Clear any existing options beyond the default placeholder
            while (productSelect.options.length > 1) productSelect.remove(1);

            const productNames = Object.keys(this.productStats).sort();
            productNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                productSelect.appendChild(opt);
            });
        },

        async loadData() {
            try {
                this.ledger = await window.AppDB.getRawLedger();
                this.orders = await window.AppDB.getOrders();
            } catch (e) {
                console.error("Reports Failed to fetch Supabase data:", e);
                this.ledger = [];
                this.orders = [];
            }
        },

        // ─── canonical name helper (shared) ──────────────────────────────────
        canonName(n) {
            if (!n) return 'unknown';
            return window.formatProductName
                ? window.formatProductName(n).toLowerCase()
                : String(n).toLowerCase().trim();
        },

        // ─── safe order-date parser ───────────────────────────────────────────
        getOrderDate(order) {
            if (order.date) {
                const d = new Date(order.date);
                if (!isNaN(d.getTime())) return d;
            }
            if (order.created_at) {
                const d = new Date(order.created_at);
                if (!isNaN(d.getTime())) return d;
            }
            if (order.id) {
                const parts = String(order.id).split('-');
                if (parts.length > 1) {
                    const ts = parseInt(parts[1]);
                    if (!isNaN(ts) && ts > 1000000000000) return new Date(ts); // ms epoch guard
                }
            }
            return null; // explicitly unknown — do NOT fall back to now()
        },

        processData() {
            this.productStats = {};

            const initProduct = (rawName) => {
                const name = this.canonName(rawName);
                if (!this.productStats[name]) {
                    this.productStats[name] = {
                        inbound: 0,
                        outbound: 0,
                        defects: 0,
                        // monthlyOutbound keyed as "Mon YYYY" for display
                        monthlyOutbound: {}
                    };
                }
                return name;
            };

            // Build cancelled order ID set
            const cancelledOrderIds = new Set();
            if (Array.isArray(this.orders)) {
                this.orders.forEach(o => {
                    if (o && o.status && String(o.status).toLowerCase() === 'cancelled') {
                        if (o.id) cancelledOrderIds.add(String(o.id));
                    }
                });
            }

            // 1. Tabulate totals from ledger
            if (Array.isArray(this.ledger)) {
                this.ledger.forEach(row => {
                    if (!row) return;
                    if (
                        row.transaction_type === 'OUTBOUND' &&
                        row.reference_id &&
                        cancelledOrderIds.has(String(row.reference_id))
                    ) return;

                    const name = initProduct(row.product_name);
                    const qty = Number(row.qty) || 0;

                    if (row.transaction_type === 'INBOUND') this.productStats[name].inbound += qty;
                    if (row.transaction_type === 'OUTBOUND') this.productStats[name].outbound += qty;
                    if (row.transaction_type === 'DEFECT') this.productStats[name].defects += qty;
                    // RETURN = restocked item coming back into stock — counts as inbound
                    if (row.transaction_type === 'RETURN') this.productStats[name].inbound += qty;
                    if (row.transaction_type === 'ADJUSTMENT') {
                        if (qty > 0) this.productStats[name].inbound += qty;
                        else this.productStats[name].outbound += Math.abs(qty);
                    }
                });
            }

            // 2. Build monthlyOutbound from ledger OUTBOUND rows (most reliable source)
            //    This powers the chart and avoids all order-date / bundle-qty ambiguity.
            if (Array.isArray(this.ledger)) {
                this.ledger.forEach(row => {
                    if (!row || row.transaction_type !== 'OUTBOUND') return;
                    if (row.reference_id && cancelledOrderIds.has(String(row.reference_id))) return;

                    const name = initProduct(row.product_name);
                    const qty = Number(row.qty) || 0;

                    // Parse the ledger row date
                    let d = null;
                    if (row.created_at) d = new Date(row.created_at);
                    else if (row.date) d = new Date(row.date);

                    if (!d || isNaN(d.getTime())) return;

                    const monthKey = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                    const weekKey = (() => {
                        const wd = new Date(d);
                        const day = wd.getDay() || 7;
                        wd.setDate(wd.getDate() - (day - 1));
                        return `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, '0')}-${String(wd.getDate()).padStart(2, '0')}`;
                    })();
                    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const yearKey = `${d.getFullYear()}`;

                    const mo = this.productStats[name].monthlyOutbound;
                    mo[`daily::${dayKey}`] = (mo[`daily::${dayKey}`] || 0) + qty;
                    mo[`weekly::${weekKey}`] = (mo[`weekly::${weekKey}`] || 0) + qty;
                    mo[`monthly::${monthKey}`] = (mo[`monthly::${monthKey}`] || 0) + qty;
                    mo[`yearly::${yearKey}`] = (mo[`yearly::${yearKey}`] || 0) + qty;
                });
            }

            // 3. Also sweep completed orders for any products NOT in ledger (edge case)
            //    Only adds to monthlyOutbound — does NOT touch inbound/outbound totals
            //    to avoid double-counting with ledger rows.
            if (Array.isArray(this.orders)) {
                this.orders.forEach(order => {
                    if (!order) return;
                    const isComplete = order.status === 'Complete' || order.status === 'Exported';
                    if (!isComplete) return;

                    const d = this.getOrderDate(order);
                    if (!d) return; // skip orders with no parseable date

                    const monthKey = d.toLocaleString('default', { month: 'short', year: 'numeric' });
                    const weekKey = (() => {
                        const wd = new Date(d);
                        const day = wd.getDay() || 7;
                        wd.setDate(wd.getDate() - (day - 1));
                        return `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, '0')}-${String(wd.getDate()).padStart(2, '0')}`;
                    })();
                    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const yearKey = `${d.getFullYear()}`;

                    if (!Array.isArray(order.lineItems)) return;

                    order.lineItems.forEach(line => {
                        if (!line) return;
                        const isBundle = line.subItems && Array.isArray(line.subItems) && line.subItems.length > 0;

                        if (isBundle) {
                            line.subItems.forEach(sub => {
                                if (!sub) return;
                                const name = initProduct(sub.name);
                                // Only fill in if ledger hasn't already populated this product's chart data
                                const mo = this.productStats[name].monthlyOutbound;
                                const qty = (Number(sub.requiredQty) || 0) * (Number(line.orderedQty) || 1);
                                if (qty <= 0) return;

                                // Use scannedBreakdown if available (most accurate)
                                if (sub.scannedBreakdown && Object.keys(sub.scannedBreakdown).length > 0) {
                                    for (const [sNameRaw, sCount] of Object.entries(sub.scannedBreakdown)) {
                                        const sName = initProduct(sNameRaw);
                                        const smo = this.productStats[sName].monthlyOutbound;
                                        const addIfMissing = (key, val) => { if (!smo[key]) smo[key] = val; else smo[key] += val; };
                                        addIfMissing(`daily::${dayKey}`, Number(sCount) || 0);
                                        addIfMissing(`weekly::${weekKey}`, Number(sCount) || 0);
                                        addIfMissing(`monthly::${monthKey}`, Number(sCount) || 0);
                                        addIfMissing(`yearly::${yearKey}`, Number(sCount) || 0);
                                    }
                                } else {
                                    const addIfMissing = (key, val) => { if (!mo[key]) mo[key] = val; else mo[key] += val; };
                                    addIfMissing(`daily::${dayKey}`, qty);
                                    addIfMissing(`weekly::${weekKey}`, qty);
                                    addIfMissing(`monthly::${monthKey}`, qty);
                                    addIfMissing(`yearly::${yearKey}`, qty);
                                }
                            });
                        } else {
                            const name = initProduct(line.name);
                            const mo = this.productStats[name].monthlyOutbound;
                            const qty = Number(line.orderedQty) || 0;
                            if (qty <= 0) return;
                            const addIfMissing = (key, val) => { if (!mo[key]) mo[key] = val; else mo[key] += val; };
                            addIfMissing(`daily::${dayKey}`, qty);
                            addIfMissing(`weekly::${weekKey}`, qty);
                            addIfMissing(`monthly::${monthKey}`, qty);
                            addIfMissing(`yearly::${yearKey}`, qty);
                        }
                    });
                });
            }
        },

        renderStats() {
            const tbody = document.getElementById('report-tbody');
            if (!tbody) return;
            tbody.innerHTML = '';

            let totalOutboundAll = 0;
            let totalDefectsAll = 0;

            const productRows = Object.keys(this.productStats).map(name => {
                const stat = this.productStats[name];
                const dynStock = stat.inbound - stat.outbound - stat.defects;
                totalOutboundAll += stat.outbound;
                totalDefectsAll += stat.defects;
                return { name, ...stat, dynStock };
            });

            productRows.sort((a, b) => b.outbound - a.outbound);

            productRows.forEach(row => {
                const tr = document.createElement('tr');
                const lowStockClass = row.dynStock < window.InventoryMath.LOW_STOCK_THRESHOLD && row.inbound > 0
                    ? 'color: var(--danger); font-weight: bold;'
                    : '';
                const safeName = row.name.replace(/'/g, "\\'");
                const linkedName = `<a onclick="window.reportsApp.selectChartProduct('${safeName}')" style="cursor:pointer;color:var(--accent);text-decoration:underline;font-weight:500;">${row.name}</a>`;

                tr.innerHTML = `
                    <td style="font-weight:600;">${linkedName}</td>
                    <td style="text-align:center;color:var(--success);">${row.inbound}</td>
                    <td style="text-align:center;color:#a855f7;">${row.outbound}</td>
                    <td style="text-align:center;color:var(--danger);">${row.defects}</td>
                    <td style="text-align:center;font-size:1.1rem;${lowStockClass}">${row.dynStock}</td>
                `;
                tbody.appendChild(tr);
            });

            const outboundEl = document.getElementById('total-outbound-stat');
            const defectsEl = document.getElementById('total-defects-stat');
            const bestEl = document.getElementById('best-seller-stat');

            if (outboundEl) outboundEl.textContent = totalOutboundAll;
            if (defectsEl) defectsEl.textContent = totalDefectsAll;
            if (bestEl && productRows.length > 0) bestEl.textContent = productRows[0].name;
        },

        initChart() {
            const canvasEl = document.getElementById('salesChart');
            if (!canvasEl) return;
            const ctx = canvasEl.getContext('2d');

            Chart.defaults.color = 'rgba(255,255,255,0.7)';
            Chart.defaults.font.family = "'Inter', sans-serif";

            if (this.chartInstance) this.chartInstance.destroy();

            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Sales Vol (Qty)',
                        data: [],
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251,191,36,0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#fbbf24',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fbbf24',
                            padding: 10,
                            displayColors: false
                        }
                    },
                    scales: {
                        x: { grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } },
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 },
                            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }
                        }
                    }
                }
            });
        },

        updateChart() {
            if (!this.chartInstance) return;

            const productFilter = document.getElementById('chart-product-filter').value;
            const timeframe = document.getElementById('chart-timeframe-filter').value;

            const overlay = document.getElementById('chart-placeholder-overlay');
            const canvasEl = document.getElementById('salesChart');

            if (!productFilter || productFilter === '') {
                if (overlay) overlay.style.display = 'flex';
                if (canvasEl) canvasEl.style.opacity = '0';
                return;
            }
            if (overlay) overlay.style.display = 'none';
            if (canvasEl) canvasEl.style.opacity = '1';

            // ── Pull data directly from pre-built monthlyOutbound (ledger-sourced) ──
            const prefix = `${timeframe}::`;
            const salesData = {};

            const collectFor = (stats) => {
                Object.entries(stats.monthlyOutbound).forEach(([key, qty]) => {
                    if (!key.startsWith(prefix)) return;
                    const dateKey = key.slice(prefix.length);
                    salesData[dateKey] = (salesData[dateKey] || 0) + qty;
                });
            };

            if (productFilter === 'all') {
                Object.values(this.productStats).forEach(stats => collectFor(stats));
            } else {
                const stats = this.productStats[productFilter];
                if (stats) collectFor(stats);
            }

            // Sort keys chronologically
            const sortedDates = Object.keys(salesData).sort((a, b) => {
                // "Apr 2025" style (monthly) needs special parse
                const da = new Date(a), db = new Date(b);
                if (!isNaN(da) && !isNaN(db)) return da - db;
                return a.localeCompare(b);
            });

            const dataPoints = sortedDates.map(d => salesData[d]);
            const labels = timeframe === 'weekly'
                ? sortedDates.map(d => 'Week of ' + d)
                : sortedDates;

            const pName = productFilter === 'all' ? 'All Products' : productFilter;
            this.chartInstance.data.datasets[0].label = `${pName} — Sales Vol`;
            this.chartInstance.data.labels = labels;
            this.chartInstance.data.datasets[0].data = dataPoints;
            this.chartInstance.update();
        }
    };

    reportsApp.init();
    window.reportsApp = reportsApp;
});