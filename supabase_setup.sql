-- TKG Barcode Ops - Supabase Setup Script
-- Run this entire script in the Supabase SQL Editor to initialize your database.

-- 1. Create Stock Ledger Table
CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    product_name TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('INBOUND', 'OUTBOUND', 'DEFECT', 'ADJUSTMENT')),
    qty INTEGER NOT NULL,
    expiry TEXT,
    batch_id TEXT,
    reference_id TEXT, -- E.g. Order ID, AWB, or Defect Log ID
    notes TEXT
);

-- 1b. Expand transaction types to support returns
ALTER TABLE public.stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check;
ALTER TABLE public.stock_ledger
    ADD CONSTRAINT stock_ledger_transaction_type_check
    CHECK (transaction_type IN ('INBOUND', 'OUTBOUND', 'DEFECT', 'ADJUSTMENT', 'RETURN', 'MANUAL_DEDUCT'));
    
-- 2. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY, -- e.g. "SHOP-12345" or "B2B-datetime"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL, -- "Complete", "Pending", "Exported"
    platform TEXT, -- "shopee", "lazada", "tiktok", "shopify", "b2b"
    order_data JSONB NOT NULL -- The massive JSON blob for line items
);

-- 3. Create Defects Table
CREATE TABLE IF NOT EXISTS public.defects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    product TEXT NOT NULL,
    count INTEGER NOT NULL,
    expiry TEXT,
    defect_type TEXT NOT NULL,
    notes TEXT
);

-- 4. Create App Settings Table 
-- (Used for custom product mappings, overrides)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Core Products Table (V2 SYSTEM)
-- This replaces the massive JSON blob with a formal database table.
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- 'single', 'bundle', 'giftbox'
    barcodes TEXT[] DEFAULT '{}',
    image TEXT,
    base_product TEXT,
    components JSONB DEFAULT '[]', -- Recipe contents
    require_inner_scan BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5b. Optional SKU field for operational scans
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;

-- 6. Returns + Refunds + Inventory Movement Tables
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    barcode TEXT NOT NULL,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    return_reason TEXT,
    status TEXT NOT NULL,
    scanned_by TEXT,
    notes TEXT,
    restocked BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.refund_logs (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    refund_date DATE NOT NULL,
    platform TEXT NOT NULL,
    awb TEXT,
    order_id TEXT,
    customer TEXT,
    reason TEXT,
    items TEXT,
    notes TEXT,
    restock BOOLEAN DEFAULT false,
    status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sku TEXT NOT NULL,
    product_name TEXT NOT NULL,
    movement_type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    reference_type TEXT,
    reference_id TEXT,
    scanned_by TEXT,
    notes TEXT
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 7. Create permissive policies for an internal Tool 
-- Since this is an internal dashboard, we allow all Anon Key connections to read/write freely.
DROP POLICY IF EXISTS "Enable all access for stock_ledger" ON public.stock_ledger;
CREATE POLICY "Enable all access for stock_ledger" ON public.stock_ledger FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for orders" ON public.orders;
CREATE POLICY "Enable all access for orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for defects" ON public.defects;
CREATE POLICY "Enable all access for defects" ON public.defects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for app_settings" ON public.app_settings;
CREATE POLICY "Enable all access for app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for products" ON public.products;
CREATE POLICY "Enable all access for products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for returns" ON public.returns;
CREATE POLICY "Enable all access for returns" ON public.returns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for refund_logs" ON public.refund_logs;
CREATE POLICY "Enable all access for refund_logs" ON public.refund_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for inventory_movements" ON public.inventory_movements;
CREATE POLICY "Enable all access for inventory_movements" ON public.inventory_movements FOR ALL USING (true) WITH CHECK (true);

-- 8. Add Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_stock_product ON public.stock_ledger (product_name);
CREATE INDEX IF NOT EXISTS idx_stock_type ON public.stock_ledger (transaction_type);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_platform ON public.orders (platform);
CREATE INDEX IF NOT EXISTS idx_products_barcodes ON public.products USING GIN (barcodes);
CREATE INDEX IF NOT EXISTS idx_returns_barcode ON public.returns (barcode);
CREATE INDEX IF NOT EXISTS idx_returns_sku ON public.returns (sku);
CREATE INDEX IF NOT EXISTS idx_returns_created ON public.returns (created_at);
CREATE INDEX IF NOT EXISTS idx_refund_logs_status ON public.refund_logs (status);
CREATE INDEX IF NOT EXISTS idx_refund_logs_created ON public.refund_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON public.inventory_movements (sku);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON public.inventory_movements (created_at);

-- 10. Returns Processing RPCs (Transactional)
CREATE OR REPLACE FUNCTION public.get_product_stock_qty(p_product_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('OUTBOUND', 'DEFECT') THEN -qty ELSE qty END
    ), 0)
    INTO v_total
    FROM public.stock_ledger
    WHERE product_name = p_product_name;

    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_return(
    p_barcode TEXT,
    p_sku TEXT,
    p_product_name TEXT,
    p_quantity INTEGER,
    p_return_reason TEXT,
    p_status TEXT,
    p_scanned_by TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    return_id UUID,
    previous_quantity INTEGER,
    new_quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_prev INTEGER;
    v_new INTEGER;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be positive';
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('OUTBOUND', 'DEFECT') THEN -qty ELSE qty END
    ), 0)
    INTO v_prev
    FROM public.stock_ledger
    WHERE product_name = p_product_name;

    INSERT INTO public.returns (
        barcode,
        sku,
        product_name,
        quantity,
        return_reason,
        status,
        scanned_by,
        notes,
        restocked
    ) VALUES (
        p_barcode,
        p_sku,
        p_product_name,
        p_quantity,
        p_return_reason,
        p_status,
        p_scanned_by,
        p_notes,
        p_status = 'Restocked'
    ) RETURNING id INTO return_id;

    IF p_status = 'Restocked' THEN
        INSERT INTO public.stock_ledger (
            product_name,
            transaction_type,
            qty,
            reference_id,
            notes
        ) VALUES (
            p_product_name,
            'RETURN',
            p_quantity,
            return_id::text,
            'Return restock'
        );
        v_new := v_prev + p_quantity;
    ELSE
        v_new := v_prev;
    END IF;

    INSERT INTO public.inventory_movements (
        sku,
        product_name,
        movement_type,
        quantity_change,
        previous_quantity,
        new_quantity,
        reference_type,
        reference_id,
        scanned_by,
        notes
    ) VALUES (
        p_sku,
        p_product_name,
        CASE WHEN p_status = 'Restocked' THEN 'RETURN_RESTOCK' ELSE 'RETURN_INTAKE' END,
        CASE WHEN p_status = 'Restocked' THEN p_quantity ELSE 0 END,
        v_prev,
        v_new,
        'returns',
        return_id::text,
        p_scanned_by,
        p_notes
    );

    RETURN QUERY SELECT return_id, v_prev, v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_return(
    p_return_id UUID,
    p_scanned_by TEXT DEFAULT NULL
)
RETURNS TABLE (
    previous_quantity INTEGER,
    new_quantity INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_return public.returns%ROWTYPE;
    v_prev INTEGER;
    v_new INTEGER;
BEGIN
    SELECT * INTO v_return FROM public.returns WHERE id = p_return_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return not found';
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN transaction_type IN ('OUTBOUND', 'DEFECT') THEN -qty ELSE qty END
    ), 0)
    INTO v_prev
    FROM public.stock_ledger
    WHERE product_name = v_return.product_name;

    IF v_return.status = 'Restocked' THEN
        INSERT INTO public.stock_ledger (
            product_name,
            transaction_type,
            qty,
            reference_id,
            notes
        ) VALUES (
            v_return.product_name,
            'OUTBOUND',
            v_return.quantity,
            v_return.id::text,
            'Return undo'
        );
        v_new := v_prev - v_return.quantity;
    ELSE
        v_new := v_prev;
    END IF;

    UPDATE public.returns
    SET status = 'Reverted',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_return_id;

    INSERT INTO public.inventory_movements (
        sku,
        product_name,
        movement_type,
        quantity_change,
        previous_quantity,
        new_quantity,
        reference_type,
        reference_id,
        scanned_by,
        notes
    ) VALUES (
        v_return.sku,
        v_return.product_name,
        'RETURN_UNDO',
        CASE WHEN v_return.status = 'Restocked' THEN -v_return.quantity ELSE 0 END,
        v_prev,
        v_new,
        'returns',
        v_return.id::text,
        COALESCE(p_scanned_by, v_return.scanned_by),
        'Undo last return'
    );

    RETURN QUERY SELECT v_prev, v_new;
END;
$$;

-- 9. Storage Security Policies for 'product-images' Bucket
-- These permit anyone using the dashboard (Anon Key) to securely upload and replace images.
DROP POLICY IF EXISTS "Public Upload to product-images" ON storage.objects;
CREATE POLICY "Public Upload to product-images" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Update to product-images" ON storage.objects;
CREATE POLICY "Public Update to product-images" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public Select to product-images" ON storage.objects;
CREATE POLICY "Public Select to product-images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'product-images');

-- 11. Example Test Data (Optional)
-- Uncomment to seed sample records for UI verification.
-- INSERT INTO public.refund_logs (id, refund_date, platform, awb, order_id, customer, reason, items, notes, restock, status)
-- VALUES ('rfnd-sample-001', CURRENT_DATE, 'Shopee', 'SPXSG123456789', '2409123456789', 'Test Customer', 'Damaged / Defective', '2x Sample Item', 'Sample note', true, 'Restocked');
--
-- INSERT INTO public.returns (barcode, sku, product_name, quantity, return_reason, status, scanned_by, notes, restocked)
-- VALUES ('794712851851', 'SKU-CHOC-30G', 'chocolate 30g', 1, 'Damaged / Defective', 'Restocked', 'Operator A', 'Sample return', true);
