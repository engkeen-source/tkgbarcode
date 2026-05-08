/**
 * orders-workbench.js - Order Records + Packing Station
 */

document.addEventListener('DOMContentLoaded', () => {
    const orderUtils = {
        normalize(value) {
            return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
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
        escapeAttr(value) {
            return this.escapeHtml(value).replace(/\s+/g, ' ');
        },
        formatDisplayName(name) {
            return window.formatProductName ? window.formatProductName(name) : name;
        },
        isB2B(order) {
            return (order.platform === 'b2b') || (order.id && String(order.id).toLowerCase().startsWith('b2b'));
        },
        derivePlatform(order) {
            if (this.isB2B(order)) return 'b2b';
            let platform = String(order.platform || '').toLowerCase();
            const shipper = String(order.shipper || '').toLowerCase();
            const awb = String(order.awb || '').toLowerCase();
            const id = String(order.id || '').toLowerCase();

            if (!platform) {
                if (shipper.includes('lazada') || awb.startsWith('lz')) platform = 'lazada';
                else if (shipper.includes('shopify') || id.startsWith('shop-')) platform = 'shopify';
                else if (shipper.includes('tiktok') || awb.startsWith('tt')) platform = 'tiktok';
                else platform = 'shopee';
            }

            return platform;
        },
        deriveDelivery(order, platform) {
            const shipper = String(order.shipper || '').toLowerCase();
            const awb = String(order.awb || '').toLowerCase();

            if (platform === 'b2b' || shipper.includes('b2b')) return 'b2b';
            if (shipper.includes('ninja') || awb.startsWith('ninja')) return 'ninjavan';
            if (shipper.includes('spx') || shipper.includes('pick locker') || awb.startsWith('spx')) return 'spx';
            if (shipper.includes('singpost') || shipper.includes('speedpost') || platform === 'lazada' || platform === 'shopify') return 'singpost';
            if (shipper.includes('j&t') || awb.startsWith('jt')) return 'jt';
            return 'other';
        },
        getPlatformBadge(order) {
            const platform = this.derivePlatform(order);
            const labelMap = {
                shopee: 'Shopee',
                lazada: 'Lazada',
                shopify: 'Shopify',
                tiktok: 'TikTok',
                b2b: 'B2B / Wholesale'
            };
            const classMap = {
                shopee: 'platform-shopee',
                lazada: 'platform-lazada',
                shopify: 'platform-shopify',
                tiktok: 'platform-tiktok',
                b2b: 'platform-b2b',
                other: 'platform-other'
            };
            const label = labelMap[platform] || 'Unknown';
            const cls = classMap[platform] || classMap.other;
            return `<span class="records-badge ${cls}">${label}</span>`;
        },
        getDeliveryBadge(order) {
            const platform = this.derivePlatform(order);
            const shipper = String(order.shipper || '').toLowerCase();
            const awb = String(order.awb || '').toLowerCase();

            if (shipper.includes('ninja') || awb.startsWith('ninja')) {
                return '<span class="records-badge delivery-ninjavan">NinjaVan</span>';
            }
            if (shipper.includes('spx') || shipper.includes('pick locker') || awb.startsWith('spx')) {
                return '<span class="records-badge delivery-spx">SPX Express</span>';
            }
            if (shipper.includes('singpost') || shipper.includes('speedpost') || platform === 'lazada' || platform === 'shopify') {
                return '<span class="records-badge delivery-singpost">Singpost</span>';
            }
            if (shipper.includes('j&t') || awb.startsWith('jt')) {
                return '<span class="records-badge delivery-jt">J&T Express</span>';
            }
            if (platform === 'b2b' || shipper.includes('b2b')) {
                return '<span class="records-badge delivery-b2b">Direct Dispatch</span>';
            }
            return `<span class="records-badge platform-other">${this.escapeHtml(order.shipper || 'Unknown')}</span>`;
        },
        formatDate(order) {
            const formatClean = (ms) => {
                const d = new Date(ms);
                const dStr = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                const tStr = d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${dStr}<br><span style="font-size:0.85em; color:var(--text-secondary);">${tStr}</span>`;
            };

            if (order.id && String(order.id).startsWith('SHOP-')) {
                const ts = parseInt(String(order.id).split('-')[1], 10);
                if (!isNaN(ts)) return formatClean(ts);
            }

            if (order.id && String(order.id).startsWith('B2B-')) {
                const ts = parseInt(String(order.id).split('-')[1], 10);
                if (!isNaN(ts)) {
                    let dStr = new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                    if (order.b2bTime) {
                        dStr += `<br><span style="font-size:0.85em; color:var(--text-secondary);">${this.escapeHtml(order.b2bTime)}</span>`;
                    }
                    return dStr;
                }
            }

            if (order.date) {
                return formatClean(new Date(order.date).getTime());
            }

            return '<span style="opacity:0.5">-</span>';
        },
        getCustomerName(order) {
            return order.customerName || order.customer || order.buyerName || order.recipientName || order.shippingName || '-';
        },
        resolveImage(name) {
            if (!name) return '';
            if (window.IMAGE_DB && window.IMAGE_DB[name]) return window.IMAGE_DB[name];
            const lower = String(name).toLowerCase();
            if (window.IMAGE_DB && window.IMAGE_DB[lower]) return window.IMAGE_DB[lower];
            if (window.IMAGE_DB) {
                const key = Object.keys(window.IMAGE_DB).find((k) => k.toLowerCase() === lower);
                if (key) return window.IMAGE_DB[key];
            }
            return '';
        }
    };

    const withRetry = async (fn, attempts = 2, delayMs = 500) => {
        let lastErr;
        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (err) {
                lastErr = err;
                if (i < attempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
            }
        }
        throw lastErr;
    };

    const orderService = {
        orders: [],
        lastLoaded: 0,
        loadingPromise: null,
        ttlMs: 60000,

        async load(force = false) {
            if (this.loadingPromise) return this.loadingPromise;
            if (!force && this.orders.length > 0 && (Date.now() - this.lastLoaded) < this.ttlMs) {
                return this.orders;
            }

            this.loadingPromise = withRetry(async () => {
                if (!window.AppDB || !window.AppDB.getOrders) return [];
                return await window.AppDB.getOrders();
            }).then((orders) => {
                this.orders = Array.isArray(orders) ? orders : [];
                this.lastLoaded = Date.now();
                return this.orders;
            }).finally(() => {
                this.loadingPromise = null;
            });

            return this.loadingPromise;
        },

        async refresh() {
            return this.load(true);
        },

        updateLocalOrder(updated) {
            if (!updated || !updated.id) return;
            const idx = this.orders.findIndex((o) => String(o.id) === String(updated.id));
            if (idx >= 0) this.orders[idx] = updated;
        },

        findByIdentifier(identifier) {
            const normalized = orderUtils.normalize(identifier);
            if (!normalized) return null;

            const matches = (value) => {
                const candidate = orderUtils.normalize(value);
                if (!candidate) return false;
                return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate);
            };

            const findBy = (fn) => this.orders.find((o) => matches(fn(o)));

            return findBy((o) => o.awb) ||
                findBy((o) => o.trackingNumber || o.tracking || o.tracking_no || o.trackingNo) ||
                findBy((o) => o.orderId || o.id);
        }
    };

    const records = {
        orders: [],
        filteredOrders: [],
        currentTab: 'ecommerce',

        init() {
            this.cacheDom();
            this.bindEvents();
            this.refreshData();
        },

        cacheDom() {
            this.dom = {
                searchInput: document.getElementById('records-search-input'),
                statusFilter: document.getElementById('records-status-filter'),
                platformFilter: document.getElementById('records-platform-filter'),
                deliveryFilter: document.getElementById('records-delivery-filter'),
                recordsTbody: document.getElementById('records-tbody'),
                tabButtons: document.querySelectorAll('[data-records-tab]')
            };
        },

        bindEvents() {
            const debouncedFilter = this.debounce(() => this.applyFilters(), 200);
            if (this.dom.searchInput) this.dom.searchInput.addEventListener('input', debouncedFilter);
            if (this.dom.statusFilter) this.dom.statusFilter.addEventListener('change', () => this.applyFilters());
            if (this.dom.platformFilter) this.dom.platformFilter.addEventListener('change', () => this.applyFilters());
            if (this.dom.deliveryFilter) this.dom.deliveryFilter.addEventListener('change', () => this.applyFilters());

            this.dom.tabButtons.forEach((btn) => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.recordsTab));
            });

            if (this.dom.recordsTbody) {
                this.dom.recordsTbody.addEventListener('click', (event) => {
                    const target = event.target.closest('[data-action]');
                    if (!target) return;
                    const action = target.dataset.action;
                    const orderId = target.dataset.orderId;
                    const index = target.dataset.index;

                    if (action === 'toggle-items') this.toggleItems(index);
                    if (action === 'edit') this.editOrder(orderId);
                    if (action === 'cancel') this.cancelOrder(orderId);
                    if (action === 'delete') this.deleteOrder(orderId);
                    if (action === 'view-pod') this.viewPod(orderId);
                });
            }
        },

        debounce(fn, delay) {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        async refreshData() {
            try {
                this.orders = await orderService.refresh();
            } catch (err) {
                console.error('Failed to load orders', err);
                this.orders = [];
            }
            this.applyFilters();
        },

        switchTab(tab) {
            if (!tab || tab === this.currentTab) return;
            this.currentTab = tab;
            this.dom.tabButtons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.recordsTab === tab);
            });

            if (this.dom.platformFilter && this.dom.deliveryFilter) {
                const showFilters = tab === 'ecommerce';
                this.dom.platformFilter.style.display = showFilters ? 'inline-block' : 'none';
                this.dom.deliveryFilter.style.display = showFilters ? 'inline-block' : 'none';
            }

            this.applyFilters();
        },

        applyFilters() {
            const search = this.dom.searchInput ? this.dom.searchInput.value.toLowerCase().trim() : '';
            const statusFilter = this.dom.statusFilter ? this.dom.statusFilter.value : 'all';
            const platformFilter = this.dom.platformFilter ? this.dom.platformFilter.value : 'all';
            const deliveryFilter = this.dom.deliveryFilter ? this.dom.deliveryFilter.value : 'all';

            this.filteredOrders = this.orders.filter((order) => {
                const isB2B = orderUtils.isB2B(order);
                if (this.currentTab === 'ecommerce' && isB2B) return false;
                if (this.currentTab === 'b2b' && !isB2B) return false;

                const matchSearch = !search ||
                    (order.awb && String(order.awb).toLowerCase().includes(search)) ||
                    (order.orderId && String(order.orderId).toLowerCase().includes(search)) ||
                    (order.id && String(order.id).toLowerCase().includes(search));

                const isComplete = order.status === 'Complete' || order.status === 'Exported';
                let matchStatus = true;
                if (statusFilter === 'complete') matchStatus = isComplete;
                if (statusFilter === 'pending') matchStatus = !isComplete;

                const platform = orderUtils.derivePlatform(order);
                const delivery = orderUtils.deriveDelivery(order, platform);

                let matchPlatform = true;
                if (this.currentTab === 'ecommerce' && platformFilter !== 'all' && platform !== platformFilter) {
                    matchPlatform = false;
                }

                let matchDelivery = true;
                if (this.currentTab === 'ecommerce' && deliveryFilter !== 'all' && delivery !== deliveryFilter) {
                    matchDelivery = false;
                }

                return matchSearch && matchStatus && matchPlatform && matchDelivery;
            });

            this.renderRecords();
        },

        toggleItems(index) {
            const list = document.getElementById(`items-${index}`);
            const btn = document.getElementById(`btn-${index}`);
            if (!list || !btn) return;
            if (list.style.display === 'none' || list.style.display === '') {
                list.style.display = 'block';
                btn.textContent = 'Hide';
            } else {
                list.style.display = 'none';
                btn.textContent = 'View';
            }
        },

        async deleteOrder(orderId) {
            if (!orderId) return;
            if (confirm('WARNING: Deleting Order Record!\n\nAre you sure you want to permanently erase this order? This will immediately restore all its items back into your active Stock Inventory natively.')) {
                try {
                    await window.AppDB.deleteOrder(orderId);
                    await this.refreshData();
                } catch (e) {
                    alert('Failed to delete order: ' + e.message);
                }
            }
        },

        async cancelOrder(orderId) {
            if (!orderId) return;
            if (confirm('Cancel Order?\n\nThis will mark the order as Cancelled and remove its stock deductions, natively restoring the items to your Live Inventory.\n\nThe order record will remain visible in your logs for auditing.')) {
                try {
                    await window.AppDB.cancelOrder(orderId);
                    await this.refreshData();
                } catch (e) {
                    alert('Failed to cancel order: ' + e.message);
                }
            }
        },

        editOrder(orderId) {
            if (!orderId) return;
            const orderIndex = this.orders.findIndex((o) => o.id === orderId || o.id === parseInt(orderId, 10));
            if (orderIndex === -1) return;
            const order = this.orders[orderIndex];

            let stagedItems = JSON.parse(JSON.stringify(order.lineItems || []));

            let selectOptions = '<option value="" disabled selected>Select an item to add...</option>';
            if (typeof PRODUCT_CATALOG !== 'undefined') {
                let allProducts = [];
                for (const category in PRODUCT_CATALOG) {
                    if (category === 'Aliases' || category === 'Gift Box Barcodes' || category === 'Merchandise') continue;
                    for (const pName in PRODUCT_CATALOG[category]) {
                        allProducts.push(pName);
                    }
                }
                allProducts.sort().forEach((p) => {
                    const displayName = p.split(' ').map((w) => w.match(/^\d+g$/i) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    selectOptions += `<option value="${p}">${displayName}</option>`;
                });
            }

            const modal = document.createElement('div');
            modal.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; justify-content:center; align-items:center;';
            modal.id = 'edit-order-modal';

            const renderItems = () => {
                let itemsHtml = '';
                stagedItems.forEach((line, idx) => {
                    const isBundleStr = line.isBundle ? '<span style="color:#a855f7; font-size:0.75rem; font-weight:700; background:rgba(168,85,247,0.15); padding:0.2rem 0.5rem; border-radius:12px; margin-left:0.5rem; text-transform:uppercase;">Bundle</span>' : '';
                    itemsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)); padding:1rem 1.5rem; border-radius:12px; margin-bottom:0.75rem; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-weight:600; flex:1; color:white; font-size:1.05rem;">${line.name} ${isBundleStr}</span>
                            <div style="display:flex; gap:1rem; align-items:center;">
                                <label style="color:var(--text-secondary); font-size:0.9rem;">Qty:</label>
                                <input type="number" id="staged-qty-${idx}" value="${line.orderedQty}" min="0" style="width:80px; padding:0.6rem; background:rgba(0,0,0,0.4); color:var(--text-primary); border:1px solid var(--border-color); border-radius:8px; font-size:1.1rem; text-align:center; outline:none; transition:border-color 0.2s;" onchange="window.orderWorkbench.updateStagedQty(${idx}, this.value)">
                            </div>
                        </div>
                    `;
                });
                return itemsHtml;
            };

            const isB2B = orderUtils.isB2B(order);
            this._newPodBase64 = order.podImage || null;

            const renderPodSection = () => {
                if (!isB2B) return '';
                const previewHtml = this._newPodBase64
                    ? `<img id="edit-pod-preview" src="${this._newPodBase64}" style="max-height:100px; border-radius:8px; border:2px solid var(--accent); margin-top:1rem; display:block; box-shadow:0 4px 6px rgba(0,0,0,0.3);">`
                    : `<img id="edit-pod-preview" src="" style="max-height:100px; border-radius:8px; border:2px solid var(--accent); margin-top:1rem; display:none; box-shadow:0 4px 6px rgba(0,0,0,0.3);">`;

                return `
                <div style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); padding:1.5rem; border-radius:12px; margin-bottom:2.5rem;">
                    <label style="display:block; color:var(--text-secondary); font-size:0.85rem; margin-bottom:0.5rem; font-weight:600; text-transform:uppercase;">Proof of Delivery Attachment</label>
                    <input type="file" id="edit-pod-upload" accept="image/*" style="width:100%; padding:0.75rem; background:rgba(0,0,0,0.4); color:white; border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                    ${previewHtml}
                </div>
                `;
            };

            const buildHtml = () => {
                return `
                <div style="background:var(--bg-app); border:1px solid rgba(255,255,255,0.1); padding:2.5rem; border-radius:16px; max-width:650px; width:95%; max-height:85vh; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); font-family:'Inter', sans-serif;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h2 style="margin:0; color:white; font-size:1.8rem; font-weight:800;">Edit Order Content</h2>
                        <span style="background:rgba(255,255,255,0.1); padding:0.4rem 0.8rem; border-radius:8px; font-family:monospace; font-size:0.9rem; color:var(--text-secondary);">${order.awb || order.orderId || order.id}</span>
                    </div>
                    <p style="color:var(--text-secondary); margin-bottom:2rem; font-size:0.95rem; line-height:1.5;">Modify quantities below. Adding or removing items will natively and instantly synchronize with your Stock Inventory and Reports math.</p>

                    <div id="modal-items-container" style="margin-bottom: 2rem;">
                        ${renderItems()}
                    </div>

                    <div style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); padding:1.5rem; border-radius:12px; margin-bottom:2.5rem;">
                        <label style="display:block; color:var(--text-secondary); font-size:0.85rem; margin-bottom:0.5rem; font-weight:600; text-transform:uppercase;">Add New Product to Historical Order</label>
                        <div style="display:flex; gap:1rem;">
                            <select id="modal-add-select" style="flex:1; padding:0.75rem; background:rgba(0,0,0,0.4); color:white; border:1px solid var(--border-color); border-radius:8px; font-size:1rem; outline:none;">
                                ${selectOptions}
                            </select>
                            <button id="btn-modal-add" style="background:var(--accent); color:white; border:none; border-radius:8px; padding:0 1.5rem; font-weight:600; cursor:pointer; font-size:0.95rem; transition:transform 0.1s;">+ Add</button>
                        </div>
                    </div>

                    ${renderPodSection()}

                    <div style="display:flex; justify-content:space-between; gap: 1rem; margin-top:1rem;">
                        <button id="btn-cancel-edit" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:var(--text-secondary); flex:1; padding:1rem; border-radius:12px; font-weight:600; cursor:pointer; font-size:1.05rem; transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">Cancel</button>
                        <button id="btn-save-edit" style="background:linear-gradient(135deg, var(--success) 0%, #059669 100%); color:white; flex:2; border:none; border-radius:12px; font-weight:700; cursor:pointer; font-size:1.05rem; box-shadow:0 4px 15px rgba(16,185,129,0.3); transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">Commit & Sync Inventory</button>
                    </div>
                </div>`;
            };

            modal.innerHTML = buildHtml();
            document.body.appendChild(modal);

            this._stagedItems = stagedItems;

            document.getElementById('btn-cancel-edit').onclick = () => {
                delete this._stagedItems;
                delete this._newPodBase64;
                modal.remove();
            };

            if (isB2B) {
                const podUpload = document.getElementById('edit-pod-upload');
                if (podUpload) {
                    podUpload.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 600;
                                let width = img.width;
                                let height = img.height;
                                if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, width, height);
                                this._newPodBase64 = canvas.toDataURL('image/jpeg', 0.5);
                                const preview = document.getElementById('edit-pod-preview');
                                if (preview) {
                                    preview.src = this._newPodBase64;
                                    preview.style.display = 'block';
                                }
                            };
                            img.src = event.target.result;
                        };
                        reader.readAsDataURL(file);
                    });
                }
            }

            document.getElementById('btn-modal-add').onclick = () => {
                const sel = document.getElementById('modal-add-select');
                const pName = sel.value;
                if (!pName) return;

                let subItems = [];
                let isBundle = false;
                if (typeof PRODUCT_CATALOG !== 'undefined') {
                    for (const cat in PRODUCT_CATALOG) {
                        if (PRODUCT_CATALOG[cat][pName]) {
                            const schema = PRODUCT_CATALOG[cat][pName];
                            if (schema.type === 'bundle' || schema.type === 'gift_box') {
                                isBundle = true;
                                if (schema.contents) {
                                    subItems = schema.contents.map((sub) => ({
                                        name: sub.name.toLowerCase(),
                                        requiredQty: sub.count,
                                        scannedQty: sub.count,
                                        done: true
                                    }));
                                }
                            }
                        }
                    }
                }

                const existingItem = this._stagedItems.find((i) => i.name === pName);
                if (existingItem) {
                    existingItem.orderedQty++;
                    existingItem.scannedQty++;
                    if (existingItem.isBundle && existingItem.subItems) {
                        const ratio = existingItem.orderedQty / (existingItem.orderedQty - 1);
                        existingItem.subItems.forEach((sub) => {
                            sub.requiredQty = sub.requiredQty * ratio;
                            sub.scannedQty = sub.scannedQty * ratio;
                        });
                    }
                } else {
                    this._stagedItems.push({
                        id: `added-${Date.now()}`,
                        name: pName,
                        orderedQty: 1,
                        scannedQty: 1,
                        status: 'Complete',
                        isBundle: isBundle,
                        subItems: subItems.length > 0 ? subItems : null
                    });
                }

                document.getElementById('modal-items-container').innerHTML = renderItems();
                sel.value = '';
            };

            document.getElementById('btn-save-edit').onclick = async () => {
                let anyChanges = false;
                const filteredStage = this._stagedItems.filter((l) => l.orderedQty > 0);
                if (JSON.stringify(order.lineItems) !== JSON.stringify(filteredStage)) {
                    order.lineItems = filteredStage;
                    anyChanges = true;
                }

                if (isB2B && this._newPodBase64 !== order.podImage) {
                    order.podImage = this._newPodBase64;
                    anyChanges = true;
                }

                if (anyChanges) {
                    const saveBtn = document.getElementById('btn-save-edit');
                    saveBtn.textContent = 'Saving to Cloud...';
                    saveBtn.disabled = true;
                    try {
                        if (order.lineItems && order.lineItems.length === 0) {
                            await AppDB.deleteOrder(order.id);
                        } else {
                            await AppDB.deleteOrder(order.id);
                            await AppDB.fulfillOrder(order);
                        }
                        await this.refreshData();
                    } catch (e) {
                        alert('Failed to update order: ' + e.message);
                    }
                }

                delete this._stagedItems;
                delete this._newPodBase64;
                modal.remove();
            };
        },

        updateStagedQty(idx, val) {
            let newQty = parseInt(val, 10) || 0;
            const line = this._stagedItems[idx];
            if (line && line.orderedQty !== newQty) {
                if (line.isBundle && line.subItems && line.orderedQty > 0) {
                    const ratio = newQty / line.orderedQty;
                    line.subItems.forEach((sub) => {
                        sub.requiredQty = sub.requiredQty * ratio;
                        sub.scannedQty = sub.scannedQty * ratio;
                    });
                }
                line.orderedQty = newQty;
                line.scannedQty = newQty;
            }
        },

        renderRecords() {
            if (!this.dom.recordsTbody) return;
            this.dom.recordsTbody.innerHTML = '';

            if (this.filteredOrders.length === 0) {
                this.dom.recordsTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No orders found matching the criteria.</td></tr>';
                return;
            }

            this.filteredOrders.forEach((order, idx) => {
                const tr = document.createElement('tr');
                const isComplete = order.status === 'Complete' || order.status === 'Exported';
                const statusBadge = `<span class="records-badge ${isComplete ? 'complete' : 'pending'}">${orderUtils.escapeHtml(order.status || 'Pending')}</span>`;

                const platformBadge = orderUtils.getPlatformBadge(order);
                const deliveryBadge = orderUtils.getDeliveryBadge(order);
                const dateStr = orderUtils.formatDate(order);

                let itemCount = 0;
                let itemsPreview = [];
                let fullItemsList = [];

                if (order.lineItems) {
                    order.lineItems.forEach((line) => {
                        const qty = line.orderedQty || 1;
                        itemCount += qty;

                        const nStr = orderUtils.formatDisplayName(line.name);
                        const mainExpBadge = line.selectedExpiry
                            ? ` <span style="color:var(--danger); font-size:0.85em;">[Exp: ${new Date(line.selectedExpiry).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}]</span>`
                            : '';
                        const text = `${qty}x ${orderUtils.escapeHtml(nStr)}${mainExpBadge}`;

                        if (itemsPreview.length < 2) itemsPreview.push(`${qty}x ${orderUtils.escapeHtml(nStr)}`);
                        fullItemsList.push(`<li>${text}</li>`);

                        if (line.subItems && line.subItems.length > 0) {
                            line.subItems.forEach((sub) => {
                                const subNStr = orderUtils.formatDisplayName(sub.name);
                                const expBadge = sub.selectedExpiry
                                    ? ` <span style="color:var(--danger); font-size:0.85em;">[Exp: ${new Date(sub.selectedExpiry).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}]</span>`
                                    : '';
                                fullItemsList.push(`<li style="color:var(--text-secondary); margin-left:1em;">- ${sub.requiredQty}x ${orderUtils.escapeHtml(subNStr)}${expBadge}</li>`);
                            });
                        }
                    });
                }

                let itemsHtml = `<div class="items-cell">${itemCount} items: ${itemsPreview.join(', ')}${itemsPreview.length < fullItemsList.length ? '...' : ''} <button id="btn-${idx}" class="btn-expand" data-action="toggle-items" data-index="${idx}">View</button></div>`;
                itemsHtml += `<ul id="items-${idx}" class="items-list-expanded" style="display:none;">${fullItemsList.join('')}</ul>`;

                const safeId = order.id ? String(order.id) : '';

                const podButton = order.podImage
                    ? `<button class="btn-pod" data-action="view-pod" data-order-id="${orderUtils.escapeAttr(safeId)}" title="View Proof of Delivery">POD</button>`
                    : '';

                const actionButtons = [
                    `<button class="action-btn btn-edit" data-action="edit" data-order-id="${orderUtils.escapeAttr(safeId)}">Edit</button>`
                ];
                if ((order.status || '').toLowerCase() !== 'cancelled') {
                    actionButtons.push(`<button class="action-btn btn-cancel" data-action="cancel" data-order-id="${orderUtils.escapeAttr(safeId)}">Cancel</button>`);
                }
                actionButtons.push(`<button class="action-btn btn-delete" data-action="delete" data-order-id="${orderUtils.escapeAttr(safeId)}">Delete</button>`);

                tr.innerHTML = `
                    <td style="color: var(--text-secondary); font-size: 0.85rem; white-space: nowrap; display:flex; align-items:center;">${dateStr} ${podButton}</td>
                    <td style="font-weight: 600; font-family: monospace; font-size: 1.05rem;">${orderUtils.escapeHtml(order.awb || '-')}</td>
                    <td style="color: var(--text-secondary);">${orderUtils.escapeHtml(order.orderId || '-')}</td>
                    <td>${platformBadge}</td>
                    <td>${deliveryBadge}</td>
                    <td>${itemsHtml}</td>
                    <td>${statusBadge}</td>
                    <td style="text-align: right; white-space: nowrap;">${actionButtons.join(' ')}</td>
                `;
                this.dom.recordsTbody.appendChild(tr);
            });
        },

        viewPod(orderId) {
            const order = this.orders.find((o) => String(o.id) === String(orderId));
            if (!order || !order.podImage) return;

            const modal = document.createElement('div');
            modal.style = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); backdrop-filter:blur(5px); z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center;';

            modal.innerHTML = `
                <div style="background:var(--bg-app); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:1.5rem; display:flex; flex-direction:column; align-items:center; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
                    <h3 style="margin-top:0; color:white; margin-bottom:1rem;">Proof of Delivery</h3>
                    <img src="${order.podImage}" style="max-width:90vw; max-height:75vh; border-radius:8px; border:1px solid rgba(255,255,255,0.1);">
                    <button style="margin-top:1.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; padding:0.8rem 2rem; border-radius:8px; cursor:pointer; font-weight:600; font-family:'Inter', sans-serif;" onclick="this.closest('div').parentElement.remove()">Close</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
    };

    const packing = {
        currentOrder: null,
        items: [],
        lastScanValue: null,
        lastScanAt: 0,
        isActive: false,
        _focusTimer: null,
        _scanBuffer: '',
        _bufferTimer: null,

        init() {
            this.cacheDom();
            this.bindEvents();
            this.renderEmpty();
        },

        cacheDom() {
            this.dom = {
                scannerInput: document.getElementById('awb-scanner-input'),
                scannerIndicator: document.getElementById('packing-scanner-indicator'),
                scannerZone: document.getElementById('scanner-input-zone'),
                lastScanRow: document.getElementById('scanner-last-scan'),
                lastScanValue: document.getElementById('scanner-last-value'),
                scanStatus: document.getElementById('awb-scan-status'),
                packingEmpty: document.getElementById('packing-empty'),
                packingOrder: document.getElementById('packing-order'),
                orderTitle: document.getElementById('packing-order-title'),
                customerName: document.getElementById('packing-customer-name'),
                platformPill: document.getElementById('packing-platform-pill'),
                statusPill: document.getElementById('packing-status-pill'),
                awbValue: document.getElementById('packing-awb'),
                orderIdValue: document.getElementById('packing-order-id'),
                updatedValue: document.getElementById('packing-updated'),
                progress: document.getElementById('packing-progress'),
                itemsContainer: document.getElementById('packing-items'),
                markAllButton: document.getElementById('packing-mark-all'),
                completeButton: document.getElementById('packing-complete'),
                printButton: document.getElementById('packing-print')
            };
        },

        bindEvents() {
            const input = this.dom.scannerInput;

            if (input) {
                // Primary: barcode scanner fires Enter after the barcode string
                input.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        const value = input.value.trim();
                        if (value) {
                            this._commitScan(value);
                        }
                    }
                });

                // Secondary safety net: detect rapid input characteristic of a
                // USB scanner (whole barcode arrives within ~80 ms)
                input.addEventListener('input', () => {
                    clearTimeout(this._bufferTimer);
                    this._bufferTimer = setTimeout(() => {
                        const value = input.value.trim();
                        if (value && value.length >= 4) {
                            this._commitScan(value);
                        }
                    }, 120);
                });

                // Keep focus on the scanner field whenever the packing tab is active.
                // If the user clicks somewhere else on the page, refocus after a short
                // delay (so clicks on buttons still register first).
                input.addEventListener('blur', () => {
                    if (!this.isActive) return;
                    clearTimeout(this._focusTimer);
                    this._focusTimer = setTimeout(() => {
                        if (this.isActive && document.activeElement !== input) {
                            input.focus();
                        }
                    }, 200);
                });

                // Visual feedback: scanning-active class while input is focused
                input.addEventListener('focus', () => {
                    this._setIndicator('scanning');
                });
            }

            if (this.dom.markAllButton) {
                this.dom.markAllButton.addEventListener('click', () => this.markAllPacked());
            }
            if (this.dom.completeButton) {
                this.dom.completeButton.addEventListener('click', () => this.completePacking());
            }
            if (this.dom.printButton) {
                this.dom.printButton.addEventListener('click', () => this.printPackingSlip());
            }

            // Clicking on the scanner zone always re-focuses the input
            if (this.dom.scannerZone) {
                this.dom.scannerZone.addEventListener('click', () => {
                    if (this.dom.scannerInput) this.dom.scannerInput.focus();
                });
            }
        },

        _commitScan(value) {
            clearTimeout(this._bufferTimer);
            if (this.dom.scannerInput) {
                this.dom.scannerInput.value = '';
                this.dom.scannerInput.focus();
            }
            this.handleScan(value).catch((err) => console.error(err));
        },

        _setIndicator(state) {
            const el = this.dom.scannerIndicator;
            if (!el) return;
            el.className = 'scanner-indicator';
            if (state === 'ready') {
                el.textContent = '● Ready';
                el.classList.add('ready');
            } else if (state === 'scanning') {
                el.textContent = '◉ Scanning';
                el.classList.add('scanning');
            } else if (state === 'found') {
                el.textContent = '✓ Found';
                el.classList.add('found');
                setTimeout(() => this._setIndicator('ready'), 2500);
            } else if (state === 'error') {
                el.textContent = '✗ Not Found';
                el.classList.add('err');
                setTimeout(() => this._setIndicator('ready'), 2500);
            }
        },

        _focusScannerInput() {
            if (this.dom.scannerInput && this.isActive) {
                this.dom.scannerInput.focus();
            }
        },

        activate() {
            this.isActive = true;
            this._setIndicator('ready');
            // Small delay lets the tab transition finish before focusing
            setTimeout(() => this._focusScannerInput(), 80);
        },

        deactivate() {
            this.isActive = false;
            clearTimeout(this._focusTimer);
            clearTimeout(this._bufferTimer);
            if (this.dom.scannerInput) {
                this.dom.scannerInput.blur();
                this.dom.scannerInput.value = '';
            }
        },

        setStatus(message, tone) {
            if (!this.dom.scanStatus) return;
            this.dom.scanStatus.textContent = message || '';
            this.dom.scanStatus.classList.remove('success', 'error');
            if (tone === 'success') this.dom.scanStatus.classList.add('success');
            if (tone === 'error') this.dom.scanStatus.classList.add('error');
        },

        renderEmpty() {
            if (this.dom.packingEmpty) this.dom.packingEmpty.classList.remove('hidden');
            if (this.dom.packingOrder) this.dom.packingOrder.classList.add('hidden');
        },

        renderOrder() {
            if (!this.currentOrder) {
                this.renderEmpty();
                return;
            }

            const order = this.currentOrder;
            const platform = orderUtils.derivePlatform(order);
            const platformLabelMap = {
                shopee: 'Shopee',
                lazada: 'Lazada',
                shopify: 'Shopify',
                tiktok: 'TikTok',
                b2b: 'B2B / Wholesale'
            };

            if (this.dom.packingEmpty) this.dom.packingEmpty.classList.add('hidden');
            if (this.dom.packingOrder) this.dom.packingOrder.classList.remove('hidden');

            if (this.dom.orderTitle) {
                const titleValue = order.orderId || order.id || 'Order';
                this.dom.orderTitle.textContent = `Order ${titleValue}`;
            }
            if (this.dom.customerName) {
                this.dom.customerName.textContent = orderUtils.getCustomerName(order);
            }
            if (this.dom.platformPill) {
                this.dom.platformPill.textContent = platformLabelMap[platform] || 'Unknown';
            }

            const packingStatus = order.packingStatus || 'Not Packed';
            if (this.dom.statusPill) {
                this.dom.statusPill.textContent = packingStatus;
                this.dom.statusPill.classList.remove('packed', 'pending');
                this.dom.statusPill.classList.add(packingStatus.toLowerCase() === 'packed' ? 'packed' : 'pending');
            }

            if (this.dom.awbValue) this.dom.awbValue.textContent = order.awb || order.trackingNumber || order.tracking || '-';
            if (this.dom.orderIdValue) this.dom.orderIdValue.textContent = order.orderId || order.id || '-';

            if (this.dom.updatedValue) {
                const stamp = order.packingCompletedAt || order.updated_at || order.date || '';
                const d = stamp ? new Date(stamp) : null;
                this.dom.updatedValue.textContent = d && !isNaN(d.getTime())
                    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '-';
            }

            this.items = this.buildItems(order);
            this.renderItems();
            this.updateProgress();
        },

        buildItems(order) {
            const map = new Map();

            const addItem = (name, qty, sku, image) => {
                if (!name || qty <= 0) return;
                const key = `${name}__${sku || ''}`;
                const existing = map.get(key);
                if (existing) {
                    existing.qty += qty;
                } else {
                    map.set(key, {
                        name,
                        qty,
                        sku: sku || '-',
                        image: image || orderUtils.resolveImage(name),
                        packed: false
                    });
                }
            };

            if (Array.isArray(order.lineItems)) {
                order.lineItems.forEach((line) => {
                    if (!line) return;
                    if (line.subItems && line.subItems.length > 0) {
                        line.subItems.forEach((sub) => {
                            const qty = Number(sub.requiredQty || sub.qty || 0);
                            addItem(sub.name, qty, sub.sku || line.sku, sub.image);
                        });
                    } else {
                        const qty = Number(line.orderedQty || line.qty || line.quantity || 0);
                        addItem(line.name, qty, line.sku, line.image);
                    }
                });
            }

            if (map.size === 0 && Array.isArray(order.items)) {
                order.items.forEach((item) => {
                    if (!item) return;
                    const qty = Number(item.qty || item.quantity || 0);
                    addItem(item.name, qty, item.sku, item.image);
                });
            }

            return Array.from(map.values());
        },

        renderItems() {
            if (!this.dom.itemsContainer) return;
            this.dom.itemsContainer.innerHTML = '';

            if (this.items.length === 0) {
                this.dom.itemsContainer.innerHTML = '<div class="packing-empty">No line items found for this order.</div>';
                return;
            }

            this.items.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = 'packing-item';
                row.innerHTML = `
                    <div class="packing-item-media">
                        ${item.image ? `<img src="${item.image}" alt="${orderUtils.escapeAttr(item.name)}">` : '<div class="placeholder"></div>'}
                    </div>
                    <div>
                        <div class="packing-item-name">${orderUtils.escapeHtml(orderUtils.formatDisplayName(item.name))}</div>
                        <div class="packing-item-meta">SKU: ${orderUtils.escapeHtml(item.sku)}</div>
                    </div>
                    <div class="packing-item-qty">x${item.qty}</div>
                    <label class="packing-item-check">
                        <input type="checkbox" data-index="${idx}" ${item.packed ? 'checked' : ''}>
                        Packed
                    </label>
                `;

                const checkbox = row.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.addEventListener('change', (event) => {
                        const index = parseInt(event.target.dataset.index, 10);
                        if (Number.isNaN(index) || !this.items[index]) return;
                        this.items[index].packed = event.target.checked;
                        this.updateProgress();
                    });
                }

                this.dom.itemsContainer.appendChild(row);
            });
        },

        updateProgress() {
            const total = this.items.length;
            const packed = this.items.filter((i) => i.packed).length;
            if (this.dom.progress) {
                this.dom.progress.textContent = `${packed} of ${total} packed`;
            }
            if (this.dom.completeButton) {
                this.dom.completeButton.disabled = total === 0 || packed !== total;
            }
        },

        markAllPacked() {
            this.items.forEach((item) => {
                item.packed = true;
            });
            this.renderItems();
            this.updateProgress();
        },

        async completePacking() {
            if (!this.currentOrder) return;
            const allPacked = this.items.length > 0 && this.items.every((item) => item.packed);
            if (!allPacked) {
                this.setStatus('Pack all items before completing.', 'error');
                return;
            }

            if (!window.AppDB || !window.AppDB.updateOrderData) {
                this.setStatus('Packing update service is not available.', 'error');
                return;
            }

            const packedAt = new Date().toISOString();
            const payload = {
                packingStatus: 'Packed',
                packingCompletedAt: packedAt,
                packingChecklist: this.items.map((item) => ({
                    name: item.name,
                    sku: item.sku,
                    qty: item.qty,
                    packed: item.packed
                }))
            };

            const completeBtn = this.dom.completeButton;
            const originalText = completeBtn ? completeBtn.textContent : '';
            if (completeBtn) {
                completeBtn.textContent = 'Saving...';
                completeBtn.disabled = true;
            }

            try {
                await window.AppDB.updateOrderData(this.currentOrder.id, payload);
                this.currentOrder.packingStatus = 'Packed';
                this.currentOrder.packingCompletedAt = packedAt;
                orderService.updateLocalOrder(this.currentOrder);
                if (this.dom.statusPill) {
                    this.dom.statusPill.textContent = 'Packed';
                    this.dom.statusPill.classList.remove('pending');
                    this.dom.statusPill.classList.add('packed');
                }
                if (this.dom.updatedValue) {
                    const d = new Date(packedAt);
                    this.dom.updatedValue.textContent = d.toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
                this.setStatus('Packing completed and saved.', 'success');
            } catch (err) {
                console.error(err);
                this.setStatus('Failed to update packing status.', 'error');
                if (completeBtn) completeBtn.disabled = false;
            } finally {
                if (completeBtn) completeBtn.textContent = originalText;
            }
        },

        printPackingSlip() {
            if (!this.currentOrder) return;
            const order = this.currentOrder;
            const itemsHtml = this.items.map((item) => {
                const name = orderUtils.escapeHtml(orderUtils.formatDisplayName(item.name));
                return `<tr><td>${name}</td><td>${orderUtils.escapeHtml(item.sku)}</td><td style="text-align:right;">${item.qty}</td></tr>`;
            }).join('');

            const slipHtml = `
                <html>
                <head>
                    <title>Packing Slip</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
                        h1 { font-size: 20px; margin-bottom: 8px; }
                        p { margin: 4px 0; }
                        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                        th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 4px; text-align: left; }
                        th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
                    </style>
                </head>
                <body>
                    <h1>Packing Slip</h1>
                    <p><strong>Order ID:</strong> ${orderUtils.escapeHtml(order.orderId || order.id || '-')}</p>
                    <p><strong>Airway Bill:</strong> ${orderUtils.escapeHtml(order.awb || order.trackingNumber || order.tracking || '-')}</p>
                    <p><strong>Customer:</strong> ${orderUtils.escapeHtml(orderUtils.getCustomerName(order))}</p>
                    <table>
                        <thead>
                            <tr><th>Item</th><th>SKU</th><th style="text-align:right;">Qty</th></tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                </body>
                </html>
            `;

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                this.setStatus('Popup blocked. Allow popups to print.', 'error');
                return;
            }

            printWindow.document.open();
            printWindow.document.write(slipHtml);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        },

        async handleManualSubmit() {
            // Legacy compatibility — no-op since manual input is removed.
        },

        async handleScan(rawValue) {
            const normalized = orderUtils.normalize(rawValue);
            if (!normalized) return false;

            const now = Date.now();
            if (this.lastScanValue === normalized && (now - this.lastScanAt) < 1500) {
                return true;
            }
            this.lastScanValue = normalized;
            this.lastScanAt = now;

            // Show last-scanned value in the card
            if (this.dom.lastScanRow) this.dom.lastScanRow.style.display = 'flex';
            if (this.dom.lastScanValue) this.dom.lastScanValue.textContent = rawValue;

            this.setStatus('Searching for order...', '');
            this._setIndicator('scanning');

            try {
                await orderService.load();
            } catch (err) {
                console.error(err);
                this.setStatus('Failed to load orders. Try refresh.', 'error');
                this._setIndicator('error');
                setTimeout(() => this._focusScannerInput(), 300);
                return true;
            }

            let order = orderService.findByIdentifier(normalized);   // check cache first
            if (!order) {
                // Not in cache — hit the database directly (fast indexed lookup)
                order = await window.AppDB.findOrderByBarcode(rawValue);
                if (order) {
                    // Add to local cache so subsequent scans of same AWB are instant
                    orderService.orders.push(order);
                }
            }

            this.currentOrder = order;
            this.renderOrder();
            this._setIndicator('found');
            this.setStatus(`✓ Loaded order ${order.orderId || order.id || order.awb || ''}.`, 'success');
            setTimeout(() => this._focusScannerInput(), 400);
            return true;
        },

        refreshCurrentOrder() {
            if (!this.currentOrder) return;
            const refreshed = orderService.orders.find((o) => String(o.id) === String(this.currentOrder.id));
            if (!refreshed) return;
            this.currentOrder = refreshed;
            this.renderOrder();
        }
    };

    const orderWorkbench = {
        currentWorkspace: 'batch',
        ordersChannel: null,

        init() {
            this.cacheDom();
            this.bindEvents();
            records.init();
            packing.init();
            this.setupRealtime();
        },

        cacheDom() {
            this.dom = {
                workspaceTabs: document.querySelectorAll('[data-workspace]'),
                workspaceSections: {
                    batch: document.getElementById('workspace-batch'),
                    records: document.getElementById('workspace-records'),
                    packing: document.getElementById('workspace-packing')
                },
                openRecordsBtn: document.getElementById('open-records-btn'),
                recordsRefreshBtn: document.getElementById('records-refresh-btn'),
                packingRefreshBtn: document.getElementById('packing-refresh-btn')
            };
        },

        bindEvents() {
            this.dom.workspaceTabs.forEach((btn) => {
                btn.addEventListener('click', () => this.switchWorkspace(btn.dataset.workspace));
            });

            if (this.dom.openRecordsBtn) {
                this.dom.openRecordsBtn.addEventListener('click', () => {
                    if (window.app && typeof window.app.switchView === 'function') {
                        window.app.switchView('dashboard');
                    }
                    this.switchWorkspace('records');
                });
            }

            if (this.dom.recordsRefreshBtn) {
                this.dom.recordsRefreshBtn.addEventListener('click', () => records.refreshData());
            }

            if (this.dom.packingRefreshBtn) {
                this.dom.packingRefreshBtn.addEventListener('click', async () => {
                    await orderService.refresh();
                    records.applyFilters();
                    packing.refreshCurrentOrder();
                });
            }
        },

        switchWorkspace(name) {
            if (!name || !this.dom.workspaceSections[name]) return;
            this.currentWorkspace = name;

            this.dom.workspaceTabs.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.workspace === name);
            });

            Object.entries(this.dom.workspaceSections).forEach(([key, section]) => {
                if (!section) return;
                section.classList.toggle('active', key === name);
            });

            if (name === 'packing') {
                packing.activate();
            } else {
                packing.deactivate();
            }
        },

        isPackingActive() {
            return this.currentWorkspace === 'packing';
        },

        handleAwbScan(value) {
            if (!this.isPackingActive()) return false;
            packing.handleScan(value).catch((err) => console.error(err));
            return true;
        },

        updateStagedQty(idx, val) {
            records.updateStagedQty(idx, val);
        },

        setupRealtime() {
            if (!window.AppDB || typeof window.AppDB.subscribeOrders !== 'function') return;
            let refreshTimer = null;

            this.ordersChannel = window.AppDB.subscribeOrders(() => {
                if (refreshTimer) return;
                refreshTimer = setTimeout(async () => {
                    refreshTimer = null;
                    await orderService.refresh();
                    records.applyFilters();
                    packing.refreshCurrentOrder();
                }, 800);
            });
        }
    };

    window.orderWorkbench = orderWorkbench;
    orderWorkbench.init();
});
