from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "_upwork_portfolio" / "09-keyora-stayos" / "UPLOAD-TO-UPWORK"
OUT.mkdir(parents=True, exist_ok=True)
IMG = ROOT / "assets" / "images"
DISPLAY = ROOT / "node_modules" / "@expo-google-fonts" / "playfair-display" / "700Bold" / "PlayfairDisplay_700Bold.ttf"
BODY = ROOT / "node_modules" / "@expo-google-fonts" / "dm-sans" / "500Medium" / "DMSans_500Medium.ttf"
BOLD = ROOT / "node_modules" / "@expo-google-fonts" / "dm-sans" / "700Bold" / "DMSans_700Bold.ttf"
CREAM, INK, LIME, SKY, CORAL, MUTED, WHITE = "#F7F2E8", "#10100F", "#C9FF45", "#DDE7FF", "#FF614D", "#696A64", "#FFFFFF"

def font(path, size): return ImageFont.truetype(str(path), size)
def fit(path, box):
    im = Image.open(path).convert("RGB")
    scale = max(box[0] / im.width, box[1] / im.height)
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
    left, top = (im.width - box[0]) // 2, (im.height - box[1]) // 2
    return im.crop((left, top, left + box[0], top + box[1]))
def rr(draw, xy, radius, fill, outline=None, width=1): draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)
def text(draw, xy, value, fnt, fill=INK, anchor=None): draw.text(xy, value, font=fnt, fill=fill, anchor=anchor)
def save(im, name): im.save(OUT / name, "JPEG", quality=93, subsampling=0, optimize=True)

def cover():
    im = Image.new("RGB", (3200, 2400), INK); d = ImageDraw.Draw(im)
    hero = fit(IMG / "casablanca-penthouse.webp", (1900, 2400)); im.paste(hero, (1300, 0))
    grad = Image.new("RGBA", im.size, (0,0,0,0)); gd = ImageDraw.Draw(grad)
    for x in range(1500):
        a = int(255 * (1 - x / 1500)); gd.line((x,0,x,2400), fill=(16,16,15,a))
    im = Image.alpha_composite(im.convert("RGBA"), grad).convert("RGB"); d = ImageDraw.Draw(im)
    rr(d, (160, 160, 850, 245), 42, LIME); text(d, (505, 202), "HOSPITALITY OPERATIONS", font(BOLD, 34), anchor="mm")
    text(d, (160, 520), "KEYORA", font(DISPLAY, 190), WHITE)
    text(d, (160, 725), "StayOS", font(DISPLAY, 190), WHITE)
    text(d, (165, 1040), "Hotel operations,\nbeautifully run.", font(DISPLAY, 106), CREAM)
    text(d, (165, 1420), "React Native  ·  Expo  ·  TypeScript", font(BOLD, 40), LIME)
    features = ["Multi-property dashboard", "Room inventory & booking", "Guest CRM & housekeeping"]
    y = 1595
    for item in features:
        d.ellipse((165,y+8,191,y+34), fill=CORAL); text(d, (220,y), item, font(BODY, 42), WHITE); y += 88
    rr(d, (165, 2080, 1160, 2220), 70, CREAM); text(d, (662, 2150), "MOBILE PRODUCT DESIGN + DEVELOPMENT", font(BOLD, 32), anchor="mm")
    save(im, "00-COVER-KEYORA-3200x2400.jpg")

def inventory():
    im = Image.new("RGB", (3200,2400), CREAM); d = ImageDraw.Draw(im)
    text(d,(160,140),"01 / DISCOVERY",font(BOLD,34),CORAL); text(d,(160,230),"Room inventory\nthat works at a glance.",font(DISPLAY,112))
    text(d,(168,520),"Search, live status, destination, guest capacity and rate bands—\nwith clear reset and empty states.",font(BODY,42),MUTED)
    pics=["atlas-suite.webp","fez-junior-suite.webp","marrakech-family-suite.webp","tangier-twin.webp"]
    positions=[(160,760),(1660,760),(160,1550),(1660,1550)]
    names=[("Atlas Signature","Marrakech · 4.92"),("Cedar Junior","Fez · 4.88"),("Palm Family","Marrakech · 4 guests"),("Strait Twin","Tangier · 2 guests")]
    for p,pos,meta in zip(pics,positions,names):
        card=fit(IMG/p,(1380,600)); card=card.resize((1380,600)); im.paste(card,pos); rr(d,(pos[0],pos[1]+510,pos[0]+1380,pos[1]+700),0,WHITE)
        text(d,(pos[0]+42,pos[1]+540),meta[0],font(BOLD,44)); text(d,(pos[0]+42,pos[1]+602),meta[1],font(BODY,30),MUTED)
        rr(d,(pos[0]+1030,pos[1]+548,pos[0]+1332,pos[1]+630),42,LIME); text(d,(pos[0]+1181,pos[1]+589),"AVAILABLE",font(BOLD,25),anchor="mm")
    save(im,"01-ROOM-INVENTORY.jpg")

def detail():
    im=Image.new("RGB",(3200,2400),CREAM); d=ImageDraw.Draw(im)
    hero=fit(IMG/"atlas-suite.webp",(1760,2400)); im.paste(hero,(0,0))
    rr(d,(1660,100,3120,2300),70,WHITE)
    text(d,(1780,190),"02 / STAY DETAIL",font(BOLD,32),CORAL); text(d,(1780,300),"Atlas Signature",font(DISPLAY,92))
    text(d,(1780,430),"Marrakech · KEYORA Medina",font(BODY,34),MUTED)
    rr(d,(1780,525,2050,605),40,LIME); text(d,(1915,565),"4.92 · 184",font(BOLD,28),anchor="mm")
    text(d,(1780,705),"Everything guests need\nto book with confidence.",font(DISPLAY,70))
    items=["Instant confirmation","Flexible cancellation","Detailed amenities","Availability and dates","Transparent price breakdown","Policies and house rules"]
    y=1040
    for i,item in enumerate(items):
        c=[LIME,SKY,"#FFE7E2"][i%3]; rr(d,(1780,y,1844,y+64),32,c); text(d,(1812,y+32),"✓",font(BOLD,30),anchor="mm"); text(d,(1885,y+8),item,font(BOLD,36)); y+=128
    rr(d,(1780,1860,2980,2070),42,INK); text(d,(1840,1905),"3 nights · 2 guests",font(BODY,28),"#CACAC4"); text(d,(1840,1970),"9,918 MAD total",font(DISPLAY,56),WHITE); rr(d,(2550,1905,2910,2025),60,CORAL); text(d,(2730,1965),"BOOK",font(BOLD,30),WHITE,anchor="mm")
    save(im,"02-ADVANCED-STAY-DETAIL.jpg")

def operations():
    im=Image.new("RGB",(3200,2400),INK); d=ImageDraw.Draw(im)
    text(d,(160,150),"03 / OPERATIONS",font(BOLD,34),LIME); text(d,(160,250),"One command center.\nEvery stay in sync.",font(DISPLAY,112),WHITE)
    text(d,(165,540),"Built for owners, managers, front desk and housekeeping teams.",font(BODY,42),"#CACAC4")
    stats=[("33%","OCCUPANCY",LIME),("42.8K","REVENUE · MAD",CREAM),("4.8","GUEST SCORE",SKY)]
    x=160
    for val,lab,color in stats:
        rr(d,(x,760,x+880,1130),56,color); text(d,(x+55,820),val,font(DISPLAY,100)); text(d,(x+58,1015),lab,font(BOLD,26),MUTED); x+=960
    cards=[("LIVE DASHBOARD","Occupancy, revenue, arrivals and room-turn signals."),("BOOKING CALENDAR","Deep-linked reservations with channel and pricing data."),("GUEST CRM","VIP status, stay history and contact intelligence."),("HOUSEKEEPING","Rush, blocked and ready states synchronized to inventory."),("ROLE WORKSPACES","Owner, manager, front-desk and service entry."),("PRODUCTION CORE","Strict TypeScript, domain tests and optimized assets.")]
    x,y=160,1300
    for title,copy in cards:
        rr(d,(x,y,x+880,y+390),46,"#1F1F1D",outline="#3D3D39",width=3); rr(d,(x+44,y+44,x+108,y+108),32,CORAL); text(d,(x+44,y+155),title,font(BOLD,32),WHITE); text(d,(x+44,y+220),copy,font(BODY,29),"#CACAC4"); x+=960
        if x>2800: x=160; y+=450
    save(im,"03-OPERATIONS-PLATFORM.jpg")

cover(); inventory(); detail(); operations()
print(OUT)
