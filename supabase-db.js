/**
 * supabase-db.js - Central Data Connector for TKG Barcode Ops
 * This file replaces all raw `localStorage` calls across the application
 * with an asynchronous, cloud-hosted relational ledger system.
 */

const SUPABASE_URL = 'https://yvjkkpntbceweojcriec.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2amtrcG50YmNld2VvamNyaWVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzODIxNTIsImV4cCI6MjA4OTk1ODE1Mn0.nF5QCAoPAY07n0gY2-vW7lsGdPvFORnT2PoWSBgImDc';

// Initialize Client (Relies on CDN Script in HTML headers)
let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
        console.error("window.supabase is not defined. The CDN script failed to load or parse.");
    }
} catch (e) {
    console.error("Failed to initialize Supabase client:", e);
}

if (!supabaseClient) {
    console.error("Supabase client is null! AppDB will fail on any database calls.");
}

// Ensure Names match Catalog perfectly
const canon = (name) => window.formatProductName ? window.formatProductName(name).toLowerCase() : name.toLowerCase();

window.AppDB = {

    // ==========================================
    // INVENTORY & LEDGER METHODS
    // ==========================================

    /**
     * Gets the current live inventory by dynamically summing 
     * the entire ledger (Inbound minus Outbound) on the fly.
     * Returns: { "product_name": [ { expiry: "...", qty: 10 } ] }
     */
    async getLiveInventory() {
        // In a very large app, we would use an RPC or SQL View here.
        // For our scale, downloading the ledger to sum is instantly fast.
        const { data, error } = await supabaseClient.from('stock_ledger').select('*');
        if (error) throw error;

        const inventory = {};

        data.forEach(row => {
            const product = canon(row.product_name);
            const expiry = row.expiry || '';
            const isDeduction = row.transaction_type === 'OUTBOUND' || row.transaction_type === 'DEFECT';
            const qty = isDeduction ? -row.qty : row.qty;

            if (!inventory[product]) inventory[product] = [];

            const existingBatch = inventory[product].find(b => b.expiry === expiry);
            if (existingBatch) {
                existingBatch.qty += qty;
            } else {
                inventory[product].push({ expiry, qty });
            }
        });

        return inventory;
    },

    async getComputedInventory() {
        const rawInventory = await this.getLiveInventory();
        const computedInventory = {};

        for (const [productName, rawBatches] of Object.entries(rawInventory)) {
            let positiveBatches = [];
            let negativeOffset = 0;

            rawBatches.forEach(b => {
                if (b.qty > 0) {
                    positiveBatches.push({ expiry: b.expiry, qty: b.qty });
                } else if (b.qty < 0) {
                    negativeOffset += Math.abs(b.qty);
                }
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
                if (b.qty >= negativeOffset) {
                    b.qty -= negativeOffset;
                    negativeOffset = 0;
                } else {
                    negativeOffset -= b.qty;
                    b.qty = 0;
                }
            }

            const finalBatches = positiveBatches.filter(b => b.qty > 0 || !b.expiry);

            if (negativeOffset > 0 && finalBatches.length === 0) {
                finalBatches.push({ expiry: '', qty: 0 });
            }

            computedInventory[productName] = finalBatches.length > 0 ? finalBatches : [{ expiry: '', qty: 0 }];
        }
        return computedInventory;
    },

    async getRawLedger() {
        const { data, error } = await supabaseClient.from('stock_ledger').select('*');
        if (error) throw error;
        return data || [];
    },

    /**
     * Used by the Inbound Scanner (Stock_inbound.html)
     * @param {Array} scannedItems - [ { name, qty, expiry, batch_id } ]
     */
    async insertInbound(scannedItems) {
        const rows = scannedItems
            .filter(i => i.name && i.name !== 'Unknown Product')
            .map(item => ({
                product_name: canon(item.name),
                transaction_type: 'INBOUND',
                qty: item.qty,
                expiry: item.expiry || null,
                batch_id: item.batch_id || null,
                reference_id: 'INBOUND_SCAN',
                notes: 'Scanned via Stock Inbound app'
            }));

        if (rows.length === 0) return;

        const { error } = await supabaseClient.from('stock_ledger').insert(rows);
        if (error) throw error;
    },

    /**
     * Optional manual adjustment function for the Inventory modal.
     */
    async insertAdjustment(productName, qtyIncrease, expiry, reason) {
        const type = qtyIncrease >= 0 ? 'ADJUSTMENT' : 'OUTBOUND';
        const { error } = await supabaseClient.from('stock_ledger').insert({
            product_name: canon(productName),
            transaction_type: type,
            qty: Math.abs(qtyIncrease),
            expiry: expiry || null,
            reference_id: 'MANUAL_ADJUST',
            notes: reason || 'Manual Stock Edit'
        });
        if (error) throw error;
    },

    /**
     * Deletes all individual stock movement logs and replaces them 
     * with single BALANCE_FORWARD rows holding current live sums.
     */
    async consolidateLedger() {
        // 1. Calculate live sum first
        const rawInventory = await this.getLiveInventory();

        let forwardRows = [];
        for (const [productName, batches] of Object.entries(rawInventory)) {
            batches.forEach(b => {
                if (b.qty > 0 || b.qty < 0) { // Keep any non-zero balances
                    forwardRows.push({
                        product_name: canon(productName),
                        transaction_type: 'INBOUND', // INBOUND acts as positive quantity.
                        qty: Math.abs(b.qty), // Absolute value, we can use OUTBOUND for negative 
                        expiry: b.expiry || null,
                        reference_id: 'SYSTEM_ROLLUP',
                        notes: 'Ledger Consolidation / Roll-up starting balance'
                    });

                    // If the balance is actually negative, flip type
                    if (b.qty < 0) {
                        forwardRows[forwardRows.length - 1].transaction_type = 'OUTBOUND';
                    }
                }
            });
        }

        // 2. Wipe existing ledger
        const { error: delErr } = await supabaseClient.from('stock_ledger').delete().neq('transaction_type', 'DELETE_ALL_OVERRIDE');
        if (delErr) throw delErr;

        // 3. Insert forward balances
        if (forwardRows.length > 0) {
            const { error: insErr } = await supabaseClient.from('stock_ledger').insert(forwardRows);
            if (insErr) throw insErr;
        }

        return true;
    },

    // ==========================================
    // ORDERS & FULFILLMENT METHODS
    // ==========================================

    async deleteOrder(orderId) {
        // 1. Delete all ledger deductions (restores inventory instantly)
        const { error: ledgErr } = await supabaseClient.from('stock_ledger').delete().eq('reference_id', orderId);
        if (ledgErr) throw ledgErr;

        // 2. Delete the order record
        const { error: ordErr } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (ordErr) throw ordErr;
    },

    async cancelOrder(orderId) {
        // 1. Delete all ledger deductions (restores inventory instantly)
        const { error: ledgErr } = await supabaseClient.from('stock_ledger').delete().eq('reference_id', orderId);
        if (ledgErr) throw ledgErr;

        // 2. Fetch the existing order row
        const { data: orderRow, error: fetchErr } = await supabaseClient.from('orders').select('*').eq('id', orderId).single();
        if (fetchErr || !orderRow) throw new Error("Order not found");

        // 3. Update the order_data payload inner status
        const orderData = orderRow.order_data;
        if (orderData) {
            orderData.status = 'Cancelled';
        }

        // 4. Update the SQL status and payload
        const { error: updErr } = await supabaseClient.from('orders').update({
            status: 'Cancelled',
            order_data: orderData
        }).eq('id', orderId);
        if (updErr) throw updErr;
    },

    async getOrders() {
        const { data, error } = await supabaseClient.from('orders').select('order_data');
        if (error) throw error;
        return data.map(d => d.order_data);
    },

    /**
     * Upserts an array of orders (used by script.js when clicking "Save & Resume")
     */
    async saveOrdersBatch(ordersArray) {
        const payload = ordersArray.map(o => ({
            id: o.id,
            status: o.status || 'Complete',
            platform: o.platform || 'unknown',
            order_data: o
        }));

        // Upsert orders
        const { error } = await supabaseClient.from('orders').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
    },

    /**
     * Completes an order (deducts stock and updates status). 
     * Crucially, this prevents double-deduction by checking if it was already Complete.
     */
    async fulfillOrder(orderObj) {
        // 1. Check if the order was already completed in the DB to prevent double outbounds
        const { data: existing } = await supabaseClient.from('orders').select('status').eq('id', orderObj.id).single();
        const wasAlreadyDone = existing && (existing.status === 'Complete' || existing.status === 'Exported');

        // 2. Build the exact items to deduct
        if (!wasAlreadyDone && (orderObj.status === 'Complete' || orderObj.status === 'Exported')) {
            const ledgerRows = [];

            const processItem = (name, qty, expiry) => {
                if (qty <= 0) return;
                ledgerRows.push({
                    product_name: canon(name),
                    transaction_type: 'OUTBOUND',
                    qty: qty,
                    expiry: expiry || null,
                    reference_id: orderObj.id,
                    notes: `Order Fulfillment (${orderObj.awb || ''})`
                });
            };

            if (orderObj.lineItems) {
                orderObj.lineItems.forEach(line => {
                    const isBundle = line.subItems && line.subItems.length > 0;
                    if (isBundle) {
                        line.subItems.forEach(sub => {
                            if (sub.scannedBreakdown && Object.keys(sub.scannedBreakdown).length > 0) {
                                for (const [sName, sCount] of Object.entries(sub.scannedBreakdown)) {
                                    let exp = (sub.selectedBreakdownExpiries && sub.selectedBreakdownExpiries[canon(sName)]) || null;
                                    processItem(sName, sCount, exp);
                                }
                            } else {
                                processItem(sub.name, sub.requiredQty || 0, sub.selectedExpiry);
                            }
                        });
                    } else {
                        processItem(line.name, line.orderedQty || 0, line.selectedExpiry);
                    }
                });
            }

            // Push ledger deductions!
            if (ledgerRows.length > 0) {
                const { error: ledgErr } = await supabaseClient.from('stock_ledger').insert(ledgerRows);
                if (ledgErr) throw ledgErr;
            }
        }

        // 3. Upsert Order object itself
        const { error: orderError } = await supabaseClient.from('orders').upsert({
            id: orderObj.id,
            status: orderObj.status || 'Complete',
            platform: orderObj.platform || 'unknown',
            order_data: orderObj
        }, { onConflict: 'id' });

        if (orderError) throw orderError;
    },

    async updateOrderData(orderId, updates) {
        if (!orderId) throw new Error('Order ID required');

        const { data: orderRow, error: fetchErr } = await supabaseClient
            .from('orders')
            .select('order_data')
            .eq('id', orderId)
            .single();

        if (fetchErr || !orderRow) throw new Error('Order not found');

        const merged = { ...(orderRow.order_data || {}), ...(updates || {}) };
        const updatePayload = { order_data: merged };
        if (updates && updates.status) updatePayload.status = updates.status;

        const { error: updErr } = await supabaseClient
            .from('orders')
            .update(updatePayload)
            .eq('id', orderId);
        if (updErr) throw updErr;

        return merged;
    },

    subscribeOrders(handler) {
        if (!supabaseClient || typeof supabaseClient.channel !== 'function') return null;
        const channel = supabaseClient
            .channel('orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                if (typeof handler === 'function') handler(payload);
            })
            .subscribe();
        return channel;
    },

    unsubscribe(channel) {
        if (!supabaseClient || !channel) return;
        supabaseClient.removeChannel(channel);
    },

    // ==========================================
    // DEFECTS
    // ==========================================

    async getDefects() {
        const { data, error } = await supabaseClient.from('defects').select('*');
        if (error) throw error;
        return data;
    },

    async insertDefect(defectObj) {
        const cName = canon(defectObj.product);

        // Push defect record
        const { error: defErr } = await supabaseClient.from('defects').insert({
            product: cName,
            count: defectObj.count,
            expiry: defectObj.expiry || null,
            defect_type: defectObj.defectType || 'Unknown',
            notes: defectObj.notes || ''
        });
        if (defErr) throw defErr;

        // Debit out of the stock ledger
        const { error: ledgErr } = await supabaseClient.from('stock_ledger').insert({
            product_name: cName,
            transaction_type: 'DEFECT',
            qty: defectObj.count,
            expiry: defectObj.expiry || null,
            reference_id: 'DEFECT_LOG',
            notes: `Sys Defect: ${defectObj.defectType}`
        });
        if (ledgErr) throw ledgErr;
    },

    // ==========================================
    // CATALOG & PRODUCTS
    // ==========================================

    async getProducts() {
        const { data, error } = await supabaseClient.from('products').select('*');
        if (error) {
            console.error("Failed to load products from DB", error);
            if (error.code === '42P01') return {}; // Table undefined
            throw error;
        }

        const map = {};
        data.forEach(row => {
            map[row.id] = {
                name: row.id,
                type: row.type,
                barcodes: row.barcodes || [],
                image: row.image,
                baseProduct: row.base_product,
                contents: row.components || [],
                requireInnerScan: row.require_inner_scan
            };
        });
        return map;
    },

    async saveProduct(p) {
        const payload = {
            id: p.name,
            type: p.type,
            barcodes: p.barcodes || [],
            image: p.image || null,
            base_product: p.baseProduct || null,
            components: p.contents || [],
            require_inner_scan: p.requireInnerScan || false,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabaseClient.from('products').upsert(payload, { onConflict: 'id' });
        if (error) throw error;
    },

    // ==========================================
    // GENERAL APP SETTINGS (Overrides / Mappings)
    // ==========================================

    async getSetting(key) {
        const { data, error } = await supabaseClient.from('app_settings').select('value').eq('key', key).single();
        if (error && error.code !== 'PGRST116') { // PGRST116 == 0 rows returned
            throw error;
        }
        return data ? data.value : null;
    },
    async setSetting(key, value) {
        const { error } = await supabaseClient.from('app_settings').upsert({
            key: key,
            value: value,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        if (error) throw error;
    },

    // ==========================================
    // STORAGE / IMAGES
    // ==========================================

    async uploadProductImage(file, productName) {
        // Sanitize product name to use as filename
        const cleanName = productName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const fileExt = file.name.split('.').pop();
        const path = `${cleanName}_${Date.now()}.${fileExt}`;

        const { data, error } = await supabaseClient.storage
            .from('product-images')
            .upload(path, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        // Get the public URL
        const { data: urlData } = supabaseClient.storage
            .from('product-images')
            .getPublicUrl(path);

        return urlData.publicUrl;
    }
};
