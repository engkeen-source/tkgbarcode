/**
 * refunds.js - TKG Barcode Ops Issue Management (Refunds + Defects)
 */

document.addEventListener('DOMContentLoaded', () => {
    const toastContainer = document.getElementById('toast-container');

    const toast = {
        show(message, type = 'success') {
            if (!toastContainer) return;
            const el = document.createElement('div');
            el.className = `toast ${type}`;
            el.textContent = message;
            toastContainer.appendChild(el);
            setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 2800);
            setTimeout(() => el.remove(), 3200);
        }
    };

    const utils = {
        escapeHtml(value) {
            return String(value || '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[char]));
        },

        escapeAttr(value) {
            return utils.escapeHtml(value).replace(/\s+/g, ' ');
        },

        formatDate(value) {
            if (!value) return '-';
            const date = String(value).length === 10
                ? new Date(`${value}T00:00:00`)
                : new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        },

        formatDateTime(value) {
            if (!value) return '-';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '-';
            return date.toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        normalizeBarcode(value) {
            return String(value || '').replace(/\s+/g, '').trim();
        },

        formatProductName(name) {
            if (!name) return '-';
            return window.formatProductName ? window.formatProductName(name) : name;
        },

        safeNumber(value, fallback = 0) {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
        },

        toCsv(rows, columns) {
            const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
            const header = columns.map(col => escape(col.label)).join(',');
            const body = rows.map(row => columns.map(col => escape(row[col.key])).join(',')).join('\n');
            return [header, body].filter(Boolean).join('\n');
        },

        downloadCsv(csv, filename) {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    };

    const issueApp = {
        currentTab: 'refunds',
        init() {
            this.cacheDom();
            this.bindEvents();
            this.refunds.init();
            this.defects.init();
        },

        cacheDom() {
            this.dom = {
                tabButtons: document.querySelectorAll('[data-issue-tab]'),
                refundsSection: document.getElementById('refunds-section'),
                returnsSection: document.getElementById('returns-section'),
                defectsSection: document.getElementById('defects-section')
            };
        },

        bindEvents() {
            this.dom.tabButtons.forEach((btn) => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.issueTab));
            });
        },

        switchTab(tab) {
            if (!tab || tab === this.currentTab) return;
            this.currentTab = tab;

            this.dom.tabButtons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.issueTab === tab);
            });

            if (this.dom.refundsSection) {
                this.dom.refundsSection.classList.toggle('active', tab === 'refunds');
            }
            if (this.dom.returnsSection) {
                this.dom.returnsSection.classList.toggle('active', tab === 'returns');
            }
            if (this.dom.defectsSection) {
                this.dom.defectsSection.classList.toggle('active', tab === 'defects');
            }

            if (tab === 'returns' && this.returns && !this.returns.initialized) {
                this.returns.init();
            }
        }
    };

    const refundStore = {
        lsKey: 'tkg_refunds',

        getLocal() {
            try { return JSON.parse(localStorage.getItem(this.lsKey) || '[]'); }
            catch { return []; }
        },

        saveLocal(records) {
            localStorage.setItem(this.lsKey, JSON.stringify(records));
        },

        async getAll() {
            if (window.AppDB && typeof window.AppDB.getRefunds === 'function') {
                return await window.AppDB.getRefunds();
            }
            return this.getLocal();
        },

        async save(record) {
            if (window.AppDB && typeof window.AppDB.saveRefund === 'function') {
                return await window.AppDB.saveRefund(record);
            }
            const all = this.getLocal();
            all.unshift(record);
            this.saveLocal(all);
            return record;
        },

        async update(id, changes) {
            if (window.AppDB && typeof window.AppDB.updateRefund === 'function') {
                return await window.AppDB.updateRefund(id, changes);
            }
            const all = this.getLocal();
            const idx = all.findIndex(r => r.id === id);
            if (idx !== -1) {
                Object.assign(all[idx], changes);
                this.saveLocal(all);
            }
        },

        async remove(id) {
            if (window.AppDB && typeof window.AppDB.deleteRefund === 'function') {
                return await window.AppDB.deleteRefund(id);
            }
            const all = this.getLocal().filter(r => r.id !== id);
            this.saveLocal(all);
        }
    };

    const returnStore = {
        lsKey: 'tkg_returns',
        movementKey: 'tkg_returns_movements',

        getLocal() {
            try { return JSON.parse(localStorage.getItem(this.lsKey) || '[]'); }
            catch { return []; }
        },

        saveLocal(records) {
            localStorage.setItem(this.lsKey, JSON.stringify(records));
        },

        getMovementsLocal() {
            try { return JSON.parse(localStorage.getItem(this.movementKey) || '[]'); }
            catch { return []; }
        },

        saveMovementsLocal(records) {
            localStorage.setItem(this.movementKey, JSON.stringify(records));
        },

        async getAll() {
            if (window.AppDB && typeof window.AppDB.getReturns === 'function') {
                return await window.AppDB.getReturns();
            }
            return this.getLocal();
        },

        async getMovements() {
            if (window.AppDB && typeof window.AppDB.getInventoryMovements === 'function') {
                return await window.AppDB.getInventoryMovements();
            }
            return this.getMovementsLocal();
        },

        async process(payload) {
            if (window.AppDB && typeof window.AppDB.processReturn === 'function') {
                return await window.AppDB.processReturn(payload);
            }

            const record = {
                id: `ret-${Date.now()}`,
                barcode: payload.barcode,
                sku: payload.sku,
                productName: payload.productName,
                quantity: payload.quantity,
                returnReason: payload.returnReason,
                status: payload.status,
                scannedBy: payload.scannedBy,
                createdAt: new Date().toISOString()
            };

            const all = this.getLocal();
            all.unshift(record);
            this.saveLocal(all);

            const movement = {
                id: `mv-${Date.now()}`,
                sku: payload.sku,
                productName: payload.productName,
                movementType: payload.status === 'Restocked' ? 'RETURN_RESTOCK' : 'RETURN_INTAKE',
                quantityChange: payload.status === 'Restocked' ? payload.quantity : 0,
                previousQuantity: null,
                newQuantity: null,
                createdAt: record.createdAt
            };

            const movements = this.getMovementsLocal();
            movements.unshift(movement);
            this.saveMovementsLocal(movements);

            return { record, previousQty: null, newQty: null, movement };
        },

        async undo(record, scannedBy) {
            if (window.AppDB && typeof window.AppDB.undoReturn === 'function') {
                return await window.AppDB.undoReturn(record.id, scannedBy || record.scannedBy);
            }

            const all = this.getLocal();
            const idx = all.findIndex(r => r.id === record.id);
            if (idx !== -1) {
                all[idx].status = 'Reverted';
                all[idx].updatedAt = new Date().toISOString();
                this.saveLocal(all);
            }

            const movement = {
                id: `mv-${Date.now()}`,
                sku: record.sku,
                productName: record.productName,
                movementType: 'RETURN_UNDO',
                quantityChange: record.status === 'Restocked' ? -record.quantity : 0,
                previousQuantity: null,
                newQuantity: null,
                createdAt: new Date().toISOString()
            };

            const movements = this.getMovementsLocal();
            movements.unshift(movement);
            this.saveMovementsLocal(movements);

            return { previousQty: null, newQty: null, movement };
        }
    };

    issueApp.refunds = {
        records: [],
        filtered: [],

        init() {
            this.cacheDom();
            this.bindEvents();
            this.setDefaultDate();
            this.loadRecords().then(() => this.applyFilters());
        },

        cacheDom() {
            this.dom = {
                openModalBtn: document.getElementById('btn-open-log-modal'),
                closeModalBtn: document.getElementById('close-log-modal'),
                modal: document.getElementById('log-refund-modal'),
                submitBtn: document.getElementById('btn-submit-refund'),
                tbody: document.getElementById('refunds-tbody'),
                searchInput: document.getElementById('refund-search-input'),
                statusFilter: document.getElementById('refund-status-filter'),
                platformFilter: document.getElementById('refund-platform-filter'),
                reasonFilter: document.getElementById('refund-reason-filter'),
                statPending: document.getElementById('stat-pending'),
                statApproved: document.getElementById('stat-approved'),
                statRestocked: document.getElementById('stat-restocked'),
                statRejected: document.getElementById('stat-rejected')
            };
        },

        bindEvents() {
            if (this.dom.openModalBtn) {
                this.dom.openModalBtn.addEventListener('click', () => {
                    this.resetForm();
                    this.dom.modal.classList.remove('hidden');
                });
            }

            if (this.dom.closeModalBtn) {
                this.dom.closeModalBtn.addEventListener('click', () => this.dom.modal.classList.add('hidden'));
            }

            if (this.dom.modal) {
                this.dom.modal.addEventListener('click', (e) => {
                    if (e.target === e.currentTarget) this.dom.modal.classList.add('hidden');
                });
            }

            if (this.dom.submitBtn) {
                this.dom.submitBtn.addEventListener('click', () => this.submitRefund());
            }

            if (this.dom.searchInput) this.dom.searchInput.addEventListener('input', () => this.applyFilters());
            if (this.dom.statusFilter) this.dom.statusFilter.addEventListener('change', () => this.applyFilters());
            if (this.dom.platformFilter) this.dom.platformFilter.addEventListener('change', () => this.applyFilters());
            if (this.dom.reasonFilter) this.dom.reasonFilter.addEventListener('change', () => this.applyFilters());

            if (this.dom.tbody) {
                this.dom.tbody.addEventListener('click', (event) => {
                    const btn = event.target.closest('button[data-action]');
                    if (!btn) return;
                    const action = btn.dataset.action;
                    const id = btn.dataset.id;
                    if (action === 'approve') this.changeStatus(id, 'Approved');
                    if (action === 'restock') this.changeStatus(id, 'Restocked');
                    if (action === 'reject') this.changeStatus(id, 'Rejected');
                    if (action === 'delete') this.deleteRecord(id);
                });
            }
        },

        setDefaultDate() {
            const today = new Date().toISOString().split('T')[0];
            const dateInput = document.getElementById('refund-date');
            if (dateInput) dateInput.value = today;
        },

        resetForm() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('refund-date').value = today;
            document.getElementById('refund-platform').value = '';
            document.getElementById('refund-awb').value = '';
            document.getElementById('refund-order-id').value = '';
            document.getElementById('refund-customer').value = '';
            document.getElementById('refund-reason').value = '';
            document.getElementById('refund-items').value = '';
            document.getElementById('refund-notes').value = '';
            document.getElementById('refund-restock').checked = false;
        },

        async loadRecords() {
            try {
                this.records = await refundStore.getAll();
            } catch (e) {
                console.error('Failed to load refund records', e);
                this.records = [];
            }
        },

        async submitRefund() {
            const date = document.getElementById('refund-date').value.trim();
            const platform = document.getElementById('refund-platform').value;
            const awb = document.getElementById('refund-awb').value.trim();
            const orderId = document.getElementById('refund-order-id').value.trim();
            const customer = document.getElementById('refund-customer').value.trim();
            const reason = document.getElementById('refund-reason').value;
            const items = document.getElementById('refund-items').value.trim();
            const notes = document.getElementById('refund-notes').value.trim();
            const restock = document.getElementById('refund-restock').checked;

            if (!date || !platform || !reason || !items) {
                toast.show('Please fill in Date, Platform, Reason, and Items.', 'error');
                return;
            }

            const record = {
                id: `rfnd-${Date.now()}`,
                date,
                platform,
                awb: awb || '-',
                orderId: orderId || '-',
                customer: customer || '-',
                reason,
                items,
                notes,
                restock,
                status: restock ? 'Restocked' : 'Pending',
                createdAt: new Date().toISOString()
            };

            try {
                const saved = await refundStore.save(record);
                this.records.unshift(saved || record);
                this.applyFilters();
                this.dom.modal.classList.add('hidden');
                toast.show('Refund logged successfully.', 'success');
            } catch (e) {
                console.error('Failed to save refund', e);
                toast.show('Failed to save. Please try again.', 'error');
            }
        },

        applyFilters() {
            const search = this.dom.searchInput ? this.dom.searchInput.value.toLowerCase().trim() : '';
            const status = this.dom.statusFilter ? this.dom.statusFilter.value : 'all';
            const platform = this.dom.platformFilter ? this.dom.platformFilter.value : 'all';
            const reason = this.dom.reasonFilter ? this.dom.reasonFilter.value : 'all';

            this.filtered = this.records.filter(r => {
                const matchSearch = !search ||
                    r.awb.toLowerCase().includes(search) ||
                    r.orderId.toLowerCase().includes(search) ||
                    (r.customer && r.customer.toLowerCase().includes(search)) ||
                    r.items.toLowerCase().includes(search);

                const matchStatus = status === 'all' || r.status === status;
                const matchPlatform = platform === 'all' || r.platform === platform;
                const matchReason = reason === 'all' || r.reason === reason;

                return matchSearch && matchStatus && matchPlatform && matchReason;
            });

            this.renderTable();
            this.updateStats();
        },

        updateStats() {
            const counts = { Pending: 0, Approved: 0, Restocked: 0, Rejected: 0 };
            this.records.forEach((r) => {
                if (counts[r.status] !== undefined) counts[r.status]++;
            });
            if (this.dom.statPending) this.dom.statPending.textContent = counts.Pending;
            if (this.dom.statApproved) this.dom.statApproved.textContent = counts.Approved;
            if (this.dom.statRestocked) this.dom.statRestocked.textContent = counts.Restocked;
            if (this.dom.statRejected) this.dom.statRejected.textContent = counts.Rejected;
        },

        renderTable() {
            if (!this.dom.tbody) return;
            this.dom.tbody.innerHTML = '';

            if (this.filtered.length === 0) {
                this.dom.tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:3rem; color:var(--text-secondary);">No refund records found.</td></tr>';
                return;
            }

            this.filtered.forEach((r) => {
                const tr = document.createElement('tr');

                const dateStr = utils.formatDate(r.date);

                const platformBadge = this.platformBadge(r.platform);
                const statusBadge = this.statusBadge(r.status);

                const actionButtons = [];
                if (r.status === 'Pending') {
                    actionButtons.push(`<button class="action-btn btn-approve" data-action="approve" data-id="${r.id}">Approve</button>`);
                    actionButtons.push(`<button class="action-btn btn-restock" data-action="restock" data-id="${r.id}">Restock</button>`);
                    actionButtons.push(`<button class="action-btn btn-reject" data-action="reject" data-id="${r.id}">Reject</button>`);
                } else if (r.status === 'Approved') {
                    actionButtons.push(`<button class="action-btn btn-restock" data-action="restock" data-id="${r.id}">Restock</button>`);
                    actionButtons.push(`<button class="action-btn btn-reject" data-action="reject" data-id="${r.id}">Reject</button>`);
                }
                actionButtons.push(`<button class="action-btn btn-delete" data-action="delete" data-id="${r.id}">Delete</button>`);

                tr.innerHTML = `
                    <td style="color:var(--text-secondary); font-size:0.88rem; white-space:nowrap;">${dateStr}</td>
                    <td>
                        <div style="font-weight:600; font-family:monospace; font-size:0.95rem;">${utils.escapeHtml(r.awb)}</div>
                        <div style="color:var(--text-secondary); font-size:0.8rem;">${utils.escapeHtml(r.orderId)}</div>
                    </td>
                    <td>${platformBadge}</td>
                    <td style="font-size:0.88rem; color:var(--text-primary);">${utils.escapeHtml(r.reason)}</td>
                    <td style="font-size:0.88rem; color:var(--text-secondary);">${utils.escapeHtml(r.items)}</td>
                    <td><div class="notes-cell" title="${utils.escapeAttr(r.notes || '')}">${r.notes ? utils.escapeHtml(r.notes) : '<span style="opacity:0.35;">-</span>'}</div></td>
                    <td>${statusBadge}${r.restock ? ' <span style="font-size:0.75rem; color:var(--text-secondary);">Restock</span>' : ''}</td>
                    <td style="text-align:right; white-space:nowrap;">${actionButtons.join(' ')}</td>
                `;
                this.dom.tbody.appendChild(tr);
            });
        },

        platformBadge(platform) {
            const map = {
                Shopee: 'shopee',
                Lazada: 'lazada',
                Shopify: 'shopify',
                TikTok: 'tiktok',
                B2B: 'b2b',
                Other: 'other'
            };
            const cls = map[platform] || 'other';
            return `<span class="badge ${cls}">${utils.escapeHtml(platform || 'Other')}</span>`;
        },

        statusBadge(status) {
            const map = {
                Pending: 'pending',
                Approved: 'approved',
                Restocked: 'restocked',
                Rejected: 'rejected'
            };
            const cls = map[status] || 'pending';
            return `<span class="badge ${cls}">${utils.escapeHtml(status)}</span>`;
        },

        async changeStatus(id, newStatus) {
            try {
                await refundStore.update(id, { status: newStatus });
                const rec = this.records.find(r => r.id === id);
                if (rec) rec.status = newStatus;
                this.applyFilters();
                toast.show(`Status updated to ${newStatus}.`, 'success');
            } catch (e) {
                console.error('Failed to update status', e);
                toast.show('Failed to update status.', 'error');
            }
        },

        async deleteRecord(id) {
            if (!confirm('Delete this refund record? This cannot be undone.')) return;
            try {
                await refundStore.remove(id);
                this.records = this.records.filter(r => r.id !== id);
                this.applyFilters();
                toast.show('Refund record deleted.', 'success');
            } catch (e) {
                console.error('Failed to delete refund', e);
                toast.show('Failed to delete record.', 'error');
            }
        },


    };

    issueApp.returns = {
        initialized: false,
        records: [],
        filtered: [],
        movements: [],
        inventoryTotals: {},
        productIndex: {},
        returnsChannel: null,
        movementsChannel: null,
        scanQueue: Promise.resolve(),
        scanTimer: null,
        lastScan: null,
        lastBarcodeTimes: new Map(),
        isProcessing: false,
        settings: {
            duplicateWindowMs: 3000,
            autoSubmitDelayMs: 140,
            minBarcodeLength: 6,
            bulkMode: false,
            sound: true
        },

        init() {
            this.initialized = true;
            this.cacheDom();
            this.bindEvents();
            this.loadSettings();
            if (this.dom.undoBtn) this.dom.undoBtn.disabled = true;
            this.loadProducts()
                .then(() => this.refreshAll())
                .then(() => this.setupRealtime())
                .then(() => this.focusScanner());
        },

        cacheDom() {
            this.dom = {
                refreshBtn: document.getElementById('returns-refresh-btn'),
                exportBtn: document.getElementById('returns-export-btn'),
                scanInput: document.getElementById('returns-scan-input'),
                manualInput: document.getElementById('returns-manual-input'),
                manualSubmit: document.getElementById('returns-manual-submit'),
                qtyInput: document.getElementById('returns-qty-input'),
                statusSelect: document.getElementById('returns-status-select'),
                reasonSelect: document.getElementById('returns-reason-select'),
                scannedByInput: document.getElementById('returns-scanned-by'),
                bulkToggle: document.getElementById('returns-bulk-toggle'),
                soundToggle: document.getElementById('returns-sound-toggle'),
                undoBtn: document.getElementById('returns-undo-btn'),
                scanStatus: document.getElementById('returns-scan-status'),
                lastScan: document.getElementById('returns-last-scan'),
                searchInput: document.getElementById('returns-search-input'),
                statusFilter: document.getElementById('returns-status-filter'),
                tbody: document.getElementById('returns-tbody'),
                statToday: document.getElementById('returns-stat-today'),
                statTotalItems: document.getElementById('returns-stat-total-items'),
                statTopSku: document.getElementById('returns-stat-top-sku'),
                statRestocked: document.getElementById('returns-stat-restocked'),
                liveProduct: document.getElementById('returns-live-product'),
                liveSku: document.getElementById('returns-live-sku'),
                liveBarcode: document.getElementById('returns-live-barcode'),
                livePrev: document.getElementById('returns-live-prev'),
                liveNew: document.getElementById('returns-live-new'),
                liveTime: document.getElementById('returns-live-time'),
                scanHistory: document.getElementById('returns-scan-history'),
                movementsBody: document.getElementById('returns-movements-tbody'),
                movementsRefresh: document.getElementById('returns-movements-refresh')
            };
        },

        bindEvents() {
            if (this.dom.refreshBtn) {
                this.dom.refreshBtn.addEventListener('click', () => this.refreshAll());
            }

            if (this.dom.exportBtn) {
                this.dom.exportBtn.addEventListener('click', () => this.exportCsv());
            }

            if (this.dom.manualSubmit) {
                this.dom.manualSubmit.addEventListener('click', () => {
                    const raw = this.dom.manualInput ? this.dom.manualInput.value : '';
                    if (!raw) return;
                    this.queueScan(raw, 'manual');
                    if (this.dom.manualInput) this.dom.manualInput.value = '';
                });
            }

            if (this.dom.manualInput) {
                this.dom.manualInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const raw = this.dom.manualInput.value;
                        if (!raw) return;
                        this.queueScan(raw, 'manual');
                        this.dom.manualInput.value = '';
                    }
                });
            }

            if (this.dom.scanInput) {
                this.dom.scanInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const raw = this.dom.scanInput.value;
                        if (raw) this.queueScan(raw, 'scanner');
                        if (this.dom.scanInput) this.dom.scanInput.value = '';
                    }
                });

                this.dom.scanInput.addEventListener('input', () => {
                    if (this.scanTimer) clearTimeout(this.scanTimer);
                    const value = this.dom.scanInput.value;
                    this.scanTimer = setTimeout(() => {
                        const normalized = utils.normalizeBarcode(value);
                        if (normalized.length >= this.settings.minBarcodeLength) {
                            this.queueScan(normalized, 'scanner');
                            if (this.dom.scanInput) this.dom.scanInput.value = '';
                        }
                    }, this.settings.autoSubmitDelayMs);
                });
            }

            if (this.dom.bulkToggle) {
                this.dom.bulkToggle.addEventListener('change', () => {
                    this.settings.bulkMode = this.dom.bulkToggle.checked;
                    localStorage.setItem('tkg_returns_bulk', this.settings.bulkMode ? 'true' : 'false');
                    if (this.settings.bulkMode) this.focusScanner();
                });
            }

            if (this.dom.soundToggle) {
                this.dom.soundToggle.addEventListener('change', () => {
                    this.settings.sound = this.dom.soundToggle.checked;
                    localStorage.setItem('tkg_returns_sound', this.settings.sound ? 'true' : 'false');
                });
            }

            if (this.dom.scannedByInput) {
                this.dom.scannedByInput.addEventListener('input', () => {
                    localStorage.setItem('tkg_returns_scanned_by', this.dom.scannedByInput.value.trim());
                });
            }

            if (this.dom.searchInput) {
                this.dom.searchInput.addEventListener('input', () => this.applyFilters());
            }

            if (this.dom.statusFilter) {
                this.dom.statusFilter.addEventListener('change', () => this.applyFilters());
            }

            if (this.dom.undoBtn) {
                this.dom.undoBtn.addEventListener('click', () => this.undoLastScan());
            }

            if (this.dom.movementsRefresh) {
                this.dom.movementsRefresh.addEventListener('click', () => this.loadMovements());
            }
        },

        loadSettings() {
            const bulkSaved = localStorage.getItem('tkg_returns_bulk');
            const soundSaved = localStorage.getItem('tkg_returns_sound');
            const scannedBy = localStorage.getItem('tkg_returns_scanned_by');

            this.settings.bulkMode = bulkSaved === 'true';
            this.settings.sound = soundSaved !== 'false';

            if (this.dom.bulkToggle) this.dom.bulkToggle.checked = this.settings.bulkMode;
            if (this.dom.soundToggle) this.dom.soundToggle.checked = this.settings.sound;
            if (this.dom.scannedByInput && scannedBy) this.dom.scannedByInput.value = scannedBy;
        },

        async refreshAll() {
            try {
                await Promise.all([
                    this.loadReturns(),
                    this.loadMovements(),
                    this.loadInventoryTotals()
                ]);
                this.applyFilters();
            } catch (e) {
                console.error('Failed to refresh returns data', e);
                toast.show('Failed to refresh returns data.', 'error');
            }
        },

        setupRealtime() {
            if (this.returnsChannel || !window.AppDB) return;

            if (typeof window.AppDB.subscribeReturns === 'function') {
                this.returnsChannel = window.AppDB.subscribeReturns(() => {
                    this.loadReturns().then(() => this.applyFilters());
                });
            }

            if (typeof window.AppDB.subscribeInventoryMovements === 'function') {
                this.movementsChannel = window.AppDB.subscribeInventoryMovements(() => {
                    this.loadMovements();
                });
            }
        },

        async loadProducts() {
            let dbProducts = {};
            if (window.AppDB && typeof window.AppDB.getProducts === 'function') {
                try {
                    dbProducts = await window.AppDB.getProducts();
                } catch (e) {
                    console.error('Failed to load products from DB', e);
                }
            }

            const index = {};
            const addProduct = (name, sku, barcodes) => {
                if (!Array.isArray(barcodes)) return;
                barcodes.forEach((code) => {
                    const key = utils.normalizeBarcode(code);
                    if (!key) return;
                    if (!index[key]) {
                        index[key] = {
                            productName: name,
                            sku: sku || name
                        };
                    }
                });
            };

            Object.values(dbProducts || {}).forEach((product) => {
                if (!product) return;
                addProduct(product.name || product.id || '', product.sku || product.name || product.id, product.barcodes || []);
            });

            if (typeof PRODUCT_DB !== 'undefined') {
                Object.entries(PRODUCT_DB).forEach(([name, codes]) => {
                    addProduct(name, name, codes || []);
                });
            }

            this.productIndex = index;
        },

        async loadInventoryTotals() {
            if (!window.AppDB || typeof window.AppDB.getComputedInventory !== 'function') return;
            try {
                const inventory = await window.AppDB.getComputedInventory();
                const totals = {};
                Object.entries(inventory || {}).forEach(([name, batches]) => {
                    const total = (batches || []).reduce((sum, batch) => {
                        const qty = batch && (batch.qty ?? batch.computedQty);
                        return sum + utils.safeNumber(qty);
                    }, 0);
                    totals[name] = total;
                });
                this.inventoryTotals = totals;
            } catch (e) {
                console.error('Failed to load inventory totals', e);
            }
        },

        async loadReturns() {
            this.records = await returnStore.getAll();
        },

        async loadMovements() {
            this.movements = await returnStore.getMovements();
            this.renderMovements();
        },

        applyFilters() {
            const search = this.dom.searchInput ? this.dom.searchInput.value.toLowerCase().trim() : '';
            const status = this.dom.statusFilter ? this.dom.statusFilter.value : 'all';

            this.filtered = this.records.filter((r) => {
                const matchSearch = !search ||
                    (r.barcode && r.barcode.toLowerCase().includes(search)) ||
                    (r.sku && r.sku.toLowerCase().includes(search)) ||
                    (r.productName && r.productName.toLowerCase().includes(search));

                const matchStatus = status === 'all' || r.status === status;
                return matchSearch && matchStatus;
            });

            this.renderReturnsTable();
            this.renderScanHistory();
            this.updateAnalytics();
        },

        renderReturnsTable() {
            if (!this.dom.tbody) return;
            this.dom.tbody.innerHTML = '';

            if (!this.filtered.length) {
                this.dom.tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2.5rem; color:var(--text-secondary);">No returns found.</td></tr>';
                return;
            }

            this.filtered.slice(0, 50).forEach((r) => {
                const tr = document.createElement('tr');
                const timeStr = utils.formatDateTime(r.createdAt);
                const statusBadge = this.statusBadge(r.status);
                const productName = utils.formatProductName(r.productName);

                tr.innerHTML = `
                    <td style="white-space:nowrap; color:var(--text-secondary); font-size:0.88rem;">${utils.escapeHtml(timeStr)}</td>
                    <td>
                        <div style="font-weight:600; font-family:monospace; font-size:0.95rem;">${utils.escapeHtml(r.sku || '-')}</div>
                        <div style="color:var(--text-secondary); font-size:0.8rem;">${utils.escapeHtml(productName)}</div>
                    </td>
                    <td style="font-family:monospace; color:var(--text-secondary);">${utils.escapeHtml(r.barcode || '-')}</td>
                    <td>${utils.escapeHtml(r.quantity ?? '-')}</td>
                    <td>${statusBadge}</td>
                    <td>${utils.escapeHtml(r.scannedBy || '-')}</td>
                `;

                this.dom.tbody.appendChild(tr);
            });
        },

        renderMovements() {
            if (!this.dom.movementsBody) return;
            this.dom.movementsBody.innerHTML = '';

            if (!this.movements.length) {
                this.dom.movementsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-secondary);">No movements found.</td></tr>';
                return;
            }

            this.movements.slice(0, 20).forEach((m) => {
                const tr = document.createElement('tr');
                const timeStr = utils.formatDateTime(m.createdAt || m.created_at);
                const change = utils.safeNumber(m.quantityChange ?? m.quantity_change, 0);
                const changeLabel = change === 0 ? '-' : `${change > 0 ? '+' : ''}${change}`;
                const newQty = utils.safeNumber(m.newQuantity ?? m.new_quantity, '-');

                tr.innerHTML = `
                    <td style="white-space:nowrap; color:var(--text-secondary); font-size:0.85rem;">${utils.escapeHtml(timeStr)}</td>
                    <td style="font-family:monospace;">${utils.escapeHtml(m.sku || '-')}</td>
                    <td style="color:${change >= 0 ? '#34d399' : '#f87171'}; font-weight:600;">${utils.escapeHtml(changeLabel)}</td>
                    <td>${utils.escapeHtml(newQty)}</td>
                `;

                this.dom.movementsBody.appendChild(tr);
            });
        },

        renderScanHistory() {
            if (!this.dom.scanHistory) return;
            const recent = this.records.slice(0, 5);
            if (!recent.length) {
                this.dom.scanHistory.innerHTML = '<div style="color:var(--text-secondary); font-size:0.85rem;">No recent scans.</div>';
                return;
            }

            this.dom.scanHistory.innerHTML = recent.map((r) => {
                const productName = utils.formatProductName(r.productName);
                return `
                    <div class="scan-history-item">
                        <span>${utils.escapeHtml(productName)} (${utils.escapeHtml(r.sku || '-')})</span>
                        <span>${utils.escapeHtml(r.quantity ?? '-')} | ${utils.escapeHtml(r.status)}</span>
                    </div>
                `;
            }).join('');
        },

        updateAnalytics() {
            const todayKey = new Date().toISOString().split('T')[0];
            let totalToday = 0;
            let totalItems = 0;
            let restockedToday = 0;
            const skuCounts = {};

            this.records.forEach((r) => {
                const dateKey = r.createdAt ? String(r.createdAt).split('T')[0] : '';
                totalItems += utils.safeNumber(r.quantity, 0);
                if (dateKey === todayKey) {
                    totalToday += 1;
                    if (r.status === 'Restocked') restockedToday += utils.safeNumber(r.quantity, 0);
                }

                const sku = r.sku || '-';
                skuCounts[sku] = (skuCounts[sku] || 0) + utils.safeNumber(r.quantity, 0);
            });

            let topSku = '-';
            let topCount = 0;
            Object.entries(skuCounts).forEach(([sku, count]) => {
                if (count > topCount) {
                    topCount = count;
                    topSku = sku;
                }
            });

            if (this.dom.statToday) this.dom.statToday.textContent = totalToday;
            if (this.dom.statTotalItems) this.dom.statTotalItems.textContent = totalItems;
            if (this.dom.statTopSku) this.dom.statTopSku.textContent = topSku;
            if (this.dom.statRestocked) this.dom.statRestocked.textContent = restockedToday;
        },

        statusBadge(status) {
            const map = {
                'Restocked': 'restocked',
                'Pending Inspection': 'inspection',
                'Damaged': 'damaged',
                'Reverted': 'reverted'
            };
            const cls = map[status] || 'pending';
            return `<span class="badge ${cls}">${utils.escapeHtml(status || 'Pending')}</span>`;
        },

        setScanStatus(message, isError = false) {
            if (!this.dom.scanStatus) return;
            this.dom.scanStatus.textContent = message;
            this.dom.scanStatus.style.color = isError ? 'var(--danger)' : 'var(--text-primary)';
        },

        setLoading(isLoading, message = '') {
            this.isProcessing = isLoading;
            if (this.dom.scanInput) this.dom.scanInput.disabled = isLoading;
            if (this.dom.manualSubmit) this.dom.manualSubmit.disabled = isLoading;
            if (this.dom.undoBtn) this.dom.undoBtn.disabled = isLoading;
            if (message) this.setScanStatus(message, false);
        },

        focusScanner() {
            if (this.dom.scanInput && !this.dom.scanInput.disabled) {
                this.dom.scanInput.focus();
            }
        },

        queueScan(rawBarcode, source = 'scanner') {
            const barcode = utils.normalizeBarcode(rawBarcode);
            if (!barcode) {
                this.setScanStatus('Invalid barcode.', true);
                toast.show('Invalid barcode.', 'error');
                this.playSound('error');
                return;
            }

            this.scanQueue = this.scanQueue
                .then(() => this.processScan(barcode, source))
                .catch((e) => {
                    console.error('Scan queue failed', e);
                    toast.show('Failed to process scan.', 'error');
                });
        },

        async processScan(barcode, source) {
            if (this.isDuplicate(barcode)) {
                this.setScanStatus('Duplicate scan ignored.', true);
                toast.show('Duplicate scan ignored.', 'error');
                this.playSound('error');
                return;
            }

            const product = await this.resolveProduct(barcode);
            if (!product) {
                this.setScanStatus('Barcode not found in catalog.', true);
                toast.show('Invalid barcode.', 'error');
                this.playSound('error');
                return;
            }

            const quantity = this.getQuantity();
            const status = this.dom.statusSelect ? this.dom.statusSelect.value : 'Restocked';
            const returnReason = this.dom.reasonSelect ? this.dom.reasonSelect.value : 'Other';
            const scannedBy = this.dom.scannedByInput ? this.dom.scannedByInput.value.trim() : '';

            const payload = {
                barcode,
                sku: product.sku,
                productName: product.productName,
                quantity,
                status,
                returnReason,
                scannedBy: scannedBy || 'Unknown'
            };

            this.setLoading(true, `Processing ${utils.formatProductName(product.productName)}...`);

            try {
                const result = await returnStore.process(payload);
                const record = result.record || {
                    id: `ret-${Date.now()}`,
                    barcode,
                    sku: product.sku,
                    productName: product.productName,
                    quantity,
                    returnReason,
                    status,
                    scannedBy: scannedBy || 'Unknown',
                    createdAt: new Date().toISOString()
                };

                this.records.unshift(record);
                this.lastScan = record;
                this.markBarcode(barcode);

                const prevQty = result.previousQty ?? result.previous_quantity;
                const newQty = result.newQty ?? result.new_quantity;

                this.updateLiveDisplay(record, prevQty, newQty);
                this.appendMovement(result.movement, record, prevQty, newQty);

                if (this.dom.undoBtn) this.dom.undoBtn.disabled = false;
                this.applyFilters();
                const statusMsg = status === 'Restocked'
                    ? `Restocked: ${utils.formatProductName(record.productName)} (x${record.quantity})`
                    : `Logged: ${utils.formatProductName(record.productName)} (${status})`;
                this.setScanStatus(statusMsg, false);
                toast.show(status === 'Restocked' ? 'Restocked successfully.' : 'Return logged.', 'success');
                this.playSound('success');
            } catch (e) {
                console.error('Failed to process return', e);
                toast.show('Database error. Please try again.', 'error');
                this.playSound('error');
            } finally {
                this.setLoading(false, 'Ready to scan');
                if (this.settings.bulkMode) this.focusScanner();
            }
        },

        async resolveProduct(barcode) {
            const cached = this.productIndex[barcode];
            if (cached) return cached;

            if (window.AppDB && typeof window.AppDB.findProductByBarcode === 'function') {
                try {
                    const product = await window.AppDB.findProductByBarcode(barcode);
                    if (product && product.name) {
                        const resolved = {
                            productName: product.name,
                            sku: product.sku || product.name
                        };
                        this.productIndex[barcode] = resolved;
                        return resolved;
                    }
                } catch (e) {
                    console.error('Failed to resolve barcode via AppDB', e);
                }
            }

            return null;
        },

        getQuantity() {
            if (!this.dom.qtyInput) return 1;
            const qty = parseInt(this.dom.qtyInput.value, 10);
            return Number.isFinite(qty) && qty > 0 ? qty : 1;
        },

        isDuplicate(barcode) {
            const last = this.lastBarcodeTimes.get(barcode);
            if (!last) return false;
            return (Date.now() - last) < this.settings.duplicateWindowMs;
        },

        markBarcode(barcode) {
            this.lastBarcodeTimes.set(barcode, Date.now());
        },

        updateLiveDisplay(record, previousQty, newQty) {
            let prev = Number.isFinite(previousQty)
                ? previousQty
                : (Number.isFinite(this.inventoryTotals[record.productName]) ? this.inventoryTotals[record.productName] : null);
            let next = Number.isFinite(newQty) ? newQty : null;

            if (prev !== null && next === null) {
                next = prev + (record.status === 'Restocked' ? record.quantity : 0);
            }

            if (next !== null) {
                this.inventoryTotals[record.productName] = next;
            }

            if (this.dom.liveProduct) this.dom.liveProduct.textContent = utils.formatProductName(record.productName);
            if (this.dom.liveSku) this.dom.liveSku.textContent = record.sku || '-';
            if (this.dom.liveBarcode) this.dom.liveBarcode.textContent = record.barcode || '-';
            if (this.dom.livePrev) this.dom.livePrev.textContent = prev !== null ? prev : '-';
            if (this.dom.liveNew) this.dom.liveNew.textContent = next !== null ? next : '-';
            if (this.dom.liveTime) this.dom.liveTime.textContent = utils.formatDateTime(record.createdAt);
            if (this.dom.lastScan) this.dom.lastScan.textContent = `Last scan: ${utils.formatProductName(record.productName)} (${record.sku || '-'})`;
        },

        appendMovement(movement, record, previousQty, newQty) {
            const change = record.status === 'Restocked' ? record.quantity : 0;
            const movementRow = movement || {
                id: `mv-${Date.now()}`,
                sku: record.sku,
                productName: record.productName,
                movementType: record.status === 'Restocked' ? 'RETURN_RESTOCK' : 'RETURN_INTAKE',
                quantityChange: change,
                previousQuantity: previousQty ?? null,
                newQuantity: newQty ?? null,
                createdAt: record.createdAt
            };

            this.movements.unshift(movementRow);
            this.movements = this.movements.slice(0, 50);
            this.renderMovements();
        },

        playSound(type) {
            if (!this.settings.sound) return;
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.value = type === 'success' ? 880 : 220;
                gain.gain.value = 0.05;

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                setTimeout(() => {
                    osc.stop();
                    ctx.close();
                }, 120);
            } catch (e) {
                console.warn('Sound playback failed', e);
            }
        },

        exportCsv() {
            if (!this.records.length) {
                toast.show('No returns to export.', 'error');
                return;
            }

            const columns = [
                { key: 'createdAt', label: 'timestamp' },
                { key: 'barcode', label: 'barcode' },
                { key: 'sku', label: 'sku' },
                { key: 'productName', label: 'product_name' },
                { key: 'quantity', label: 'quantity' },
                { key: 'status', label: 'status' },
                { key: 'returnReason', label: 'return_reason' },
                { key: 'scannedBy', label: 'scanned_by' }
            ];

            const csv = utils.toCsv(this.records, columns);
            const date = new Date().toISOString().split('T')[0];
            utils.downloadCsv(csv, `returns_${date}.csv`);
        },

        async undoLastScan() {
            if (!this.lastScan) {
                toast.show('No scan to undo.', 'error');
                return;
            }

            if (!confirm('Undo the last scan? This will revert inventory changes.')) return;

            this.setLoading(true, 'Undoing last scan...');
            try {
                const wasRestocked = this.lastScan.status === 'Restocked';
                const scannedBy = this.dom.scannedByInput ? this.dom.scannedByInput.value.trim() : '';
                const result = await returnStore.undo(this.lastScan, scannedBy || this.lastScan.scannedBy);

                const record = this.records.find(r => r.id === this.lastScan.id);
                if (record) record.status = 'Reverted';

                const prevQty = result.previousQty ?? result.previous_quantity;
                const newQty = result.newQty ?? result.new_quantity;

                const movementRow = result.movement || {
                    id: `mv-${Date.now()}`,
                    sku: this.lastScan.sku,
                    productName: this.lastScan.productName,
                    movementType: 'RETURN_UNDO',
                    quantityChange: wasRestocked ? -this.lastScan.quantity : 0,
                    previousQuantity: prevQty ?? null,
                    newQuantity: newQty ?? null,
                    createdAt: new Date().toISOString()
                };

                this.movements.unshift(movementRow);
                this.renderMovements();
                if (record) this.updateLiveDisplay(record, prevQty, newQty);
                this.applyFilters();
                this.updateAnalytics();

                this.lastScan = null;
                if (this.dom.undoBtn) this.dom.undoBtn.disabled = true;
                this.setScanStatus('Last scan reverted.', false);
                toast.show('Last scan reverted.', 'success');
            } catch (e) {
                console.error('Failed to undo return', e);
                toast.show('Failed to undo last scan.', 'error');
            } finally {
                this.setLoading(false, 'Ready to scan');
            }
        }
    };

    issueApp.defects = {
        pendingLogs: [],
        resolvedLogs: [],
        currentDefect: null,
        activeFilter: 'all',
        statusFilter: 'all',
        localProducts: {},

        init() {
            this.cacheDom();
            this.bindEvents();
            this.loadLogs();
            this.loadProducts().then(() => {
                this.renderLogs();
                this.updateCounts();
            });
        },

        cacheDom() {
            this.dom = {
                defectButtons: document.querySelectorAll('[data-defect-type]'),
                filterButtons: document.querySelectorAll('[data-defect-filter]'),
                otherContainer: document.getElementById('other-input-container'),
                otherInput: document.getElementById('other-defect-desc'),
                scanInput: document.getElementById('defect-scan-input'),
                batchInput: document.getElementById('defect-batch-input'),
                expiryInput: document.getElementById('defect-expiry-input'),
                feedback: document.getElementById('scan-feedback'),
                logBody: document.getElementById('defect-log-body'),
                searchInput: document.getElementById('defect-search-input'),
                statusFilter: document.getElementById('defect-status-filter'),
                syncBtn: document.getElementById('defect-sync-btn'),
                clearBtn: document.getElementById('defect-clear-btn'),
                countNoAir: document.getElementById('count-no-air'),
                countLeak: document.getElementById('count-leak'),
                countMushy: document.getElementById('count-mushy'),
                countOther: document.getElementById('count-other')
            };
        },

        bindEvents() {
            this.dom.defectButtons.forEach((btn) => {
                btn.addEventListener('click', () => this.selectDefect(btn.dataset.defectType));
            });

            this.dom.filterButtons.forEach((btn) => {
                btn.addEventListener('click', () => this.setFilter(btn.dataset.defectFilter));
            });

            if (this.dom.scanInput) {
                this.dom.scanInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const barcode = this.dom.scanInput.value.trim();
                        if (barcode) this.processScan(barcode);
                        this.dom.scanInput.value = '';
                    }
                });
            }

            if (this.dom.searchInput) {
                this.dom.searchInput.addEventListener('input', () => this.renderLogs());
            }
            if (this.dom.statusFilter) {
                this.dom.statusFilter.addEventListener('change', () => {
                    this.statusFilter = this.dom.statusFilter.value;
                    this.renderLogs();
                });
            }

            if (this.dom.syncBtn) this.dom.syncBtn.addEventListener('click', () => this.syncToCloud());
            if (this.dom.clearBtn) this.dom.clearBtn.addEventListener('click', () => this.clearAllLogs());

            if (this.dom.logBody) {
                this.dom.logBody.addEventListener('click', (event) => {
                    const btn = event.target.closest('button[data-action]');
                    if (!btn) return;
                    const action = btn.dataset.action;
                    const id = Number(btn.dataset.id);
                    if (action === 'edit') this.editLogItem(id);
                    if (action === 'delete') this.deleteLogItem(id);
                });
            }
        },

        loadLogs() {
            const pendingKey = 'tkg_defect_logs_pending';
            const resolvedKey = 'tkg_defect_logs_resolved';
            const legacyKey = 'tkg_defect_logs';

            const safeParse = (key) => {
                try { return JSON.parse(localStorage.getItem(key) || '[]'); }
                catch { return []; }
            };

            const pending = safeParse(pendingKey);
            const resolved = safeParse(resolvedKey);

            if (pending.length === 0 && resolved.length === 0) {
                const legacy = safeParse(legacyKey);
                if (legacy.length > 0) {
                    this.pendingLogs = legacy.map((log) => ({
                        ...log,
                        status: 'Pending',
                        createdAt: log.createdAt || new Date().toISOString()
                    }));
                    localStorage.removeItem(legacyKey);
                    this.saveLogs();
                    return;
                }
            }

            this.pendingLogs = pending.map((log) => ({
                ...log,
                status: log.status || 'Pending',
                createdAt: log.createdAt || new Date().toISOString()
            }));
            this.resolvedLogs = resolved.map((log) => ({
                ...log,
                status: log.status || 'Resolved',
                createdAt: log.createdAt || new Date().toISOString()
            }));
        },

        saveLogs() {
            localStorage.setItem('tkg_defect_logs_pending', JSON.stringify(this.pendingLogs));
            localStorage.setItem('tkg_defect_logs_resolved', JSON.stringify(this.resolvedLogs));
        },

        async loadProducts() {
            this.localProducts = {};

            if (window.AppDB && typeof window.AppDB.getProducts === 'function') {
                try {
                    const dbProducts = await window.AppDB.getProducts();
                    if (dbProducts && Object.keys(dbProducts).length > 0) {
                        this.localProducts = dbProducts;
                    }
                } catch (e) {
                    console.error('Failed to load native DB catalog', e);
                }
            }

            const saved = localStorage.getItem('tkg_product_overrides');
            if (saved) {
                try {
                    const overrides = JSON.parse(saved);
                    for (const [name, data] of Object.entries(overrides)) {
                        if (data === null) {
                            if (typeof PRODUCT_DB !== 'undefined') delete PRODUCT_DB[name];
                            continue;
                        }
                        if (typeof data === 'object' && data.barcodes && data.barcodes.length > 0) {
                            if (typeof PRODUCT_DB !== 'undefined') PRODUCT_DB[name] = data.barcodes;
                        }
                    }
                } catch (e) {
                    console.error('Failed to load overrides', e);
                }
            }
        },

        selectDefect(type) {
            this.currentDefect = type;

            this.dom.defectButtons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.defectType === type);
            });

            if (type === 'other') {
                if (this.dom.otherContainer) this.dom.otherContainer.style.display = 'block';
                if (this.dom.otherInput) this.dom.otherInput.focus();
            } else {
                if (this.dom.otherContainer) this.dom.otherContainer.style.display = 'none';
                if (this.dom.otherInput) this.dom.otherInput.value = '';
            }

            if (this.dom.scanInput) {
                this.dom.scanInput.disabled = false;
                this.dom.scanInput.placeholder = `Scanning for: ${this.formatType(type)}...`;
                if (type !== 'other') this.dom.scanInput.focus();
            }

            if (this.dom.feedback) {
                this.dom.feedback.textContent = `Ready to register ${this.formatType(type)} items`;
                this.dom.feedback.style.color = 'var(--text-primary)';
            }
        },

        setFilter(filter) {
            this.activeFilter = filter;
            this.dom.filterButtons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.defectFilter === filter);
            });
            this.renderLogs();
        },

        formatType(type, desc = '') {
            if (type === 'no-air') return 'No Air';
            if (type === 'leak') return 'Leak';
            if (type === 'mushy') return 'Mushy';
            if (type === 'other') return desc || 'Other';
            return type;
        },

        processScan(barcode) {
            if (!this.currentDefect) {
                toast.show('Please select a defect type first.', 'error');
                return;
            }

            const productName = this.findProductByBarcode(barcode);
            const otherDesc = this.dom.otherInput ? this.dom.otherInput.value.trim() : '';
            const batchNum = this.dom.batchInput ? this.dom.batchInput.value.trim() : '';
            const expiryDate = this.dom.expiryInput ? this.dom.expiryInput.value : '';

            const existingEntry = this.pendingLogs.find((l) =>
                l.barcode === barcode &&
                l.type === this.currentDefect &&
                l.batch === batchNum &&
                l.expiry === expiryDate &&
                (this.currentDefect !== 'other' || l.otherDesc === otherDesc)
            );

            if (existingEntry) {
                existingEntry.count++;
                const index = this.pendingLogs.indexOf(existingEntry);
                if (index > -1) {
                    this.pendingLogs.splice(index, 1);
                    this.pendingLogs.unshift(existingEntry);
                }
                this.saveLogs();
                this.renderLogs();
                this.updateCounts();
                const batchText = batchNum ? `[Batch: ${batchNum}] ` : '';
                const expText = expiryDate ? `[Exp: ${expiryDate}]` : '';
                if (this.dom.feedback) {
                    this.dom.feedback.textContent = `Updated: ${productName} (x${existingEntry.count}) - ${this.formatType(this.currentDefect, otherDesc)} ${batchText}${expText}`;
                    this.dom.feedback.style.color = 'var(--accent)';
                }
                return;
            }

            const entry = {
                id: Date.now(),
                product: productName,
                barcode: barcode,
                type: this.currentDefect,
                otherDesc: otherDesc,
                batch: batchNum,
                expiry: expiryDate,
                count: 1,
                status: 'Pending',
                createdAt: new Date().toISOString()
            };

            this.pendingLogs.unshift(entry);
            this.saveLogs();
            this.renderLogs();
            this.updateCounts();

            if (this.dom.feedback) {
                this.dom.feedback.textContent = `Registered: ${productName} (${this.formatType(this.currentDefect, otherDesc)})`;
                this.dom.feedback.style.color = 'var(--success)';
            }
        },

        findProductByBarcode(code) {
            for (const [name, data] of Object.entries(this.localProducts)) {
                if (data && data.barcodes && data.barcodes.includes(code)) return name;
            }

            if (typeof PRODUCT_CATALOG !== 'undefined') {
                for (const category in PRODUCT_CATALOG) {
                    for (const [name, item] of Object.entries(PRODUCT_CATALOG[category])) {
                        if (item.barcodes && item.barcodes.includes(code)) return name;
                    }
                }
            }

            if (typeof PRODUCT_DB !== 'undefined') {
                for (const [name, codes] of Object.entries(PRODUCT_DB)) {
                    if (Array.isArray(codes) && codes.includes(code)) return name;
                }
            }
            return 'Unknown Product';
        },

        getFilteredLogs() {
            const search = this.dom.searchInput ? this.dom.searchInput.value.toLowerCase().trim() : '';
            const status = this.statusFilter === 'all' ? 'all' : this.statusFilter;

            let logs = [];
            if (status === 'Pending') {
                logs = [...this.pendingLogs];
            } else if (status === 'Resolved') {
                logs = [...this.resolvedLogs];
            } else {
                logs = [...this.pendingLogs, ...this.resolvedLogs];
            }

            return logs.filter((log) => {
                const typeMatch = this.activeFilter === 'all' || log.type === this.activeFilter;
                const searchMatch = !search ||
                    (log.product && log.product.toLowerCase().includes(search)) ||
                    (log.barcode && log.barcode.toLowerCase().includes(search)) ||
                    (log.batch && log.batch.toLowerCase().includes(search));
                return typeMatch && searchMatch;
            });
        },

        renderLogs() {
            if (!this.dom.logBody) return;
            const filteredLogs = this.getFilteredLogs();

            if (filteredLogs.length === 0) {
                this.dom.logBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color: var(--text-secondary);">No defect logs found.</td></tr>';
                this.updateCounts([]);
                return;
            }

            this.dom.logBody.innerHTML = filteredLogs.map((log) => {
                const batchBadge = log.batch ? `<div style="font-size: 0.8em; color: var(--accent); margin-top: 4px;">Batch: ${utils.escapeHtml(log.batch)}</div>` : '';
                const expBadge = log.expiry ? `<div style="font-size: 0.8em; color: var(--danger); margin-top: 4px;">Exp: ${utils.escapeHtml(log.expiry)}</div>` : '';
                const statusBadge = this.statusBadge(log.status);
                const actionButtons = [];
                if (log.status === 'Pending') {
                    actionButtons.push(`<button class="action-btn btn-neutral" data-action="edit" data-id="${log.id}">Edit</button>`);
                }
                actionButtons.push(`<button class="action-btn btn-delete" data-action="delete" data-id="${log.id}">Delete</button>`);

                return `
                <tr>
                    <td style="font-weight:600;">
                        ${utils.escapeHtml(log.product)}
                        ${log.count > 1 ? `<span style="background:#0f172a; color:white; padding:2px 8px; border-radius:12px; font-size:0.8em; margin-left:8px; display: inline-block;">x${log.count}</span>` : ''}
                    </td>
                    <td><span class="defect-tag defect-${log.type}">${utils.escapeHtml(this.formatType(log.type, log.otherDesc))}</span></td>
                    <td>
                        ${batchBadge}
                        ${expBadge}
                        ${!log.batch && !log.expiry ? '<span style="color:var(--text-secondary); font-size:0.8em;">-</span>' : ''}
                    </td>
                    <td style="font-family:monospace; color:var(--text-secondary);">${utils.escapeHtml(log.barcode)}</td>
                    <td>${statusBadge}</td>
                    <td>${actionButtons.join(' ')}</td>
                </tr>
            `;
            }).join('');

            this.updateCounts(filteredLogs);
        },

        statusBadge(status) {
            const cls = status === 'Resolved' ? 'resolved' : 'pending';
            return `<span class="badge ${cls}">${utils.escapeHtml(status)}</span>`;
        },

        editLogItem(id) {
            const index = this.pendingLogs.findIndex((l) => l.id === id);
            if (index === -1) return;
            const log = this.pendingLogs[index];

            const newBatch = prompt(`Edit Batch Number for ${log.product}\nCurrent Batch: ${log.batch || 'None'}`, log.batch || '');
            if (newBatch === null) return;

            const newExpiry = prompt(`Edit Expiry Date (YYYY-MM-DD)\nCurrent Expiry: ${log.expiry || 'None'}`, log.expiry || '');
            if (newExpiry === null) return;

            log.batch = newBatch.trim();
            log.expiry = newExpiry.trim();

            this.saveLogs();
            this.renderLogs();
        },

        deleteLogItem(id) {
            const pendingIndex = this.pendingLogs.findIndex((l) => l.id === id);
            if (pendingIndex !== -1) {
                this.pendingLogs.splice(pendingIndex, 1);
            } else {
                const resolvedIndex = this.resolvedLogs.findIndex((l) => l.id === id);
                if (resolvedIndex !== -1) this.resolvedLogs.splice(resolvedIndex, 1);
            }
            this.saveLogs();
            this.renderLogs();
        },

        updateCounts(logs = null) {
            const list = logs || this.pendingLogs;
            const counts = { 'no-air': 0, leak: 0, mushy: 0, other: 0 };
            list.forEach((l) => {
                if (counts[l.type] !== undefined) counts[l.type] += l.count;
            });

            if (this.dom.countNoAir) this.dom.countNoAir.textContent = counts['no-air'];
            if (this.dom.countLeak) this.dom.countLeak.textContent = counts.leak;
            if (this.dom.countMushy) this.dom.countMushy.textContent = counts.mushy;
            if (this.dom.countOther) this.dom.countOther.textContent = counts.other;
        },

        async syncToCloud() {
            if (!this.pendingLogs.length) {
                toast.show('No pending defects to sync.', 'error');
                return;
            }
            if (!confirm('Push these defect logs to the Cloud Ledger? This will permanently deduct stock.')) return;
            if (!window.AppDB || typeof window.AppDB.insertDefect !== 'function') {
                toast.show('Cloud sync is unavailable. AppDB is not ready.', 'error');
                return;
            }

            const btn = this.dom.syncBtn;
            const originalText = btn ? btn.textContent : '';
            if (btn) {
                btn.textContent = 'Syncing...';
                btn.disabled = true;
            }

            try {
                for (const log of this.pendingLogs) {
                    await window.AppDB.insertDefect({
                        product: log.product,
                        count: log.count,
                        expiry: log.expiry || null,
                        defectType: log.type,
                        notes: log.otherDesc || ''
                    });
                }

                const resolvedAt = new Date().toISOString();
                const resolvedLogs = this.pendingLogs.map((log) => ({
                    ...log,
                    status: 'Resolved',
                    resolvedAt
                }));

                this.resolvedLogs = resolvedLogs.concat(this.resolvedLogs);
                this.pendingLogs = [];
                this.saveLogs();
                this.renderLogs();
                toast.show('Defects synced to Cloud Ledger.', 'success');
            } catch (e) {
                console.error('Sync failed', e);
                toast.show('Sync failed. Please try again.', 'error');
            } finally {
                if (btn) {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            }
        },

        clearAllLogs() {
            if (!confirm('Clear all logs? This will remove pending and resolved defects.')) return;
            this.pendingLogs = [];
            this.resolvedLogs = [];
            localStorage.removeItem('tkg_defect_logs_pending');
            localStorage.removeItem('tkg_defect_logs_resolved');
            this.renderLogs();
            if (this.dom.scanInput) this.dom.scanInput.value = '';
            if (this.dom.feedback) this.dom.feedback.textContent = 'Session cleared';
        },


    };

    issueApp.init();
    window.issueApp = issueApp;
});
