/* script.js */
// ---------------------------------------------------------
// CONFIGURATION: Paste your SheetDB or Webhook URL here to Automate Sync
const AUTO_SYNC_URL = "https://sheetdb.io/api/v1/bfzfmwnisrhmo";
const SHEET_TAB_NAME = "DAMIENBARCODEEXPERIMENT"; // leave empty for first tab, or e.g. "Sheet1"
// Example: "https://sheetdb.io/api/v1/58f6..."
// ---------------------------------------------------------

const app = {
    state: {
        orders: [],
        currentOrder: null,
        scanHistory: [],
        missingItems: [],
        shopifyTempItems: []
    },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        await this.loadOverrides(); // LOAD custom product data
        await this.loadState(); // LOAD persisted state
        // Run audit to check for missing barcodes
        this.auditProductDatabase();
    },

    async loadOverrides() {
        try {
            const dbProducts = await window.AppDB.getProducts();
            if (dbProducts && Object.keys(dbProducts).length > 0) {
                this.localProducts = dbProducts;
                console.log("Loaded " + Object.keys(this.localProducts).length + " native DB catalog products.");

                // Merge into PRODUCT_DB and BUNDLE_DB for easier resolution
                for (const [name, data] of Object.entries(this.localProducts)) {
                    if (!data) continue;

                    // New DB format: {type, barcodes, contents, image, baseProduct, requireInnerScan}
                    if (data.barcodes && data.barcodes.length > 0) {
                        if (typeof PRODUCT_DB !== 'undefined') PRODUCT_DB[name] = data.barcodes;
                    }
                    if (data.contents && data.contents.length > 0) {
                        if (typeof BUNDLE_DB !== 'undefined') BUNDLE_DB[name] = data.contents;
                    }
                    if (data.type === 'giftbox') {
                        if (typeof GIFTBOX_DB !== 'undefined') GIFTBOX_DB.add(name);
                    }
                    if (data.image) {
                        if (typeof IMAGE_DB !== 'undefined' && IMAGE_DB !== null) IMAGE_DB[name] = data.image;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load native DB products", e);
        }

        // Load Marketplace Mappings
        this.marketplaceMapping = {};

        // Load Hardcoded Mappings from products.js First
        if (typeof HARDCODED_MAPPINGS !== 'undefined') {
            this.marketplaceMapping = { ...HARDCODED_MAPPINGS };
            console.log("Loaded hardcoded marketplace mappings.");
        }

        try {
            const mapSaved = await window.AppDB.getSetting('tkg_marketplace_mapping');
            if (mapSaved) {
                this.marketplaceMapping = { ...this.marketplaceMapping, ...mapSaved };
                console.log("Merged cloud marketplace mappings.");
            }
        } catch (e) {
            console.error("Failed to load cloud marketplace mapping", e);
        }
    },

    async loadState() {
        // Fetch Live Inventory once for Expiry Dropdowns
        try {
            this.inventory = await window.AppDB.getComputedInventory();
        } catch (e) {
            console.error("Failed to load inventory for script init", e);
            this.inventory = {};
        }

        const savedString = localStorage.getItem('tkg_active_scanner_batch');

        if (savedString) {
            try {
                const parsed = JSON.parse(savedString);
                if (Array.isArray(parsed)) {
                    this.state.orders = parsed;
                    console.log("Loaded " + this.state.orders.length + " active unsynced orders from local buffer.");
                    this.state.missingItems = []; // Reset on reload
                    this.renderDashboard();
                    if (this.state.orders.length > 0) {
                        this.switchView('dashboard-view');
                    }
                }
            } catch (e) {
                console.error("Failed to load saved state", e);
            }
        }
    },

    saveState() {
        try {
            // Only save the active scanner batch, never the historical archive
            localStorage.setItem('tkg_active_scanner_batch', JSON.stringify(this.state.orders));
        } catch (e) {
            console.error("Failed to save state", e);
        }
    },

    auditProductDatabase() {
        console.group("Running Product Database Audit...");
        let issuesFound = 0;
        const missingProducts = [];

        // 1. Check PRODUCT_DB for empty barcodes
        if (typeof PRODUCT_DB !== 'undefined') {
            for (const [key, codes] of Object.entries(PRODUCT_DB)) {
                if (!Array.isArray(codes) || codes.length === 0) {
                    console.warn(`[PRODUCT_DB] No barcodes found for: "${key}"`);
                    missingProducts.push(`Product: ${key}`);
                    issuesFound++;
                }
            }
        } else {
            console.error("PRODUCT_DB is not defined!");
        }

        // 2. Check BUNDLE_DB for invalid references (undefined barcodes)
        if (typeof BUNDLE_DB !== 'undefined') {
            for (const [bundleName, components] of Object.entries(BUNDLE_DB)) {
                if (!Array.isArray(components)) {
                    console.error(`[BUNDLE_DB] Invalid definition for bundle: "${bundleName}"`);
                    continue;
                }
                components.forEach(comp => {
                    if (!comp.barcodes) {
                        console.warn(`[BUNDLE_DB] Bundle "${bundleName}" has component "${comp.name}" with UNDEFINED barcodes.`);
                        missingProducts.push(`Bundle Component: ${bundleName} -> ${comp.name}`);
                        issuesFound++;
                    } else if (Array.isArray(comp.barcodes) && comp.barcodes.length === 0) {
                        console.warn(`[BUNDLE_DB] Bundle "${bundleName}" has component "${comp.name}" with EMPTY barcodes.`);
                        missingProducts.push(`Bundle Component: ${bundleName} -> ${comp.name}`);
                        issuesFound++;
                    }
                });
            }
        }

        if (issuesFound === 0) {
            console.log("Audit Complete: No issues found.");
        } else {
            console.warn(`Audit Complete: Found ${issuesFound} potential issues.`);
        }
        console.groupEnd();
    },

    cacheDOM() {
        this.dom = {
            uploadView: document.getElementById('upload-view'),
            dashboardView: document.getElementById('dashboard-view'),
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            ordersTableBody: document.getElementById('orders-list'),
            orderCount: document.getElementById('order-count'),
            newImportBtn: document.getElementById('new-import-btn'),
            scanModal: document.getElementById('scan-modal'),
            modalClose: document.getElementById('close-modal'),
            modalAWB: document.getElementById('modal-awb'),
            modalOrderId: document.getElementById('modal-order-id'),
            modalItems: document.getElementById('modal-items'),
            completeScanBtn: document.getElementById('complete-scan-btn'),
            scanFeedback: document.getElementById('scan-feedback'),
            summaryView: document.getElementById('summary-view'),
            viewSummaryBtn: document.getElementById('view-summary-btn'),
            addFileBtn: document.getElementById('add-file-btn'),
            checkDupesBtn: document.getElementById('check-dupes-btn'),
            btnExportGSheet: document.getElementById('btn-export-gsheet'),
            backToDashBtn: document.getElementById('back-to-dash-btn'),
            summaryContent: document.getElementById('summary-content'),
            // Shopify Manual Elements
            addShopifyBtn: document.getElementById('add-shopify-btn'),
            shopifyModal: document.getElementById('shopify-modal'),
            closeShopifyModal: document.getElementById('close-shopify-modal'),
            shopifyAwbInput: document.getElementById('shopify-awb-input'),
            shopifyProductInput: document.getElementById('shopify-product-input'),
            shopifyQtyInput: document.getElementById('shopify-qty-input'),
            shopifySearchResults: document.getElementById('shopify-search-results'),
            shopifyAddProductBtn: document.getElementById('shopify-add-product-btn'),
            shopifyItemsList: document.getElementById('shopify-items-list'),
            saveShopifyOrderBtn: document.getElementById('save-shopify-order-btn')
        };
    },

    bindEvents() {
        // File Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dom.dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dom.dropZone.addEventListener(eventName, () => {
                this.dom.dropZone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dom.dropZone.addEventListener(eventName, () => {
                this.dom.dropZone.classList.remove('dragover');
            });
        });

        this.dom.dropZone.addEventListener('drop', e => this.handleDrop(e));
        this.dom.fileInput.addEventListener('change', e => this.handleFileSelect(e));

        // Navigation
        this.dom.newImportBtn.addEventListener('click', () => {
            if (confirm('Import new file? Current data will be cleared.')) {
                this.state.isMerging = false; // Add flag
                this.state.orders = [];
                this.saveState(); // Clear storage
                this.switchView('upload');
                document.getElementById('file-input').value = ''; // Reset input to allow re-selecting same file
            }
        });

        this.dom.addFileBtn.addEventListener('click', () => {
            this.state.isMerging = true;
            document.getElementById('file-input').click();
        });

        if (this.dom.checkDupesBtn) {
            this.dom.checkDupesBtn.addEventListener('click', async () => {
                const btn = this.dom.checkDupesBtn;
                const originalText = btn.textContent;
                btn.textContent = "Checking...";
                btn.disabled = true;
                try {
                    await this.checkForDuplicates();
                    alert("Duplicate check complete.");
                } catch (err) {
                    console.error(err);
                    alert("Error checking duplicates.");
                } finally {
                    btn.textContent = originalText;
                    btn.disabled = false;
                }
            });
        }

        this.dom.btnExportGSheet.addEventListener('click', () => this.syncToGoogleSheet()); // Added listener

        // Summary View Navigation
        this.dom.viewSummaryBtn.addEventListener('click', () => {
            this.renderSummaryView();
            this.switchView('summary');
        });

        this.dom.backToDashBtn.addEventListener('click', () => {
            this.switchView('dashboard');
        });

        // Modal
        this.dom.modalClose.addEventListener('click', () => this.closeModal());
        this.dom.completeScanBtn.addEventListener('click', () => {
            this.completeOrder();
        });

        // Shopify Manual Input
        this.dom.addShopifyBtn.addEventListener('click', () => this.openShopifyModal());
        this.dom.closeShopifyModal.addEventListener('click', () => this.closeShopifyModal());
        this.dom.shopifyAddProductBtn.addEventListener('click', () => this.addShopifyProduct());
        this.dom.saveShopifyOrderBtn.addEventListener('click', () => this.saveShopifyOrder());
        this.dom.shopifyProductInput.addEventListener('input', (e) => this.searchShopifyProducts(e.target.value));
        this.dom.shopifyProductInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addShopifyProduct();
        });
        this.dom.shopifyAwbInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.dom.shopifyProductInput.focus();
        });

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (this.dom.shopifySearchResults && !this.dom.shopifySearchResults.contains(e.target) && e.target !== this.dom.shopifyProductInput) {
                this.dom.shopifySearchResults.classList.add('hidden');
            }
        });

        // Close modal on outside click
        this.dom.scanModal.addEventListener('click', (e) => {
            if (e.target === this.dom.scanModal) this.closeModal();
        });
        this.dom.shopifyModal.addEventListener('click', (e) => {
            if (e.target === this.dom.shopifyModal) this.closeShopifyModal();
        });

        // Global Barcode Listener
        let barcodeBuffer = '';
        let barcodeTimeout;

        document.addEventListener('keydown', (e) => {
            // If we are typing in an input field, ignore
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Barcode scanners usually send characters very fast. 
            // We'll buffer them. End with 'Enter'.

            if (e.key === 'Enter') {
                if (barcodeBuffer.length > 2) {
                    this.handleGlobalScan(barcodeBuffer);
                }
                barcodeBuffer = '';
                return;
            }

            // Reset buffer if too slow (manual typing)
            clearTimeout(barcodeTimeout);
            barcodeTimeout = setTimeout(() => {
                barcodeBuffer = '';
            }, 100);

            if (e.key.length === 1) { // Printable chars only
                barcodeBuffer += e.key;
            }
        });

        // Manual Scan Input inside Modal
        document.getElementById('scan-input-btn').addEventListener('click', () => {
            const input = document.getElementById('scan-input');
            this.handleProductScan(input.value);
            input.value = '';
            input.focus();
        });

        document.getElementById('scan-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleProductScan(e.target.value);
                e.target.value = '';
            }
        });
    },

    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.processFile(files[0]);
    },

    handleFileSelect(e) {
        const files = e.target.files;
        this.processFile(files[0]);
    },

    readFileAs(file, mode) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));

            if (mode === 'text') {
                reader.readAsText(file);
            } else if (mode === 'binary') {
                reader.readAsBinaryString(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    },

    async processFile(file) {
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('Excel parser failed to load. Please refresh the page and try again.');
            return;
        }

        const fileName = String(file.name || '').toLowerCase();
        const isCsv = fileName.endsWith('.csv');

        const attempts = isCsv
            ? [
                { mode: 'text', type: 'string' },
                { mode: 'array', type: 'array' },
                { mode: 'binary', type: 'binary' }
            ]
            : [
                { mode: 'array', type: 'array' },
                { mode: 'binary', type: 'binary' },
                { mode: 'text', type: 'string' }
            ];

        let workbook = null;
        let lastErr = null;

        for (const attempt of attempts) {
            try {
                const data = await this.readFileAs(file, attempt.mode);
                workbook = XLSX.read(data, { type: attempt.type });
                if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
                    break;
                }
            } catch (err) {
                lastErr = err;
            }
        }

        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            alert('Error parsing Excel file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
            console.error(lastErr || 'Unable to parse workbook.');
            return;
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        if (!worksheet) {
            alert('No worksheet found in the file.');
            return;
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        if (jsonData.length === 0) {
            alert('No data found in the file.');
            return;
        }

        this.processOrders(jsonData, worksheet);
    },

    processOrders(data, worksheet) {
        // Platform Detection
        const platform = this.detectPlatform(worksheet, data);
        console.log("Detected Platform:", platform);

        let parsedOrders = [];
        if (platform === 'lazada') {
            parsedOrders = this.processLazadaOrders(worksheet);
        } else {
            parsedOrders = this.processShopeeOrders(data);
        }

        if (parsedOrders.length === 0) return;

        const normalizedPlatform = this.normalizeText(platform);
        parsedOrders.forEach(order => {
            if (!order) return;
            const existing = this.normalizeText(order.platform);
            order.platform = existing || normalizedPlatform || order.platform;
        });

        // Merging Logic
        const ordersMap = new Map();

        // If merging, load existing
        if (this.state.isMerging && this.state.orders.length > 0) {
            this.state.orders.forEach(o => ordersMap.set(o.id, o));
        } else {
            this.state.orders = [];
        }

        parsedOrders.forEach((newOrder, index) => {
            const id = newOrder.id;
            if (!id) return;

            if (!ordersMap.has(id)) {
                ordersMap.set(id, newOrder);
            } else {
                // Order ID already exists in the current session.
                // We skip adding it again to avoid duplicating line items if the same file is imported twice.
                console.log(`Order ${id} already exists, skipping duplicate.`);
            }
        });

        this.state.orders = Array.from(ordersMap.values());
        this.saveState(); // SAVE after import
        this.renderDashboard();
        this.switchView('dashboard');

        // Trigger background duplicate check
        // this.checkForDuplicates(); // Manual check only
    },

    async checkForDuplicates() {
        const apiUrl = (typeof AUTO_SYNC_URL !== 'undefined' && AUTO_SYNC_URL.length > 5)
            ? AUTO_SYNC_URL
            : (localStorage.getItem('TKG_SHEETDB_URL') || localStorage.getItem('TKG_WEBHOOK_URL'));

        if (!apiUrl) return;

        // Construct URL
        let targetUrl = apiUrl;
        if (typeof SHEET_TAB_NAME !== 'undefined' && SHEET_TAB_NAME.length > 0) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl += `${separator}sheet=${encodeURIComponent(SHEET_TAB_NAME)}`;
        }

        try {
            console.log("Checking for duplicates against Sheet...");
            // Fetch Sheet Data
            const existingData = await fetch(targetUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }).then(res => res.ok ? res.json() : []).catch(e => {
                console.warn("Duplicate check failed:", e);
                return [];
            });

            const existingAWBs = new Set();
            const existingOrderIDs = new Set();

            if (Array.isArray(existingData)) {
                existingData.forEach(row => {
                    if (row.AWB) existingAWBs.add(String(row.AWB).trim());
                    const oid = row['Order ID'] || row['OrderId'] || row['order_id'];
                    if (oid) existingOrderIDs.add(String(oid).trim());
                });
            }

            // Flag duplicates locally
            let duplicateCount = 0;
            this.state.orders.forEach(o => {
                const awb = o.awb ? String(o.awb).trim() : '';
                const oid = o.orderId ? String(o.orderId).trim() : '';

                if ((awb && existingAWBs.has(awb)) || (oid && existingOrderIDs.has(oid))) {
                    o.isDuplicate = true;
                    // Also mark as synced if it's there
                    o.synced = true;
                    o.status = 'Exported'; // Optional: mark as done/exported? User wants yellow highlight.
                    duplicateCount++;
                }
            });

            if (duplicateCount > 0) {
                console.log(`Found ${duplicateCount} duplicates.`);
                this.saveState();
                this.renderDashboard();
            }

        } catch (e) {
            console.warn("Error during duplicate check:", e);
        }
    },

    detectPlatform(worksheet, jsonData) {
        // 1. Check heuristics in parsed JSON (if standard simple headers)
        if (jsonData && jsonData.length > 0) {
            const keys = Object.keys(jsonData[0]).join(' ').toLowerCase();
            if (keys.includes('order id') && keys.includes('tracking number')) return 'shopee';
        }

        // 2. Deep Check: Scan first 20 rows of Column A for "Order Item Id" (Lazada)
        // We use sheet_to_json with header:1 to get array of arrays
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, limit: 20 });
        for (const row of rows) {
            if (!row || row.length === 0) continue;
            const str = row.join(' ').toLowerCase();
            if (str.includes('order item id') || str.includes('seller sku')) return 'lazada';
        }

        // 3. Check for Shopee specific headers in those 20 rows if JSON check failed (e.g. metadata at top)
        for (const row of rows) {
            const str = row.join(' ').toLowerCase();
            if (str.includes('order id') && str.includes('tracking number')) return 'shopee';
        }

        // 4. Fallback: Check dimensions. Lazada usually uses deep columns (AZ, BA, BG).
        const ref = worksheet['!ref'];
        if (ref) {
            const range = XLSX.utils.decode_range(ref);
            // BG is column index 58. Include some buffer.
            if (range.e.c >= 55) {
                console.log("Sheet is very wide (>=Col BD). Assuming Lazada structure.");
                return 'lazada';
            }
        }

        console.log("Defaulting to Shopee platform.");
        return 'shopee';
    },

    processLazadaOrders(worksheet) {
        // Read with header: "A" to get A, B, C... AZ, BA... 
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: "A", defval: "" });

        // Find the Header Row (Row containing "Order Item Id")
        let headerIndex = -1;
        for (let i = 0; i < Math.min(rawData.length, 20); i++) {
            const valA = String(rawData[i]['A']).toLowerCase();
            if (valA.includes('order item id') || valA.includes('item id')) {
                headerIndex = i;
                break;
            }
        }

        // Slice data to satisfy "Start after header"
        // If header found, data starts at headerIndex + 1
        // If not found, assume data starts at 0 (or 1 if 0 is header)
        const dataRows = (headerIndex !== -1) ? rawData.slice(headerIndex + 1) : rawData;

        const ordersMap = new Map();

        dataRows.forEach((row, index) => {
            // Mapping:
            // Order ID: Col A (User specified first column)
            // AWB: Col BG
            // Name: Col AZ
            // Variation: Col BA
            // Shipper: BC (but overridden by BG check)

            const orderId = String(row['A'] || '').trim();
            const rawAwb = String(row['BG'] || '').trim(); // BG is Tracking Code

            // Skip empty rows
            if (!orderId && !rawAwb) return;

            // ... (Rest of logic same as before) ...

            let id = rawAwb || orderId;

            // Name Check early to filter headers
            const rawName = String(row['AZ'] || '').trim();
            const variant = String(row['BA'] || '').trim();

            // SKIP HEADER ROWS (Aggressive Check)
            const idLower = String(id).toLowerCase();
            const nameLower = rawName.toLowerCase();

            if (
                !id ||
                idLower.includes('order id') ||
                idLower.includes('item id') ||
                idLower.includes('tracking') ||
                idLower.includes('bill') ||
                idLower.includes('seller sku') ||
                nameLower.includes('product name') ||
                nameLower.includes('item name') ||
                nameLower === 'variation' ||
                nameLower === 'seller sku'
            ) return;

            let shipper = 'Other';
            if (rawAwb.toUpperCase().startsWith('LZSGD')) {
                shipper = 'SpeedPost';
            }

            if (!ordersMap.has(id)) {
                ordersMap.set(id, {
                    id: id,
                    awb: rawAwb,
                    orderId: orderId,
                    lineItems: [],
                    status: 'Pending',
                    shipper: shipper
                });
            }

            // Name & Variant variables already declared above for filtering check.

            // Construct Name
            let finalName = this.beautifyMarketplaceName(rawName, variant);
            if (variant) {
                const nName = normalizeName(finalName);
                const nVar = normalizeName(variant);
                if (nVar && !nName.includes(nVar)) {
                    finalName = `${finalName} ${variant}`;
                }
            }

            const requiredQty = 1;

            // Resolve Product
            const resolution = this.resolveProduct(finalName, 1, variant);
            const totalBoxes = resolution.multiplier || 1;

            const lineItem = {
                id: `laz-line-${index}`,
                name: finalName,
                orderedQty: totalBoxes,
                isBundle: resolution.type === 'bundle',
                isGiftBox: !!resolution.isGiftBox,
                requireInnerScan: !!resolution.requireInnerScan,
                bundleBarcodes: resolution.bundleBarcodes || [],
                subItems: resolution.components,
                expanded: false,
                status: 'Pending'
            };

            ordersMap.get(id).lineItems.push(lineItem);
        });

        return Array.from(ordersMap.values());
    },

    processShopeeOrders(data) {
        if (!data || data.length === 0) return [];

        const firstRow = data[0];
        const keys = Object.keys(firstRow);

        // Heuristics
        // Heuristics
        const awbKey = keys.find(k => /barcode|tracking|awb|bill/i.test(k)) || keys[0];

        // Improve Order ID detection
        let orderIdKey = keys.find(k => k.toLowerCase().trim() === 'order id');
        if (!orderIdKey) {
            orderIdKey = keys.find(k => /order.*id|order.*no|po number/i.test(k)) || (keys.length > 1 ? keys[1] : keys[0]);
        }

        const nameKey = keys.find(k => /product.*name|item.*name|description/i.test(k));
        const variantKey = keys.find(k => /variation/i.test(k));
        const qtyKey = keys.find(k => /qty|quantity/i.test(k));

        const ordersMap = new Map();

        data.forEach((row, index) => {
            const rawId = row[orderIdKey] || row[awbKey];
            const id = String(rawId).trim();

            if (!id) return;

            const awb = row[awbKey];
            const orderId = row[orderIdKey];

            // Shipper Detection for Shopee
            // Usually inferred from AWB prefix or explicit column if exists?
            // Existing logic relies on AWB prefix in dashboard render.
            // We can store a generic shipper if columns exist (like "Shipping Option")
            const shipKey = keys.find(k => /shipping\s*option|shipping\s*method|carrier|courier|logistics|delivery|shipper/i.test(k));
            const shipperRaw = shipKey ? row[shipKey] : '';
            const shipper = shipperRaw || 'Other'; // Placeholder

            if (!ordersMap.has(id)) {
                ordersMap.set(id, {
                    id: id,
                    awb: awb,
                    orderId: orderId,
                    lineItems: [],
                    status: 'Pending',
                    shipper: shipper
                });
            }

            let rawName = this.beautifyMarketplaceName(row[nameKey], row[variantKey]);
            let variantVal = "";
            if (variantKey && row[variantKey]) {
                variantVal = String(row[variantKey]).trim();
                const nName = normalizeName(rawName);
                const nVar = normalizeName(variantVal);
                if (nVar && !nName.includes(nVar)) {
                    rawName = `${rawName} ${variantVal}`;
                }
            }

            const requiredQty = qtyKey ? (parseInt(row[qtyKey]) || 1) : 1;
            const resolution = this.resolveProduct(rawName, requiredQty, variantVal);

            const lineItem = {
                id: `shp-line-${index}`,
                name: rawName,
                orderedQty: requiredQty,
                isBundle: resolution.type === 'bundle',
                isGiftBox: !!resolution.isGiftBox,
                requireInnerScan: !!resolution.requireInnerScan,
                bundleBarcodes: resolution.bundleBarcodes || [],
                subItems: resolution.components,
                expanded: false,
                status: 'Pending'
            };

            ordersMap.get(id).lineItems.push(lineItem);
        });

        return Array.from(ordersMap.values());
    },

    resolveProduct(rawName, qty, variantName = "") {
        if (!rawName) return { type: 'unknown', components: [] };

        // --- NEW: CHECK MARKETPLACE MAPPING TABLE ---
        let resolvedName = rawName;

        // 1. Try to map purely by the Variant Name (as requested for Variant Data Excel linking)
        if (variantName && this.marketplaceMapping && this.marketplaceMapping[variantName]) {
            resolvedName = this.marketplaceMapping[variantName];
            console.log(`Resolved via Variant mapping: ${variantName} -> ${resolvedName}`);
        }
        // 2. Fallback: Try to map the full raw string
        else if (this.marketplaceMapping && this.marketplaceMapping[rawName]) {
            resolvedName = this.marketplaceMapping[rawName];
            console.log(`Resolved via Full Name mapping: ${rawName} -> ${resolvedName}`);
        }

        if (typeof normalizeName !== 'function') {
            console.error("products.js not loaded?");
            return {
                type: 'unknown',
                components: [{
                    name: resolvedName, sku: 'UNKNOWN', validBarcodes: [],
                    requiredQty: qty, scannedQty: 0, done: false, unknown: true
                }]
            };
        }

        const norm = normalizeName(resolvedName);

        // 0. Dynamic Quantity Heuristic (e.g. "Bundle of 15")
        let multiplier = 1;
        // Use matchAll to find all occurrences and take the last one (most specific/variation usually at end)

        // 1. Check "Pack Size: X" (Lazada)
        const packSizeMatches = [...rawName.matchAll(/Pack\s*Size\s*:?\s*(\d+)/gi)];
        if (packSizeMatches.length > 0) {
            const m = packSizeMatches[packSizeMatches.length - 1];
            if (m && m[1]) multiplier = parseInt(m[1], 10);
        }

        // 2. Check "Bundle of X"
        const bundleMatches = [...rawName.matchAll(/bundle\s*of\s?(\d+)/gi)];
        if (bundleMatches.length > 0) {
            const m = bundleMatches[bundleMatches.length - 1];
            if (m && m[1]) multiplier = parseInt(m[1], 10);
        }

        // 3. New: Check "X Boxes" or "X Packs" (e.g., "9 Boxes" or "15 Packs")
        // Refined: Only match if NOT preceded by "Assortment of" (protects bundle size descriptions)
        const boxMatches = [...rawName.matchAll(/(?<!Assortment\s*of\s*)(\d+)\s*(Boxes|Packs)/gi)];
        if (boxMatches.length > 0) {
            const m = boxMatches[boxMatches.length - 1];
            if (m && m[1]) multiplier = parseInt(m[1], 10);
        }

        // 0. Check overrides first (handled by merge in loadOverrides, but explicit re-check for safety)

        // 1. Check BUNDLE_DB
        for (const [bundleKey, contents] of Object.entries(typeof BUNDLE_DB !== 'undefined' ? BUNDLE_DB : {})) {
            if (norm.includes(normalizeName(bundleKey))) {
                let boxBarcodes = [];
                if (typeof PRODUCT_DB !== 'undefined') {
                    if (PRODUCT_DB[bundleKey]) boxBarcodes = PRODUCT_DB[bundleKey];
                    // Also try lowercase key fallback
                    else if (PRODUCT_DB[bundleKey.toLowerCase()]) boxBarcodes = PRODUCT_DB[bundleKey.toLowerCase()];
                }

                const isGift = typeof GIFTBOX_DB !== 'undefined' && GIFTBOX_DB.has(bundleKey);
                const localInfo = (this.localProducts && this.localProducts[bundleKey]) ? this.localProducts[bundleKey] : null;
                const requiresInner = localInfo ? !!localInfo.requireInnerScan : (isGift ? false : false); // Default gift boxes to auto-fulfill via box scan

                return {
                    type: 'bundle',
                    isGiftBox: isGift,
                    requireInnerScan: requiresInner,
                    bundleBarcodes: boxBarcodes,
                    components: contents.map(subItem => {
                        let finalItemCount = 0;
                        if (subItem.count === 'split') {
                            const splitCount = contents.filter(x => x.count === 'split').length;
                            const calculated = multiplier / splitCount;
                            finalItemCount = calculated < 1 ? 1 : Math.round(calculated);
                        } else {
                            if (subItem.ignoreMultiplier) {
                                finalItemCount = subItem.count;
                            } else if (subItem.count === 1 && contents.length === 1) {
                                finalItemCount = multiplier;
                            } else {
                                finalItemCount = subItem.count;
                            }
                        }

                        let img = null;
                        if (typeof PRODUCT_DB !== 'undefined' && typeof IMAGE_DB !== 'undefined') {
                            const subNorm = normalizeName(subItem.name);
                            if (IMAGE_DB[subNorm]) {
                                img = IMAGE_DB[subNorm];
                            } else {
                                const foundKey = Object.keys(PRODUCT_DB).find(k => {
                                    const dbCodes = PRODUCT_DB[k];
                                    if (!dbCodes || !subItem.barcodes) return false;
                                    return dbCodes === subItem.barcodes ||
                                        (dbCodes.length === subItem.barcodes.length && dbCodes.every((val, index) => val === subItem.barcodes[index]));
                                });
                                if (foundKey && IMAGE_DB[foundKey]) {
                                    img = IMAGE_DB[foundKey];
                                }
                            }
                        }

                        // Recursively resolve inner components if this item is also a bundle/giftbox
                        let innerComponents = null;
                        if (typeof BUNDLE_DB !== 'undefined' && BUNDLE_DB[subItem.name]) {
                            innerComponents = BUNDLE_DB[subItem.name];
                        }

                        return {
                            name: subItem.name,
                            sku: 'BUNDLE-ITEM',
                            validBarcodes: subItem.barcodes,
                            requiredQty: finalItemCount * qty,
                            scannedQty: 0,
                            done: false,
                            isBundleItem: true,
                            originalName: rawName,
                            image: img,
                            innerComponents: innerComponents
                        };
                    }),
                    multiplier: multiplier // Pass multiplier up for processing
                };
            }
        }

        // 2. Check PRODUCT_DB (Direct Match or Word-Level Match)
        for (const [prodKey, barcodes] of Object.entries(PRODUCT_DB)) {
            const nKey = normalizeName(prodKey);
            const nSource = normalizeName(resolvedName);

            // Check A: Direct Substring (fastest)
            let isMatch = nSource.includes(nKey);

            // Check B: Word-Level check (handles interrupters like 'Brownie Crisps' or 'Popcorn')
            if (!isMatch) {
                const keyWords = prodKey.toLowerCase().split(/\s+/).filter(w => w.length > 1);
                const sourceLower = resolvedName.toLowerCase();
                isMatch = keyWords.every(word => sourceLower.includes(word));
            }

            if (isMatch) {
                // Lookup Image
                let img = null;
                if (typeof IMAGE_DB !== 'undefined' && IMAGE_DB[prodKey]) {
                    img = IMAGE_DB[prodKey];
                }

                return {
                    type: 'single',
                    components: [{
                        name: prodKey, // Use clean catalog key instead of raw marketplace name
                        sku: 'SINGLE-ITEM',
                        validBarcodes: barcodes,
                        requiredQty: qty * multiplier,
                        scannedQty: 0,
                        done: false,
                        image: img
                    }]
                };
            }
        }

        // 3. Fallback: Unknown Item
        if (!this.state.missingItems.includes(rawName)) {
            this.state.missingItems.push(rawName);
        }

        return {
            type: 'unknown',
            components: [{
                name: rawName,
                sku: 'UNKNOWN',
                validBarcodes: [],
                requiredQty: qty * multiplier,
                scannedQty: 0,
                done: false,
                unknown: true
            }]
        };
    },

    beautifyMarketplaceName(rawName, variant) {
        if (!variant || !rawName || !rawName.includes('/')) return rawName;

        // Pattern: Find the largest block of text containing slashes (e.g., A / B / C)
        const slashPattern = /([^/]+\s*\/\s*[^/]+(?:\s*\/\s*[^/]+)*)/;
        const match = rawName.match(slashPattern);

        if (match) {
            const fullList = match[0];
            const items = fullList.split('/').map(i => i.trim());
            const nVar = normalizeName(variant);

            // Find which item in the list matches our selected variant
            const foundItem = items.find(item => {
                const nItem = normalizeName(item);
                return nItem === nVar || nItem.includes(nVar) || nVar.includes(nItem);
            });

            if (foundItem) {
                // Replace the messy list with the winner
                let result = rawName.replace(fullList, foundItem);

                // Ensure POPPA is retained if it was in the original name
                if (normalizeName(rawName).includes('poppa') && !normalizeName(result).includes('poppa')) {
                    result = "POPPA " + result;
                }

                return result;
            }
        }
        return rawName;
    },

    normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    },

    isCompleteStatus(status) {
        const normalized = this.normalizeText(status);
        return normalized === 'complete' || normalized === 'exported';
    },

    derivePlatform(order) {
        const platform = this.normalizeText(order && order.platform);
        if (platform) return platform;

        const shipper = this.normalizeText(order && order.shipper);
        const idToken = this.normalizeText(order && (order.awb || order.orderId || order.id));

        if (shipper.includes('shopify') || idToken.startsWith('shop-')) return 'shopify';
        if (shipper.includes('lazada') || shipper.includes('lex') || idToken.startsWith('lz')) return 'lazada';
        if (shipper.includes('tiktok') || idToken.startsWith('tt')) return 'tiktok';
        if (shipper.includes('shopee') || shipper.includes('spx') || shipper.includes('ninja')) return 'shopee';

        return '';
    },

    getOrderBucket(order) {
        const platform = this.derivePlatform(order);
        if (platform === 'shopify') return 'shopify';
        if (platform === 'lazada') return 'lazada';

        const shipper = this.normalizeText(order && order.shipper);
        const idToken = this.normalizeText(order && (order.awb || order.orderId || order.id));

        if (shipper.includes('ninja') || idToken.startsWith('shhpm') || idToken.startsWith('shpm') || idToken.startsWith('ninja')) {
            return 'ninjavan';
        }

        if (shipper.includes('spx') || shipper.includes('pick locker') || idToken.startsWith('spx')) {
            return 'spx';
        }

        if (shipper.includes('speedpost') || shipper.includes('singpost')) {
            if (idToken.startsWith('lz')) return 'lazada';
        }

        return 'other';
    },

    renderDashboard() {
        const allOrders = this.state.orders.filter(o => {
            const idStr = String(o.id || '');
            const platformStr = String(o.platform || '');
            return !idStr.startsWith('B2B-') && !idStr.startsWith('b2b-') && platformStr !== 'b2b';
        });

        const activeOrders = allOrders.filter(order => !this.isCompleteStatus(order.status));

        if (this.dom.orderCount) {
            this.dom.orderCount.textContent = activeOrders.length;
        }
        this.dom.ordersTableBody.innerHTML = '';

        // Render Issues Panel
        const issuesPanel = document.getElementById('issues-panel');
        const issuesList = document.getElementById('issues-list');
        if (issuesPanel && issuesList) {
            if (this.state.missingItems.length > 0) {
                issuesPanel.classList.remove('hidden');
                issuesList.innerHTML = [...new Set(this.state.missingItems)].map(item => `<li>${item}</li>`).join('');
            } else {
                issuesPanel.classList.add('hidden');
            }
        }

        // Tally Counters
        let stats = {
            ninjavan: { total: 0, done: 0 },
            spx: { total: 0, done: 0 },
            lazada: { total: 0, done: 0 },
            shopify: { total: 0, done: 0 },
            other: { total: 0, done: 0 },
            total: { total: 0, done: 0 }
        };

        allOrders.forEach(order => {
            if (!order) return;

            const isComplete = this.isCompleteStatus(order.status);
            stats.total.total++;
            if (isComplete) stats.total.done++;

            const bucket = this.getOrderBucket(order);
            const key = stats[bucket] ? bucket : 'other';
            stats[key].total++;
            if (isComplete) stats[key].done++;
        });

        activeOrders.forEach(order => {
            const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
            const bucket = this.getOrderBucket(order);

            const tr = document.createElement('tr');
            if (order.isDuplicate) {
                tr.classList.add('row-duplicate');
            } else if (bucket === 'shopify') {
                tr.style.borderLeft = "4px solid #9333ea";
                tr.style.background = "rgba(147, 51, 234, 0.05)";
            } else if (bucket === 'other') {
                tr.classList.add('row-alert');
            }

            // Calculate total items across all lines
            let totalItems = 0;
            let hasMissingBarcodes = false;

            lineItems.forEach(line => {
                if (line.subItems) {
                    line.subItems.forEach(sub => {
                        totalItems += (sub.requiredQty || 0);
                        if (!sub.validBarcodes || sub.validBarcodes.length === 0) {
                            hasMissingBarcodes = true;
                        }
                    });
                }
            });

            let statusClass = '';
            if (order.status === 'Complete') {
                statusClass = 'text-success';
            } else if (order.status === 'In Progress') {
                statusClass = 'text-warning';
            } else if (order.status === 'Exported') {
                statusClass = 'text-exported';
            }

            const cautionIcon = hasMissingBarcodes
                ? '<span title="Contains items with missing barcodes" style="font-size: 0.8em; margin-left: 6px; cursor: help;">⚠️</span>'
                : '';

            tr.innerHTML = `
                <td><strong>${order.awb || order.orderId || "?"}</strong>${cautionIcon}</td>
                <td>${order.orderId || "-"}</td>
                <td>${totalItems} items (${lineItems.length} lines)</td>
                <td>
                    <span class="${statusClass}">${order.status}</span>
                </td>
            `;
            tr.addEventListener('click', () => this.openOrder(order.id));
            tr.style.cursor = 'pointer';
            this.dom.ordersTableBody.appendChild(tr);
        });

        // Update Stats DOM
        const ninjaEl = document.getElementById('count-ninja');
        if (ninjaEl) ninjaEl.textContent = `${stats.ninjavan.done} / ${stats.ninjavan.total}`;

        const spxEl = document.getElementById('count-spx');
        if (spxEl) spxEl.textContent = `${stats.spx.done} / ${stats.spx.total}`;

        const lazadaEl = document.getElementById('count-lazada');
        if (lazadaEl) lazadaEl.textContent = `${stats.lazada.done} / ${stats.lazada.total}`;

        const shopifyEl = document.getElementById('count-shopify');
        if (shopifyEl) shopifyEl.textContent = `${stats.shopify.done} / ${stats.shopify.total}`;

        const totalEl = document.getElementById('count-total');
        if (totalEl) totalEl.textContent = `${stats.total.done} / ${stats.total.total}`;

        // Optional Other card
        let otherCard = document.getElementById('stat-card-other');
        if (stats.other.total > 0) {
            if (!otherCard) {
                const panel = document.getElementById('stats-panel');
                otherCard = document.createElement('div');
                otherCard.className = 'stat-card stat-alert';
                otherCard.id = 'stat-card-other';
                otherCard.innerHTML = `<div class="stat-title">Other</div><div class="stat-value" id="count-other">0</div>`;
                panel.insertBefore(otherCard, panel.lastElementChild); // Insert before Total
            }
            const countOtherEl = document.getElementById('count-other');
            if (countOtherEl) countOtherEl.textContent = `${stats.other.done} / ${stats.other.total}`;
            otherCard.style.display = 'flex';
        } else if (otherCard) {
            otherCard.style.display = 'none';
        }
    },

    handleGlobalScan(barcode) {
        const cleanCode = String(barcode).trim();
        if (!cleanCode) return;

        if (this.state.currentOrder) {
            this.handleProductScan(cleanCode);
            return;
        }

        if (window.orderWorkbench && typeof window.orderWorkbench.isPackingActive === 'function' && window.orderWorkbench.isPackingActive()) {
            const handled = window.orderWorkbench.handleAwbScan(cleanCode);
            if (handled) return;
        }

        const order = this.state.orders.find(o =>
            String(o.awb).includes(cleanCode) ||
            String(o.orderId).includes(cleanCode)
        );

        if (order) {
            this.openOrder(order.id);
        } else {
            console.log("Order not found or invalid scan: " + cleanCode);
        }
    },

    openOrder(id) {
        const order = this.state.orders.find(o => o.id === id);
        if (!order) return;

        this.state.currentOrder = order;
        // Reset scan feedback state
        this.state.scanHistory = [];
        this.dom.scanFeedback.classList.add('hidden');
        this.dom.scanFeedback.innerHTML = '';

        this.dom.modalAWB.textContent = order.awb || order.orderId;
        this.dom.modalOrderId.textContent = order.orderId;

        this.renderOrderItems();
        this.dom.scanModal.classList.remove('hidden');
        setTimeout(() => document.getElementById('scan-input').focus(), 100);
    },

    toggleLine(lineId) {
        const order = this.state.currentOrder;
        if (!order) return;
        const line = order.lineItems.find(l => l.id === lineId);
        if (line) {
            line.expanded = !line.expanded;
            this.renderOrderItems();
        }
    },

    async syncToGoogleSheet() {
        if (this.state.orders.length === 0) {
            alert("No orders to sync.");
            return;
        }

        // SheetDB / Sheety URL
        let apiUrl = (typeof AUTO_SYNC_URL !== 'undefined' && AUTO_SYNC_URL.length > 5)
            ? AUTO_SYNC_URL
            : localStorage.getItem('TKG_SHEETDB_URL');

        if (!apiUrl) {
            apiUrl = prompt("Please enter your SheetDB API URL (e.g. https://sheetdb.io/api/v1/...):");
            if (apiUrl) {
                localStorage.setItem('TKG_SHEETDB_URL', apiUrl.trim());
            } else {
                return;
            }
        }

        // AGGREGATE TOTALS (Smarter Tally based on actual scans/breakdowns)
        const tally = {};
        this.state.orders.forEach(order => {
            order.lineItems.forEach(line => {
                line.subItems.forEach(sub => {
                    if (sub.scannedBreakdown && Object.keys(sub.scannedBreakdown).length > 0) {
                        for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                            if (!tally[sName]) tally[sName] = 0;
                            tally[sName] += sCount;
                        }
                    } else {
                        const name = sub.name;
                        const qty = sub.scannedQty || 0;
                        if (qty > 0) {
                            if (!tally[name]) tally[name] = 0;
                            tally[name] += qty;
                        }
                    }
                });
            });
        });

        // SheetDB expects flattened JSON objects. 
        // Keys MUST match your Google Sheet Headers exactly.
        // We will assume headers: "Timestamp", "Product", "Quantity"
        const rows = Object.entries(tally).map(([name, qty]) => {
            return {
                "Timestamp": new Date().toLocaleString(),
                "Product": name,
                "Quantity": qty
            };
        });

        // Payload for SheetDB (Bulk Insert)
        const payload = {
            data: rows
        };

        this.dom.exportGSheetBtn.textContent = "Sending...";
        this.dom.exportGSheetBtn.disabled = true;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const resJson = await response.json();
                console.log(resJson);
                alert(`Successfully synced ${rows.length} rows to Google Sheet via SheetDB!`);
            } else {
                const text = await response.text();
                throw new Error("API Error: " + text);
            }

        } catch (err) {
            console.error(err);
            alert("Sync Failed: " + err.message);
            // reset url if likely wrong
            if (confirm("Reset stored API URL?")) {
                localStorage.removeItem('TKG_SHEETDB_URL');
            }
        } finally {
            this.dom.exportGSheetBtn.textContent = "Sync to G-Sheet";
            this.dom.exportGSheetBtn.disabled = false;
        }
    },

    setExpiry(lineId, subName, val, breakdownName = null) {
        const order = this.state.currentOrder;
        if (!order) return;
        const line = order.lineItems.find(l => l.id === lineId);
        if (!line) return;
        const sub = line.subItems.find(s => s.name === subName);
        if (!sub) return;

        if (breakdownName) {
            if (!sub.selectedBreakdownExpiries) sub.selectedBreakdownExpiries = {};
            sub.selectedBreakdownExpiries[breakdownName] = val;
        } else {
            sub.selectedExpiry = val;
        }

        this.saveState();
        this.renderOrderItems();
    },

    getExpiryDropdownHtml(productName, selectedValue, lineId, subName, breakdownName = null) {
        try {
            const inv = this.inventory || {};
            let batches = inv[productName] || inv[productName.toLowerCase()];
            if (!batches) {
                // Try case-insensitive fallback loop
                const keyMatch = Object.keys(inv).find(k => k.toLowerCase() === productName.toLowerCase());
                batches = keyMatch ? inv[keyMatch] : [];
            }

            const valid = batches.filter(b => b.expiry && (b.computedQty || b.qty) > 0).sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

            let options = '<option value="">Auto (FIFO)</option>';
            valid.forEach(b => {
                const dateStr = new Date(b.expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                const sel = (selectedValue === b.expiry) ? 'selected' : '';
                options += `<option value="${b.expiry}" ${sel}>${dateStr}</option>`;
            });

            let bdArg = breakdownName ? `, '${breakdownName.replace(/'/g, "\\'")}'` : '';
            return `<select onchange="app.setExpiry('${lineId}', '${subName.replace(/'/g, "\\'")}', this.value${bdArg})" 
                     style="margin-top: 6px; display: block; font-size: 0.75rem; padding: 3px 6px; border-radius: 6px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); outline: none; cursor: pointer; max-width: 140px;">
                        ${options}
                    </select>`;
        } catch (e) {
            return '';
        }
    },

    renderOrderItems() {
        const order = this.state.currentOrder;
        this.dom.modalItems.innerHTML = '';

        let allOrderDone = true;

        order.lineItems.forEach(line => {
            const li = document.createElement('li');
            li.className = 'line-item-container ' + (line.expanded ? 'expanded' : '');

            // Check if all subitems in this line are done
            const lineComplete = line.subItems.every(s => s.done);
            if (!lineComplete) allOrderDone = false;

            // Calculate progress for line
            const totalReq = line.subItems.reduce((a, s) => a + s.requiredQty, 0);
            const totalScan = line.subItems.reduce((a, s) => a + s.scannedQty, 0);

            const isBundle = line.isBundle;

            if (isBundle) {
                // Bundle View: Header + Dropdown
                const headerHtml = `
                    <div class="line-attrs ${lineComplete ? 'complete' : ''}" onclick="app.toggleLine('${line.id}')">
                         <div class="qty-badge" style="margin-right: 1rem;">${line.orderedQty}</div>
                         <div class="line-header-info">
                             <div class="line-name">${window.formatProductName ? window.formatProductName(line.name) : line.name}</div>
                             <div class="line-meta">
                                 ${(line.bundleBarcodes && line.bundleBarcodes.length > 0)
                        ? `📦 Gift Box • ${Math.floor(totalScan / (Math.max(1, totalReq / line.orderedQty)))} / ${line.orderedQty} Boxes <span style="opacity:0.7; font-size:0.9em;">(${totalScan}/${totalReq} items)</span>`
                        : `📦 Bundle • ${totalScan} / ${totalReq} items`
                    }
                             </div>
                         </div>
                         <div class="expand-icon">▼</div>
                    </div>
                `;

                let subItemsHtml = `<div class="sub-items-list">`;
                line.subItems.forEach(sub => {
                    const subComplete = sub.scannedQty >= sub.requiredQty;
                    const validCodes = (sub.validBarcodes || []).filter(c => c && String(c).trim() !== '');
                    const hasBarcodes = validCodes.length > 0;
                    const missingClass = hasBarcodes ? '' : 'missing-barcode';
                    const warningIcon = hasBarcodes ? '' : '<span class="warning-icon" title="No barcode assigned!">⚠️</span>';

                    let leftContent = `<div class="qty-badge-small">${sub.requiredQty}x</div>`;
                    if (sub.image) {
                        leftContent = `<img src="${sub.image}" alt="${sub.name}" class="product-thumb" />`;
                    }

                    let breakdownHtml = '';
                    if (sub.scannedBreakdown) {
                        breakdownHtml = '<div class="scanned-breakdown">';
                        for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                            const bdExp = (sub.selectedBreakdownExpiries && sub.selectedBreakdownExpiries[sName]) || '';
                            const selectMenu = subComplete ? '' : this.getExpiryDropdownHtml(sName, bdExp, line.id, sub.name, sName);
                            breakdownHtml += `<div class="breakdown-item"><span class="check">✓</span> ${sCount}x ${sName} ${selectMenu}</div>`;
                        }
                        breakdownHtml += '</div>';
                    }

                    subItemsHtml += `
                        <div class="sub-item ${subComplete ? 'complete' : ''} ${missingClass}">
                             ${leftContent}
                             <div class="name">
                                 ${warningIcon} ${window.formatProductName ? window.formatProductName(sub.name) : sub.name}
                                 ${subComplete ? '' : this.getExpiryDropdownHtml(sub.name, sub.selectedExpiry, line.id, sub.name)}
                             </div>
                             <div class="status">
                                 ${sub.scannedQty} / ${sub.requiredQty}
                                 ${subComplete ? '✅' : ''}
                             </div>
                             ${breakdownHtml}
                        </div>
                    `;
                });
                subItemsHtml += `</div>`;
                li.innerHTML = headerHtml + subItemsHtml;

            } else {
                // Single Item View: Compact Row (Use sub-item style directly, but slightly bigger)
                // We use the first sub-item as the main display since Single Items have 1 sub-item
                const sub = line.subItems[0];
                const subComplete = sub.scannedQty >= sub.requiredQty;
                const validCodes = (sub.validBarcodes || []).filter(c => c && String(c).trim() !== '');
                const hasBarcodes = validCodes.length > 0;
                const missingClass = hasBarcodes ? '' : 'missing-barcode';
                const warningIcon = hasBarcodes ? '' : '<span class="warning-icon" title="No barcode assigned!">⚠️</span>';

                // We'll use a modified class 'single-item-row' to make it look like the "smaller black rectangle"
                // effectively acting like a sub-item but at the top level

                let leftContent = `<div class="qty-badge-small">${sub.requiredQty}x</div>`;
                if (sub.image) {
                    leftContent = `<img src="${sub.image}" alt="Product Image" class="product-thumb" />`;
                }

                let breakdownHtml = '';
                if (sub.scannedBreakdown) {
                    breakdownHtml = '<div class="scanned-breakdown">';
                    for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                        const bdExp = (sub.selectedBreakdownExpiries && sub.selectedBreakdownExpiries[sName]) || '';
                        const selectMenu = subComplete ? '' : this.getExpiryDropdownHtml(sName, bdExp, line.id, sub.name, sName);
                        breakdownHtml += `<div class="breakdown-item"><span class="check">✓</span> ${sCount}x ${sName} ${selectMenu}</div>`;
                    }
                    breakdownHtml += '</div>';
                }

                li.innerHTML = `
                    <div class="sub-item single-item-row ${subComplete ? 'complete' : ''} ${missingClass}">
                         ${leftContent}
                         <div class="name" style="font-size: 1rem;">
                              ${warningIcon} ${window.formatProductName ? window.formatProductName(sub.name) : sub.name}
                              ${subComplete ? '' : this.getExpiryDropdownHtml(sub.name, sub.selectedExpiry, line.id, sub.name)}
                         </div>
                         <div class="status">
                             ${sub.scannedQty} / ${sub.requiredQty}
                             ${subComplete ? '✅' : ''}
                         </div>
                         ${breakdownHtml}
                    </div>
                `;
            }
            this.dom.modalItems.appendChild(li);
        });

        const btn = this.dom.completeScanBtn;
        if (allOrderDone) {
            btn.disabled = false;
            btn.textContent = "Complete Job";
            btn.classList.add('pulse');
        } else {
            btn.disabled = true;
            btn.textContent = "Scan all items to continue";
            btn.classList.remove('pulse');
        }
    },

    handleProductScan(barcode) {
        if (!this.state.currentOrder) return;
        const cleanCode = String(barcode).trim();
        console.log("Scanning Product:", cleanCode);

        const order = this.state.currentOrder;

        // Find matching item in ALL lines
        let found = false;
        let matchedItemName = '';

        // Track if we found a match that was already done
        let itemExistsButFulfilled = false;

        for (const line of order.lineItems) {
            // New Bundle Scan Logic
            if (line.isBundle && line.bundleBarcodes && line.bundleBarcodes.includes(cleanCode)) {
                let allSubItemsDoneBefore = line.subItems.every(s => s.done);
                if (allSubItemsDoneBefore) {
                    itemExistsButFulfilled = true;
                } else {
                    const reqInner = !!line.requireInnerScan;

                    if (!reqInner) {
                        // AUTO-FULFILL EVERYTHING INSIDE
                        line.subItems.forEach(sub => {
                            const itemsPerBox = sub.requiredQty / line.orderedQty;
                            sub.scannedQty = Math.min(sub.requiredQty, sub.scannedQty + itemsPerBox);
                            if (sub.scannedQty >= sub.requiredQty) sub.done = true;

                            if (!sub.scannedBreakdown) sub.scannedBreakdown = {};
                            sub.scannedBreakdown[sub.name] = (sub.scannedBreakdown[sub.name] || 0) + itemsPerBox;

                            // Recursive Fulfill: If this box item has internal components, add them to breakdown too
                            if (sub.innerComponents) {
                                sub.innerComponents.forEach(inner => {
                                    const qtyForThisBox = inner.count * itemsPerBox;
                                    sub.scannedBreakdown[inner.name] = (sub.scannedBreakdown[inner.name] || 0) + qtyForThisBox;
                                });
                            }
                        });
                        found = true;
                        matchedItemName = line.name + " (Box Scan)";
                    } else {
                        // REQUIRE INNER SCAN: Only fulfill the 'Box' or 'Packaging' item if it exists in subItems
                        let boxItemFound = false;
                        line.subItems.forEach(sub => {
                            const isBoxItem = sub.name.toLowerCase().includes('box') || sub.name.toLowerCase().includes('packaging') || sub.name.toLowerCase().includes('sleeve');
                            const codes = sub.validBarcodes || [];
                            if (isBoxItem || codes.includes(cleanCode)) {
                                if (sub.scannedQty < sub.requiredQty) {
                                    sub.scannedQty++;
                                    if (sub.scannedQty >= sub.requiredQty) sub.done = true;
                                    boxItemFound = true;
                                    matchedItemName = sub.name;

                                    if (!sub.scannedBreakdown) sub.scannedBreakdown = {};
                                    sub.scannedBreakdown[sub.name] = (sub.scannedBreakdown[sub.name] || 0) + 1;
                                }
                            }
                        });

                        if (boxItemFound) {
                            found = true;
                        } else {
                            // If no explicit box item found but we scanned the box barcode, maybe fulfill a dummy or just ignore?
                            // User wants to scan items individually, so we don't auto-fulfill ingredients.
                            // We can just signify a successful Box Scan if needed.
                            alert("Box scanned, but individual items still required.");
                            found = true; // Still mark as 'found' to avoid 'Wrong item scan' alert
                            matchedItemName = "Box Packaging";
                        }
                    }

                    if (found) {
                        line.expanded = true;
                        this.renderOrderItems();
                        if (order.status === 'Pending') {
                            order.status = 'In Progress';
                            this.renderDashboard();
                        }
                        this.saveState();
                    }
                }
                if (found || itemExistsButFulfilled) break;
            }

            for (const item of line.subItems) {

                const fits = (item.validBarcodes && item.validBarcodes.includes(cleanCode));
                // Unknown logic?
                // const isUnknownAndMatches = item.unknown; // (logic reserved if needed)

                if (fits) {
                    if (!item.done) {
                        // Found a pending item!
                        item.scannedQty++;
                        if (item.scannedQty >= item.requiredQty) item.done = true;
                        found = true;

                        // Default to item name
                        matchedItemName = item.name;

                        // Attempt to resolve specific name from PRODUCT_DB (especially for 'Any' bundles)
                        if (typeof PRODUCT_DB !== 'undefined') {
                            for (const [dbName, dbCodes] of Object.entries(PRODUCT_DB)) {
                                if (dbCodes.includes(cleanCode)) {
                                    // Formatted name
                                    matchedItemName = window.formatProductName ? window.formatProductName(dbName) : dbName.toLowerCase().split(' ').map(function (word) {
                                        return (word.charAt(0).toUpperCase() + word.slice(1));
                                    }).join(' ');
                                    break;
                                }
                            }
                        }

                        // Auto-expand the line if it was hidden, so user sees the progress
                        line.expanded = true;

                        // Track Breakdown for this specific sub-item
                        if (!item.scannedBreakdown) item.scannedBreakdown = {};
                        if (matchedItemName) {
                            item.scannedBreakdown[matchedItemName] = (item.scannedBreakdown[matchedItemName] || 0) + 1;
                        }

                        // Recursive Fulfill: If this matched item is a giftbox with ingredients, log them in breakdown
                        if (item.innerComponents) {
                            item.innerComponents.forEach(inner => {
                                const qtyForThisScan = inner.count;
                                item.scannedBreakdown[inner.name] = (item.scannedBreakdown[inner.name] || 0) + qtyForThisScan;
                            });
                        }

                        // Update UI
                        this.renderOrderItems();

                        // Update Status to In Progress if it was Pending
                        if (order.status === 'Pending') {
                            order.status = 'In Progress';
                            this.renderDashboard();
                        }

                        // Break out of inner loop
                        break;
                    } else {
                        // Item matches but is already done. 
                        // We set this flag, but continue searching in case another line has the same item pending.
                        itemExistsButFulfilled = true;
                    }
                }
            }
            if (found) break; // Break out of outer loop
        }

        if (found) {
            // Update Scan History
            const history = this.state.scanHistory;
            const existingEntry = history.find(entry => entry.name === matchedItemName);

            if (existingEntry) {
                existingEntry.count++;
            } else {
                history.push({ name: matchedItemName, count: 1 });
            }

            this.renderScanFeedback();
            this.saveState(); // SAVE usage
        } else {
            // Not found (as a pending item). Check why.
            if (itemExistsButFulfilled) {
                alert("Item already fulfilled");
            } else {
                alert("Wrong item scanned");
            }
        }
    },

    renderScanFeedback() {
        const container = this.dom.scanFeedback;
        if (this.state.scanHistory.length === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        // Re-render list
        container.innerHTML = this.state.scanHistory.map(entry => `
            <div class="scan-log-item">
                <span>${window.formatProductName ? window.formatProductName(entry.name) : entry.name}</span>
                <span class="count">${entry.count}x</span>
            </div>
        `).join('');
    },

    renderSummaryView() {
        // Aggregate all scanned items across all orders
        const tally = {};

        this.state.orders.forEach(order => {
            order.lineItems.forEach(line => {
                // Tally individual contents for ALL line types (Bundles, Gift Boxes, and Single Items)
                line.subItems.forEach(sub => {
                    // 1. Check scan breakdown (for user-selected items in 'Any' bundles)
                    if (sub.scannedBreakdown && Object.keys(sub.scannedBreakdown).length > 0) {
                        for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                            if (!tally[sName]) tally[sName] = 0;
                            tally[sName] += sCount;
                        }
                    } else {
                        // 2. Fallback to scanned quantity (for fixed content or single items)
                        const qty = sub.scannedQty || 0;
                        if (qty > 0) {
                            const name = sub.name;
                            if (!tally[name]) tally[name] = 0;
                            tally[name] += qty;
                        }
                    }
                });
            });
        });

        const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]); // Descending by count

        if (entries.length === 0) {
            this.dom.summaryContent.innerHTML = '<p style="text-align:center; color:var(--text-secondary);">No items scanned yet.</p>';
            return;
        }

        let html = `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Product Name</th>
                        <th style="text-align:right;">Total Scanned</th>
                    </tr>
                </thead>
                <tbody>
        `;

        entries.forEach(([name, count]) => {
            html += `
                <tr>
                    <td>${window.formatProductName ? window.formatProductName(name) : name}</td>
                    <td style="text-align:right;"><span class="summary-count">${count}</span></td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        this.dom.summaryContent.innerHTML = html;
    },


    async completeOrder() {
        if (this.state.currentOrder) {
            const order = this.state.currentOrder;
            const originalStatus = order.status;

            // Optimistic rendering
            order.status = 'Complete';
            this.renderDashboard();
            this.closeModal();

            try {
                await window.AppDB.fulfillOrder(order);
                this.saveState(); // SAVE completion logic to local queue state

                // Refresh local inventory cache after a successful deduction so dropdowns stay accurate natively
                this.inventory = await window.AppDB.getComputedInventory();
            } catch (e) {
                alert("Failed to submit order to Cloud Ledger: " + e.message);
                order.status = originalStatus; // Rollback Optimistic UI
                this.renderDashboard();
            }
        }
    },

    // BULK SYNC (Manual Trigger)
    async syncToGoogleSheet() {
        // 1. Filter for valid orders to sync
        const ordersToSync = this.state.orders.filter(o => o.status === 'Complete' && !o.synced);

        if (ordersToSync.length === 0) {
            alert("No new 'Complete' orders to sync.");
            return;
        }

        const apiUrl = (typeof AUTO_SYNC_URL !== 'undefined' && AUTO_SYNC_URL.length > 5)
            ? AUTO_SYNC_URL
            : (localStorage.getItem('TKG_SHEETDB_URL') || localStorage.getItem('TKG_WEBHOOK_URL'));

        if (!apiUrl) {
            alert("Please configure AUTO_SYNC_URL in script.js first.");
            return;
        }

        // Construct URL with tab name
        let targetUrl = apiUrl;
        if (typeof SHEET_TAB_NAME !== 'undefined' && SHEET_TAB_NAME.length > 0) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl += `${separator}sheet=${encodeURIComponent(SHEET_TAB_NAME)}`;
        }

        this.dom.btnExportGSheet.textContent = "Checking duplicates...";
        this.dom.btnExportGSheet.disabled = true;

        try {
            // STEP 1: Fetch existing data to check for duplicates
            const existingData = await fetch(targetUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            }).then(res => res.ok ? res.json() : []).catch(() => []);

            // Extract existing AWBs and OrderIDs
            const existingAWBs = new Set();
            const existingOrderIDs = new Set();

            if (Array.isArray(existingData)) {
                existingData.forEach(row => {
                    if (row.AWB) existingAWBs.add(String(row.AWB).trim());
                    // Check various Order ID keys possibly present in sheet
                    const oid = row['Order ID'] || row['OrderId'] || row['order_id'];
                    if (oid) existingOrderIDs.add(String(oid).trim());
                });
            }

            // STEP 2: Filter out duplicates (Skip them instead of deleting)
            const finalOrdersToSync = [];

            ordersToSync.forEach(o => {
                const awb = o.awb ? String(o.awb).trim() : '';
                const oid = o.orderId ? String(o.orderId).trim() : '';

                let isDuplicate = false;
                if (awb && existingAWBs.has(awb)) {
                    isDuplicate = true;
                } else if (oid && existingOrderIDs.has(oid)) {
                    isDuplicate = true;
                }

                if (!isDuplicate) {
                    finalOrdersToSync.push(o);
                }
            });

            if (finalOrdersToSync.length === 0) {
                // All were duplicates
                this.dom.btnExportGSheet.textContent = "Sync to G-Sheet";
                this.dom.btnExportGSheet.disabled = false;

                // Mark all as synced locally since they exist remotely
                ordersToSync.forEach(o => o.synced = true);
                this.renderDashboard();
                this.saveState();

                alert("All selected orders are already in the Google Sheet.");
                return;
            }

            // STEP 3: Prepare new data from FINAL list
            const rawRows = finalOrdersToSync.map(order => {
                const row = {
                    "Date": new Date().toLocaleString(),
                    "Order ID": order.orderId ? String(order.orderId) : (order.awb || `ORD-${Date.now()}`),
                    "AWB": order.awb || ""
                };

                order.lineItems.forEach(line => {
                    line.subItems.forEach(sub => {
                        // Check if we have specific breakdown (e.g. for user-selected bundles)
                        if (sub.scannedBreakdown && Object.keys(sub.scannedBreakdown).length > 0) {
                            // Use the actual scanned items
                            for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                                const code = this.getShortCode(sName);
                                if (code && code !== "IGNORE") {
                                    row[code] = (row[code] || 0) + sCount;
                                }
                            }
                        } else if (sub.requiredQty > 0) {
                            // Fallback to generic name (standard behavior for fixed items)
                            const code = this.getShortCode(sub.name);
                            if (code && code !== "IGNORE") {
                                row[code] = (row[code] || 0) + sub.requiredQty;
                            }
                        }
                    });
                });
                return { row, orderId: order.id };
            });

            // Collect all keys
            const allKeys = new Set(["Date", "Order ID", "AWB"]);
            rawRows.forEach(item => {
                Object.keys(item.row).forEach(k => allKeys.add(k));
            });

            // Standard Keys
            const standardKeys = [
                'CF30G', 'CC30G', 'CH30G', 'FHC30G', 'KBT30G', 'NL30G', 'PH30G', 'SC30G', 'CS30G',
                'CF65G', 'CC65G', 'CH65G', 'FHC65G', 'KBT65G', 'NL65G', 'PH65G', 'SC65G', 'CS65G',
                'OriginalYumi', 'CheeseYumi', 'BBQYumi',
                'ChickenCCones', 'WheatCCones', 'MayoCCones',
                'ChocolateB35G', 'MatchaB35G',
                'ChocolateB', 'BananaB', 'PeanutB',
                'CheeseYCC', 'SquidYCC', 'BarbequeYCC',
                'ChocolatePP', 'CaramelPP',
                'Jasmine', 'Osmanthus', 'POPCORNINKGPlain/Cheese',
            ];
            standardKeys.forEach(k => allKeys.add(k));

            // Finalize with 0s
            const payloadData = rawRows.map(item => {
                const completeRow = {};
                allKeys.forEach(key => {
                    completeRow[key] = item.row[key] || (['Date', 'Order ID', 'AWB'].includes(key) ? '' : 0);
                });
                return completeRow;
            });

            if (payloadData.length === 0) {
                alert("No items found in selected orders.");
                return;
            }

            // STEP 4: Send new data
            this.dom.btnExportGSheet.textContent = `Syncing ${payloadData.length} new...`;

            const res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payloadData)
            });

            if (res.ok) {
                this.renderDashboard();

            } else {
                const txt = await res.text();
                throw new Error(txt);
            }
        } catch (e) {
            console.error(e);
            alert("Sync Failed: " + e.message);
        } finally {
            this.dom.btnExportGSheet.textContent = "Sync to G-Sheet";
            this.dom.btnExportGSheet.disabled = false;
        }
    },

    getShortCode(name) {
        const n = String(name).toLowerCase();

        // 1. Ignore 320G
        if (n.includes('320g')) return "IGNORE";

        // --- POPPA ---
        if (n.includes('poppa')) {
            if (n.includes('chocolate')) return "ChocolatePP";
            if (n.includes('caramel')) return "CaramelPP";
            return "PoppaOther";
        }

        // --- YUMI CORN STICKS ---
        if (n.includes('corn stick')) {
            if (n.includes('original')) return "OriginalYumi";
            if (n.includes('cheese')) return "CheeseYumi";
            if (n.includes('bbq')) return "BBQYumi";
            return "StickOther";
        }

        // --- YUMI CORN CURLS (YCC) ---
        if (n.includes('corn curl')) {
            if (n.includes('cheese')) return "CheeseYCC";
            if (n.includes('squid')) return "SquidYCC";
            if (n.includes('bbq') || n.includes('barbeque')) return "BarbequeYCC";
            return "CurlOther";
        }

        // --- BRONY'S ---
        if (n.includes('brony') || n.includes('brownie crisp')) {
            if (n.includes('35g')) {
                if (n.includes('matcha')) return "MatchaB35G";
                if (n.includes('chocolate')) return "ChocolateB35G";
            } else {
                // 108g / Standard
                if (n.includes('chocolate')) return "ChocolateB";
                if (n.includes('banana')) return "BananaB";
                if (n.includes('peanut')) return "PeanutB";
            }
            return "BronyOther";
        }

        // --- CORN CONES ---
        if (n.includes('corn cone')) {
            if (n.includes('chicken')) return "ChickenCCones";
            if (n.includes('wheat')) return "WheatCCones";
            if (n.includes('mayo')) return "MayoCCones";
            return "ConesOther";
        }

        // --- STANDARD POPCORN (30g / 65g) ---
        let suffix = "";
        if (n.includes('30g')) {
            suffix = "30G";
        } else if (n.includes('65g')) {
            suffix = "65G";
        } else if (n.includes('premium butter') || n.includes('air-popped') || n.includes('flavoured popcorn')) {
            // Verbose names like "the kettle gourmet air-popped popcorn made with premium butter chocolate"
            // These are 65g products but don't have "65g" in the name
            suffix = "65G";
        }

        if (suffix) {
            if (n.includes('chicken floss')) return "CF" + suffix;
            if (n.includes('chocolate')) return "CH" + suffix;
            if (n.includes('chilli crab')) return "CC" + suffix;
            if (n.includes('fish head')) return "FHC" + suffix;
            if (n.includes('kaya')) return "KBT" + suffix;
            if (n.includes('nasi lemak')) return "NL" + suffix;
            if (n.includes('pulut hitam')) return "PH" + suffix;
            if (n.includes('salted caramel')) return "SC" + suffix;
            if (n.includes('cheese') || n.includes('holly cheese') || n.includes('holy cheese')) return "CS" + suffix;
        }

        // --- MINI PACKS ---
        if (n.includes('mini pack')) {
            if (n.includes('salted caramel')) return "MPCS";
            if (n.includes('kaya')) return "MPKBT";
            if (n.includes('chocolate')) return "MPCHC";
            return "MPOther";
        }

        // --- BULK ---
        if (n.includes('popcorn') && n.includes('kg')) {
            // User list has: "POPCORNINKGPlain/Cheese". This looks like ONE column header.
            return "POPCORNINKGPlain/Cheese";
        }
        if (n.includes('jasmine')) return "Jasmine";
        if (n.includes('osmanthus')) return "Osmanthus";

        return "UNKNOWN-" + name;
    },

    closeModal() {
        this.dom.scanModal.classList.add('hidden');
        this.state.currentOrder = null;
        // Reset feedback
        this.dom.scanFeedback.classList.add('hidden');
        this.state.scanHistory = [];
    },

    switchView(viewName) {
        // Reset all views
        this.dom.uploadView.classList.add('hidden');
        this.dom.dashboardView.classList.add('hidden');
        if (this.dom.summaryView) {
            this.dom.summaryView.classList.add('hidden');
            this.dom.summaryView.classList.remove('active');
        }

        this.dom.uploadView.classList.remove('active');
        this.dom.dashboardView.classList.remove('active');

        // Activate specific view
        if (viewName === 'upload') {
            this.dom.uploadView.classList.remove('hidden');
            this.dom.uploadView.classList.add('active');
        } else if (viewName === 'summary' && this.dom.summaryView) {
            this.dom.summaryView.classList.remove('hidden');
            this.dom.summaryView.classList.add('active');
        } else {
            // Default to Dashboard
            this.dom.dashboardView.classList.remove('hidden');
            this.dom.dashboardView.classList.add('active');
        }
    },

    // --- SHOPIFY MANUAL ENTRY FUNCTIONS ---
    openShopifyModal() {
        this.dom.shopifyModal.classList.remove('hidden');
        this.dom.shopifyAwbInput.value = '';
        this.dom.shopifyProductInput.value = '';
        this.dom.shopifyQtyInput.value = '1';
        this.dom.shopifySearchResults.classList.add('hidden');
        this.state.shopifyTempItems = [];
        this.renderShopifyItems();
        this.dom.shopifyAwbInput.focus();
    },

    closeShopifyModal() {
        this.dom.shopifyModal.classList.add('hidden');
    },

    searchShopifyProducts(query) {
        if (!query || query.length < 2) {
            this.dom.shopifySearchResults.classList.add('hidden');
            return;
        }

        const results = [];
        const nQuery = query.toLowerCase();

        // Search Singles
        if (typeof PRODUCT_DB !== 'undefined') {
            for (const name in PRODUCT_DB) {
                const barcodes = PRODUCT_DB[name];
                if (name.toLowerCase().includes(nQuery) || barcodes.some(b => String(b).includes(nQuery))) {
                    results.push({ name, type: 'Single', barcode: barcodes[0] || "No Barcode" });
                }
            }
        }

        // Search Bundles
        if (typeof BUNDLE_DB !== 'undefined') {
            for (const name in BUNDLE_DB) {
                if (name.toLowerCase().includes(nQuery)) {
                    results.push({ name, type: 'Bundle', barcode: 'BUNDLE' });
                }
            }
        }

        this.renderShopifySearchResults(results.slice(0, 10)); // Limit to top 10
    },

    renderShopifySearchResults(results) {
        const container = this.dom.shopifySearchResults;
        container.innerHTML = '';

        if (results.length === 0) {
            container.classList.add('hidden');
            return;
        }

        results.forEach(res => {
            const div = document.createElement('div');
            div.style.padding = '10px 15px';
            div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            div.style.cursor = 'pointer';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:600; font-size: 0.9rem;">${res.name}</div>
                    <div style="font-size: 0.75rem; color:var(--text-secondary);">${res.type}</div>
                </div>
                <div style="font-size: 0.75rem; opacity: 0.6;">${res.barcode}</div>
            `;

            div.addEventListener('click', () => {
                this.dom.shopifyProductInput.value = res.name;
                container.classList.add('hidden');
                this.dom.shopifyQtyInput.focus();
            });
            container.appendChild(div);
        });

        container.classList.remove('hidden');
    },

    addShopifyProduct() {
        const inputVal = this.dom.shopifyProductInput.value.trim();
        const qty = parseInt(this.dom.shopifyQtyInput.value) || 1;

        if (!inputVal) return;

        // Try to identify the product
        let foundName = null;
        let barcode = "";

        // 1. Direct Name Match (best if they picked from list)
        if (typeof PRODUCT_DB !== 'undefined' && PRODUCT_DB[inputVal]) {
            foundName = inputVal;
            barcode = PRODUCT_DB[inputVal][0] || "No Barcode";
        } else if (typeof BUNDLE_DB !== 'undefined' && BUNDLE_DB[inputVal]) {
            foundName = inputVal;
            barcode = "BUNDLE";
        } else {
            // 2. Search barcode
            if (typeof PRODUCT_DB !== 'undefined') {
                for (const [name, codes] of Object.entries(PRODUCT_DB)) {
                    if (codes.includes(inputVal)) {
                        foundName = name;
                        barcode = inputVal;
                        break;
                    }
                }
            }
        }

        if (!foundName) {
            alert("Could not identify product: " + inputVal);
            return;
        }

        // Add or Merge
        const existing = this.state.shopifyTempItems.find(it => it.name === foundName);
        if (existing) {
            existing.qty += qty;
        } else {
            this.state.shopifyTempItems.push({
                name: foundName,
                qty: qty,
                barcode: barcode
            });
        }

        this.dom.shopifyProductInput.value = '';
        this.dom.shopifyQtyInput.value = '1';
        this.renderShopifyItems();
        this.dom.shopifyProductInput.focus();
    },

    removeShopifyProduct(index) {
        this.state.shopifyTempItems.splice(index, 1);
        this.renderShopifyItems();
    },

    renderShopifyItems() {
        const list = this.dom.shopifyItemsList;
        list.innerHTML = '';

        if (this.state.shopifyTempItems.length === 0) {
            list.innerHTML = `<li style="color:var(--text-secondary); opacity:0.5; text-align:center; padding: 1rem;">No items added yet.</li>`;
            return;
        }

        this.state.shopifyTempItems.forEach((item, idx) => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            li.innerHTML = `
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap: 8px;">
                        <span style="background: #9333ea; color: white; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; font-weight:700;">${item.qty}x</span>
                        <div style="font-weight:600; font-size: 0.9rem; color: #a855f7;">${item.name}</div>
                    </div>
                </div>
                <button onclick="app.removeShopifyProduct(${idx})" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size: 1.2rem; padding: 5px;">&times;</button>
            `;
            list.appendChild(li);
        });
    },

    saveShopifyOrder() {
        const awb = this.dom.shopifyAwbInput.value.trim();
        const items = this.state.shopifyTempItems;

        if (!awb) {
            alert("Please enter an Airway Bill / Tracking Number.");
            this.dom.shopifyAwbInput.focus();
            return;
        }
        if (items.length === 0) {
            alert("Please add at least one product to the order.");
            this.dom.shopifyProductInput.focus();
            return;
        }

        // Create the order object
        const orderId = "SHOP-" + Date.now();
        const newOrder = {
            id: orderId,
            awb: awb,
            orderId: orderId,
            status: 'Pending',
            platform: 'shopify',
            shipper: 'Shopify',
            lineItems: []
        };

        items.forEach((item, index) => {
            const resolution = this.resolveProduct(item.name, item.qty);

            const lineItem = {
                id: `shop-line-${index}`,
                name: item.name,
                orderedQty: item.qty,
                isBundle: resolution.type === 'bundle',
                isGiftBox: !!resolution.isGiftBox,
                requireInnerScan: !!resolution.requireInnerScan,
                bundleBarcodes: resolution.bundleBarcodes || [],
                subItems: resolution.components,
                expanded: false,
                status: 'Pending'
            };
            newOrder.lineItems.push(lineItem);
        });

        // Add to global state
        this.state.orders.unshift(newOrder); // Add to top
        this.saveState();
        this.renderDashboard();
        this.closeShopifyModal();

        // Show success notification
        alert("Shopify Order added successfully!");
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    window.app = app;
});
