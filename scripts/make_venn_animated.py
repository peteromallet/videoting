from PIL import Image, ImageDraw, ImageFont
import struct, wave, math, os

W, H = 1920, 1080
FPS = 30
OUT_DIR = "/Users/peteromalley/Downloads/venn_frames"
os.makedirs(OUT_DIR, exist_ok=True)

# Circle params
r = 280
cx1 = W // 2 - 160
cx2 = W // 2 + 160
cy = H // 2 - 30

# Colors
left_fill = (60, 130, 200, 80)
right_fill = (200, 80, 60, 80)
left_outline = (80, 160, 240)
right_outline = (240, 100, 80)
label_color_l = (180, 210, 255)
label_color_r = (255, 180, 170)
arrow_color = (220, 200, 100)
flash_color = (255, 240, 140, 120)
bg = (17, 17, 17)

# Font
try:
    font_big = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 38)
    font_med = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    font_label = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 28)
except:
    font_big = ImageFont.load_default()
    font_med = font_big
    font_label = font_big

def ease_out(t):
    return 1 - (1 - t) ** 3

def lerp_alpha(color, alpha_frac):
    if len(color) == 4:
        return (color[0], color[1], color[2], int(color[3] * alpha_frac))
    return tuple(int(c * alpha_frac) for c in color)

def lerp_color(color, alpha_frac):
    # For RGB text, blend toward bg
    return tuple(int(bg[i] + (color[i] - bg[i]) * alpha_frac) for i in range(3))

def draw_circle_left(draw, alpha=1.0):
    fill = lerp_alpha(left_fill, alpha)
    outline = lerp_color(left_outline, alpha)
    draw.ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill=fill, outline=outline, width=3)
    # Text
    tc = lerp_color(label_color_l, alpha)
    t1, t2 = "Creative", "Control"
    bb1 = draw.textbbox((0, 0), t1, font=font_big)
    bb2 = draw.textbbox((0, 0), t2, font=font_med)
    lx = cx1 - 70
    draw.text((lx - (bb1[2] - bb1[0]) // 2, cy - 30), t1, fill=tc, font=font_big)
    draw.text((lx - (bb2[2] - bb2[0]) // 2, cy + 15), t2, fill=tc, font=font_med)

def draw_circle_right(draw, alpha=1.0):
    fill = lerp_alpha(right_fill, alpha)
    outline = lerp_color(right_outline, alpha)
    draw.ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill=fill, outline=outline, width=3)
    tc = lerp_color(label_color_r, alpha)
    t1, t2 = "Model", "Creativity"
    bb1 = draw.textbbox((0, 0), t1, font=font_big)
    bb2 = draw.textbbox((0, 0), t2, font=font_med)
    rx = cx2 + 70
    draw.text((rx - (bb1[2] - bb1[0]) // 2, cy - 30), t1, fill=tc, font=font_big)
    draw.text((rx - (bb2[2] - bb2[0]) // 2, cy + 15), t2, fill=tc, font=font_med)

def draw_label(draw, alpha=1.0):
    tc = lerp_color(arrow_color, alpha)
    text = "Using Anchor Images"
    bb = draw.textbbox((0, 0), text, font=font_label)
    tw = bb[2] - bb[0]
    draw.text((W // 2 - tw // 2, cy + r + 95), text, fill=tc, font=font_label)

def draw_arrow(draw, progress=1.0, alpha=1.0):
    """Arrow from label up to overlap center. progress 0-1 controls how far it's drawn."""
    tc = lerp_color(arrow_color, alpha)
    overlap_x = W // 2
    start_y = cy + r + 80  # just above label
    end_y = cy  # center of overlap
    current_end_y = int(start_y + (end_y - start_y) * progress)

    draw.line([(overlap_x, start_y), (overlap_x, current_end_y)], fill=tc, width=3)
    # Arrowhead at current tip
    hs = 12
    draw.polygon([
        (overlap_x, current_end_y),
        (overlap_x - hs, current_end_y + int(hs * 1.5)),
        (overlap_x + hs, current_end_y + int(hs * 1.5)),
    ], fill=tc)

def draw_intersection_flash(draw, alpha=1.0):
    """Draw a highlight on the intersection region."""
    # Create a mask for the intersection
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    # Left circle mask
    m1 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m1).ellipse([cx1 - r, cy - r, cx1 + r, cy + r], fill=255)
    # Right circle mask
    m2 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m2).ellipse([cx2 - r, cy - r, cx2 + r, cy + r], fill=255)
    # Intersection
    from PIL import ImageChops
    intersection = ImageChops.multiply(m1, m2)
    # Apply alpha
    intersection = intersection.point(lambda p: int(p * alpha))
    # Create flash overlay
    flash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    flash_solid = Image.new("RGBA", (W, H), flash_color)
    flash.paste(flash_solid, mask=intersection)
    return flash

# Timeline (in seconds)
# 0.0-0.3: empty
# 0.3-0.7: left circle appears
# 0.7-1.2: hold
# 1.2-1.6: right circle appears
# 1.6-2.1: hold
# 2.1-2.5: label text appears
# 2.5-3.2: arrow grows upward
# 3.2-3.8: intersection flashes (pulse in then out)
# 3.8-5.0: hold final

total_frames = FPS * 5  # 5 seconds

for f in range(total_frames):
    t = f / FPS

    img = Image.new("RGBA", (W, H), bg + (255,))
    draw = ImageDraw.Draw(img, "RGBA")

    # Left circle
    if t < 0.3:
        left_a = 0
    elif t < 0.7:
        left_a = ease_out((t - 0.3) / 0.4)
    else:
        left_a = 1.0

    # Right circle
    if t < 1.2:
        right_a = 0
    elif t < 1.6:
        right_a = ease_out((t - 1.2) / 0.4)
    else:
        right_a = 1.0

    # Label
    if t < 2.1:
        label_a = 0
    elif t < 2.5:
        label_a = ease_out((t - 2.1) / 0.4)
    else:
        label_a = 1.0

    # Arrow
    if t < 2.5:
        arrow_prog = 0
    elif t < 3.2:
        arrow_prog = ease_out((t - 2.5) / 0.7)
    else:
        arrow_prog = 1.0

    # Flash
    if t < 3.2:
        flash_a = 0
    elif t < 3.5:
        flash_a = ease_out((t - 3.2) / 0.3)
    elif t < 3.8:
        flash_a = 1.0 - (t - 3.5) / 0.3  # fade out to subtle
        flash_a = max(flash_a, 0.3)  # keep subtle glow
    else:
        flash_a = 0.3

    # Draw in order (left first so right overlaps)
    if left_a > 0:
        draw_circle_left(draw, left_a)
    if right_a > 0:
        draw_circle_right(draw, right_a)
    if label_a > 0:
        draw_label(draw, label_a)
    if arrow_prog > 0:
        draw_arrow(draw, arrow_prog, label_a)

    # Flash overlay
    if flash_a > 0:
        flash_layer = draw_intersection_flash(draw, flash_a)
        img = Image.alpha_composite(img, flash_layer)

    # Save frame
    img.convert("RGB").save(os.path.join(OUT_DIR, f"frame_{f:04d}.png"))

print(f"Generated {total_frames} frames")

# Generate sound effects as WAV
def make_beep(filename, freq=800, duration=0.15, volume=0.3):
    sample_rate = 44100
    n_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(n_samples):
            t = i / sample_rate
            envelope = math.sin(math.pi * i / n_samples)  # smooth envelope
            val = math.sin(2 * math.pi * freq * t) * volume * envelope
            wav.writeframes(struct.pack('<h', int(val * 32767)))

def make_whoosh(filename, duration=0.3, volume=0.2):
    sample_rate = 44100
    n_samples = int(sample_rate * duration)
    import random
    random.seed(42)
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for i in range(n_samples):
            envelope = math.sin(math.pi * i / n_samples)
            noise = random.uniform(-1, 1) * volume * envelope
            wav.writeframes(struct.pack('<h', int(noise * 32767)))

make_beep("/Users/peteromalley/Downloads/beep1.wav", freq=600, duration=0.2)
make_beep("/Users/peteromalley/Downloads/beep2.wav", freq=800, duration=0.2)
make_beep("/Users/peteromalley/Downloads/pop.wav", freq=1000, duration=0.15)
make_whoosh("/Users/peteromalley/Downloads/whoosh.wav", duration=0.4)

print("Sound effects generated")
