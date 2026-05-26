/**
 * order-records.js - TKG Barcode Ops Analytics
 */

document.addEventListener('DOMContentLoaded', () => {
    const analyticsApp = {
        orders: [],
        ledger: [],
        productStats: {},
        chartInstance: null,
        dataLoaded: false,
        liveInventory: {},
        computedStock: {},
        reportResetAt: 0,
        refreshTimer: null,
        refreshInFlight: false,
        refreshQueued: false,
        stockChannel: null,
        pollTimer: null,

        async init() {
            this.cacheDom();
            this.bindEvents();
            await this.loadData();
            this.refreshAnalytics();
            this.startRealtimeSync();
        },

        cacheDom() {
            this.dom = {
                reportTbody: document.getElementById('report-tbody'),
                chartProductFilter: document.getElementById('chart-product-filter'),
                chartTimeframeFilter: document.getElementById('chart-timeframe-filter'),
                chartPlaceholder: document.getElementById('chart-placeholder-overlay'),
                chartCanvas: document.getElementById('salesChart'),
                statOutbound: document.getElementById('total-outbound-stat'),
                statDefects: document.getElementById('total-defects-stat'),
                statBestSeller: document.getElementById('best-seller-stat'),
                resetReportsBtn: document.getElementById('reset-reports-btn')
            };
        },

        bindEvents() {
            if (this.dom.chartProductFilter) {
                this.dom.chartProductFilter.addEventListener('change', () => this.updateChart());
            }
            if (this.dom.chartTimeframeFilter) {
                this.dom.chartTimeframeFilter.addEventListener('change', () => this.updateChart());
            }
            if (this.dom.resetReportsBtn) {
                this.dom.resetReportsBtn.addEventListener('click', () => this.resetReports());
            }
        },

        startRealtimeSync() {
            if (this.stockChannel || this.pollTimer) return;
            if (window.AppDB && typeof window.AppDB.subscribeStockLedger === 'function') {
                this.stockChannel = window.AppDB.subscribeStockLedger(() => this.scheduleRefresh());
            }
            if (!this.stockChannel) {
                this.startPolling();
            }
        },

        startPolling() {
            if (this.pollTimer) return;
            this.pollTimer = setInterval(() => this.scheduleRefresh(), 30000);
        },

        scheduleRefresh() {
            if (this.refreshTimer) return;
            this.refreshTimer = setTimeout(() => {
                this.refreshTimer = null;
                this.reloadAndRefresh();
            }, 200);
        },

        async reloadAndRefresh() {
            if (this.refreshInFlight) {
                this.refreshQueued = true;
                return;
            }
            this.refreshInFlight = true;
            try {
                await this.loadData(true);
                this.refreshAnalytics();
            } finally {
                this.refreshInFlight = false;
                if (this.refreshQueued) {
                    this.refreshQueued = false;
                    this.scheduleRefresh();
                }
            }
        },

        async loadData(force = false) {
            if (this.dataLoaded && !force) return;

            this.reportResetAt = Number(localStorage.getItem('tkg_reports_reset_at') || 0);

            const ordersPromise = window.AppDB && window.AppDB.getOrders
                ? window.AppDB.getOrders()
                : Promise.resolve([]);
            const ledgerPromise = window.AppDB && window.AppDB.getRawLedger
                ? window.AppDB.getRawLedger()
                : Promise.resolve([]);
            const inventoryPromise = window.AppDB && window.AppDB.getLiveInventory
                ? window.AppDB.getLiveInventory()
                : Promise.resolve({});

            const [ordersRes, ledgerRes, inventoryRes] = await Promise.allSettled([
                ordersPromise,
                ledgerPromise,
                inventoryPromise
            ]);

            if (ordersRes.status === 'fulfilled') {
                this.orders = Array.isArray(ordersRes.value) ? ordersRes.value : [];
            } else {
                console.error('Failed to load orders', ordersRes.reason);
                this.orders = [];
            }

            if (ledgerRes.status === 'fulfilled') {
                this.ledger = Array.isArray(ledgerRes.value) ? ledgerRes.value : [];
            } else {
                console.error('Failed to load ledger', ledgerRes.reason);
                this.ledger = [];
            }

            if (inventoryRes.status === 'fulfilled') {
                this.liveInventory = inventoryRes.value || {};
            } else {
                console.error('Failed to load live inventory', inventoryRes.reason);
                this.liveInventory = {};
            }

            this.dataLoaded = true;
        },

        refreshAnalytics() {
            this.processData();
            this.renderStats();
            this.extractProducts();
            this.initChart();
            this.updateChart();
            this.loadStockReports();
            this.renderSkuRankings();

            const skuFilter = document.getElementById('sku-timeframe-filter');
            if (skuFilter) {
                skuFilter.onchange = () => this.renderSkuRankings();
            }
        },

        canonName(n) {
            if (!n) return 'unknown';
            return window.formatProductName
                ? window.formatProductName(n).toLowerCase()
                : String(n).toLowerCase().trim();
        },

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
                    const ts = parseInt(parts[1], 10);
                    if (!isNaN(ts) && ts > 1000000000000) return new Date(ts);
                }
            }
            return null;
        },

        getLedgerDate(row) {
            if (row?.created_at) {
                const d = new Date(row.created_at);
                if (!isNaN(d.getTime())) return d;
            }
            if (row?.date) {
                const d = new Date(row.date);
                if (!isNaN(d.getTime())) return d;
            }
            return null;
        },

        passesResetGate(date) {
            if (!this.reportResetAt) return true;
            if (!date || isNaN(date.getTime())) return true;
            return date.getTime() >= this.reportResetAt;
        },

        shouldCountLedgerRow(row) {
            if (!row) return false;
            if (!this.passesResetGate(this.getLedgerDate(row))) return false;

            if (row.reference_id === 'MANUAL_ADJUST') {
                if (row.transaction_type === 'ADJUSTMENT') {
                    return row.notes === 'Manual New Batch';
                }
                if (row.transaction_type === 'OUTBOUND') {
                    return false;
                }
            }

            return true;
        },

        computeDynamicStockMap() {
            const stockMap = {};
            const inv = this.liveInventory || {};

            Object.entries(inv).forEach(([productName, rawBatches]) => {
                const batches = this.getComputedBatches(rawBatches);
                const total = batches.reduce((sum, b) => sum + b.qty, 0);
                stockMap[this.canonName(productName)] = total;
            });

            this.computedStock = stockMap;
        },

        processData() {
            this.productStats = {};
            this.computeDynamicStockMap();

            // Pre-seed ALL known single products from catalog
            // so products with zero activity still appear in the table
            if (typeof PRODUCT_CATALOG !== 'undefined') {
                for (const category in PRODUCT_CATALOG) {
                    if (category === 'Aliases' || category === 'Merchandise' || category === 'Gift Box Barcodes') continue;
                    for (const productName in PRODUCT_CATALOG[category]) {
                        const product = PRODUCT_CATALOG[category][productName];
                        if (product.type !== 'single') continue;
                        const name = this.canonName(productName);
                        if (!this.productStats[name]) {
                            this.productStats[name] = {
                                inbound: 0,
                                outbound: 0,
                                defects: 0,
                                monthlyOutbound: {}
                            };
                        }
                    }
                }
            }

            Object.keys(this.computedStock).forEach((name) => {
                if (!this.productStats[name]) {
                    this.productStats[name] = {
                        inbound: 0,
                        outbound: 0,
                        defects: 0,
                        monthlyOutbound: {}
                    };
                }
            });

            const initProduct = (rawName) => {
                const name = this.canonName(rawName);
                if (!this.productStats[name]) {
                    this.productStats[name] = {
                        inbound: 0,
                        outbound: 0,
                        defects: 0,
                        monthlyOutbound: {}
                    };
                }
                return name;
            };

            const cancelledOrderIds = new Set();
            if (Array.isArray(this.orders)) {
                this.orders.forEach((o) => {
                    if (o && o.status && String(o.status).toLowerCase() === 'cancelled') {
                        if (o.id) cancelledOrderIds.add(String(o.id));
                    }
                });
            }

            if (Array.isArray(this.ledger)) {
                this.ledger.forEach((row) => {
                    if (!row) return;
                    if (!this.shouldCountLedgerRow(row)) return;
                    if (
                        row.transaction_type === 'OUTBOUND' &&
                        row.reference_id &&
                        cancelledOrderIds.has(String(row.reference_id))
                    ) return;

                    const name = initProduct(row.product_name);
                    const qty = Number(row.qty) || 0;

                    if (row.transaction_type === 'OUTBOUND') this.productStats[name].outbound += qty;
                    if (row.transaction_type === 'DEFECT') this.productStats[name].defects += qty;
                    if (row.transaction_type === 'ADJUSTMENT' && qty < 0) {
                        this.productStats[name].outbound += Math.abs(qty);
                    }
                });
            }

            if (Array.isArray(this.ledger)) {
                this.ledger.forEach((row) => {
                    if (!row || row.transaction_type !== 'OUTBOUND') return;
                    if (!this.shouldCountLedgerRow(row)) return;
                    if (row.reference_id && cancelledOrderIds.has(String(row.reference_id))) return;

                    const name = initProduct(row.product_name);
                    const qty = Number(row.qty) || 0;

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

            if (Array.isArray(this.orders)) {
                this.orders.forEach((order) => {
                    if (!order) return;
                    const isComplete = order.status === 'Complete' || order.status === 'Exported';
                    if (!isComplete) return;

                    const d = this.getOrderDate(order);
                    if (!this.passesResetGate(d)) return;
                    if (!d) return;

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

                    order.lineItems.forEach((line) => {
                        if (!line) return;
                        const isBundle = line.subItems && Array.isArray(line.subItems) && line.subItems.length > 0;

                        if (isBundle) {
                            line.subItems.forEach((sub) => {
                                if (!sub) return;
                                const name = initProduct(sub.name);
                                const mo = this.productStats[name].monthlyOutbound;
                                const qty = (Number(sub.requiredQty) || 0) * (Number(line.orderedQty) || 1);
                                if (qty <= 0) return;

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

            Object.keys(this.productStats).forEach((name) => {
                const computed = Object.prototype.hasOwnProperty.call(this.computedStock, name)
                    ? this.computedStock[name]
                    : 0;
                this.productStats[name].inbound = computed;
            });
        },

        renderStats() {
            if (!this.dom.reportTbody) return;
            this.dom.reportTbody.innerHTML = '';

            let totalOutboundAll = 0;
            let totalDefectsAll = 0;

            const productRows = Object.keys(this.productStats).map((name) => {
                const stat = this.productStats[name];
                const dynStock = stat.inbound;
                totalOutboundAll += stat.outbound;
                totalDefectsAll += stat.defects;
                return { name, ...stat, dynStock };
            });

            productRows.sort((a, b) => b.outbound - a.outbound);

            productRows.forEach((row) => {
                const tr = document.createElement('tr');
                const lowStockClass = row.dynStock < 10
                    ? 'color: var(--danger); font-weight: bold;'
                    : '';
                const safeName = row.name.replace(/'/g, "\\'");
                const displayName = window.formatProductName ? window.formatProductName(row.name) : row.name;
                const linkedName = `<a onclick="window.analyticsApp.selectChartProduct('${safeName}')" style="cursor:pointer;color:var(--accent);text-decoration:underline;font-weight:500;">${this.escapeHtml(displayName)}</a>`;

                tr.innerHTML = `
                    <td style="font-weight:600;">${linkedName}</td>
                    <td style="text-align:center;color:var(--success);">${row.inbound}</td>
                    <td style="text-align:center;color:#a855f7;">${row.outbound}</td>
                    <td style="text-align:center;color:var(--danger);">${row.defects}</td>
                    <td style="text-align:center;font-size:1.1rem;${lowStockClass}">${row.dynStock}</td>
                `;
                this.dom.reportTbody.appendChild(tr);
            });

            if (this.dom.statOutbound) this.dom.statOutbound.textContent = totalOutboundAll;
            if (this.dom.statDefects) this.dom.statDefects.textContent = totalDefectsAll;
            if (this.dom.statBestSeller && productRows.length > 0) {
                const bestName = window.formatProductName ? window.formatProductName(productRows[0].name) : productRows[0].name;
                this.dom.statBestSeller.textContent = bestName;
            }
        },

        extractProducts() {
            if (!this.dom.chartProductFilter) return;
            const productSelect = this.dom.chartProductFilter;
            const currentValue = productSelect.value;

            while (productSelect.options.length > 2) productSelect.remove(2);

            const productNames = Object.keys(this.productStats).sort();
            productNames.forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = window.formatProductName ? window.formatProductName(name) : name;
                productSelect.appendChild(opt);
            });

            if (currentValue) {
                productSelect.value = currentValue;
            }
        },

        selectChartProduct(productName) {
            if (this.dom.chartProductFilter) {
                this.dom.chartProductFilter.value = productName;
                this.updateChart();
            }
            const cs = document.querySelector('.chart-container');
            if (cs) cs.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },

        initChart() {
            if (!this.dom.chartCanvas) return;
            if (this.chartInstance) return;

            const ctx = this.dom.chartCanvas.getContext('2d');
            Chart.defaults.color = 'rgba(255,255,255,0.7)';
            Chart.defaults.font.family = "'Inter', sans-serif";

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
            if (!this.chartInstance || !this.dom.chartProductFilter || !this.dom.chartTimeframeFilter) return;

            const productFilter = this.dom.chartProductFilter.value;
            const timeframe = this.dom.chartTimeframeFilter.value;

            if (!productFilter || productFilter === '') {
                if (this.dom.chartPlaceholder) this.dom.chartPlaceholder.style.display = 'flex';
                if (this.dom.chartCanvas) this.dom.chartCanvas.style.opacity = '0';
                return;
            }
            if (this.dom.chartPlaceholder) this.dom.chartPlaceholder.style.display = 'none';
            if (this.dom.chartCanvas) this.dom.chartCanvas.style.opacity = '1';

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
                Object.values(this.productStats).forEach((stats) => collectFor(stats));
            } else {
                const stats = this.productStats[productFilter];
                if (stats) collectFor(stats);
            }

            const sortedDates = Object.keys(salesData).sort((a, b) => {
                const da = new Date(a), db = new Date(b);
                if (!isNaN(da) && !isNaN(db)) return da - db;
                return a.localeCompare(b);
            });

            const dataPoints = sortedDates.map((d) => salesData[d]);
            const labels = timeframe === 'weekly'
                ? sortedDates.map((d) => 'Week of ' + d)
                : sortedDates;

            const pName = productFilter === 'all'
                ? 'All Products'
                : (window.formatProductName ? window.formatProductName(productFilter) : productFilter);

            this.chartInstance.data.datasets[0].label = `${pName} - Sales Vol`;
            this.chartInstance.data.labels = labels;
            this.chartInstance.data.datasets[0].data = dataPoints;
            this.chartInstance.update();
        },

        escapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));
        },

        async loadStockReports() {
            try {
                let liveInventory = this.liveInventory;
                if (!liveInventory || Object.keys(liveInventory).length === 0) {
                    liveInventory = await window.AppDB.getLiveInventory();
                    this.liveInventory = liveInventory || {};
                }
                this.renderLowStockReport(liveInventory);
                this.renderExpiringReport(liveInventory);

                const expiryFilter = document.getElementById('expiry-filter');
                if (expiryFilter) {
                    expiryFilter.onchange = () => this.renderExpiringReport(liveInventory);
                }
            } catch (e) {
                console.error('Failed to load stock reports', e);
            }
        },

        getComputedBatches(rawBatches) {
            let positiveBatches = [];
            let negativeOffset = 0;

            (rawBatches || []).forEach(b => {
                if (b.qty > 0) positiveBatches.push({ expiry: b.expiry, qty: b.qty });
                else if (b.qty < 0) negativeOffset += Math.abs(b.qty);
            });

            positiveBatches.sort((a, b) => {
                if (!a.expiry && !b.expiry) return 0;
                if (!a.expiry) return 1;
                if (!b.expiry) return -1;
                return new Date(a.expiry) - new Date(b.expiry);
            });

            for (let i = 0; i < positiveBatches.length; i++) {
                if (negativeOffset <= 0) break;
                const b = positiveBatches[i];
                if (b.qty >= negativeOffset) { b.qty -= negativeOffset; negativeOffset = 0; }
                else { negativeOffset -= b.qty; b.qty = 0; }
            }

            return positiveBatches.filter(b => b.qty > 0);
        },

        renderLowStockReport(liveInventory) {
            const tbody = document.getElementById('low-stock-tbody');
            if (!tbody) return;

            const lowItems = [];
            const seen = new Set();

            if (typeof PRODUCT_CATALOG !== 'undefined') {
                for (const category in PRODUCT_CATALOG) {
                    if (category === 'Aliases' || category === 'Merchandise' || category === 'Gift Box Barcodes') continue;
                    for (const productName in PRODUCT_CATALOG[category]) {
                        if (seen.has(productName)) continue;
                        seen.add(productName);

                        const product = PRODUCT_CATALOG[category][productName];
                        if (product.type !== 'single') continue;

                        const rawBatches = liveInventory[productName] || [];
                        const batches = this.getComputedBatches(rawBatches);
                        const total = batches.reduce((sum, b) => sum + b.qty, 0);

                        if (total < 10) {
                            lowItems.push({ name: productName, stock: total });
                        }
                    }
                }
            } else {
                for (const [productName, rawBatches] of Object.entries(liveInventory)) {
                    const batches = this.getComputedBatches(rawBatches);
                    const total = batches.reduce((sum, b) => sum + b.qty, 0);
                    if (total < 10) lowItems.push({ name: productName, stock: total });
                }
            }

            lowItems.sort((a, b) => a.stock - b.stock);

            const lowCountStat = document.getElementById('low-stock-count-stat');
            if (lowCountStat) lowCountStat.textContent = lowItems.length;

            // --- CHART ---
            const canvas = document.getElementById('lowStockChart');
            if (canvas) {
                if (this.lowStockChartInstance) this.lowStockChartInstance.destroy();

                const labels = lowItems.map(i => window.formatProductName ? window.formatProductName(i.name) : i.name);
                const data = lowItems.map(i => i.stock);
                const colors = lowItems.map(i => i.stock === 0 ? 'rgba(239,68,68,0.8)' : 'rgba(245,158,11,0.8)');
                const borderColors = lowItems.map(i => i.stock === 0 ? '#ef4444' : '#f59e0b');

                this.lowStockChartInstance = new Chart(canvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Current Stock',
                                data,
                                backgroundColor: colors,
                                borderColor: borderColors,
                                borderWidth: 1,
                                borderRadius: 6
                            },
                            {
                                label: 'Low Stock Threshold (10)',
                                data: new Array(lowItems.length).fill(10),
                                type: 'line',
                                borderColor: 'rgba(255,255,255,0.3)',
                                borderDash: [6, 4],
                                borderWidth: 2,
                                pointRadius: 0,
                                fill: false
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: { color: 'rgba(255,255,255,0.7)', font: { family: "'Inter', sans-serif" } }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                titleColor: '#fff',
                                bodyColor: '#fbbf24',
                                padding: 10
                            }
                        },
                        scales: {
                            x: {
                                ticks: { color: 'rgba(255,255,255,0.7)', maxRotation: 45, font: { size: 11 } },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: { precision: 0, color: 'rgba(255,255,255,0.7)' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            }

            // --- TABLE ---
            if (lowItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--success); padding:2rem;">✅ All products are sufficiently stocked!</td></tr>`;
                return;
            }

            tbody.innerHTML = lowItems.map(item => {
                const displayName = window.formatProductName ? window.formatProductName(item.name) : item.name;
                const statusColor = item.stock === 0 ? 'var(--danger)' : '#f59e0b';
                const statusText = item.stock === 0 ? '🔴 Out of Stock' : '🟡 Low Stock';
                return `
            <tr>
                <td style="font-weight:600;">${this.escapeHtml(displayName)}</td>
                <td style="text-align:center; font-size:1.2rem; font-weight:800; color:${statusColor};">${item.stock}</td>
                <td style="text-align:center;">
                    <span style="padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; background:${item.stock === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}; color:${statusColor};">
                        ${statusText}
                    </span>
                </td>
            </tr>
        `;
            }).join('');
        },

        renderExpiringReport(liveInventory) {
            const tbody = document.getElementById('expiring-tbody');
            if (!tbody) return;

            const filterVal = document.getElementById('expiry-filter')?.value;
            const now = new Date();
            const expiringItems = [];

            for (const [productName, rawBatches] of Object.entries(liveInventory)) {
                const batches = this.getComputedBatches(rawBatches);
                batches.forEach(batch => {
                    if (!batch.expiry) return;
                    const expDate = new Date(batch.expiry);
                    if (isNaN(expDate)) return;

                    const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
                    if (filterVal !== 'all' && daysLeft > parseInt(filterVal)) return;

                    expiringItems.push({ name: productName, expiry: batch.expiry, qty: batch.qty, daysLeft });
                });
            }

            expiringItems.sort((a, b) => a.daysLeft - b.daysLeft);

            const expCountStat = document.getElementById('expiring-count-stat');
            if (expCountStat) {
                expCountStat.textContent = expiringItems.filter(i => i.daysLeft <= 30).length;
            }

            // --- CHART ---
            const canvas = document.getElementById('expiringChart');
            if (canvas) {
                if (this.expiringChartInstance) this.expiringChartInstance.destroy();

                // Group by urgency buckets
                const buckets = { 'Expired': 0, 'Critical (≤7d)': 0, 'Expiring Soon (≤30d)': 0, 'OK (>30d)': 0 };
                expiringItems.forEach(item => {
                    if (item.daysLeft <= 0) buckets['Expired'] += item.qty;
                    else if (item.daysLeft <= 7) buckets['Critical (≤7d)'] += item.qty;
                    else if (item.daysLeft <= 30) buckets['Expiring Soon (≤30d)'] += item.qty;
                    else buckets['OK (>30d)'] += item.qty;
                });

                const bucketColors = {
                    'Expired': 'rgba(239,68,68,0.8)',
                    'Critical (≤7d)': 'rgba(239,68,68,0.5)',
                    'Expiring Soon (≤30d)': 'rgba(245,158,11,0.8)',
                    'OK (>30d)': 'rgba(16,185,129,0.8)'
                };

                const bucketBorders = {
                    'Expired': '#ef4444',
                    'Critical (≤7d)': '#ef4444',
                    'Expiring Soon (≤30d)': '#f59e0b',
                    'OK (>30d)': '#10b981'
                };

                this.expiringChartInstance = new Chart(canvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: Object.keys(buckets),
                        datasets: [{
                            label: 'Total Qty',
                            data: Object.values(buckets),
                            backgroundColor: Object.keys(buckets).map(k => bucketColors[k]),
                            borderColor: Object.keys(buckets).map(k => bucketBorders[k]),
                            borderWidth: 1,
                            borderRadius: 6
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
                                callbacks: {
                                    label: ctx => `${ctx.parsed.y} units`
                                }
                            }
                        },
                        scales: {
                            x: {
                                ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 12 } },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            y: {
                                beginAtZero: true,
                                ticks: { precision: 0, color: 'rgba(255,255,255,0.7)' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            }

            // --- TABLE ---
            if (expiringItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--success); padding:2rem;">✅ No products expiring in this timeframe!</td></tr>`;
                return;
            }

            tbody.innerHTML = expiringItems.map(item => {
                const displayName = window.formatProductName ? window.formatProductName(item.name) : item.name;
                const expDateStr = new Date(item.expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

                let statusColor, statusText;
                if (item.daysLeft <= 0) { statusColor = 'var(--danger)'; statusText = '🔴 Expired'; }
                else if (item.daysLeft <= 7) { statusColor = 'var(--danger)'; statusText = '🔴 Critical'; }
                else if (item.daysLeft <= 30) { statusColor = '#f59e0b'; statusText = '🟡 Expiring Soon'; }
                else { statusColor = '#10b981'; statusText = '🟢 OK'; }

                return `
            <tr>
                <td style="font-weight:600;">${this.escapeHtml(displayName)}</td>
                <td style="text-align:center; color:${statusColor}; font-weight:600;">${expDateStr}</td>
                <td style="text-align:center; font-weight:700;">${item.qty}</td>
                <td style="text-align:center; color:${statusColor}; font-weight:700;">${item.daysLeft <= 0 ? 'Expired' : item.daysLeft + ' days'}</td>
                <td style="text-align:center;">
                    <span style="padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; background:${item.daysLeft <= 7 ? 'rgba(239,68,68,0.15)' : item.daysLeft <= 30 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'}; color:${statusColor};">
                        ${statusText}
                    </span>
                </td>
            </tr>
        `;
            }).join('');
        },

        getSkuOutbound(productName, timeframe) {
            const stats = this.productStats[this.canonName(productName)];
            if (!stats) return 0;

            if (timeframe === 'all') {
                return stats.outbound || 0;
            }

            const now = new Date();
            const prefix = timeframe === 'daily' ? 'daily'
                : timeframe === 'weekly' ? 'weekly'
                    : timeframe === 'monthly' ? 'monthly'
                        : 'yearly';

            let currentKey = '';
            if (timeframe === 'daily') {
                currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            } else if (timeframe === 'weekly') {
                const wd = new Date(now);
                const day = wd.getDay() || 7;
                wd.setDate(wd.getDate() - (day - 1));
                currentKey = `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, '0')}-${String(wd.getDate()).padStart(2, '0')}`;
            } else if (timeframe === 'monthly') {
                currentKey = now.toLocaleString('default', { month: 'short', year: 'numeric' });
            } else if (timeframe === 'yearly') {
                currentKey = `${now.getFullYear()}`;
            }

            const mo = stats.monthlyOutbound || {};
            return mo[`${prefix}::${currentKey}`] || 0;
        },

        renderSkuRankings() {
            const timeframe = document.getElementById('sku-timeframe-filter')?.value || 'all';

            // Gather all products with their outbound for the selected timeframe
            const allSkus = [];

            if (typeof PRODUCT_CATALOG !== 'undefined') {
                const seen = new Set();
                for (const category in PRODUCT_CATALOG) {
                    if (category === 'Aliases' || category === 'Merchandise' || category === 'Gift Box Barcodes') continue;
                    for (const productName in PRODUCT_CATALOG[category]) {
                        if (seen.has(productName)) continue;
                        seen.add(productName);
                        const product = PRODUCT_CATALOG[category][productName];
                        if (product.type !== 'single') continue;
                        if (this.excludedProducts && this.excludedProducts.includes(productName.toLowerCase())) continue;

                        const outbound = this.getSkuOutbound(productName, timeframe);
                        allSkus.push({ name: productName, outbound });
                    }
                }
            } else {
                for (const [name, stats] of Object.entries(this.productStats)) {
                    allSkus.push({ name, outbound: this.getSkuOutbound(name, timeframe) });
                }
            }

            allSkus.sort((a, b) => b.outbound - a.outbound);

            const top10 = allSkus.slice(0, 10);
            const least10 = [...allSkus].sort((a, b) => a.outbound - b.outbound).slice(0, 10);

            // --- TOP 10 CHART ---
            const topCanvas = document.getElementById('topSkuChart');
            if (topCanvas) {
                if (this.topSkuChartInstance) this.topSkuChartInstance.destroy();
                this.topSkuChartInstance = new Chart(topCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: top10.map(i => window.formatProductName ? window.formatProductName(i.name) : i.name),
                        datasets: [{
                            label: 'Units Sold',
                            data: top10.map(i => i.outbound),
                            backgroundColor: top10.map((_, idx) => `rgba(16, 185, 129, ${1 - idx * 0.07})`),
                            borderColor: '#10b981',
                            borderWidth: 1,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                titleColor: '#fff',
                                bodyColor: '#10b981',
                                padding: 10,
                                callbacks: { label: ctx => `${ctx.parsed.x} units` }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                ticks: { precision: 0, color: 'rgba(255,255,255,0.7)' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            y: {
                                ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            }

            // --- LEAST 10 CHART ---
            const leastCanvas = document.getElementById('leastSkuChart');
            if (leastCanvas) {
                if (this.leastSkuChartInstance) this.leastSkuChartInstance.destroy();
                this.leastSkuChartInstance = new Chart(leastCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: least10.map(i => window.formatProductName ? window.formatProductName(i.name) : i.name),
                        datasets: [{
                            label: 'Units Sold',
                            data: least10.map(i => i.outbound),
                            backgroundColor: least10.map((_, idx) => `rgba(239, 68, 68, ${0.4 + idx * 0.06})`),
                            borderColor: '#ef4444',
                            borderWidth: 1,
                            borderRadius: 6
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                titleColor: '#fff',
                                bodyColor: '#ef4444',
                                padding: 10,
                                callbacks: { label: ctx => `${ctx.parsed.x} units` }
                            }
                        },
                        scales: {
                            x: {
                                beginAtZero: true,
                                ticks: { precision: 0, color: 'rgba(255,255,255,0.7)' },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            },
                            y: {
                                ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11 } },
                                grid: { color: 'rgba(255,255,255,0.05)' }
                            }
                        }
                    }
                });
            }

            // --- TOP 10 TABLE ---
            const topTbody = document.getElementById('top-sku-tbody');
            if (topTbody) {
                if (top10.length === 0) {
                    topTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding:2rem;">No data for this timeframe</td></tr>`;
                } else {
                    topTbody.innerHTML = top10.map((item, idx) => {
                        const displayName = window.formatProductName ? window.formatProductName(item.name) : item.name;
                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
                        return `
                    <tr>
                        <td style="font-weight:700; color:#10b981;">${medal}</td>
                        <td style="font-weight:600;">${this.escapeHtml(displayName)}</td>
                        <td style="text-align:center; font-weight:700; color:#10b981;">${item.outbound}</td>
                    </tr>
                `;
                    }).join('');
                }
            }

            // --- LEAST 10 TABLE ---
            const leastTbody = document.getElementById('least-sku-tbody');
            if (leastTbody) {
                if (least10.length === 0) {
                    leastTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary); padding:2rem;">No data for this timeframe</td></tr>`;
                } else {
                    leastTbody.innerHTML = least10.map((item, idx) => {
                        const displayName = window.formatProductName ? window.formatProductName(item.name) : item.name;
                        return `
                    <tr>
                        <td style="font-weight:700; color:#ef4444;">${idx + 1}</td>
                        <td style="font-weight:600;">${this.escapeHtml(displayName)}</td>
                        <td style="text-align:center; font-weight:700; color:#ef4444;">${item.outbound}</td>
                    </tr>
                `;
                    }).join('');
                }
            }
        },

        resetReports() {
            if (!confirm('Reset reports data? This clears inbound/outbound totals and charts. Stock levels are not affected.')) return;
            if (!confirm('This will only affect report numbers shown on this page. Continue?')) return;

            const now = Date.now();
            localStorage.setItem('tkg_reports_reset_at', String(now));
            this.reportResetAt = now;
            this.refreshAnalytics();
        },
    };

    analyticsApp.init();
    window.analyticsApp = analyticsApp;
});