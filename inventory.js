/**
 * inventory.js - Stock Inventory Logic
 */
//OKAY TEST IF THIS SHIT WORTKKSKKSKRKS
document.addEventListener('DOMContentLoaded', () => {
    const app = {
        inventory: {},
        orders: [],
        defects: [],
        currentCategory: 'all',
        searchTerm: '',

        async init() {
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

        saveInventory() {
            localStorage.setItem('tkg_inventory', JSON.stringify(this.inventory));
            // Show a temporary success state on the save button
            const saveBtn = document.getElementById('save-inventory-btn');
            const originalText = saveBtn.textContent;
            saveBtn.textContent = 'Saved!';
            saveBtn.style.background = '#059669';
            setTimeout(() => {
                saveBtn.textContent = originalText;
                saveBtn.style.background = 'var(--success)';
            }, 1000);
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
                    // Accumulate all FIFO outbound/defect generic sweeps
                    negativeOffset += Math.abs(b.qty);
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
                            ${product.image ? `<img src="${product.image}" class="product-img" onerror="this.onerror=null; this.outerHTML='<div class=\'product-img\' style=\'display:flex;align-items:center;justify-content:center;font-size:1.5rem;\'>📦</div>';">` : `<div class="product-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;">📦</div>`}
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

                if (target.classList.contains('remove-batch-btn')) {
                    const expiry = target.dataset.expiry;
                    const qtyToClear = parseInt(target.dataset.qty) || 0;
                    const row = target.closest('.stock-batch');
                    const isNewRow = row && row.dataset.newRow === '1';

                    if (isNewRow && qtyToClear <= 0) {
                        row.remove();
                        return;
                    }

                    if (qtyToClear > 0) {
                        if (!confirm("Remove this exact batch tracking?")) return;
                        target.disabled = true;
                        try {
                            await AppDB.insertAdjustment(this.currentModalProduct, -qtyToClear, expiry, "Manual Batch Clear");
                            await this.loadInventory(true); // refresh data only
                            this.renderModalBatches();
                            this.updateCardStockDisplay(this.currentModalProduct);
                        } catch (err) {
                            alert("Failed to clear batch: " + err.message);
                            target.disabled = false;
                            this.renderModalBatches();
                        }
                    }
                } else if (target.classList.contains('control-btn') && !target.classList.contains('remove-batch-btn')) {
                    const expiry = target.dataset.expiry;
                    const isPlus = target.classList.contains('plus-btn');

                    target.disabled = true;
                    try {
                        if (isPlus) {
                            await AppDB.insertAdjustment(this.currentModalProduct, 1, expiry, "Manual +1 Edit");
                        } else {
                            // verify they have stock to deduct
                            const qty = parseInt(target.parentElement.querySelector('.stock-input').value) || 0;
                            if (qty > 0) {
                                await AppDB.insertAdjustment(this.currentModalProduct, -1, expiry, "Manual -1 Edit");
                            }
                        }
                        await this.loadInventory(true); // refresh data only, no full grid re-render
                        this.renderModalBatches();
                        this.updateCardStockDisplay(this.currentModalProduct);
                    } catch (err) {
                        alert("Failed to adjust stock: " + err.message);
                        this.renderModalBatches(); // reset 
                    }
                }
            });

            // Modal delegated inputs (Date Changes + Direct Stock Edit)
            document.getElementById('modal-batches-container').addEventListener('change', async (e) => {
                const target = e.target;
                if (!this.currentModalProduct) return;

                // ── Date field changed ────────────────────────────
                if (target.classList.contains('batch-date-input')) {
                    const row = target.closest('.stock-batch');
                    const isNewRow = row && row.dataset.newRow === '1';
                    const oldExp = target.dataset.oldExp;
                    const qty = parseInt(target.dataset.qty) || 0;
                    let newExp = target.value.trim();

                    // Convert DD/MM/YYYY → YYYY-MM-DD
                    const dmyMatch = newExp.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
                    if (dmyMatch) {
                        const [, dd, mm, yyyy] = dmyMatch;
                        newExp = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
                    }

                    // Validate
                    if (newExp && isNaN(new Date(newExp).getTime())) {
                        alert('Invalid date. Please use DD/MM/YYYY format (e.g. 31/12/2026).');
                        // Restore display value
                        target.value = oldExp ? (([y, m, d]) => `${d}/${m}/${y}`)(oldExp.split('-')) : '';
                        return;
                    }

                    if (isNewRow) {
                        this.updateBatchRowExpiry(row, newExp);
                        return;
                    }

                    if (oldExp !== newExp && qty > 0) {
                        if (!confirm(`Transfer ${qty} items from ${oldExp || 'No Expiry'} to ${newExp}?`)) {
                            target.value = oldExp ? (([y, m, d]) => `${d}/${m}/${y}`)(oldExp.split('-')) : '';
                            return;
                        }

                        target.disabled = true;
                        try {
                            const resolvedOldExp = (oldExp === 'No Expiry' || !oldExp) ? '' : oldExp;
                            const resolvedNewExp = (newExp === 'No Expiry' || !newExp) ? '' : newExp;

                            await AppDB.insertAdjustment(this.currentModalProduct, -qty, resolvedOldExp, 'Date Move - Remove old');
                            await AppDB.insertAdjustment(this.currentModalProduct, qty, resolvedNewExp, 'Date Move - Add new');

                            await this.loadInventory(true);
                            this.renderModalBatches();
                            this.updateCardStockDisplay(this.currentModalProduct);
                        } catch (err) {
                            alert('Failed to change date: ' + err.message);
                            target.value = oldExp ? (([y, m, d]) => `${d}/${m}/${y}`)(oldExp.split('-')) : '';
                            target.disabled = false;
                        }
                    }
                }

                // ── Stock number typed directly ───────────────────
                if (target.classList.contains('stock-input')) {
                    const row = target.closest('.stock-batch');
                    let expiry = target.dataset.expiry || '';
                    const originalQty = parseInt(target.dataset.originalQty) || 0;
                    const newQty = parseInt(target.value);

                    if (!expiry && row && row.dataset.newRow === '1') {
                        const dateInput = row.querySelector('.batch-date-input');
                        if (dateInput && dateInput.value.trim()) {
                            let raw = dateInput.value.trim();
                            const dmyMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
                            if (dmyMatch) {
                                const [, dd, mm, yyyy] = dmyMatch;
                                raw = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
                            }
                            if (raw && isNaN(new Date(raw).getTime())) {
                                alert('Invalid date. Please use DD/MM/YYYY format (e.g. 31/12/2026).');
                                return;
                            }
                            expiry = raw;
                            this.updateBatchRowExpiry(row, raw);
                        }
                    }

                    if (isNaN(newQty) || newQty < 0) {
                        target.value = originalQty;
                        return;
                    }

                    const delta = newQty - originalQty;
                    if (delta === 0) return;

                    if (!confirm(`Set stock to ${newQty} (${delta > 0 ? '+' : ''}${delta} adjustment)?`)) {
                        target.value = originalQty;
                        return;
                    }

                    target.disabled = true;
                    try {
                        await AppDB.insertAdjustment(this.currentModalProduct, delta, expiry, 'Manual Direct Edit');
                        await this.loadInventory(true);
                        this.renderModalBatches();
                        this.updateCardStockDisplay(this.currentModalProduct);
                    } catch (err) {
                        alert('Failed to update stock: ' + err.message);
                        target.value = originalQty;
                        target.disabled = false;
                    }
                }
            });

            // Save Button (Sync to cloud)
            document.getElementById('save-inventory-btn').addEventListener('click', async () => {
                // Because we send API requests dynamically, we just do a fresh pull here to guarantee sync.
                await this.loadInventory();
                this.saveInventory(); // UI Feedback
                this.renderModalBatches();
            });
        },

        openModal(productName) {
            this.currentModalProduct = productName;
            document.getElementById('modal-product-name').textContent = productName.charAt(0).toUpperCase() + productName.slice(1);
            this.renderModalBatches();
            document.getElementById('batch-modal').classList.add('active');
        },

        updateBatchRowExpiry(row, newExp) {
            if (!row) return;
            row.querySelectorAll('[data-expiry]').forEach(el => {
                el.dataset.expiry = newExp;
            });
            const dateInput = row.querySelector('.batch-date-input');
            if (dateInput) {
                dateInput.dataset.oldExp = newExp;
            }
        },

        insertEmptyBatchRow() {
            const container = document.getElementById('modal-batches-container');
            if (!container) return;

            const row = document.createElement('div');
            row.className = 'stock-batch';
            row.dataset.newRow = '1';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'flex-start';
            row.style.gap = '8px';
            row.style.paddingBottom = '12px';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            row.innerHTML = `
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <input type="text" class="batch-date-input" data-old-exp="" data-qty="0" placeholder="DD/MM/YYYY" value="">
                    <button class="control-btn remove-batch-btn" data-expiry="" data-qty="0" style="color: var(--danger); font-size: 1.25rem; font-weight: bold; background: none; margin-left: auto;">×</button>
                </div>
                <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        Live Stock: <strong style="color: var(--accent); font-size: 1.1rem;">0</strong>
                    </div>
                    <div class="stock-control mini" style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.75rem; color: var(--text-secondary); margin-right: 4px;">Adjust:</span>
                        <button class="control-btn minus-btn" data-expiry="">−</button>
                        <input type="number" class="stock-input" value="0" data-expiry="" data-original-qty="0">
                        <button class="control-btn plus-btn" data-expiry="">+</button>
                    </div>
                </div>
            `;

            container.appendChild(row);

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

            container.innerHTML = batches.map((b) => {
                const remColor = b.qty < 0 ? 'var(--danger)' : 'var(--accent)';

                return `
                    <div class="stock-batch" style="flex-direction: column; align-items: flex-start; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; justify-content: space-between; width: 100%;">
                            <input type="text" class="batch-date-input" data-old-exp="${b.expiry}" data-qty="${b.qty}" placeholder="DD/MM/YYYY" value="${b.expiry ? (([y, m, d]) => `${d}/${m}/${y}`)(b.expiry.split('-')) : ''}">
                            <button class="control-btn remove-batch-btn" data-expiry="${b.expiry}" data-qty="${b.qty}" style="color: var(--danger); font-size: 1.25rem; font-weight: bold; background: none; margin-left: auto;">×</button>
                        </div>
                        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                Live Stock: <strong style="color: ${remColor}; font-size: 1.1rem;">${b.qty}</strong>
                            </div>
                            <div class="stock-control mini" style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 0.75rem; color: var(--text-secondary); margin-right: 4px;">Adjust:</span>
                                <button class="control-btn minus-btn" data-expiry="${b.expiry}">−</button>
                                <input type="number" class="stock-input" value="${b.qty}" data-expiry="${b.expiry}" data-original-qty="${b.qty}">
                                <button class="control-btn plus-btn" data-expiry="${b.expiry}">+</button>
                            </div>
                        </div>
                    </div>
                    `;
            }).join('');

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

    };

    window._inventoryApp = app;
    app.init();
});