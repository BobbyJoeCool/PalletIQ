# Seed Reference — What the Database Seed Creates

This document describes the data created by `api/prisma/seed.ts` for each table. Run via `cd api && npx prisma db seed`.

---

## StorageCode (8 rows)

| id | desc |
|----|------|
| CR | Conveyable Reserve |
| FD | Conveyable Food |
| BK | Breakpack |
| NR | Non-Conveyable Reserve |
| NF | Non-Conveyable Food |
| RF | Restricted Food |
| RS | Restricted Reserve |
| BS | Security |

---

## PackingZone (18 rows)

| id | desc |
|----|------|
| 1  | HBA |
| 2  | Kitchen and Dining |
| 3  | Bath and Bedroom |
| 4  | Home Decor |
| 5  | Electronics |
| 6  | Small Appliances |
| 7  | Toys |
| 8  | Games |
| 9  | Security |
| 10 | Food and Beverage |
| 11 | Pets |
| 12 | Sporting Goods |
| 13 | Baby and Infant |
| 14 | Kids Clothes |
| 15 | Womens Clothes |
| 16 | Mens Clothes |
| 17 | Shoes |
| 18 | Seasonal |

---

## Department (6 rows)

| id  | name |
|-----|------|
| INB | Inbound |
| OUT | Outbound |
| BKP | Packing |
| WHS | Warehouse |
| IQA | Inventory Control and Quality Assurance |
| SEC | Security |

---

## HoldType (60 rows)

Six prefixes × ten reason codes = 60 hold type codes.

**Prefixes**

| Letter | Department |
|--------|------------|
| I | Inbound |
| W | Warehouse |
| O | Outbound |
| P | Packing |
| Q | ICQA |
| S | Security |

**Reason codes (applied to every prefix)**

| Suffix | Description |
|--------|-------------|
| 01 | Quantity Issue |
| 02 | DPCI Issue |
| 03 | VCP/SSP Issue |
| 04 | Location Issue |
| 05 | Damage Issue |
| 06 | Label In Location |
| 07 | Tipped Pallet |
| 08 | Fallen Carton |
| 09 | Object in Empty Loc |
| 10 | Expiration Issue |

Example codes: `I01`, `I02`, ... `I10`, `W01`, ... `S10`.

---

## Store (20 rows)

All stores are located in cities around Cedar Falls, Iowa.

| id   | name |
|------|------|
| 2498 | Cedar Falls |
| 2351 | Waterloo North |
| 2352 | Waterloo South |
| 2413 | Waverly |
| 2618 | La Porte City |
| 2123 | Reinbeck |
| 2756 | Dysart |
| 2874 | Independence |
| 2345 | Oelwein |
| 2671 | Iowa Falls |
| 2234 | Hampton |
| 2688 | Ackley |
| 2901 | Grundy Center |
| 2567 | Eldora |
| 2432 | Tama |
| 2789 | Charles City |
| 2890 | Marshalltown |
| 2519 | Mason City |
| 2163 | Cedar Rapids North |
| 2164 | Cedar Rapids South |

---

## User (5 rows)

All users have PIN `1234` (stored as bcrypt hash, 10 rounds).

| zNumber  | First    | Last       | Role    | Dept |
|----------|----------|------------|---------|------|
| z002p25  | Robert   | Breutzmann | ADMIN   | WHS  |
| z002p24  | Diana    | Kowalski   | MANAGER | IQA  |
| z002p23  | Marcus   | Webb       | LEAD    | WHS  |
| z002p22  | Sarah    | Okafor     | IM      | WHS  |
| z002p21  | Tyler    | Hennessey  | WORKER  | INB  |

---

## Item (~156 rows)

Realistic Target-style items. 20–25 items per storage code, no items seeded for packing-only zones.

### CR — Conveyable Reserve (25 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 076-01-0001 | HDMI Cable 6ft |
| 076-01-0002 | USB-C Charging Cable |
| 076-01-0003 | Bluetooth Earbuds |
| 076-01-0004 | Phone Case 4-Pack Assorted |
| 076-01-0005 | Screen Protector 2-Pack |
| 058-01-0001 | Copy Paper 500 Sheet Ream |
| 058-01-0002 | Ballpoint Pen 10-Pack |
| 058-01-0003 | Sticky Notes 3x3 6-Pack |
| 058-01-0004 | Binder 3-Ring 1 Inch |
| 058-01-0005 | Highlighter 5-Pack |
| 065-01-0001 | Yoga Mat 6mm |
| 065-01-0002 | Water Bottle 32oz Insulated |
| 065-01-0003 | Jump Rope Speed |
| 065-01-0004 | Resistance Bands Set 5pc |
| 065-01-0005 | Foam Roller 12 Inch |
| 086-01-0001 | Extension Cord 6ft 3-Outlet |
| 086-01-0002 | LED Light Bulb A19 4-Pack |
| 086-01-0003 | AA Batteries 20-Pack |
| 086-01-0004 | AAA Batteries 20-Pack |
| 086-01-0005 | Picture Frame 8x10 Black |
| 086-01-0006 | Command Strips 16-Pack |
| 086-01-0007 | Cable Management Sleeve |
| 086-01-0008 | Surge Protector 6-Outlet |
| 086-01-0009 | Duct Tape Heavy Duty |
| 086-01-0010 | Storage Bin 12qt Clear |

### FD — Conveyable Food (25 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 051-01-0001 | Pasta Penne 16oz |
| 051-01-0002 | Pasta Rotini 16oz |
| 051-01-0003 | Rice White Long Grain 5lb |
| 051-01-0004 | Oatmeal Quick 42oz |
| 051-01-0005 | Canned Chicken Broth 32oz |
| 051-01-0006 | Black Beans Canned 15oz |
| 051-01-0007 | Peanut Butter Creamy 40oz |
| 051-01-0008 | Diced Tomatoes 14.5oz 4pk |
| 051-01-0009 | Chicken Noodle Soup 10.75oz |
| 051-01-0010 | Corn Kernels 15.25oz 4pk |
| 052-01-0001 | Potato Chips Original 8oz |
| 052-01-0002 | Granola Bars Oat Honey 8ct |
| 052-01-0003 | Mixed Nuts 10oz |
| 052-01-0004 | Crackers Whole Grain 13.6oz |
| 052-01-0005 | Popcorn Microwave 6pk |
| 052-01-0006 | Trail Mix Classic 28oz |
| 052-01-0007 | Pretzels Twists 16oz |
| 052-01-0008 | Chocolate Chip Cookies 13oz |
| 053-01-0001 | Orange Juice 52oz |
| 053-01-0002 | Apple Juice 64oz |
| 053-01-0003 | Sports Drink 32oz 6pk |
| 053-01-0004 | Sparkling Water 12pk Lime |
| 053-01-0005 | Coffee Ground Medium 30oz |
| 053-01-0006 | Tea Bags Black 100ct |
| 053-01-0007 | Protein Shake Choc 4pk |

### BK — Breakpack (22 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 012-01-0001 | Shampoo Daily Moisture 12oz |
| 012-01-0002 | Conditioner Daily Moisture 12oz |
| 012-01-0003 | Body Wash Refreshing 16oz |
| 012-01-0004 | Deodorant Stick 2.6oz |
| 012-01-0005 | Toothpaste Whitening 6oz |
| 012-01-0006 | Toothbrush Soft 3-Pack |
| 012-01-0007 | Facial Moisturizer SPF 15 4oz |
| 012-01-0008 | Hand Lotion Unscented 8oz |
| 012-01-0009 | Razor Disposable 5-Pack |
| 012-01-0010 | Sunscreen SPF 50 5oz |
| 013-01-0001 | Mascara Black Lengthening |
| 013-01-0002 | Foundation Liquid Medium 1oz |
| 013-01-0003 | Eyeshadow Palette 12-Pan |
| 013-01-0004 | Lipstick Satin Finish |
| 013-01-0005 | Blush Powder 0.39oz |
| 013-01-0006 | Nail Polish Assorted 0.5oz |
| 013-01-0007 | Makeup Remover Wipes 25ct |
| 013-01-0008 | Setting Spray Matte 3.4oz |
| 013-01-0009 | Concealer Medium 0.23oz |
| 013-01-0010 | Bronzer Powder 0.31oz |
| 013-01-0011 | Makeup Sponge Blending 3pk |
| 013-01-0012 | Eyeliner Pencil Black |

### NR — Non-Conveyable Reserve (24 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 021-01-0001 | Bookshelf 5-Shelf Wood |
| 021-01-0002 | TV Stand 55in Black |
| 021-01-0003 | Coffee Table Rectangle |
| 021-01-0004 | Nightstand 2-Drawer |
| 021-01-0005 | Floor Lamp Arc Black |
| 021-01-0006 | Dresser 6-Drawer White |
| 021-01-0007 | Desk Writing 48in Oak |
| 021-01-0008 | Accent Chair Barrel Gray |
| 022-01-0001 | Storage Cube Organizer 6-Cube |
| 022-01-0002 | Wardrobe Portable 48in |
| 022-01-0003 | Shoe Rack 3-Tier Metal |
| 022-01-0004 | Under Bed Storage 2-Pack |
| 022-01-0005 | Laundry Hamper 2-Section |
| 022-01-0006 | Tool Organizer Wall Mount |
| 022-01-0007 | Garage Shelving 5-Tier |
| 023-01-0001 | Outdoor Storage Deck Box 73gal |
| 023-01-0002 | Christmas Tree Pre-Lit 6ft |
| 023-01-0003 | Outdoor Folding Chair 2pk |
| 023-01-0004 | Patio Umbrella 9ft Tilt |
| 023-01-0005 | Snow Blower Single Stage 21in |
| 023-01-0006 | Halloween Inflatable 6ft |
| 023-01-0007 | Garden Hose 50ft |
| 023-01-0008 | Lawn Mower Push Reel |
| 023-01-0009 | Fire Pit Portable 28in |

### NF — Non-Conveyable Food (22 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 056-01-0001 | Water 40pk 16.9oz |
| 056-01-0002 | Sparkling Water 24pk 12oz |
| 056-01-0003 | Sports Drink 24pk 12oz |
| 056-01-0004 | Soda Cola 24pk 12oz Cans |
| 056-01-0005 | Soda Lemon-Lime 24pk 12oz |
| 056-01-0006 | Energy Drink 24pk 16oz |
| 056-01-0007 | Juice Box Apple 40pk |
| 056-01-0008 | Coconut Water 12pk 11oz |
| 057-01-0001 | Dog Food Dry Adult 40lb |
| 057-01-0002 | Cat Food Dry Indoor 18lb |
| 057-01-0003 | Dog Food Wet Beef 13oz 12pk |
| 057-01-0004 | Cat Litter Clumping 40lb |
| 057-01-0005 | Dog Treats Training 30oz |
| 057-01-0006 | Bird Seed Sunflower 20lb |
| 057-01-0007 | Fish Food Flakes 4.52oz |
| 051-02-0001 | Paper Towels 8 Double Rolls |
| 051-02-0002 | Bath Tissue 18 Double Rolls |
| 051-02-0003 | Laundry Detergent Liquid 128oz |
| 051-02-0004 | Dish Soap Original 90oz |
| 051-02-0005 | All-Purpose Cleaner 32oz 2pk |
| 051-02-0006 | Trash Bags 13gal 200ct |
| 051-02-0007 | Zip Lock Bags Gallon 100ct |

### RF — Restricted Food (20 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 054-01-0001 | Wine Red Cabernet 750ml |
| 054-01-0002 | Wine White Chardonnay 750ml |
| 054-01-0003 | Wine Rose 750ml |
| 054-01-0004 | Beer Lager 12pk 12oz |
| 054-01-0005 | Beer IPA 6pk 12oz |
| 054-01-0006 | Hard Seltzer Variety 12pk |
| 054-01-0007 | Cider Apple 6pk 12oz |
| 054-01-0008 | Wine Sparkling Brut 750ml |
| 054-01-0009 | Beer Stout 6pk 12oz |
| 054-01-0010 | Wine Pinot Noir 750ml |
| 059-01-0001 | Butter Salted 4ct 1lb |
| 059-01-0002 | Eggs Large White 18ct |
| 059-01-0003 | Milk Whole Gallon |
| 059-01-0004 | Cheese Shredded 3-Cheese 32oz |
| 059-01-0005 | Yogurt Greek Plain 32oz |
| 059-01-0006 | Cream Cheese 3pk 8oz |
| 059-01-0007 | Orange Juice Chilled 89oz |
| 059-01-0008 | Sour Cream 24oz |
| 059-01-0009 | Cheddar Cheese Block 32oz |
| 059-01-0010 | Bacon 16oz Thick Cut |

### RS — Restricted Reserve (23 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 078-01-0001 | Smart Watch Fitness GPS |
| 078-01-0002 | Wireless Speaker Portable |
| 078-01-0003 | Tablet 10in 64GB WiFi |
| 078-01-0004 | Wireless Headphones Over-Ear |
| 078-01-0005 | Action Camera 4K Waterproof |
| 078-01-0006 | Smart Home Hub 4-Device Kit |
| 078-01-0007 | Digital Picture Frame 10in WiFi |
| 078-01-0008 | Robot Vacuum Auto-Recharge |
| 087-01-0001 | Gaming Controller Wireless |
| 087-01-0002 | Gaming Headset 7.1 Surround |
| 087-01-0003 | Gaming Mouse Precision |
| 087-01-0004 | Gaming Keyboard Mechanical |
| 087-01-0005 | Gaming Chair Racing Style |
| 087-01-0006 | Gaming Monitor 24in 144Hz |
| 087-01-0007 | VR Headset All-In-One |
| 087-01-0008 | Gift Card Gaming $50 |
| 085-01-0001 | Power Bank 20000mAh |
| 085-01-0002 | Smart Thermostat WiFi |
| 085-01-0003 | Security Camera Outdoor 2pk |
| 085-01-0004 | Smart Doorbell Video WiFi |
| 085-01-0005 | Dash Cam Dual 4K Front Rear |
| 085-01-0006 | E-Reader 6in 16GB |
| 085-01-0007 | Portable Projector Mini 1080p |

### BS — Security (20 items)

| DPCI (dept-class-item) | Name |
|------------------------|------|
| 079-01-0001 | Diamond Stud Earrings .25ctw |
| 079-01-0002 | Sterling Silver Necklace 18in |
| 079-01-0003 | Gold Hoop Earrings 14K 1in |
| 079-01-0004 | Watch Men Analog SS Bracelet |
| 079-01-0005 | Watch Women Quartz Rose Gold |
| 079-01-0006 | Pearl Strand Necklace 16in |
| 079-01-0007 | Gemstone Ring Size 7 S/S |
| 079-01-0008 | Bracelet Beaded Natural Stone |
| 085-02-0001 | Laptop 15in 512GB SSD |
| 085-02-0002 | Laptop 13in 256GB Ultrabook |
| 085-02-0003 | Smartphone 128GB Unlocked |
| 085-02-0004 | Smartphone 256GB Unlocked |
| 085-02-0005 | Wireless Earbuds ANC Premium |
| 085-02-0006 | Smart Watch Premium GPS AMOLED |
| 085-02-0007 | Tablet Pro 12in 128GB LTE |
| 085-02-0008 | Gift Card Visa $100 |
| 085-02-0009 | Gift Card Visa $50 |
| 085-02-0010 | Gift Card Visa $25 |
| 085-02-0011 | Drone Foldable 4K Camera |
| 085-02-0012 | Mirrorless Camera 24MP Kit |

---

## Workstation (13 rows) / WorkstationAisle (65 rows)

Groups aisles into the physical pick/put station that owns them (for later use by
ELA/PRQ, and displayed on LII). A workstation can be a non-contiguous set of aisles, so
this is a plain per-aisle lookup (`WorkstationAisle.aisle` is the primary key, one row
per assigned aisle) rather than a start/end range — `aisle` is validated against
`Location` at the application layer, not a DB foreign key (`Location`'s primary key is
the composite `(aisle, bin, level)`, so `aisle` alone isn't unique there and no true FK
is possible).

| Workstation | Aisles |
| --- | --- |
| CR01 | 300, 301, 302, 303, 304 |
| CR02 | 305, 306, 307, 308, 309 |
| FD01 | 310, 311, 312, 313, 314 |
| FD02 | 315, 316, 317, 318, 319 |
| BK01 | 320, 321, 322, 323, 324 |
| BK02 | 325, 326, 327, 328, 329 |
| NR01 | 100, 101, 102, 103, 104 |
| NR02 | 105, 106, 107, 108, 109 |
| NF01 | 110, 111, 112, 113, 114 |
| NF02 | 115, 116, 117, 118, 119 |
| BS01 | 200 |
| OS01 | 201, 202, 203, 204 |
| RS01 | 730 |

The CR/FD/BK/NR/NF 01/02 split (first-5/last-5 by pattern digit) is a seed-side
default, not a fixed rule — easy to re-seed differently since it's local demo data.

---

## Location (~56,000 rows)

Locations are generated programmatically for every bin/level combination across all
aisles. Approximately 90% are seeded as `STORED`; the remaining ~10% are `EMPTY`. All
locations start with `holdTypeCode = null`.

### Aisle-numbering scheme

CR/FD/BK/NR/NF each get a 10-aisle block; `aisle % 10` is a "pattern digit" (0-9) that
determines the aisle's build, identically across all five storage codes:

| Storage Code | Aisles |
| --- | --- |
| CR | 300-309 |
| FD | 310-319 |
| BK | 320-329 |
| NR | 100-109 |
| NF | 110-119 |

| Digit | Type | Levels |
| --- | --- | --- |
| 0, 1 | Medium | 1-6 all M |
| 2, 3 | Large | L1 M, 2-5 L |
| 4 | Small | L1 M, 2-8 S |
| 5 | Half Small | L1 M, 2-10 HS |
| 6 | Medium/Small | 1-3 M, 4-5 S, 6 M |
| 7 | Large/Half Small | L1 M, 2-3 L, 4-5 HS, 6 M |
| 8 | **Split** | Odd bins: 1-6 all M. Even bins: L1 M, 2-8 S |
| 9 | **Split** | Odd bins: L1 M, 2-10 HS. Even bins: L1 M, 2-5 L |

Digits 8/9 are "split" aisles — odd and even bins have different builds *and* different
max levels within the same aisle.

**Contraction** (CR/FD/BK/NR/NF only): Level 1 always contracts; Level 8 contracts on
**even** bins wherever Small exists (digit 4, or digit 8's even side); Levels 8-10
contract on **odd** bins wherever Half Small exists (digit 5, or digit 9's odd side).
Digit 6/7's shorter Small/Half-Small stretches (levels 4-5) don't contract beyond the
Level-1 rule.

### Special aisles

- **730** — RF (odd bins) / RS (even bins), a "folded" aisle: Zone 1 (96 bins) is XS at
  13 levels; Zones 2-4 (32 bins each) are Level 1 Medium / 2-3 Large / 4 Small / 5 Half
  Small. Zone 1 has 3× a normal zone's bin count since an XS location is 1/3 the width
  of a standard pallet slot — same physical footprint. Replaces where "330" would have
  fallen next in the plain 3xx sequence (330 itself doesn't exist). No contraction rule
  (existing BS/RF/RS exemption preserved).
- **200** — BS, the same folded shape as 730, but no odd/even storage-code split (BS
  both sides). Real and displayed number both 200 — BS isn't Restricted freight.
- **201, 202** — 192 bins/13 levels, Levels 1-9 CR / 10-13 FD (both aisles identical).
- **203** — 192 bins/13 levels, all BK.
- **204** — 192 bins/13 levels, Levels 1-9 NR / 10-13 NF.

### Location counts by aisle group

| Aisles | Bins | Locations |
| --- | --- | --- |
| 300-309 / 310-319 / 320-329 / 100-109 / 110-119 (5 blocks × 10 aisles) | 128 | 8,512 per block (42,560 total) |
| 730 | 192 (96 XS + 96 regular) | 1,728 |
| 200 | 192 (96 XS + 96 regular) | 1,728 |
| 201, 202, 203, 204 | 192 each | 2,496 each (9,984 total) |

---

## Pallet (~50,000 rows)

One pallet per STORED location. Each pallet is randomly assigned an item from the pool matching that location's storage code.

**Pallet field rules:**

| Field | Value |
|-------|-------|
| pid | Random 8-digit integer, globally unique |
| dept/class/item | Randomly selected from items with matching storageCode |
| receivedPallets | 1 |
| currentPallets | 1 |
| receivedCartons | Random 1–20 |
| currentCartons | Same as receivedCartons |
| receivedSSPs | 0 |
| currentSSPs | 0 |
| vcp | Random from [6, 8, 10, 12, 16, 20, 24] |
| ssp | 50% chance: vcp · 50% chance: vcp/2 |
| status | STORED |
| locationAisle/Bin/Level | Matches location |
| receivedByZ | z002p21 (Tyler Hennessey) |
| receivedAt | Random datetime within past 365 days |
| putByZ | z002p22 (Sarah Okafor) |
| putAt | receivedAt + 1–8 hours |
| lastPulledByZ | null |
| lastPulledAt | null |

---

## Container (8 rows)

Eight sample containers across the first 8 stored pallets, all destined for store 2498 (Cedar Falls).

**CID format:** `{storeId:4}{dept:3}{class:2}{item:4}{pid:8}{random:8}{batchDate:7}` = 36 characters

| Status | Count | Notes |
|--------|-------|-------|
| AVAILABLE | 3 | Ready to be assigned |
| PRINTED | 1 | Printed, not yet pulled |
| PULLED | 2 | Associated pallet has been pulled |
| CANCELED | 1 | Voided before fulfillment |
| PURGED | 1 | purgeDate set to yesterday |

All containers use today's Julian date as `batchDate` (YYYYDDD format, e.g. `2026176`). Purge window is 7 days forward, except the PURGED row which is set to yesterday.
