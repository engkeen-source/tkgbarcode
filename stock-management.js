/**
 * inventory.js - Stock Inventory Logic
 */
//OKAY TEST IF THIS SHIT WORTKKSKKSKRKS
document.addEventListener('DOMContentLoaded', () => {

    // Global image fallback — called from onerror on every product card image.
    // Defined here (not inline) to avoid JS quote-escaping issues inside HTML attributes.
    window._imgFallback = function (el) {
        el.onerror = null;
        const div = document.createElement('div');
        div.className = 'product-img';
        div.style.cssText = 'display:flex;align-items:center;justify-content:center;font-size:1.5rem;';
        div.textContent = '📦';
        el.parentNode.replaceChild(div, el);
    };

    const app = {
        inventory: {},
        orders: [],
        defects: [],
        currentCategory: 'all',
        searchTerm: '',
        batchEditorMode: 'stacked',

        async init() {
            this.batchEditorMode = document.getElementById('tab-inventory') ? 'table' : 'stacked';
            this.bindEvents();
            // Show loading state if grid exists
            const grid = document.getElementById('inventory-grid');
            if (grid) grid.innerHTML = '<div style="color:var(--text-secondary); text-align:center; grid-column:1/-1; padding:2rem;">Fetching LIVE Ledger...</div>';

            await this.loadOverrides();
            await this.loadInventory();
            this.renderCategories();
        },

        async loadOverrides() {
            try {
                // Fetch direct from the dedicated public.products database table
                const dbProducts = await window.AppDB.getProducts();
                if (dbProducts && Object.keys(dbProducts).length > 0) {
                    console.log("Loaded native DB catalog.");
                    // Merge into the global PRODUCT_CATALOG structure for the UI to digest
                    for (const [name, data] of Object.entries(dbProducts)) {

                        let found = false;
                        for (const cat in PRODUCT_CATALOG) {
                            if (PRODUCT_CATALOG[cat][name]) {
                                // Always restore local image — never allow DB/Supabase URLs, even for products with image: ""
                                const localImage = PRODUCT_CATALOG[cat][name].image;
                                PRODUCT_CATALOG[cat][name] = { ...PRODUCT_CATALOG[cat][name], ...data };
                                PRODUCT_CATALOG[cat][name].image = localImage; // always wins, even if ""
                                found = true;
                                break;
                            }
                        }

                        if (!found && data.type) {
                            // New product from Admin — add to Cloud Sync category
                            // Only use DB image if no local image exists
                            if (!PRODUCT_CATALOG["Cloud Sync"]) PRODUCT_CATALOG["Cloud Sync"] = {};
                            PRODUCT_CATALOG["Cloud Sync"][name] = data;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load native DB catalog", e);
            }
        },

        formatProductName(name) {
            return window.formatProductName ? window.formatProductName(name) : name;
        },

        formatDisplayDate(isoDate) {
            if (!isoDate) return '';
            const parts = String(isoDate).split('-');
            if (parts.length !== 3) return isoDate;
            return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        },

        parseDateInput(rawValue) {
            const value = String(rawValue || '').trim();
            if (!value) return { iso: '', display: '' };

            let yyyy;
            let mm;
            let dd;

            const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            const ymdMatch = value.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
            const dmyMatch = value.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            const digitsMatch = value.match(/^(\d{2})(\d{2})(\d{4})$/);

            if (isoMatch) {
                [, yyyy, mm, dd] = isoMatch;
            } else if (ymdMatch) {
                [, yyyy, mm, dd] = ymdMatch;
            } else if (dmyMatch) {
                [, dd, mm, yyyy] = dmyMatch;
            } else if (digitsMatch) {
                [, dd, mm, yyyy] = digitsMatch;
            } else {
                return null;
            }

            const y = parseInt(yyyy, 10);
            const m = parseInt(mm, 10);
            const d = parseInt(dd, 10);

            if (!y || !m || !d) return null;

            const date = new Date(Date.UTC(y, m - 1, d));
            if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;

            const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const display = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${String(y).padStart(4, '0')}`;
            return { iso, display };
        },

        setRowExpiry(row, isoDate, displayDate) {
            if (!row) return;
            const expiry = isoDate || '';
            row.querySelectorAll('[data-expiry]').forEach(el => {
                el.dataset.expiry = expiry;
            });

            const dateInput = row.querySelector('.batch-date-input');
            if (dateInput) {
                dateInput.dataset.oldExp = expiry;
                if (displayDate !== undefined) {
                    dateInput.value = displayDate;
                }
            }

            const datePicker = row.querySelector('.batch-date-picker');
            if (datePicker) {
                datePicker.value = expiry;
            }
        },

        resolveRowExpiry(row, existingExpiry) {
            if (existingExpiry !== undefined && existingExpiry !== null && existingExpiry !== '') return existingExpiry;
            const dateInput = row ? row.querySelector('.batch-date-input') : null;
            if (!dateInput) return '';
            const parsed = this.parseDateInput(dateInput.value);
            if (!parsed) {
                alert('Invalid date. Please use DD/MM/YYYY format (e.g. 31/12/2026).');
                return null;
            }
            this.setRowExpiry(row, parsed.iso, parsed.display);
            return parsed.iso;
        },

        getBatchHeaderMarkup() {
            return `
                <div class="batch-row batch-row--header">
                    <div class="batch-cell batch-expiry">Expiry Date</div>
                    <div class="batch-cell batch-adjust">Adjust</div>
                    <div class="batch-cell batch-remove">Remove</div>
                </div>
            `;
        },

        getBatchRowMarkup(batch, options = {}) {
            const qty = Number(batch.qty) || 0;
            const expiryIso = batch.expiry || '';
            const displayDate = this.formatDisplayDate(expiryIso);
            const isNewRow = options.isNewRow ? ' data-new-row="1"' : '';
            const isNewClass = options.isNewRow ? ' is-new' : '';

            if (this.batchEditorMode === 'table') {
                return `
                    <div class="batch-row batch-row--data${isNewClass}"${isNewRow}>
                        <div class="batch-cell batch-expiry">
                            <div class="batch-date-wrap">
                                <input type="text" class="batch-date-input" data-old-exp="${expiryIso}" data-qty="${qty}" placeholder="DD/MM/YYYY" value="${displayDate}" inputmode="numeric" autocomplete="off">
                                <button type="button" class="control-btn calendar-btn" title="Pick date">📅</button>
                                <input type="date" class="batch-date-picker" value="${expiryIso}">
                            </div>
                        </div>
                        <div class="batch-cell batch-adjust">
                            <div class="stock-control mini" style="display: flex; align-items: center; gap: 6px;">
                                <button class="control-btn minus-btn" data-expiry="${expiryIso}">−</button>
                                <input type="number" class="stock-input" value="${qty}" data-expiry="${expiryIso}" data-original-qty="${qty}" inputmode="numeric" min="0">
                                <button class="control-btn plus-btn" data-expiry="${expiryIso}">+</button>
                            </div>
                        </div>
                        <div class="batch-cell batch-remove">
                            <button class="control-btn remove-batch-btn" data-expiry="${expiryIso}" data-qty="${qty}" title="Remove batch">×</button>
                        </div>
                    </div>
                `;
            }

            // Fallback stacked layout for very small screens
            return `
                <div class="stock-batch"${isNewRow} style="flex-direction: column; align-items: flex-start; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                        <div class="batch-date-wrap">
                            <input type="text" class="batch-date-input" data-old-exp="${expiryIso}" data-qty="${qty}" placeholder="DD/MM/YYYY" value="${displayDate}" inputmode="numeric" autocomplete="off">
                            <button type="button" class="control-btn calendar-btn" title="Pick date">📅</button>
                            <input type="date" class="batch-date-picker" value="${expiryIso}">
                        </div>
                        <button class="control-btn remove-batch-btn" data-expiry="${expiryIso}" data-qty="${qty}" style="color: var(--danger); font-size: 1.25rem; font-weight: bold; background: none; margin-left: auto;">×</button>
                    </div>
                    <div style="display: flex; justify-content: flex-end; width: 100%; align-items: center;">
                        <div class="stock-control mini" style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.75rem; color: var(--text-secondary); margin-right: 4px;">Qty:</span>
                            <button class="control-btn minus-btn" data-expiry="${expiryIso}">−</button>
                            <input type="number" class="stock-input" value="${qty}" data-expiry="${expiryIso}" data-original-qty="${qty}" inputmode="numeric" min="0">
                            <button class="control-btn plus-btn" data-expiry="${expiryIso}">+</button>
                        </div>
                    </div>
                </div>
            `;
        },

        async loadInventory(skipRender = false) {
            // Load live ledger from Supabase API
            try {
                this.inventory = await window.AppDB.getLiveInventory();
            } catch (e) {
                console.error("Failed to load live inventory from Supabase:", e);
                this.inventory = {};
            }
            if (!skipRender) this.renderProducts();
        },

        // Surgically update a single card's stock numbers WITHOUT rebuilding the grid
        // (avoids all <img> tags being recreated and flashing)
        updateCardStockDisplay(productName) {
            if (!productName) return;
            const infoDiv = document.querySelector(`.product-info[data-product="${productName}"]`);
            if (!infoDiv) return;
            const card = infoDiv.closest('.inventory-card');
            if (!card) return;

            const computedBatches = this.getComputedBatches(productName);
            const stock = computedBatches.reduce((sum, b) => sum + b.computedQty, 0);
            const isLow = stock < 10;

            // Update low-stock card styling
            card.classList.toggle('low-stock', isLow);

            // Update total stock number
            const stockDisplay = card.querySelector('.total-stock-display');
            if (stockDisplay) stockDisplay.innerHTML = `Total: <strong>${stock}</strong>`;

            // Update LOW badge inside product name (add/remove only)
            const nameEl = card.querySelector('.product-name');
            if (nameEl) {
                const existingBadge = nameEl.querySelector('.low-stock-badge');
                if (isLow && !existingBadge) {
                    nameEl.insertAdjacentHTML('beforeend', '<span class="low-stock-badge">LOW</span>');
                } else if (!isLow && existingBadge) {
                    existingBadge.remove();
                }
            }

            // Rebuild only the batch pills row (no img involved)
            const existingBatchList = card.querySelector('.card-batches-list');
            const validBatches = computedBatches.filter(b => b.computedQty !== 0 || b.expiry);
            if (validBatches.length > 0) {
                const batchItems = validBatches.map(b => {
                    const dateStr = b.expiry && b.expiry !== 'No Expiry'
                        ? new Date(b.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'No Date';
                    const isNeg = b.computedQty < 0;
                    return `<div class="batch-pill ${isNeg ? 'neg-stock' : ''}"><span class="batch-date">${dateStr}</span><span class="batch-qty" style="${isNeg ? 'color:var(--danger);font-weight:700;' : ''}">${b.computedQty}</span></div>`;
                }).join('');

                if (existingBatchList) {
                    existingBatchList.innerHTML = batchItems;
                } else {
                    const newList = document.createElement('div');
                    newList.className = 'card-batches-list';
                    newList.dataset.product = productName;
                    newList.innerHTML = batchItems;
                    card.appendChild(newList);
                }
            } else if (existingBatchList) {
                existingBatchList.remove();
            }
        },


        renderCategories() {
            const tabsContainer = document.getElementById('category-tabs');
            const categories = Object.keys(PRODUCT_CATALOG);

            categories.forEach(cat => {
                // Check if this category has AT LEAST ONE "single" item
                const hasSingles = Object.values(PRODUCT_CATALOG[cat]).some(p => p.type === 'single');
                if (!hasSingles || cat === "Aliases" || cat === "Merchandise") return; // Skip these completely

                const tab = document.createElement('div');
                tab.className = 'category-tab';
                tab.dataset.cat = cat;
                tab.textContent = cat;
                tab.onclick = () => {
                    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentCategory = cat;
                    this.renderProducts();
                };
                tabsContainer.appendChild(tab);
            });

            // "All Items" handler
            document.querySelector('[data-cat="all"]').onclick = () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-cat="all"]').classList.add('active');
                this.currentCategory = 'all';
                this.renderProducts();
            };
        },

        getComputedBatches(productName) {
            const rawBatches = this.inventory[productName] || [];

            let positiveBatches = [];
            let negativeOffset = 0;

            rawBatches.forEach(b => {
                if (b.qty > 0) {
                    positiveBatches.push({ expiry: b.expiry, qty: b.qty });
                } else if (b.qty < 0) {
                    // Only FIFO-sweep deductions that have NO expiry recorded.
                    // Expiry-specific negatives are already baked into the per-batch qty
                    // by getLiveInventory() — sweeping them again causes double-deduction.
                    if (!b.expiry) {
                        negativeOffset += Math.abs(b.qty);
                    }
                }
            });

            // Sort positive logically (earliest first, blanks at end)
            positiveBatches.sort((a, b) => {
                if (!a.expiry && !b.expiry) return 0;
                if (!a.expiry) return 1;
                if (!b.expiry) return -1;
                return new Date(a.expiry) - new Date(b.expiry);
            });

            // FIFO Sweep Negatives across Positives
            for (let i = 0; i < positiveBatches.length; i++) {
                if (negativeOffset <= 0) break;
                const b = positiveBatches[i];
                if (b.qty >= negativeOffset) {
                    b.qty -= negativeOffset;
                    negativeOffset = 0;
                } else {
                    negativeOffset -= b.qty;
                    b.qty = 0;
                }
            }

            // Map to standard output expected by UI
            const finalBatches = positiveBatches.map(b => ({
                expiry: b.expiry || "No Expiry",
                computedQty: b.qty
            })).filter(b => b.computedQty > 0 || b.expiry === "No Expiry");

            if (negativeOffset > 0) {
                const target = finalBatches.find(b => b.expiry === "No Expiry");
                // Do NOT push negative offsets to the UI, clamp to 0 matching old system
                if (!target && finalBatches.length === 0) {
                    finalBatches.push({ expiry: "No Expiry", computedQty: 0 });
                }
            }

            return finalBatches.length > 0 ? finalBatches : [{ expiry: "No Expiry", computedQty: 0 }];
        },

        renderProducts() {
            const grid = document.getElementById('inventory-grid');
            grid.innerHTML = '';

            for (const category in PRODUCT_CATALOG) {
                if (category === "Aliases" || category === "Merchandise") continue;
                if (this.currentCategory !== 'all' && this.currentCategory !== category) continue;

                for (const productName in PRODUCT_CATALOG[category]) {
                    const product = PRODUCT_CATALOG[category][productName];

                    // NEW: We only want to track inventory for base SKUs, not bundles/giftboxes
                    if (product.type !== 'single') continue;

                    // Filter by search
                    if (this.searchTerm && !productName.toLowerCase().includes(this.searchTerm.toLowerCase())) continue;

                    const computedBatches = this.getComputedBatches(productName);

                    const stock = computedBatches.reduce((sum, b) => sum + b.computedQty, 0);
                    const isLow = stock < 10; // Threshold for low stock

                    const card = document.createElement('div');
                    card.className = `inventory-card ${isLow ? 'low-stock' : ''}`;

                    let batchesDisplay = '';
                    const validBatches = computedBatches.filter(b => b.computedQty !== 0 || b.expiry);
                    if (validBatches.length > 0) {
                        const batchItems = validBatches.map(b => {
                            const dateStr = b.expiry && b.expiry !== "No Expiry" ? new Date(b.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No Date';
                            const isNeg = b.computedQty < 0;
                            return `<div class="batch-pill ${isNeg ? 'neg-stock' : ''}"><span class="batch-date">${dateStr}</span><span class="batch-qty" style="${isNeg ? 'color:var(--danger);font-weight:700;' : ''}">${b.computedQty}</span></div>`;
                        }).join('');
                        if (batchItems) {
                            batchesDisplay = `<div class="card-batches-list" data-product="${productName}">${batchItems}</div>`;
                        }
                    }

                    card.innerHTML = `
                        <div class="product-info" data-product="${productName}">
                            ${product.image ? `<img src="${product.image}" class="product-img" onerror="_imgFallback(this)">` : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">📦</div>`}
                            <div class="product-details">
                                <div class="product-name">
                                    ${this.formatProductName(productName)}
                                    ${isLow ? '<span class="low-stock-badge">LOW</span>' : ''}
                                </div>
                                <div class="product-type">${product.type || 'single'}</div>
                            </div>
                            <div class="total-stock-display">Total: <strong>${stock}</strong></div>
                        </div>
                        ${batchesDisplay}
                    `;

                    grid.appendChild(card);
                }
            }

            if (grid.innerHTML === '') {
                grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 4rem 2rem; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
                    <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">📦</div>
                    <h3 style="color: var(--text-primary); margin-bottom: 0.5rem; font-size: 1.25rem;">No products found</h3>
                    <p style="color: var(--text-secondary); margin: 0;">Try adjusting your search or selecting a different category.</p>
                </div>`;
            }
        },

        bindEvents() {
            // Search
            document.getElementById('inventory-search').addEventListener('input', (e) => {
                this.searchTerm = e.target.value;
                this.renderProducts();
            });

            // Grid delegated clicks (Open Modal)
            document.getElementById('inventory-grid').addEventListener('click', (e) => {
                const target = e.target;
                const clickable = target.closest('.product-info') || target.closest('.card-batches-list');
                if (clickable) {
                    const productName = clickable.dataset.product;
                    if (productName) {
                        this.openModal(productName);
                    }
                }
            });

            // --- Modal Events ---
            const modal = document.getElementById('batch-modal');
            const closeBtn = document.getElementById('close-modal-btn');

            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                this.currentModalProduct = null;
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                    this.currentModalProduct = null;
                }
            });

            // Modal: Add Batch
            document.getElementById('modal-add-batch-btn').addEventListener('click', () => {
                if (!this.currentModalProduct) return;
                this.insertEmptyBatchRow();
            });

            // Modal delegated clicks (Plus/Minus/Remove)
            document.getElementById('modal-batches-container').addEventListener('click', async (e) => {
                const target = e.target;
                if (!this.currentModalProduct) return;

                if (target.classList.contains('calendar-btn')) {
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    const picker = row ? row.querySelector('.batch-date-picker') : null;
                    if (picker) {
                        if (picker.showPicker) {
                            picker.showPicker();
                        } else {
                            picker.focus();
                            picker.click();
                        }
                    }
                    return;
                }

                if (target.classList.contains('remove-batch-btn')) {
                    const expiry = target.dataset.expiry;
                    const qtyToClear = parseInt(target.dataset.qty) || 0;
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    const isNewRow = row && row.dataset.newRow === '1';

                    if (isNewRow && qtyToClear <= 0) {
                        row.remove();
                        return;
                    }

                    if (qtyToClear > 0) {
                        this.showRemoveBatchPopup({
                            productName: this.currentModalProduct,
                            expiry,
                            qtyToClear,
                            triggerBtn: target
                        });
                    }
                } else if (target.classList.contains('control-btn') && !target.classList.contains('remove-batch-btn')) {
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    let expiry = target.dataset.expiry || '';
                    const isPlus = target.classList.contains('plus-btn');

                    const resolved = this.resolveRowExpiry(row, expiry);
                    if (resolved === null) return;
                    expiry = resolved;

                    const liveBatches = this.inventory[this.currentModalProduct] || [];
                    const liveBatch = liveBatches.find(b => (b.expiry || '') === (expiry || ''));
                    const liveQty = liveBatch ? liveBatch.qty : 0;

                    if (isPlus) {
                        this.showAdjustPopup({
                            productName: this.currentModalProduct,
                            expiry,
                            isAddition: true,
                            currentQty: liveQty,
                            triggerBtn: target
                        });
                    } else {
                        if (liveQty <= 0) return;
                        this.showAdjustPopup({
                            productName: this.currentModalProduct,
                            expiry,
                            isAddition: false,
                            currentQty: liveQty,
                            triggerBtn: target
                        });
                    }
                }
            });

            // Modal delegated inputs (Date + Qty Changes)
            document.getElementById('modal-batches-container').addEventListener('change', async (e) => {
                const target = e.target;
                if (!this.currentModalProduct) return;

                if (target.classList.contains('batch-date-picker')) {
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    const textInput = row ? row.querySelector('.batch-date-input') : null;
                    if (textInput) {
                        textInput.value = this.formatDisplayDate(target.value);
                        textInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    return;
                }

                if (target.classList.contains('batch-date-input')) {
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    const isNewRow = row && row.dataset.newRow === '1';
                    const oldExp = target.dataset.oldExp || '';
                    const qty = parseInt(target.dataset.qty, 10) || 0;
                    const parsed = this.parseDateInput(target.value);

                    if (!parsed) {
                        alert('Invalid date. Please use DD/MM/YYYY format (e.g. 31/12/2026).');
                        target.value = this.formatDisplayDate(oldExp);
                        return;
                    }

                    const newExp = parsed.iso;
                    target.value = parsed.display;

                    if (isNewRow) {
                        this.setRowExpiry(row, newExp, parsed.display);
                        return;
                    }

                    if (oldExp !== newExp && qty > 0) {
                        if (!confirm(`Transfer ${qty} items from ${oldExp || "No Expiry"} to ${newExp || "No Expiry"}?`)) {
                            target.value = this.formatDisplayDate(oldExp); // revert UI
                            return;
                        }

                        target.disabled = true;
                        try {
                            const resolvedOldExp = (oldExp === "No Expiry" || !oldExp) ? "" : oldExp;
                            const resolvedNewExp = (newExp === "No Expiry" || !newExp) ? "" : newExp;

                            await AppDB.insertAdjustment(this.currentModalProduct, -qty, resolvedOldExp, "Date Move - Remove old");
                            await AppDB.insertAdjustment(this.currentModalProduct, qty, resolvedNewExp, "Date Move - Add new");

                            await this.loadInventory(true); // refresh data only
                            this.renderModalBatches();
                            this.updateCardStockDisplay(this.currentModalProduct);
                        } catch (err) {
                            alert("Failed to change date: " + err.message);
                            target.value = this.formatDisplayDate(oldExp); // revert UI
                            target.disabled = false;
                        }
                    } else if (oldExp !== newExp && qty <= 0) {
                        this.setRowExpiry(row, newExp, parsed.display);
                    }
                }

                if (target.classList.contains('stock-input')) {
                    const row = target.closest('.batch-row') || target.closest('.stock-batch');
                    let expiry = target.dataset.expiry || '';
                    const originalQty = parseInt(target.dataset.originalQty, 10) || 0;
                    const newQty = parseInt(target.value, 10);

                    if (isNaN(newQty) || newQty < 0) {
                        target.value = originalQty;
                        return;
                    }

                    const delta = newQty - originalQty;
                    if (delta === 0) return;

                    if (!expiry) {
                        const resolved = this.resolveRowExpiry(row, expiry);
                        if (resolved === null) {
                            target.value = originalQty;
                            return;
                        }
                        expiry = resolved;
                    }

                    this.showAdjustPopup({
                        productName: this.currentModalProduct,
                        expiry,
                        isAddition: delta > 0,
                        currentQty: parseInt(target.dataset.originalQty) || 0,
                        delta: Math.abs(delta),
                        triggerBtn: target,
                        onCancel: () => { target.value = originalQty; }
                    });
                }
            });

            document.getElementById('modal-batches-container').addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                if (e.target.classList.contains('batch-date-input') || e.target.classList.contains('stock-input')) {
                    e.preventDefault();
                    e.target.blur();
                }
            });

        },

        openModal(productName) {
            this.currentModalProduct = productName;
            document.getElementById('modal-product-name').textContent = productName.charAt(0).toUpperCase() + productName.slice(1);
            this.renderModalBatches();
            document.getElementById('batch-modal').classList.add('active');
        },

        insertEmptyBatchRow() {
            const container = document.getElementById('modal-batches-container');
            if (!container) return;

            const markup = this.getBatchRowMarkup({ expiry: '', qty: 0 }, { isNewRow: true });
            const wrapper = document.createElement('div');
            wrapper.innerHTML = markup.trim();
            const row = wrapper.firstElementChild;
            if (!row) return;

            if (this.batchEditorMode === 'table') {
                let table = container.querySelector('.batch-table');
                if (!table) {
                    container.innerHTML = `<div class="batch-table">${this.getBatchHeaderMarkup()}</div>`;
                    table = container.querySelector('.batch-table');
                }
                table.appendChild(row);
            } else {
                container.appendChild(row);
            }

            const input = row.querySelector('.batch-date-input');
            if (input) input.focus();
        },

        renderModalBatches() {
            if (!this.currentModalProduct) return;

            document.getElementById('modal-product-name').textContent = this.formatProductName(this.currentModalProduct);
            const container = document.getElementById('modal-batches-container');

            // Revert back to displaying the mathematically swept FIFO stock, strictly clamped.
            // This prevents messy ledger aggregations (e -10 unlinked outbounds) from showing in the UI.
            let batches = this.getComputedBatches(this.currentModalProduct);

            if (batches.length === 0) {
                batches.push({ expiry: "No Expiry", computedQty: 0 });
            }

            // Map computedQty to qty for the DOM renderer
            batches = batches.map(b => ({ expiry: b.expiry === "No Expiry" ? "" : b.expiry, qty: b.computedQty }));

            const rowsMarkup = batches.map((b) => this.getBatchRowMarkup(b)).join('');

            if (this.batchEditorMode === 'table') {
                container.innerHTML = `
                    <div class="batch-table">
                        ${this.getBatchHeaderMarkup()}
                        ${rowsMarkup}
                    </div>
                `;
            } else {
                container.innerHTML = rowsMarkup;
            }

            // Dynamic Details
            const infoDiv = document.getElementById('modal-dynamic-info');
            if (infoDiv) {
                // Calculate from raw ledger to show the exact audit trail
                const rawBatches = this.inventory[this.currentModalProduct] || [];
                const inboundStock = rawBatches.reduce((sum, b) => b.qty > 0 ? sum + parseInt(b.qty) : sum, 0);
                const outboundStock = rawBatches.reduce((sum, b) => b.qty < 0 ? sum + Math.abs(parseInt(b.qty)) : sum, 0);

                const currentStock = batches.reduce((sum, b) => sum + b.qty, 0);

                infoDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span>Gross Inbound Scans:</span> <strong>${inboundStock}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: #a855f7;">
                        <span>Total Cloud Deductions (Orders/Defects):</span> <strong>-${outboundStock}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 8px; font-weight: bold; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; color: var(--text-primary);">
                        <span>Live Clamped Stock:</span> <span>${currentStock}</span>
                    </div>
                `;
            }
        },

        showRemoveBatchPopup({ productName, expiry, qtyToClear, triggerBtn }) {
            const existing = document.getElementById('remove-batch-popup-overlay');
            if (existing) existing.remove();

            const displayExpiry = expiry
                ? new Date(expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'No expiry date';

            const overlay = document.createElement('div');
            overlay.id = 'remove-batch-popup-overlay';
            overlay.innerHTML = `
                <div id="remove-batch-popup">
                    <div class="rbp-header">
                        <div class="rbp-icon">⚠️</div>
                        <div>
                            <div class="rbp-title">Remove Batch Stock</div>
                            <div class="rbp-subtitle">${productName}</div>
                        </div>
                    </div>
                    <div class="rbp-info-row">
                        <div class="rbp-info-box">
                            <div class="rbp-info-label">Batch Expiry</div>
                            <div class="rbp-info-val">${displayExpiry}</div>
                        </div>
                        <div class="rbp-info-box">
                            <div class="rbp-info-label">Units to Remove</div>
                            <div class="rbp-info-val rbp-qty">${qtyToClear}</div>
                        </div>
                    </div>
                    <div class="rbp-field">
                        <label class="rbp-label">Reason for Removal <span style="color:#ef4444;">*</span></label>
                        <div class="rbp-reason-grid">
                            <button class="rbp-reason-btn" data-reason="Expired Stock">🗓️ Expired Stock</button>
                            <button class="rbp-reason-btn" data-reason="Damaged / Defective">💥 Damaged / Defective</button>
                            <button class="rbp-reason-btn" data-reason="Stock Count Correction">📋 Stock Count Correction</button>
                            <button class="rbp-reason-btn" data-reason="Sent as Sample">🎁 Sent as Sample</button>
                            <button class="rbp-reason-btn" data-reason="Lost / Missing">❓ Lost / Missing</button>
                            <button class="rbp-reason-btn" data-reason="Other">✏️ Other</button>
                        </div>
                    </div>
                    <div class="rbp-field" id="rbp-custom-wrap" style="display:none;">
                        <label class="rbp-label">Specify reason</label>
                        <input type="text" id="rbp-custom-input" class="rbp-input" placeholder="Type your reason here..." maxlength="120">
                    </div>
                    <div class="rbp-field">
                        <label class="rbp-label">Transaction Type</label>
                        <div class="rbp-type-grid">
                            <label class="rbp-type-opt">
                                <input type="radio" name="rbp-type" value="MANUAL_DEDUCT" checked>
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">🗂️</span>
                                    <span><strong>Stock Adjustment</strong><small>Correction, expired, damaged, sample</small></span>
                                </span>
                            </label>
                            <label class="rbp-type-opt">
                                <input type="radio" name="rbp-type" value="OUTBOUND">
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">📦</span>
                                    <span><strong>Outbound / Fulfilled</strong><small>Manually fulfilled order or dispatch</small></span>
                                </span>
                            </label>
                            <label class="rbp-type-opt">
                                <input type="radio" name="rbp-type" value="DEFECT">
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">⚠️</span>
                                    <span><strong>Defect / Write-off</strong><small>Permanently unusable stock</small></span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div class="rbp-actions">
                        <button id="rbp-cancel-btn" class="rbp-btn rbp-btn-cancel">Cancel</button>
                        <button id="rbp-confirm-btn" class="rbp-btn rbp-btn-confirm" disabled>Confirm Remove</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            let selectedReason = '';
            const confirmBtn = overlay.querySelector('#rbp-confirm-btn');
            const customWrap = overlay.querySelector('#rbp-custom-wrap');
            const customInput = overlay.querySelector('#rbp-custom-input');
            const reasonBtns = overlay.querySelectorAll('.rbp-reason-btn');

            const updateConfirmState = () => {
                const reason = selectedReason === 'Other' ? customInput.value.trim() : selectedReason;
                confirmBtn.disabled = !reason;
                confirmBtn.textContent = reason ? `Confirm Remove — ${reason}` : 'Confirm Remove';
            };

            reasonBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    reasonBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedReason = btn.dataset.reason;
                    customWrap.style.display = selectedReason === 'Other' ? 'block' : 'none';
                    if (selectedReason !== 'Other') customInput.value = '';
                    updateConfirmState();
                });
            });

            customInput.addEventListener('input', updateConfirmState);
            overlay.querySelector('#rbp-cancel-btn').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            confirmBtn.addEventListener('click', async () => {
                const finalReason = selectedReason === 'Other' ? customInput.value.trim() : selectedReason;
                const transactionType = overlay.querySelector('input[name="rbp-type"]:checked').value;
                if (!finalReason) return;

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Removing...';
                triggerBtn.disabled = true;

                try {
                    await AppDB.insertAdjustmentTyped(productName, -qtyToClear, expiry, finalReason, transactionType);
                    overlay.remove();
                    await this.loadInventory(true);
                    this.renderModalBatches();
                    this.updateCardStockDisplay(productName);
                } catch (err) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm Remove';
                    triggerBtn.disabled = false;
                    alert('Failed to remove batch: ' + err.message);
                }
            });
        },

        showAdjustPopup({ productName, expiry, isAddition, currentQty, delta = 1, triggerBtn, onCancel }) {
            const existing = document.getElementById('adjust-popup-overlay');
            if (existing) existing.remove();

            const displayExpiry = expiry
                ? new Date(expiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'No expiry date';

            const overlay = document.createElement('div');
            overlay.id = 'adjust-popup-overlay';
            overlay.style.cssText = `
                position:fixed; inset:0; background:rgba(0,0,0,0.7);
                display:flex; align-items:center; justify-content:center;
                z-index:9999; padding:1rem; backdrop-filter:blur(4px);
                animation: rbpFadeIn 0.15s ease;
            `;

            const actionLabel = isAddition ? 'Add Stock' : 'Deduct Stock';
            const actionIcon = isAddition ? '➕' : '➖';
            const actionColor = isAddition ? '#10b981' : '#ef4444';

            overlay.innerHTML = `
                <div style="
                    background:var(--bg-card, #1e293b);
                    border:1px solid rgba(255,255,255,0.1);
                    border-radius:16px; padding:1.5rem;
                    width:100%; max-width:440px;
                    max-height:90vh; overflow-y:auto;
                    animation: rbpSlideUp 0.2s ease;
                ">
                    <div class="rbp-header">
                        <div class="rbp-icon">${actionIcon}</div>
                        <div>
                            <div class="rbp-title">${actionLabel}</div>
                            <div class="rbp-subtitle">${productName}</div>
                        </div>
                    </div>

                    <div class="rbp-info-row">
                        <div class="rbp-info-box">
                            <div class="rbp-info-label">Batch Expiry</div>
                            <div class="rbp-info-val">${displayExpiry}</div>
                        </div>
                        <div class="rbp-info-box">
                            <div class="rbp-info-label">Current Stock</div>
                            <div class="rbp-info-val" style="color:#3b82f6;">${currentQty}</div>
                        </div>
                    </div>

                    <div class="rbp-field">
                        <label class="rbp-label">Quantity to ${isAddition ? 'Add' : 'Deduct'} <span style="color:#ef4444;">*</span></label>
                        <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem;">
                            <button id="adj-minus-btn" style="
                                width:36px; height:36px; border-radius:8px; border:none;
                                background:rgba(255,255,255,0.08); color:white;
                                font-size:1.2rem; cursor:pointer;
                            ">−</button>
                            <input type="number" id="adj-qty-input" value="${delta}" min="1" style="
                                width:80px; text-align:center; padding:0.5rem;
                                border-radius:8px; border:1px solid rgba(255,255,255,0.15);
                                background:rgba(255,255,255,0.05); color:white;
                                font-size:1.1rem; font-weight:700;
                            ">
                            <button id="adj-plus-btn" style="
                                width:36px; height:36px; border-radius:8px; border:none;
                                background:rgba(255,255,255,0.08); color:white;
                                font-size:1.2rem; cursor:pointer;
                            ">+</button>
                            <span style="font-size:0.85rem; color:var(--text-secondary);">units</span>
                        </div>
                        <div id="adj-stock-preview" style="margin-top:0.5rem; font-size:0.82rem; color:var(--text-secondary);">
                            Stock after ${isAddition ? 'addition' : 'deduction'}:
                            <strong style="color:${actionColor};">${isAddition ? currentQty + delta : Math.max(0, currentQty - delta)}</strong>
                        </div>
                    </div>

                    <div class="rbp-field">
                        <label class="rbp-label">Reason <span style="color:#ef4444;">*</span></label>
                        <div class="rbp-reason-grid">
                            ${isAddition ? `
                                <button class="rbp-reason-btn" data-reason="Stock Count Correction">📋 Stock Count Correction</button>
                                <button class="rbp-reason-btn" data-reason="Returned Stock">🔄 Returned Stock</button>
                                <button class="rbp-reason-btn" data-reason="Found / Located">🔍 Found / Located</button>
                                <button class="rbp-reason-btn" data-reason="Other">✏️ Other</button>
                            ` : `
                                <button class="rbp-reason-btn" data-reason="Expired Stock">🗓️ Expired Stock</button>
                                <button class="rbp-reason-btn" data-reason="Damaged / Defective">💥 Damaged / Defective</button>
                                <button class="rbp-reason-btn" data-reason="Stock Count Correction">📋 Stock Count Correction</button>
                                <button class="rbp-reason-btn" data-reason="Sent as Sample">🎁 Sent as Sample</button>
                                <button class="rbp-reason-btn" data-reason="Lost / Missing">❓ Lost / Missing</button>
                                <button class="rbp-reason-btn" data-reason="Other">✏️ Other</button>
                            `}
                        </div>
                    </div>

                    <div class="rbp-field" id="adj-custom-wrap" style="display:none;">
                        <label class="rbp-label">Specify reason</label>
                        <input type="text" id="adj-custom-input" class="rbp-input"
                            placeholder="Type your reason here..." maxlength="120">
                    </div>

                    ${!isAddition ? `
                    <div class="rbp-field">
                        <label class="rbp-label">Transaction Type</label>
                        <div class="rbp-type-grid">
                            <label class="rbp-type-opt">
                                <input type="radio" name="adj-type" value="MANUAL_DEDUCT" checked>
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">🗂️</span>
                                    <span><strong>Stock Adjustment</strong><small>Correction, expired, damaged, sample</small></span>
                                </span>
                            </label>
                            <label class="rbp-type-opt">
                                <input type="radio" name="adj-type" value="OUTBOUND">
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">📦</span>
                                    <span><strong>Outbound / Fulfilled</strong><small>Manually fulfilled order or dispatch</small></span>
                                </span>
                            </label>
                            <label class="rbp-type-opt">
                                <input type="radio" name="adj-type" value="DEFECT">
                                <span class="rbp-type-label">
                                    <span class="rbp-type-icon">⚠️</span>
                                    <span><strong>Defect / Write-off</strong><small>Permanently unusable stock</small></span>
                                </span>
                            </label>
                        </div>
                    </div>
                    ` : ''}

                    <div class="rbp-actions">
                        <button id="adj-cancel-btn" class="rbp-btn rbp-btn-cancel">Cancel</button>
                        <button id="adj-confirm-btn" class="rbp-btn rbp-btn-confirm" disabled
                            style="background:${actionColor};">
                            Confirm ${actionLabel}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            let selectedReason = '';
            const qtyInput = overlay.querySelector('#adj-qty-input');
            const preview = overlay.querySelector('#adj-stock-preview');
            const confirmBtn = overlay.querySelector('#adj-confirm-btn');
            const customWrap = overlay.querySelector('#adj-custom-wrap');
            const customInput = overlay.querySelector('#adj-custom-input');
            const reasonBtns = overlay.querySelectorAll('.rbp-reason-btn');

            const updatePreview = () => {
                const qty = Math.max(1, parseInt(qtyInput.value) || 1);
                if (isAddition) {
                    preview.innerHTML = `Stock after addition: <strong style="color:#10b981;">${currentQty + qty}</strong>`;
                } else {
                    preview.innerHTML = `Stock after deduction: <strong style="color:#ef4444;">${Math.max(0, currentQty - qty)}</strong>`;
                }
            };

            const updateConfirm = () => {
                const reason = selectedReason === 'Other'
                    ? (customInput ? customInput.value.trim() : '')
                    : selectedReason;
                confirmBtn.disabled = !reason;
                confirmBtn.textContent = reason
                    ? `Confirm ${actionLabel} — ${reason}`
                    : `Confirm ${actionLabel}`;
            };

            overlay.querySelector('#adj-minus-btn').addEventListener('click', () => {
                qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 1) - 1);
                updatePreview();
                updateConfirm();
            });

            overlay.querySelector('#adj-plus-btn').addEventListener('click', () => {
                const max = isAddition ? 99999 : currentQty;
                qtyInput.value = Math.min(max, (parseInt(qtyInput.value) || 1) + 1);
                updatePreview();
                updateConfirm();
            });

            qtyInput.addEventListener('input', () => { updatePreview(); updateConfirm(); });

            reasonBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    reasonBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedReason = btn.dataset.reason;
                    if (customWrap) customWrap.style.display = selectedReason === 'Other' ? 'block' : 'none';
                    if (customInput && selectedReason !== 'Other') customInput.value = '';
                    updateConfirm();
                });
            });

            if (customInput) customInput.addEventListener('input', updateConfirm);

            overlay.querySelector('#adj-cancel-btn').addEventListener('click', () => {
                overlay.remove();
                if (onCancel) onCancel();
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    if (onCancel) onCancel();
                }
            });

            confirmBtn.addEventListener('click', async () => {
                const finalReason = selectedReason === 'Other'
                    ? (customInput ? customInput.value.trim() : '')
                    : selectedReason;
                const qty = Math.max(1, parseInt(qtyInput.value) || 1);
                const transactionType = isAddition
                    ? 'ADJUSTMENT'
                    : (overlay.querySelector('input[name="adj-type"]:checked')?.value || 'MANUAL_DEDUCT');

                if (!finalReason) return;

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Saving...';
                if (triggerBtn) triggerBtn.disabled = true;

                try {
                    if (isAddition) {
                        await AppDB.insertAdjustment(productName, qty, expiry, finalReason);
                    } else {
                        await AppDB.insertAdjustmentTyped(productName, -qty, expiry, finalReason, transactionType);
                    }
                    overlay.remove();
                    await this.loadInventory(true);
                    this.renderModalBatches();
                    this.updateCardStockDisplay(productName);
                } catch (err) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = `Confirm ${actionLabel}`;
                    if (triggerBtn) triggerBtn.disabled = false;
                    alert('Failed to adjust stock: ' + err.message);
                }
            });
        },

    };

    window._inventoryApp = app;
    app.init();
});