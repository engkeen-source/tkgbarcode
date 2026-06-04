/* 
   products.js - Central Product Database 
   Organized by category for easier management.
*/

try {
    const oldInv = JSON.parse(localStorage.getItem('tkg_inventory') || '{}');
    let invChanged = false;
    const invMap = {
        "bronys banana fritter": "brownie crisps (108g) banana fritter",
        "bronys chocolate chip": "brownie crisps (108g) chocolate chip",
        "bronys peanut pancake": "brownie crisps (108g) peanut pancake",
        "matcha brony 35g": "brownie crisps (35g) matcha",
    };
    for (const [oldK, newK] of Object.entries(invMap)) {
        if (oldInv[oldK] !== undefined) {
            oldInv[newK] = oldInv[oldK];
            delete oldInv[oldK];
            invChanged = true;
        }
    }
    if (invChanged) localStorage.setItem('tkg_inventory', JSON.stringify(oldInv));
} catch (e) { console.error(e); }

// --- 1. INDIVIDUAL PRODUCTS CATALOG ---
const PRODUCT_CATALOG = {
    "Popcorn 30g": {
        "chocolate 30g": { type: "single", barcodes: ["794712851851"], image: "images/30gProducts/CH30g.png" },
        "kaya butter toast 30g": { type: "single", barcodes: ["794712851882"], image: "images/30gProducts/KBT30g.png" },
        "nasi lemak 30g": { type: "single", barcodes: ["794712851899"], image: "images/30gProducts/NL30g.png" },
        "pulut hitam 30g": { type: "single", barcodes: ["794712851905"], image: "images/30gProducts/PH30g.png" },
        "salted caramel 30g": { type: "single", barcodes: ["794712851912"], image: "images/30gProducts/SC30g.png" },
        "chilli crab 30g": { type: "single", barcodes: ["794712851844"], image: "images/30gProducts/CC30g.png" },
        "holy cheese 30g": { type: "single", barcodes: ["796548081532"], image: "images/30gProducts/HC30g.png" },       // TODO: add images/30gProducts/HC30g.png
        "chicken floss 30g": { type: "single", barcodes: ["794712851837"], image: "images/30gProducts/CF30g.png" },    // TODO: add images/30gProducts/CF30g.png
        "fish head curry 30g": { type: "single", barcodes: ["794712851875"], image: "images/30gProducts/FHC30g.png" }   // TODO: add images/30gProducts/FHC30g.png
    },
    "Popcorn 65g": {
        "chocolate 65g": { type: "single", barcodes: ["793618011932"], image: "images/65gProducts/CHC65G.png" },
        "kaya butter toast 65g": { type: "single", barcodes: ["793591857121"], image: "images/65gProducts/KBT65G.png" },
        "nasi lemak 65g": { type: "single", barcodes: ["793591857114"], image: "images/65gProducts/NL65G.png" },
        "pulut hitam 65g": { type: "single", barcodes: ["794712851813"], image: "images/65gProducts/PH65G.png" },
        "salted caramel 65g": { type: "single", barcodes: ["793591857138"], image: "images/65gProducts/SC65G.png" },
        "chilli crab 65g": { type: "single", barcodes: ["793591857107"], image: "images/65gProducts/CC65G.png" },
        "chicken floss 65g": { type: "single", barcodes: ["793618011949"], image: "images/65gProducts/CF65G.png" },
        "fish head curry 65g": { type: "single", barcodes: ["793591857091"], image: "images/65gProducts/FHC65G.png" }
    },
    "Poppa": {
        "poppa salted caramel": { type: "single", barcodes: ["796548081457"], image: "images/Poppa/SCPoppa.webp" },
        "poppa chocolate popcorn": { type: "single", barcodes: ["796548081464"], image: "images/Poppa/CHCPP.webp" }
    },
    "Corn Curls": {
        "yumi squid corn curls": { type: "single", barcodes: ["796548081587"], image: "images/CornCurls/yumiCCSquid.jpg" },
        "yumi bbq corn curls": { type: "single", barcodes: ["796548081570"], image: "images/CornCurls/yumiCCbbq.jpg" },
        "yumi cheese corn curls": { type: "single", barcodes: ["796548081563"], image: "images/CornCurls/yumiCCCheese.jpg" }
    },
    "Corn Sticks": {
        "yumi cheese corn stick": { type: "single", barcodes: ["754590720458"], image: "images/CornStick/yumicheesecornstick.png" },
        "yumi bbq chicken corn stick": { type: "single", barcodes: ["754590832809"], image: "images/CornStick/yumibqqcornstick.png" },
        "yumi original corn stick": { type: "single", barcodes: ["754590720472"], image: "images/CornStick/yumioriginalcornstick.png" }
    },
    "Bronys": {
        "brownie crisps (108g) banana fritter": { type: "single", barcodes: ["796548081884"], image: "images/Bronys/BronyBAN108G.jpg" },
        "brownie crisps (108g) chocolate chip": { type: "single", barcodes: ["796548081860"], image: "images/Bronys/BronyCHC108G.jpg" },
        "brownie crisps (108g) peanut pancake": { type: "single", barcodes: ["796548081877"], image: "images/Bronys/BronyPP108G.jpg" },
        "brownie crisps (35g) matcha": { type: "single", barcodes: ["796548081150"], image: "images/Bronys/BronyMATCHA35G.jpg" },
    },
    "Merchandise": {
        "the kettle gourmet limited edition chinese new year ang pow (1pack 5pcs)": { type: "single", barcodes: ["meowmeow"], image: "" }
    },
    "Gift Box Barcodes": {
        "valentine's day gift box": { type: "gift_box", barcodes: ["754590263719"], image: "images/Giftbox" },
        "raya popcorn bundle": { type: "gift_box", barcodes: ["754590720489"], image: "images/Giftbox" },
        "green christmas gift box": { type: "gift_box", barcodes: ["754590263696"], image: "images/Giftbox" },
        "national day bundle": { type: "gift_box", barcodes: ["754590832885"], image: "images/Giftbox" },
        "teacher's day bundle": { type: "gift_box", barcodes: ["796548081341"], image: "images/Giftbox" },
        "original mini pack bundle box": { type: "gift_box", barcodes: ["796548081051"], image: "images/Giftbox" },
        "yumi christmas gift box": { type: "gift_box", barcodes: ["796548081358"], image: "images/Giftbox" },
        "yumi gift box": { type: "gift_box", barcodes: ["796548081228"], image: "images/Giftbox/YUMIgiftbox.webp" },
        "mini cookies bundle box": { type: "gift_box", barcodes: ["796548081051"], image: "images/Giftbox" },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Green Dragon (發财)": { type: "gift_box", barcodes: ["796548081716"], image: "" },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Red Dragon (红中)": { type: "gift_box", barcodes: ["796548081723"], image: "" },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) White Dragon (白板)": { type: "gift_box", barcodes: ["796548081730"], image: "" }
    },
};

// --- 2. GROUPS ---
const GROUPS = {
    "65g_any": ["793618011932", "793591857121", "793591857114", "794712851813", "793591857138", "793591857107", "793618011949"],
    "30g_any": ["794712851851", "794712851882", "794712851899", "794712851905", "794712851912", "794712851844", "796548081532", "794712851837"],
    "corn_stick_any": ["754590720458", "754590720472"],
    "yumi_corn_curls_any": ["796548081587", "796548081570", "796548081563"]
};

// --- 3. HARDCODED MARKETPLACE MAPPINGS ---
// These are direct links from an exact Excel string (like a Variant Name) to a Master Product Name
const HARDCODED_MAPPINGS = {
    "Caramel": "poppa salted caramel",
    "Chocolate": "poppa chocolate popcorn", // Assuming "Chocolate" exactly as a variant means Poppa, based on criteria
    "Chocolate Chip": "brownie crisps (108g) chocolate chip",
    "Banana Fritter": "brownie crisps (108g) banana fritter",
    "Peanut Pancake Flavour": "brownie crisps (108g) peanut pancake"
};

// --- Runtime DBs (Flattened from Catalog) ---
const PRODUCT_DB = {};
const IMAGE_DB = {};
const GIFTBOX_DB = new Set(); // Tracks which names should be treated as "Gift Box" type

for (const category in PRODUCT_CATALOG) {
    const isGiftCat = /gift\s*box|gift\s*set|hamper|bundle\s*box/i.test(category);
    for (const name in PRODUCT_CATALOG[category]) {
        const item = PRODUCT_CATALOG[category][name];
        let barcodes = item.barcodes || [];
        let explicitType = item.type || null;

        PRODUCT_DB[name] = barcodes;
        if (item.image) IMAGE_DB[name] = item.image;

        // Classify as a Gift Box if explicit type is set, or if category/name matches keywords
        if (explicitType === 'gift_box' || isGiftCat || name.toLowerCase().includes('gift box') || name.toLowerCase().includes('gift set')) {
            GIFTBOX_DB.add(name);
        }
    }
}

// --- 3. BUNDLE DEFINITIONS CATALOG ---
const BUNDLE_CATALOG = {
    "Corn Stick Bundles": {
        "yumi original corn stick bundle": {
            type: "bundle",
            contents: [{ name: "Original Corn Stick", count: 3, barcodes: PRODUCT_DB["yumi original corn stick"] }]
        },
        "yumi bbq chicken corn stick bundle": {
            type: "bundle",
            contents: [{ name: "BBQ Chicken Corn Stick", count: 3, barcodes: PRODUCT_DB["yumi bbq chicken corn stick"] }]
        },
        "yumi cheese corn stick bundle": {
            type: "bundle",
            contents: [{ name: "Cheese Corn Stick", count: 3, barcodes: PRODUCT_DB["yumi cheese corn stick"] }]
        },
        "yumi assorted corn stick bundle": {
            type: "bundle",
            contents: [
                { name: "Original Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi original corn stick"] },
                { name: "BBQ Chicken Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi bbq chicken corn stick"] },
                { name: "Cheese Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi cheese corn stick"] }
            ]
        }
    },
    "Corn Curls Bundles": {
        // --- ASSORTED FLAVOURS ---
        "yumi corn curls assorted flavours (bundle of 9/15/30/48) bundle of 9": {
            type: "bundle",
            contents: [
                { name: "Yumi Squid Corn Curls", count: 3, barcodes: PRODUCT_DB["yumi squid corn curls"] },
                { name: "Yumi Cheese Corn Curls", count: 3, barcodes: PRODUCT_DB["yumi cheese corn curls"] },
                { name: "Yumi BBQ Corn Curls", count: 3, barcodes: PRODUCT_DB["yumi bbq corn curls"] }
            ]
        },
        "yumi corn curls assorted flavours (bundle of 9/15/30/48) bundle of 15": {
            type: "bundle",
            contents: [
                { name: "Yumi Squid Corn Curls", count: 5, barcodes: PRODUCT_DB["yumi squid corn curls"] },
                { name: "Yumi Cheese Corn Curls", count: 5, barcodes: PRODUCT_DB["yumi cheese corn curls"] },
                { name: "Yumi BBQ Corn Curls", count: 5, barcodes: PRODUCT_DB["yumi bbq corn curls"] }
            ]
        },
        "yumi corn curls assorted flavours (bundle of 9/15/30/48) bundle of 30": {
            type: "bundle",
            contents: [
                { name: "Yumi Squid Corn Curls", count: 10, barcodes: PRODUCT_DB["yumi squid corn curls"] },
                { name: "Yumi Cheese Corn Curls", count: 10, barcodes: PRODUCT_DB["yumi cheese corn curls"] },
                { name: "Yumi BBQ Corn Curls", count: 10, barcodes: PRODUCT_DB["yumi bbq corn curls"] }
            ]
        },
        "yumi corn curls assorted flavours (bundle of 9/15/30/48) bundle of 48": {
            type: "bundle",
            contents: [
                { name: "Yumi Squid Corn Curls", count: 16, barcodes: PRODUCT_DB["yumi squid corn curls"] },
                { name: "Yumi Cheese Corn Curls", count: 16, barcodes: PRODUCT_DB["yumi cheese corn curls"] },
                { name: "Yumi BBQ Corn Curls", count: 16, barcodes: PRODUCT_DB["yumi bbq corn curls"] }
            ]
        },

        // --- CHEESE SINGLE FLAVOUR ---
        "yumi cheese corn curls bundle of 15": {
            type: "bundle",
            contents: [{ name: "Yumi Cheese Corn Curls", count: 15, barcodes: PRODUCT_DB["yumi cheese corn curls"] }]
        },
        "yumi cheese corn curls bundle of 30": {
            type: "bundle",
            contents: [{ name: "Yumi Cheese Corn Curls", count: 30, barcodes: PRODUCT_DB["yumi cheese corn curls"] }]
        },

        // --- BBQ SINGLE FLAVOUR ---
        "yumi bbq corn curls bundle of 15": {
            type: "bundle",
            contents: [{ name: "Yumi BBQ Corn Curls", count: 15, barcodes: PRODUCT_DB["yumi bbq corn curls"] }]
        },
        "yumi bbq corn curls bundle of 30": {
            type: "bundle",
            contents: [{ name: "Yumi BBQ Corn Curls", count: 30, barcodes: PRODUCT_DB["yumi bbq corn curls"] }]
        },

        // --- SQUID SINGLE FLAVOUR ---
        "yumi squid corn curls bundle of 15": {
            type: "bundle",
            contents: [{ name: "Yumi Squid Corn Curls", count: 15, barcodes: PRODUCT_DB["yumi squid corn curls"] }]
        },
        "yumi squid corn curls bundle of 30": {
            type: "bundle",
            contents: [{ name: "Yumi Squid Corn Curls", count: 30, barcodes: PRODUCT_DB["yumi squid corn curls"] }]
        }
    },
    "Snack Monsters (8x65g)": {
        "the kettle gourmet assorted singles popcorn (8 x 65g)": {
            type: "bundle",
            contents: [
                { name: "Chicken Floss 65g", count: 1, barcodes: PRODUCT_DB["chicken floss 65g"] },
                { name: "Chilli Crab 65g", count: 1, barcodes: PRODUCT_DB["chilli crab 65g"] },
                { name: "Chocolate 65g", count: 1, barcodes: PRODUCT_DB["chocolate 65g"] },
                { name: "Kaya Butter Toast 65g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 65g"] },
                { name: "Nasi Lemak 65g", count: 1, barcodes: PRODUCT_DB["nasi lemak 65g"] },
                { name: "Pulut Hitam 65g", count: 1, barcodes: PRODUCT_DB["pulut hitam 65g"] },
                { name: "Salted Caramel 65g", count: 1, barcodes: PRODUCT_DB["salted caramel 65g"] }
                // FHC REMOVED per user rule
            ]
        },
        "nasi lemak snack monsters": {
            type: "bundle",
            contents: [{ name: "Nasi Lemak 65g", count: 8, barcodes: PRODUCT_DB["nasi lemak 65g"] }]
        },
        "chocolate snack monsters": {
            type: "bundle",
            contents: [{ name: "Chocolate 65g", count: 8, barcodes: PRODUCT_DB["chocolate 65g"] }]
        },
        "chilli crab snack monsters": {
            type: "bundle",
            contents: [{ name: "Chilli Crab 65g", count: 8, barcodes: PRODUCT_DB["chilli crab 65g"] }]
        },
        "salted caramel snack monsters": {
            type: "bundle",
            contents: [{ name: "Salted Caramel 65g", count: 8, barcodes: PRODUCT_DB["salted caramel 65g"] }]
        },
        "the kettle gourmet 20 + 5 bundle set (25 x 65g)": {
            type: "bundle",
            contents: [{ name: "Any 65g Pack", count: 25, barcodes: GROUPS["65g_any"] }]
        },
        "the kettle gourmet 12 + 2 bundle set (14 x 65g)": {
            type: "bundle",
            contents: [{ name: "Any 65g Pack", count: 14, barcodes: GROUPS["65g_any"] }]
        },
        "the kettle gourmet crazy asian popcorn flavoured 3-bundle (3 x 65g)": {
            type: "bundle",
            contents: [
                { name: "Chilli Crab 65g", count: 1, barcodes: PRODUCT_DB["chilli crab 65g"] },
                { name: "Kaya Butter Toast 65g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 65g"] },
                { name: "Nasi Lemak 65g", count: 1, barcodes: PRODUCT_DB["nasi lemak 65g"] }
            ]
        }
    },
    "Assorted Gift Boxes (8x30g)": {
        "the kettle gourmet popcorn birthday gift box (assortment of 8 packs x 30g)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] },
                { name: "Birthday Sleeve", count: 1, barcodes: [] }
            ]
        },
        "the kettle gourmet national day bundle (assortment of 8 x 30g)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "the kettle gourmet children's day bundles (assortment of 8 x 30g)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "the kettle gourmet original mini pack popcorn bundle box (assortment of 8 x 30g)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "original mini pack popcorn bundle box": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "the kettle gourmet assorted mini snack monster (assortment of 8 x 30g)": {
            type: "bundle",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "the kettle gourmet assorted snacks happy birthday gift sets assorted popcorn set": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Green Dragon (發财)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },

        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Red Dragon (红中)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) White Dragon (白板)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) 3 Dragons (3 Boxes)": {
            type: "gift_box",
            contents: [
                { name: "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Green Dragon (發财)", count: 1, barcodes: ["796548081716"] },
                { name: "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Red Dragon (红中)", count: 1, barcodes: ["796548081723"] },
                { name: "The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) White Dragon (白板)", count: 1, barcodes: ["796548081730"] }
            ]
        }
    },
    "The Kettle Gourmet Mahjong Prosperity CNY Gift Set 麻将年丰礼盒 (Assortment of 18 Snacks)": {
        type: "gift_box",
        contents: [

        ]
    },
    "Specialty Gift Sets": {
        "The Kettle Gourmet Mahjong Prosperity CNY Gift Set 麻将年丰礼盒 (Assortment of 18 Snacks)": {
            type: "gift_box",
            contents: [
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Holy Cheese 30g", count: 2, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Yumi Original Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi original corn stick"] },
                { name: "Yumi Cheese Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi cheese corn stick"] },
                { name: "Yumi BBQ Chicken Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi bbq chicken corn stick"] },
                { name: "Brownie Crisps (108g) Banana Fritter", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) banana fritter"] },
                { name: "Brownie Crisps (108g) Chocolate Chip", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) chocolate chip"] },
                { name: "Brownie Crisps (108g) Peanut Pancake", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) peanut pancake"] },
                { name: "Brownie Crisps (35g) Matcha", count: 3, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] },
                { name: "CNY Green Sleeve", count: 1, barcodes: PRODUCT_DB["The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Green Dragon (發财)"] },
                { name: "CNY Red Sleeve", count: 1, barcodes: PRODUCT_DB["The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) Red Dragon (红中)"] },
                { name: "CNY White Sleeve", count: 1, barcodes: PRODUCT_DB["The Kettle Gourmet CNY HUAT Gift Set (8packs x 30g Popcorn) White Dragon (白板)"] }
            ]
        },
        "the kettle gourmet cny huat gift box (assortment of snacks)": {
            type: "gift_box",
            contents: [
                { name: "Holy Cheese 30g", count: 2, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Brownie Crisps (35g) Matcha", count: 2, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] }
            ]
        },
        "valentine's day gift box (assortment of 2 x 65g + 2 x 30g)": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Nasi Lemak 65g", count: 1, barcodes: PRODUCT_DB["nasi lemak 65g"] },
                { name: "Salted Caramel 65g", count: 1, barcodes: PRODUCT_DB["salted caramel 65g"] }
            ]
        },
        "the kettle gourmet triple cny huat mahjong assorted snacks gift box set": {
            type: "gift_box",
            contents: [
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Holy Cheese 30g", count: 2, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Yumi Original Corn Stick", count: 2, barcodes: PRODUCT_DB["yumi original corn stick"] },
                { name: "Yumi BBQ Chicken Corn Stick", count: 1, barcodes: PRODUCT_DB["yumi bbq chicken corn stick"] },
                { name: "Brownie Crisps (35g) Matcha", count: 1, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] },
                { name: "Yumi Squid Corn Curls", count: 1, barcodes: PRODUCT_DB["yumi squid corn curls"] },
                { name: "Yumi Cheese Corn Curls", count: 1, barcodes: PRODUCT_DB["yumi cheese corn curls"] },
                { name: "Yumi BBQ Corn Curls", count: 1, barcodes: PRODUCT_DB["yumi bbq corn curls"] }
            ]
        },
        "The Kettle Gourmet Christmas Mini Pack Popcorn Bundle (Assortment of 8 Packs x 30g) Blue": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "christmas gift box green": {
            type: "gift_box",
            contents: [
                { name: "Chicken Floss 30g", count: 1, barcodes: PRODUCT_DB["chicken floss 30g"] },
                { name: "Chilli Crab 30g", count: 1, barcodes: PRODUCT_DB["chilli crab 30g"] },
                { name: "Chocolate 30g", count: 1, barcodes: PRODUCT_DB["chocolate 30g"] },
                { name: "Holy Cheese 30g", count: 1, barcodes: PRODUCT_DB["holy cheese 30g"] },
                { name: "Kaya Butter Toast 30g", count: 1, barcodes: PRODUCT_DB["kaya butter toast 30g"] },
                { name: "Nasi Lemak 30g", count: 1, barcodes: PRODUCT_DB["nasi lemak 30g"] },
                { name: "Pulut Hitam 30g", count: 1, barcodes: PRODUCT_DB["pulut hitam 30g"] },
                { name: "Salted Caramel 30g", count: 1, barcodes: PRODUCT_DB["salted caramel 30g"] }
            ]
        },
        "bronys brownie crisps 4 x 35g matcha": {
            type: "bundle",
            contents: [{ name: "Brownie Crisps (35g) Matcha", count: 4, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] }]
        },
        "bronys brownie crisps 4 x 35g assortment": {
            type: "bundle",
            contents: [
                { name: "Brownie Crisps (35g) Matcha", count: 2, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] }
            ]
        },
        "the kettle gourmet bronys edition christmas brownie crisps gift set (3 packs x 108g + 2 packs x 35g)": {
            type: "bundle",
            contents: [
                { name: "Brownie Crisps (108g) Banana Fritter", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) banana fritter"] },
                { name: "Brownie Crisps (108g) Chocolate Chip", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) chocolate chip"] },
                { name: "Brownie Crisps (108g) Peanut Pancake", count: 1, barcodes: PRODUCT_DB["brownie crisps (108g) peanut pancake"] },
                { name: "Brownie Crisps (35g) Matcha", count: 1, barcodes: PRODUCT_DB["brownie crisps (35g) matcha"] }
            ]
        }
    }
};

// --- Runtime BUNDLE_DB (Flattened) ---
const BUNDLE_DB = {};
for (const category in BUNDLE_CATALOG) {
    const isGiftCat = /gift\s*box|gift\s*set|hamper|bundle\s*box/i.test(category);
    for (const name in BUNDLE_CATALOG[category]) {
        const item = BUNDLE_CATALOG[category][name];
        let contents = Array.isArray(item) ? item : (item.contents || []);
        let explicitType = (!Array.isArray(item) && item.type) ? item.type : null;

        BUNDLE_DB[name] = contents;

        // Classify as a Gift Box if explicit type is set, or if category/name matches keywords
        if (explicitType === 'gift_box' || isGiftCat || name.toLowerCase().includes('gift box') || name.toLowerCase().includes('gift set')) {
            GIFTBOX_DB.add(name);
        }
    }
}

// Add images for bundles from CATALOG if available
for (const name in BUNDLE_DB) {
    if (!IMAGE_DB[name]) {
        // Check if there is an image mapping in the complex aliases or specifically for the bundle
        const aliasImages = {
            "Sweet Flavours Popcorn Bundle (8 Packs x 65g)": "images/Bundle/Sweetflavoursbundle8.webp",
            "all-time classic favourite": "images/Bundle/all-time classic favourite.webp",
            "the kettle gourmet crazy asian popcorn flavoured 3-bundle (3 x 65g)": "images/Bundle/crazyasianflavourbundleof3.webp",
            "nasi lemak snack monsters": "images/Bundle/nasilemak8x65.webp",
            "chocolate snack monsters": "images/Bundle/chocolate8x65.webp",
            "kaya butter toast snack monsters": "images/Bundle/kbt8x65.webp",
            "chilli crab snack monsters": "images/Bundle/chillicrab8x65.webp",
            "chicken floss snack monsters": "images/Bundle/chickenfloss8x65.webp",
            "salted caramel snack monsters": "images/Bundle/saltedcaramel8x65.webp",
            "pulut hitam snack monsters": "images/Bundle/puluthitam8x65.webp",
            "20 + 5 bundle set": "images/Bundle/20+5bundle.webp",
            "12 + 2 bundle set": "images/Bundle/12+2bundle.webp",
            "yumi original corn stick bundle": "images/Bundle/yumioriginalbundleof3.webp",
            "yumi bbq chicken corn stick bundle": "images/Bundle/yumibqqcornstickbundleof3.webp",
            "yumi cheese corn stick bundle": "images/Bundle/yumicheesecornstickbundleof3.webp",
            "yumi assorted corn stick bundle": "images/Bundle/yumiAssortedbundleof3.webp",
            "yumi corn curls assorted flavours": "images/Bundle/yumicorncurls.webp",
            "yumi gift box": "images/Giftbox/YUMIgiftbox.webp"
        };
        if (aliasImages[name]) IMAGE_DB[name] = aliasImages[name];
    }
}

// --- PREDEFINED BUILT-IN IMAGES ---
// If you host this application on a web server, the javascript cannot automatically scan the images folder.
// Whenever you upload a new image to your server via FTP/File Manager, simply add its file path to this list
// so it shows up in the "Pick Built-In Image" selector natively!
const PREDEFINED_IMAGES = [
    "images/30gProducts/CC30g.png", "images/30gProducts/HC30g.png", "images/30gProducts/KBT30g.png", "images/30gProducts/NL30g.png", "images/30gProducts/PH30g.png", "images/30gProducts/SC30g.png", "images/30gProducts/chocolate30g.png",
    "images/65gProducts/CC65G.png", "images/65gProducts/CF65G.png", "images/65gProducts/CHC65G.png", "images/65gProducts/KBT65G.png", "images/65gProducts/NL65G.png", "images/65gProducts/PH65G.png", "images/65gProducts/SC65G.png",
    "images/Bronys/BronyBAN108G.jpg", "images/Bronys/BronyCHC108G.jpg", "images/Bronys/BronyPP108G.jpg",
    "images/Bundle/12+2.webp", "images/Bundle/20+5.webp", "images/Bundle/Sweetflavoursbundle8.webp", "images/Bundle/YUMIgiftbox.webp", "images/Bundle/all-time classic favourite.webp", "images/Bundle/chickenfloss8x65.webp", "images/Bundle/chillicrab8x65.webp", "images/Bundle/chocolate8x65.webp", "images/Bundle/kbt8x65.webp", "images/Bundle/nasilemak8x65.webp", "images/Bundle/puluthitam8x65.webp", "images/Bundle/saltedcaramel8x65.webp", "images/Bundle/savouryflavoursbundle.webp", "images/Bundle/yumiAssortedbundleof3.webp", "images/Bundle/yumibqqcornstickbundleof3.webp", "images/Bundle/yumicheesecornstickbundleof3.webp", "images/Bundle/yumioriginalbundleof3.webp",
    "images/CornCurls/yumiCCCheese.jpg", "images/CornCurls/yumiCCSquid.jpg", "images/CornCurls/yumiCCbbq.jpg",
    "images/Cornstick/yumibqqcornstick.png", "images/Cornstick/yumicheesecornstick.png", "images/Cornstick/yumioriginalcornstick.png",
    "images/Logo.webp",
    "images/Poppa/CHCPP.webp", "images/Poppa/SCPOPPA.webp",
    "images/randombullshitgo.jfif"
];

// --- UTILITIES ---
function normalizeName(name) {
    if (!name) return "";
    // Standardize 'bronys' to 'brony' and other common plurals to ensure matching
    return String(name).toLowerCase()
        .replace(/bronys/g, "brony")
        .replace(/cookies/g, "cookie")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeAndFind(rawName) {
    const n = normalizeName(rawName);
    for (const key in PRODUCT_DB) {
        if (n.includes(normalizeName(key))) return { type: 'single', key: key, barcodes: PRODUCT_DB[key] };
    }
    return null;
}

// --- Global Beautiful Naming Utilities ---
window.formatProductName = function (name) {
    if (!name) return "Unknown Product";
    let cleanName = name.toLowerCase().trim();

    // Specific Hardcoded Name Overrides (Fuzzy Match for Marketplace titles)
    if (cleanName.includes('brony') || cleanName.includes('brownie crisp')) {
        if (cleanName.includes('banana')) return "Brownie Crisps (108g) Banana Fritter";
        if (cleanName.includes('peanut')) return "Brownie Crisps (108g) Peanut Pancake";
        if (cleanName.includes('matcha')) return "Brownie Crisps (35g) Matcha";
        if (cleanName.includes('chocolate')) return "Brownie Crisps (108g) Chocolate Chip";
    }

    if (cleanName === "brownie crisps (108g) banana fritter") return "Brownie Crisps (108g) Banana Fritter";
    if (cleanName === "brownie crisps (108g) chocolate chip") return "Brownie Crisps (108g) Chocolate Chip";
    if (cleanName === "brownie crisps (108g) peanut pancake") return "Brownie Crisps (108g) Peanut Pancake";
    if (cleanName === "brownie crisps (35g) matcha") return "Brownie Crisps (35g) Matcha";

    const rules = {
        "bbq": "BBQ",
        "poppa": "Poppa",
        "cny": "CNY",
        "huat": "HUAT",
        "kbt": "KBT",
        "yumi": "Yumi",
        "cc": "CC",
        "nl": "NL",
        "sc": "SC",
        "ph": "PH"
    };
    return name.split(' ').map((w, i) => {
        // Keep weight grams lowercase
        if (w.match(/^\d+g$/i)) return w.toLowerCase();
        if (w.match(/^\d+m$/i)) return w.toLowerCase();

        let lower = w.toLowerCase();
        if (rules[lower]) return rules[lower];

        // Don't capitalize small connective words unless they are the first word
        const smallWords = ["with", "and", "or", "made", "the", "a", "an", "of", "in", "for"];
        if (i !== 0 && smallWords.includes(lower)) {
            return lower;
        }

        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
};
