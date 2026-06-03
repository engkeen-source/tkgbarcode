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

    // Expose the shared Supabase client so pages can use it directly
    // without creating rogue instances (e.g. resetAllStock in stock-management.html)
    get supabaseClient() { return supabaseClient; },

    async getOrders() {
        const { data, error } = await supabaseClient
            .from('orders')
            .select('id, status, platform, awb, created_at, order_data')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;

        // Unwrap: return the order_data blob (what the rest of your app expects)
        // but enrich it with the top-level DB columns so AWB/platform are always present.
        return (data || []).map(row => ({
            ...(row.order_data || {}),
            id: row.id,
            status: row.status,
            platform: row.platform || row.order_data?.platform,
            awb: row.awb || row.order_data?.awb || row.order_data?.trackingNumber,
            _createdAt: row.created_at
        }));
    },

    /**
     * getOrdersPaginated()
     * For the Records tab when you have lots of orders.
     * Calls the RPC you created in the SQL migration.
     */
    async getOrdersPaginated(limit = 50, offset = 0, status = null, platform = null) {
        const { data, error } = await supabaseClient.rpc('get_orders_paginated', {
            p_limit: limit,
            p_offset: offset,
            p_status: status,
            p_platform: platform
        });

        if (error) throw error;

        return (data || []).map(row => ({
            ...(row.order_data || {}),
            id: row.id,
            status: row.status,
            platform: row.platform || row.order_data?.platform,
            awb: row.awb || row.order_data?.awb || row.order_data?.trackingNumber,
            _createdAt: row.created_at
        }));
    },

    /**
     * findOrderByBarcode()
     * ─────────────────────────────────────────────────────────────
     * THIS is what the packing station scanner calls on every scan.
     * Uses the Supabase RPC + database index — one fast query,
     * no client-side looping through all orders.
     *
     * @param {string} scannedValue  Raw value from the barcode scanner
     * @returns {object|null}        Order object or null if not found
     */
    async findOrderByBarcode(scannedValue) {
        if (!scannedValue) return null;

        // Normalize exactly the same way orders-workbench.js does
        const normalized = String(scannedValue).replace(/[^a-z0-9]/gi, '').toUpperCase();
        if (!normalized) return null;

        const { data, error } = await supabaseClient
            .rpc('find_order_by_identifier', { identifier: normalized });

        if (error) {
            console.error('findOrderByBarcode RPC error:', error);
            return null;
        }

        if (!data || data.length === 0) return null;

        const row = data[0];
        return {
            ...(row.order_data || {}),
            id: row.id,
            status: row.status,
            platform: row.platform || row.order_data?.platform,
            awb: row.awb || row.order_data?.awb || row.order_data?.trackingNumber,
            _createdAt: row.created_at
        };
    },

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
            // OUTBOUND and DEFECT reduce stock; INBOUND, ADJUSTMENT, and RETURN all add to stock.
            const isDeduction = ['OUTBOUND', 'DEFECT'].includes(row.transaction_type);
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
                // Only roll up positive balances. Products with a net negative balance
                // (over-sold items) are skipped — they self-correct on next inbound
                // and we never want to permanently bake in phantom OUTBOUND debt.
                if (b.qty > 0) {
                    forwardRows.push({
                        product_name: canon(productName),
                        transaction_type: 'INBOUND',
                        qty: b.qty,
                        expiry: b.expiry || null,
                        reference_id: 'SYSTEM_ROLLUP',
                        notes: 'Ledger Consolidation / Roll-up starting balance'
                    });
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
    // REFUNDS
    // ==========================================

    async getRefunds() {
        const { data, error } = await supabaseClient
            .from('refund_logs')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }

        return (data || []).map(row => ({
            id: row.id,
            date: row.refund_date || row.date || '',
            platform: row.platform,
            awb: row.awb || '-',
            orderId: row.order_id || '-',
            customer: row.customer || '-',
            reason: row.reason,
            items: row.items,
            notes: row.notes || '',
            restock: !!row.restock,
            status: row.status,
            createdAt: row.created_at
        }));
    },

    async saveRefund(record) {
        const payload = {
            id: record.id || `rfnd-${Date.now()}`,
            refund_date: record.date,
            platform: record.platform,
            awb: record.awb || null,
            order_id: record.orderId || null,
            customer: record.customer || null,
            reason: record.reason || null,
            items: record.items || null,
            notes: record.notes || null,
            restock: !!record.restock,
            status: record.status || 'Pending',
            created_at: record.createdAt || new Date().toISOString()
        };

        const { data, error } = await supabaseClient
            .from('refund_logs')
            .insert(payload)
            .select('*')
            .single();
        if (error) throw error;

        return {
            id: data.id,
            date: data.refund_date || data.date || '',
            platform: data.platform,
            awb: data.awb || '-',
            orderId: data.order_id || '-',
            customer: data.customer || '-',
            reason: data.reason,
            items: data.items,
            notes: data.notes || '',
            restock: !!data.restock,
            status: data.status,
            createdAt: data.created_at
        };
    },

    async updateRefund(id, changes) {
        const payload = {
            updated_at: new Date().toISOString()
        };

        if (changes.status) payload.status = changes.status;
        if (changes.notes !== undefined) payload.notes = changes.notes;
        if (changes.restock !== undefined) payload.restock = !!changes.restock;

        const { error } = await supabaseClient
            .from('refund_logs')
            .update(payload)
            .eq('id', id);
        if (error) throw error;
    },

    async deleteRefund(id) {
        const { error } = await supabaseClient
            .from('refund_logs')
            .delete()
            .eq('id', id);
        if (error) throw error;
    },

    // ==========================================
    // RETURNS + INVENTORY MOVEMENTS
    // ==========================================

    async getReturns(limit = 200) {
        const { data, error } = await supabaseClient
            .from('returns')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }

        return (data || []).map(row => ({
            id: row.id,
            barcode: row.barcode,
            sku: row.sku,
            productName: row.product_name,
            quantity: row.quantity,
            returnReason: row.return_reason,
            status: row.status,
            scannedBy: row.scanned_by,
            createdAt: row.created_at
        }));
    },

    async getInventoryMovements(limit = 100) {
        const { data, error } = await supabaseClient
            .from('inventory_movements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            if (error.code === '42P01') return [];
            throw error;
        }

        return (data || []).map(row => ({
            id: row.id,
            sku: row.sku,
            productName: row.product_name,
            movementType: row.movement_type,
            quantityChange: row.quantity_change,
            previousQuantity: row.previous_quantity,
            newQuantity: row.new_quantity,
            createdAt: row.created_at,
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            scannedBy: row.scanned_by
        }));
    },

    async findProductByBarcode(barcode) {
        const clean = String(barcode || '').trim();
        if (!clean) return null;

        const { data, error } = await supabaseClient
            .from('products')
            .select('id, sku, barcodes, type, image, base_product, components, require_inner_scan')
            .contains('barcodes', [clean])
            .limit(1);

        if (error) {
            if (error.code === '42P01') return null;
            throw error;
        }

        const row = data && data[0];
        if (!row) return null;

        return {
            id: row.id,
            name: row.id,
            sku: row.sku || row.id,
            type: row.type,
            barcodes: row.barcodes || [],
            image: row.image,
            baseProduct: row.base_product,
            contents: row.components || [],
            requireInnerScan: row.require_inner_scan
        };
    },

    async getProductStockQty(productName) {
        const cName = canon(productName);
        const { data, error } = await supabaseClient
            .from('stock_ledger')
            .select('transaction_type, qty')
            .eq('product_name', cName);

        if (error) throw error;

        let total = 0;
        (data || []).forEach(row => {
            // OUTBOUND and DEFECT reduce stock; INBOUND, ADJUSTMENT, and RETURN all add to stock.
            const isDeduction = ['OUTBOUND', 'DEFECT'].includes(row.transaction_type);
            total += isDeduction ? -row.qty : row.qty;
        });
        return total;
    },

    async processReturn(payload) {
        const cName = canon(payload.productName || payload.product_name);
        const status = payload.status || 'Restocked';
        const params = {
            p_barcode: payload.barcode,
            p_sku: payload.sku || cName,
            p_product_name: cName,
            p_quantity: payload.quantity || 1,
            p_return_reason: payload.returnReason || payload.return_reason || null,
            p_status: status,
            p_scanned_by: payload.scannedBy || payload.scanned_by || null,
            p_notes: payload.notes || null
        };

        let previousQty = null;
        let newQty = null;
        let record = null;
        let movement = null;

        const { data: rpcData, error: rpcError } = await supabaseClient.rpc('process_return', params);
        if (!rpcError && rpcData && rpcData.length > 0) {
            previousQty = rpcData[0].previous_quantity;
            newQty = rpcData[0].new_quantity;
            const returnId = rpcData[0].return_id;

            const { data: retRow, error: retErr } = await supabaseClient
                .from('returns')
                .select('*')
                .eq('id', returnId)
                .single();

            if (!retErr) {
                record = {
                    id: retRow.id,
                    barcode: retRow.barcode,
                    sku: retRow.sku,
                    productName: retRow.product_name,
                    quantity: retRow.quantity,
                    returnReason: retRow.return_reason,
                    status: retRow.status,
                    scannedBy: retRow.scanned_by,
                    createdAt: retRow.created_at
                };
            }

            return { record, previousQty, newQty, movement };
        }

        if (rpcError && rpcError.code !== '42883') {
            throw rpcError;
        }

        previousQty = await this.getProductStockQty(cName);

        const { data: returnRow, error: returnErr } = await supabaseClient
            .from('returns')
            .insert({
                barcode: params.p_barcode,
                sku: params.p_sku,
                product_name: cName,
                quantity: params.p_quantity,
                return_reason: params.p_return_reason,
                status: status,
                scanned_by: params.p_scanned_by,
                notes: params.p_notes,
                restocked: status === 'Restocked'
            })
            .select('*')
            .single();
        if (returnErr) throw returnErr;

        if (status === 'Restocked') {
            const { error: ledgErr } = await supabaseClient.from('stock_ledger').insert({
                product_name: cName,
                transaction_type: 'RETURN',
                qty: params.p_quantity,
                reference_id: returnRow.id,
                notes: 'Return restock'
            });
            if (ledgErr) throw ledgErr;
        }

        newQty = status === 'Restocked' ? previousQty + params.p_quantity : previousQty;

        const { data: moveRow, error: moveErr } = await supabaseClient
            .from('inventory_movements')
            .insert({
                sku: params.p_sku,
                product_name: cName,
                movement_type: status === 'Restocked' ? 'RETURN_RESTOCK' : 'RETURN_INTAKE',
                quantity_change: status === 'Restocked' ? params.p_quantity : 0,
                previous_quantity: previousQty,
                new_quantity: newQty,
                reference_type: 'returns',
                reference_id: returnRow.id,
                scanned_by: params.p_scanned_by,
                notes: params.p_notes
            })
            .select('*')
            .single();
        if (moveErr) throw moveErr;

        record = {
            id: returnRow.id,
            barcode: returnRow.barcode,
            sku: returnRow.sku,
            productName: returnRow.product_name,
            quantity: returnRow.quantity,
            returnReason: returnRow.return_reason,
            status: returnRow.status,
            scannedBy: returnRow.scanned_by,
            createdAt: returnRow.created_at
        };

        movement = moveRow ? {
            id: moveRow.id,
            sku: moveRow.sku,
            productName: moveRow.product_name,
            movementType: moveRow.movement_type,
            quantityChange: moveRow.quantity_change,
            previousQuantity: moveRow.previous_quantity,
            newQuantity: moveRow.new_quantity,
            createdAt: moveRow.created_at
        } : null;

        return { record, previousQty, newQty, movement };
    },

    async undoReturn(returnId, scannedBy) {
        const params = {
            p_return_id: returnId,
            p_scanned_by: scannedBy || null
        };

        const { data: rpcData, error: rpcError } = await supabaseClient.rpc('undo_return', params);
        if (!rpcError && rpcData && rpcData.length > 0) {
            return {
                previousQty: rpcData[0].previous_quantity,
                newQty: rpcData[0].new_quantity,
                movement: null
            };
        }

        if (rpcError && rpcError.code !== '42883') {
            throw rpcError;
        }

        const { data: returnRow, error: retErr } = await supabaseClient
            .from('returns')
            .select('*')
            .eq('id', returnId)
            .single();
        if (retErr) throw retErr;

        const previousQty = await this.getProductStockQty(returnRow.product_name);
        let newQty = previousQty;

        if (returnRow.status === 'Restocked') {
            const { error: ledgErr } = await supabaseClient.from('stock_ledger').insert({
                product_name: returnRow.product_name,
                transaction_type: 'OUTBOUND',
                qty: returnRow.quantity,
                reference_id: returnRow.id,
                notes: 'Return undo'
            });
            if (ledgErr) throw ledgErr;
            newQty = previousQty - returnRow.quantity;
        }

        const { error: updErr } = await supabaseClient
            .from('returns')
            .update({ status: 'Reverted', updated_at: new Date().toISOString() })
            .eq('id', returnId);
        if (updErr) throw updErr;

        const { data: moveRow, error: moveErr } = await supabaseClient
            .from('inventory_movements')
            .insert({
                sku: returnRow.sku,
                product_name: returnRow.product_name,
                movement_type: 'RETURN_UNDO',
                quantity_change: returnRow.status === 'Restocked' ? -returnRow.quantity : 0,
                previous_quantity: previousQty,
                new_quantity: newQty,
                reference_type: 'returns',
                reference_id: returnRow.id,
                scanned_by: scannedBy || returnRow.scanned_by,
                notes: 'Undo last return'
            })
            .select('*')
            .single();
        if (moveErr) throw moveErr;

        return {
            previousQty,
            newQty,
            movement: moveRow
        };
    },

    subscribeReturns(handler) {
        if (!supabaseClient || typeof supabaseClient.channel !== 'function') return null;
        const channel = supabaseClient
            .channel('returns_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, (payload) => {
                if (typeof handler === 'function') handler(payload);
            })
            .subscribe();
        return channel;
    },

    subscribeInventoryMovements(handler) {
        if (!supabaseClient || typeof supabaseClient.channel !== 'function') return null;
        const channel = supabaseClient
            .channel('inventory_movements_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, (payload) => {
                if (typeof handler === 'function') handler(payload);
            })
            .subscribe();
        return channel;
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
                sku: row.sku || row.id,
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
            sku: p.sku || null,
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