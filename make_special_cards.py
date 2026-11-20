"""Create one hundred keepsake card fronts from the supplied portrait."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance
import colorsys
import math

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'Encoded Data' / '015_FB_IMG_1781956291272.jpg'
OUTPUT = ROOT / 'Special Cards 100'
OUTPUT.mkdir(exist_ok=True)
photo = Image.open(SOURCE).convert('RGB')
W, H = 480, 680
font_path = Path('C:/Windows/Fonts/segoeui.ttf')
font_bold_path = Path('C:/Windows/Fonts/arial.ttf')
font = ImageFont.truetype(str(font_path), 26)
small = ImageFont.truetype(str(font_bold_path), 15)
large = ImageFont.truetype(str(font_bold_path), 48)

for number in range(1, 101):
    tone = (number - 1) // 10
    variant = (number - 1) % 10
    hue = (tone * .091 + .025) % 1
    rgb = colorsys.hsv_to_rgb(hue, .55, .72)
    accent = tuple(round(x * 255) for x in rgb)
    dark = tuple(round(x * .28) for x in accent)
    light = tuple(min(255, round(x * .48 + 145)) for x in accent)
    card = Image.new('RGB', (W, H), dark)
    draw = ImageDraw.Draw(card)
    for y in range(H):
        t = y / H
        color = tuple(round(dark[c] * (1-t) + accent[c] * t * .67) for c in range(3))
        draw.line((0, y, W, y), fill=color)
    # Central portrait stays recognizable; slight crop and color changes make each edition unique.
    target_w, target_h = 390, 520
    ratio = max(target_w / photo.width, target_h / photo.height)
    scaled = photo.resize((math.ceil(photo.width * ratio), math.ceil(photo.height * ratio)), Image.Resampling.LANCZOS)
    shift_x = round((variant - 4.5) * 3)
    shift_y = round(((number * 7) % 11 - 5) * 2)
    left = (scaled.width - target_w) // 2 + shift_x
    top = (scaled.height - target_h) // 2 + shift_y
    portrait = scaled.crop((left, top, left + target_w, top + target_h))
    portrait = ImageEnhance.Color(portrait).enhance(.88 + tone * .035)
    portrait = ImageEnhance.Contrast(portrait).enhance(1.02 + variant * .012)
    card.paste(portrait, (45, 80))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((13, 13, W-14, H-14), radius=18, outline=light, width=5)
    draw.rounded_rectangle((23, 23, W-24, H-24), radius=12, outline=accent, width=2)
    draw.rectangle((39, 74, 441, 606), outline=light, width=7)
    draw.rectangle((44, 79, 436, 601), outline=dark, width=2)
    for corner_x in (25, W-25):
        for corner_y in (25, H-25):
            r = 5 + variant % 4
            draw.ellipse((corner_x-r, corner_y-r, corner_x+r, corner_y+r), fill=light)
    for k in range(12):
        angle = 2 * math.pi * k / 12 + variant * .13
        x = W // 2 + round(174 * math.cos(angle))
        y = 338 + round(240 * math.sin(angle))
        if 45 < x < 435 and 80 < y < 600:
            continue
        r = 3 + (k + variant) % 4
        draw.ellipse((x-r, y-r, x+r, y+r), fill=light)
    draw.text((W//2, 48), 'SPECIAL MEMORY', font=small, fill=light, anchor='mm')
    draw.rounded_rectangle((85, 591, 395, 650), radius=8, fill=dark, outline=light, width=2)
    draw.text((W//2, 622), f'KEEPSAKE  ·  {number:03d}', font=font, fill=(255, 250, 235), anchor='mm')
    draw.text((W-49, 48), f'{number:03d}', font=small, fill=light, anchor='rm')
    card.save(OUTPUT / f'Special_Card_{number:03d}.webp', 'WEBP', quality=88, method=6)

print(f'Created {len(list(OUTPUT.glob("*.webp")))} special cards in {OUTPUT}')
